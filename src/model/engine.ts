// One doc on one phone: its changes in the fixed order, the receive path, commits, undo and redo,
// who has this and the trail. Explanation: docs/plan/3-how-its-built.md, sections 1.2, 1.9 and 1.11.

import {
  keys,
  type ActorId,
  type Change,
  type ChangeId,
  type DocEngine,
  type DocId,
  type DocView,
  type Fingerprint,
  type ItemId,
  type Json,
  type Op,
  type ReceiveResult,
  type ReplayStep,
  type TrailStep,
  type ViewOptions,
} from '../contracts';
import { fingerprintOf } from './fingerprint';
import { Fold, isLanesAgain, sameValue, type Entry } from './fold';
import { changeId, parseChangeId } from './ids';
import { sortChanges } from './order';
import { buildView } from './view';

/** A change with the right shape. Anything else that arrives is skipped, never applied. */
export function isChange(c: unknown): c is Change {
  if (!c || typeof c !== 'object') return false;
  const x = c as Partial<Change>;
  return (
    typeof x.actor === 'string' &&
    typeof x.seq === 'number' &&
    Number.isInteger(x.seq) &&
    x.seq >= 1 &&
    x.id === changeId(x.actor, x.seq) &&
    Array.isArray(x.deps) &&
    x.deps.every((d) => typeof d === 'string') &&
    typeof x.t === 'number' &&
    Number.isFinite(x.t) &&
    (x.kind === 'edit' || x.kind === 'note') &&
    Array.isArray(x.ops)
  );
}

export class Engine implements DocEngine {
  private known = new Map<ChangeId, Change>();
  private waitingFor = new Map<ChangeId, Change>();
  private sorted: Change[] = [];
  private fold: Fold;
  private headSet = new Set<ChangeId>();
  private maxSeq = new Map<ActorId, number>();
  private cachedView: DocView | null = null;
  private cachedPrint: Fingerprint | null = null;
  private undoStack: ChangeId[] = [];
  private redoStack: ChangeId[] = [];

  constructor(
    readonly docId: DocId,
    readonly me: ActorId,
    changes: readonly Change[] = [],
  ) {
    this.fold = new Fold(me);
    this.take(changes);
    this.refold();
    // The doc's first change (its template) is never undone.
    this.undoStack = this.sorted.filter((c) => c.actor === me && c.kind === 'edit' && c.deps.length > 0).map((c) => c.id);
  }

  changes(): readonly Change[] {
    return this.sorted;
  }

  heads(): ChangeId[] {
    return [...this.headSet].sort();
  }

  /** How many changes are stored but waiting for changes they depend on. */
  waiting(): number {
    return this.waitingFor.size;
  }

  view(opts?: ViewOptions): DocView {
    if (opts?.mode === 'normal-sync') return buildView(this.fold, this.docId, opts);
    if (!this.cachedView) this.cachedView = buildView(this.fold, this.docId);
    return this.cachedView;
  }

  fingerprint(): Fingerprint {
    if (!this.cachedPrint) this.cachedPrint = fingerprintOf(this.view());
    return this.cachedPrint;
  }

  /** Adds new changes to `known`, then moves every change whose deps are all in into the doc. Returns the new ids. */
  private take(incoming: readonly Change[]): { fresh: Set<ChangeId>; duplicates: number } {
    let duplicates = 0;
    const fresh = new Set<ChangeId>();
    for (const c of incoming) {
      if (!isChange(c)) continue;
      if (this.known.has(c.id) || this.waitingFor.has(c.id)) {
        duplicates++;
        continue;
      }
      this.waitingFor.set(c.id, c);
      if ((this.maxSeq.get(c.actor) ?? 0) < c.seq) this.maxSeq.set(c.actor, c.seq);
    }
    // A waiting change goes in once every dep is in. Deps that never arrive (or a loop) keep it waiting.
    const missing = new Map<ChangeId, number>();
    const dependents = new Map<ChangeId, ChangeId[]>();
    const free: ChangeId[] = [];
    for (const [id, c] of this.waitingFor) {
      let n = 0;
      for (const d of new Set(c.deps)) {
        if (this.known.has(d)) continue;
        n++;
        const list = dependents.get(d);
        if (list) list.push(id);
        else dependents.set(d, [id]);
      }
      missing.set(id, n);
      if (n === 0) free.push(id);
    }
    while (free.length > 0) {
      const id = free.pop()!;
      fresh.add(id);
      for (const next of dependents.get(id) ?? []) {
        const left = missing.get(next)! - 1;
        missing.set(next, left);
        if (left === 0) free.push(next);
      }
    }
    for (const id of fresh) {
      this.known.set(id, this.waitingFor.get(id)!);
      this.waitingFor.delete(id);
    }
    return { fresh, duplicates };
  }

  /** Sort every change into the fixed order and replay it onto an empty doc. */
  private refold(): void {
    this.sorted = sortChanges([...this.known.values()]);
    this.fold = new Fold(this.me);
    for (const c of this.sorted) this.fold.apply(c);
    this.headSet = new Set(this.sorted.map((c) => c.id));
    for (const c of this.sorted) for (const d of c.deps) this.headSet.delete(d);
    this.cachedView = null;
    this.cachedPrint = null;
  }

  receive(changes: Change[], from: { actor: ActorId | null; via: 'beam' | 'file' }): ReceiveResult {
    const before = new Set(this.known.keys());
    const sent = new Set(changes.map((c) => c?.id));
    const { fresh, duplicates } = this.take(changes);
    if (fresh.size > 0) this.refold();
    const added = this.sorted.filter((c) => fresh.has(c.id));
    const newEdits = added.filter((c) => c.kind === 'edit').map((c) => c.id);
    let senderMissing = false;
    for (const id of before) {
      if (!sent.has(id)) {
        senderMissing = true;
        break;
      }
    }
    let note: Change | null = null;
    if (newEdits.length > 0) {
      note = this.append({ kind: 'note', ops: [], from: { actor: from.actor, via: from.via } });
    }
    return {
      added: added.map((c) => c.id),
      newEdits,
      onlyNotes: newEdits.length === 0,
      duplicates,
      waiting: this.waitingFor.size,
      note,
      senderMissing,
    };
  }

  /** A new change from this phone. It has seen everything here, so it sorts last and is simply added. */
  private append(part: Pick<Change, 'kind' | 'ops' | 'from'> & { place?: string; t?: number }): Change {
    const seq = (this.maxSeq.get(this.me) ?? 0) + 1;
    const c: Change = {
      id: changeId(this.me, seq),
      actor: this.me,
      seq,
      deps: this.heads(),
      t: part.t ?? Date.now(),
      kind: part.kind,
      ops: part.ops,
    };
    if (part.place !== undefined && part.place !== '') c.place = part.place;
    if (part.from) c.from = part.from;
    this.maxSeq.set(this.me, seq);
    this.known.set(c.id, c);
    this.sorted.push(c);
    this.fold.apply(c);
    for (const d of c.deps) this.headSet.delete(d);
    this.headSet.add(c.id);
    this.cachedView = null;
    this.cachedPrint = null;
    return c;
  }

  commit(ops: Op[], opts?: { place?: string; t?: number }): Change {
    const c = this.append({ kind: 'edit', ops, ...opts });
    if (c.deps.length > 0) this.undoStack.push(c.id);
    this.redoStack = [];
    return c;
  }

  /** The value an entry stands for, following "show these lanes again" with one lane. */
  private meaning(key: string, e: Entry | undefined): Json {
    let cur = e;
    for (let i = 0; i < 64 && cur && isLanesAgain(cur.value) && cur.value.$lanes.length === 1; i++) {
      cur = this.fold.history.get(key)?.get(cur.value.$lanes[0]!);
    }
    return cur ? cur.value : null;
  }

  /** Ops that put back what change `id` replaced, skipping every spot someone has changed since. */
  private inverse(id: ChangeId): Op[] {
    const replaced = this.fold.replaced.get(id);
    if (!replaced) return [];
    const ops: Op[] = [];
    for (const [key, gone] of replaced) {
      const cur = this.fold.regs.get(key) ?? [];
      if (cur.length !== 1) continue;
      const now = cur[0]!;
      if (parseChangeId(now.ref).actor !== this.me) continue; // someone else changed it since
      const wrote = this.fold.history.get(key)?.get(id);
      if (!sameValue(this.meaning(key, now), this.meaning(key, wrote))) continue;
      const refs: ChangeId[] = [];
      for (const g of gone) {
        if (isLanesAgain(g.value)) refs.push(...g.value.$lanes);
        else refs.push(g.ref);
      }
      ops.push({ o: 'set', k: key, v: refs.length === 0 ? null : { $lanes: refs } });
    }
    return ops;
  }

  undo(opts?: { place?: string; t?: number }): Change | null {
    while (this.undoStack.length > 0) {
      const id = this.undoStack.pop()!;
      const ops = this.inverse(id);
      if (ops.length === 0) continue;
      const c = this.append({ kind: 'edit', ops, ...opts });
      this.redoStack.push(c.id);
      return c;
    }
    return null;
  }

  redo(opts?: { place?: string; t?: number }): Change | null {
    while (this.redoStack.length > 0) {
      const id = this.redoStack.pop()!;
      const ops = this.inverse(id);
      if (ops.length === 0) continue;
      const c = this.append({ kind: 'edit', ops, ...opts });
      this.undoStack.push(c.id);
      return c;
    }
    return null;
  }

  /** The changes whose values or items make up this block as shown. */
  private blockMakers(block: ItemId): ChangeId[] {
    const f = this.fold;
    const refs = new Set<ChangeId>();
    const add = (key: string) => {
      for (const e of f.regs.get(key) ?? []) refs.add(e.ref);
    };
    const ins = f.insertedBy.get(`${keys.blocks}\n${block}`);
    if (ins) refs.add(ins);
    add(keys.blockStyle(block));
    add(keys.tick(block));
    for (const s of f.lists.get(keys.sentences(block)) ?? []) add(keys.sentence(block, s));
    add(keys.tableName(block));
    const cols = f.lists.get(keys.columns(block)) ?? [];
    for (const c of cols) add(keys.column(block, c));
    for (const r of f.lists.get(keys.rows(block)) ?? []) {
      add(keys.row(block, r));
      for (const c of cols) add(keys.cell(block, r, c));
    }
    for (const k of f.markKeys.get(block) ?? []) add(k);
    return [...refs];
  }

  /** Each writer's newest change on this phone: what their phone had seen, as far as this phone knows. */
  private latestByActor(): Map<ActorId, Change> {
    const latest = new Map<ActorId, Change>();
    for (const c of this.sorted) {
      const cur = latest.get(c.actor);
      if (!cur || cur.seq < c.seq) latest.set(c.actor, c);
    }
    return latest;
  }

  whoHas(block: ItemId): ActorId[] {
    const makers = this.blockMakers(block);
    const out: ActorId[] = [];
    for (const [actor, c] of this.latestByActor()) {
      const clock = this.fold.clockOf(c.id);
      if (makers.every((m) => Fold.seen(clock, m))) out.push(actor);
    }
    return out.sort();
  }

  trail(block: ItemId): TrailStep[] {
    const makers = this.blockMakers(block).map((id) => this.known.get(id)).filter((c): c is Change => !!c);
    if (makers.length === 0) return [];
    // The newest words: the maker that comes last in the fixed order.
    const pos = new Map(this.sorted.map((c, i) => [c.id, i] as const));
    const newest = makers.reduce((a, b) => (pos.get(a.id)! > pos.get(b.id)! ? a : b));
    const steps: TrailStep[] = [{ actor: newest.actor, t: newest.t, via: 'wrote' }];
    const done = new Set<ActorId>([newest.actor]);
    for (const c of this.sorted) {
      if (done.has(c.actor)) continue;
      if (!Fold.seen(this.fold.clockOf(c.id), newest.id)) continue;
      done.add(c.actor);
      steps.push({ actor: c.actor, t: c.t, via: c.kind === 'note' && c.from ? c.from.via : 'beam' });
    }
    return steps;
  }

  replay(): ReplayStep[] {
    const fold = new Fold(null);
    const steps: ReplayStep[] = [];
    for (const c of this.sorted) {
      fold.apply(c);
      if (c.kind !== 'edit') continue;
      steps.push({ change: c.id, actor: c.actor, t: c.t, view: buildView(fold, this.docId) });
    }
    return steps;
  }
}

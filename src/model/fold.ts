// Replaying sorted changes onto an empty doc: registers that keep every value nobody has seen past,
// and lists. Explanation: docs/plan/3-how-its-built.md, sections 1.1 to 1.3.

import type { ActorId, Change, ChangeId, ItemId, Json, LanesAgain, MergePolicy } from '../contracts';
import { parseChangeId } from './ids';

/** One value written into a register by one change. */
export interface Entry {
  value: Json;
  ref: ChangeId;
  actor: ActorId;
  t: number;
  place?: string;
  /** A pick ("Keep this one"): the changes whose values it replaced. */
  others?: ChangeId[];
  /** A pick: the entry it kept, so the version keeps its writer. */
  picked?: ChangeId;
}

/** Which writers' changes a change had seen: writer id → highest counter seen. Includes the change itself. */
export type Clock = Record<ActorId, number>;

export function mergePolicy(key: string): MergePolicy {
  if (key === 'template') return 'later';
  if (key.startsWith('w/')) return 'own';
  if (key.startsWith('b/')) {
    const rest = key.slice(key.indexOf('/', 2) + 1);
    if (rest === 'style' || rest.startsWith('m/')) return 'later';
  }
  return 'clash';
}

export function isLanesAgain(v: Json | undefined): v is Json & LanesAgain {
  return (
    typeof v === 'object' && v !== null && !Array.isArray(v) && Array.isArray((v as Record<string, Json>).$lanes)
  );
}

/** Canonical JSON: object keys sorted, so equal values always give equal text. */
export function canonical(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v ?? null);
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`;
  const o = v as Record<string, unknown>;
  const parts: string[] = [];
  for (const k of Object.keys(o).sort()) {
    if (o[k] === undefined) continue;
    parts.push(`${JSON.stringify(k)}:${canonical(o[k])}`);
  }
  return `{${parts.join(',')}}`;
}

export function sameValue(a: Json | undefined, b: Json | undefined): boolean {
  return canonical(a ?? null) === canonical(b ?? null);
}

export class Fold {
  /** Register key → the values nobody has seen past. */
  readonly regs = new Map<string, Entry[]>();
  /** Register key → every value ever written to it, by change id. */
  readonly history = new Map<string, Map<ChangeId, Entry>>();
  readonly lists = new Map<string, ItemId[]>();
  /** `${list}\n${item}` → the change that put the item in. */
  readonly insertedBy = new Map<string, ChangeId>();
  readonly clocks = new Map<ChangeId, Clock>();
  readonly changes = new Map<ChangeId, Change>();
  /** Block id → its mark register keys. */
  readonly markKeys = new Map<ItemId, Set<string>>();
  /** Block id → the last style it had that wasn't "deleted", for a deleted block whose sentence is in clash. */
  readonly lastStyle = new Map<ItemId, Json>();
  /** For `me`'s changes only: register key → the entries each change replaced (used by undo). */
  readonly replaced = new Map<ChangeId, Map<string, Entry[]>>();
  /** Every writer seen, in the order first seen. */
  readonly actors = new Set<ActorId>();
  /** Every change, in the order applied. */
  readonly order: Change[] = [];

  constructor(readonly me: ActorId | null) {}

  /** True when `clock` had seen change `ref`. */
  static seen(clock: Clock, ref: ChangeId): boolean {
    const { actor, seq } = parseChangeId(ref);
    return (clock[actor] ?? 0) >= seq;
  }

  clockOf(id: ChangeId): Clock {
    return this.clocks.get(id) ?? {};
  }

  /** Apply one change. Its deps must already be applied (the fixed sort guarantees it). */
  apply(c: Change): void {
    const clock = Object.create(null) as Clock; // no built-in keys, whatever a writer id says
    for (const d of c.deps) {
      const dc = this.clocks.get(d);
      if (!dc) continue;
      for (const a in dc) if ((clock[a] ?? 0) < dc[a]!) clock[a] = dc[a]!;
    }
    if ((clock[c.actor] ?? 0) < c.seq) clock[c.actor] = c.seq;
    this.clocks.set(c.id, clock);
    this.changes.set(c.id, c);
    this.actors.add(c.actor);
    this.order.push(c);
    if (c.kind !== 'edit') return;
    for (const op of c.ops) {
      if (op.o === 'set') this.set(c, clock, op.k, op.v, op.others);
      else if (op.o === 'ins') this.ins(c, clock, op.list, op.id, op.after);
    }
  }

  private set(c: Change, clock: Clock, k: string, v: Json, others?: ChangeId[]): void {
    if (typeof k !== 'string') return;
    if (mergePolicy(k) === 'own' && k.split('/')[1] !== c.actor) return; // only its writer writes it
    const cur = this.regs.get(k) ?? [];
    const keep: Entry[] = [];
    const gone: Entry[] = [];
    for (const e of cur) (Fold.seen(clock, e.ref) ? gone : keep).push(e);
    const entry: Entry = { value: v === undefined ? null : v, ref: c.id, actor: c.actor, t: c.t };
    if (c.place !== undefined) entry.place = c.place;
    if (others && others.length > 0) {
      entry.others = [...others];
      const picked = this.findPicked(k, clock, v, others, c.id);
      if (picked) entry.picked = picked;
    }
    keep.push(entry);
    this.regs.set(k, keep);
    let h = this.history.get(k);
    if (!h) this.history.set(k, (h = new Map()));
    h.set(c.id, entry);
    if (this.me !== null && c.actor === this.me) {
      let r = this.replaced.get(c.id);
      if (!r) this.replaced.set(c.id, (r = new Map()));
      if (!r.has(k)) r.set(k, gone);
    }
    if (k.startsWith('b/')) {
      const slash = k.indexOf('/', 2);
      const block = k.slice(2, slash);
      const rest = k.slice(slash + 1);
      if (rest === 'style' && v !== null) this.lastStyle.set(block, v);
      if (rest.startsWith('m/')) {
        let m = this.markKeys.get(block);
        if (!m) this.markKeys.set(block, (m = new Set()));
        m.add(k);
      }
    }
  }

  /** The value a pick kept: the latest earlier entry with the same value that isn't one it replaced. */
  private findPicked(k: string, clock: Clock, v: Json, others: ChangeId[], self: ChangeId): ChangeId | undefined {
    const h = this.history.get(k);
    if (!h) return undefined;
    const skip = new Set(others);
    let found: ChangeId | undefined;
    for (const e of h.values()) {
      if (e.ref === self || skip.has(e.ref) || !Fold.seen(clock, e.ref)) continue;
      if (sameValue(e.value, v)) found = e.ref;
    }
    return found;
  }

  /**
   * Put an item right after `after`, but past any items there that its writer hadn't seen (added while apart),
   * so things added at the same spot while apart stay in the order they were written.
   */
  private ins(c: Change, clock: Clock, list: string, id: ItemId, after: ItemId | null): void {
    if (typeof list !== 'string' || typeof id !== 'string') return;
    let items = this.lists.get(list);
    if (!items) this.lists.set(list, (items = []));
    if (this.insertedBy.has(`${list}\n${id}`)) return;
    let at = 0;
    if (after !== null) {
      const i = items.indexOf(after);
      at = i < 0 ? items.length : i + 1;
    }
    while (at < items.length) {
      const by = this.insertedBy.get(`${list}\n${items[at]!}`);
      if (by === undefined || Fold.seen(clock, by)) break;
      at++;
    }
    items.splice(at, 0, id);
    this.insertedBy.set(`${list}\n${id}`, c.id);
  }

  /** The entry a lane is shown as: a pick shows the writer of the version it kept. */
  origin(key: string, e: Entry): Entry {
    let cur = e;
    const h = this.history.get(key);
    for (let i = 0; i < 64 && cur.picked; i++) {
      const next = h?.get(cur.picked);
      if (!next) break;
      cur = next;
    }
    return cur;
  }
}

// What the doc shows, worked out from the replayed registers and lists.
// Settle rules and the normal-sync view are applied here, never by rewriting anything (sections 1.7, 1.11).

import {
  keys,
  type ActorId,
  type BlockStyle,
  type BlockView,
  type ChangeId,
  type ColumnDef,
  type ColumnView,
  type DocId,
  type DocView,
  type Field,
  type ItemId,
  type Json,
  type Lane,
  type MarkType,
  type MarkView,
  type RowView,
  type RuleDef,
  type RuleResult,
  type RuleView,
  type SentenceView,
  type SettleRule,
  type TableView,
  type ViewOptions,
  type WriterColour,
  type WriterView,
} from '../contracts';
import { canonical, Fold, isLanesAgain, mergePolicy, type Entry } from './fold';
import { checkRule } from './rules';

interface Ctx {
  fold: Fold;
  settle: SettleRule;
  mode: 'merged' | 'normal-sync';
  arrival: ReadonlyMap<ChangeId, number> | undefined;
}

function laneOf<T>(fold: Fold, key: string, e: Entry): Lane<T> {
  const o = fold.origin(key, e);
  const lane: Lane<T> = { value: e.value as T | null, ref: e.ref, actor: o.actor, t: o.t };
  if (o.place !== undefined) lane.place = o.place;
  return lane;
}

function laneOrder(a: Lane<unknown>, b: Lane<unknown>): number {
  if (a.t !== b.t) return a.t < b.t ? -1 : 1;
  if (a.actor !== b.actor) return a.actor < b.actor ? -1 : 1;
  return a.ref < b.ref ? -1 : a.ref > b.ref ? 1 : 0;
}

function asNumber(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && /^\s*-?\d+(\.\d+)?\s*$/.test(v)) return Number(v);
  return null;
}

/** Which version a settle rule keeps, or null when it can't decide (the clash stays as lanes). */
function settleWinner<T>(rule: SettleRule, lanes: Lane<T>[]): Lane<T> | null {
  if (rule.kind === 'newest') {
    let best = lanes[0]!;
    for (const l of lanes) if (laneOrder(l, best) > 0) best = l;
    return best;
  }
  if (rule.kind === 'person') {
    const mine = lanes.filter((l) => l.actor === rule.actor);
    return mine.length === 1 ? mine[0]! : null;
  }
  if (rule.kind === 'smaller') {
    let best: Lane<T> | null = null;
    let bestN = Infinity;
    for (const l of lanes) {
      const n = asNumber(l.value);
      if (n === null) return null;
      if (n < bestN) {
        bestN = n;
        best = l;
      }
    }
    return best;
  }
  return null;
}

/** A register as shown. Null when nothing was ever written to it. */
export function resolveField<T>(ctx: Ctx, key: string): Field<T> | null {
  const { fold } = ctx;
  const entries = fold.regs.get(key);
  if (!entries || entries.length === 0) return null;
  const hist = fold.history.get(key);

  // Every current version, with the entry it came from. A "show these lanes again" value opens up.
  const raw: { lane: Lane<T>; src: Entry }[] = [];
  const opened = new Set<string>(); // each entry opens once, so a made-up chain of lanes can't blow up
  const expand = (e: Entry, depth: number) => {
    if (opened.has(e.ref)) return;
    opened.add(e.ref);
    if (isLanesAgain(e.value)) {
      if (depth > 8) return;
      for (const r of e.value.$lanes) {
        const he = hist?.get(r);
        if (he) expand(he, depth + 1);
      }
      return;
    }
    raw.push({ lane: laneOf<T>(fold, key, e), src: e });
  };
  for (const e of entries) expand(e, 0);
  if (raw.length === 0) {
    const e = entries[0]!;
    raw.push({ lane: { value: null, ref: e.ref, actor: e.actor, t: e.t }, src: e });
  }

  const policy = mergePolicy(key);
  if (policy !== 'clash') {
    let best = raw[0]!;
    for (const r of raw) if (laneOrder(r.lane, best.lane) > 0) best = r;
    if (key.endsWith('/style')) {
      const deleted = raw.find((r) => r.lane.value === null);
      if (deleted) best = deleted; // deleting a block beats changing its style
    }
    return { key, state: 'one', shown: best.lane, lanes: [best.lane], kept: [] };
  }

  raw.sort((a, b) => laneOrder(a.lane, b.lane));
  const distinct: typeof raw = [];
  const seenValues = new Set<string>();
  for (const r of raw) {
    const c = canonical(r.lane.value);
    if (seenValues.has(c)) continue;
    seenValues.add(c);
    distinct.push(r);
  }
  const lanes = distinct.map((r) => r.lane);

  if (distinct.length === 1) {
    const only = distinct[0]!;
    const field: Field<T> = { key, state: 'one', shown: only.lane, lanes, kept: [] };
    const src = raw.length === 1 ? only.src : null;
    if (src?.others) {
      for (const ref of src.others) {
        const he = hist?.get(ref);
        if (he && !isLanesAgain(he.value)) field.kept.push(laneOf<T>(fold, key, he));
      }
      field.pickedBy = src.actor;
    }
    return field;
  }

  if (ctx.mode === 'normal-sync') {
    // A normal sync keeps only the version whose change reached this phone last.
    const arrivedAt = (l: Lane<T>) => ctx.arrival?.get(l.ref) ?? -1;
    let last = lanes[0]!;
    for (const l of lanes) if (arrivedAt(l) >= arrivedAt(last)) last = l;
    return { key, state: 'one', shown: last, lanes: [last], kept: lanes.filter((l) => l !== last) };
  }

  if (key !== keys.settle && ctx.settle.kind !== 'ask') {
    const winner = settleWinner(ctx.settle, lanes);
    if (winner) {
      return { key, state: 'settled', shown: winner, lanes, kept: lanes.filter((l) => l !== winner), how: ctx.settle };
    }
  }
  return { key, state: 'clash', shown: null, lanes, kept: [] };
}

/** True when some version still has words (or a value): a fully deleted spot isn't shown. */
function hasValue(f: Field<unknown> | null): f is Field<unknown> {
  return !!f && f.lanes.some((l) => l.value !== null);
}

function synthetic<T>(key: string, value: T, ref: ChangeId, actor: ActorId): Field<T> {
  const lane: Lane<T> = { value, ref, actor, t: 0 };
  return { key, state: 'one', shown: lane, lanes: [lane], kept: [] };
}

function laneActors(f: Field<unknown>, into: ActorId[]): void {
  const ls = f.state === 'clash' ? f.lanes : f.shown ? [f.shown] : [];
  for (const l of ls) if (l.value !== null && !into.includes(l.actor)) into.push(l.actor);
}

function countOccurrences(text: string, quote: string): number {
  if (!quote) return 0;
  let n = 0;
  for (let i = text.indexOf(quote); i >= 0; i = text.indexOf(quote, i + quote.length)) n++;
  return n;
}

const MARK_TYPES = new Set<MarkType>(['bold', 'italic', 'underline', 'link']);

export function safeHref(href: unknown): href is string {
  if (typeof href !== 'string') return false;
  return /^(https?:\/\/|tel:|mailto:)/i.test(href.trim());
}

function blockText(sentences: SentenceView[]): string {
  return sentences.map((s) => (typeof s.field.shown?.value === 'string' ? s.field.shown.value : '')).join('');
}

function buildTable(ctx: Ctx, id: ItemId, writtenBy: ActorId[]): TableView {
  const { fold } = ctx;
  const insRef = fold.insertedBy.get(`${keys.blocks}\n${id}`) ?? '';
  const name = resolveField<string>(ctx, keys.tableName(id)) ?? synthetic(keys.tableName(id), '', insRef, '');
  const columns: ColumnView[] = [];
  for (const c of fold.lists.get(keys.columns(id)) ?? []) {
    const def = resolveField<ColumnDef>(ctx, keys.column(id, c));
    if (hasValue(def)) columns.push({ id: c, def: def as Field<ColumnDef> });
  }
  const rows: RowView[] = [];
  for (const r of fold.lists.get(keys.rows(id)) ?? []) {
    const alive = resolveField<true>(ctx, keys.row(id, r));
    if (!hasValue(alive)) continue;
    const cells: Record<ItemId, Field<string>> = {};
    for (const c of columns) {
      const f = resolveField<string>(ctx, keys.cell(id, r, c.id));
      if (f) {
        cells[c.id] = f;
        laneActors(f, writtenBy);
      }
    }
    rows.push({ id: r, alive: alive as Field<true>, cells });
  }
  return { name, columns, rows };
}

function isStyle(v: unknown): v is BlockStyle {
  return typeof v === 'object' && v !== null && !Array.isArray(v) && typeof (v as { kind?: unknown }).kind === 'string';
}

export function buildView(fold: Fold, docId: DocId, opts: ViewOptions = {}): DocView {
  const base: Ctx = { fold, settle: { kind: 'ask' }, mode: opts.mode ?? 'merged', arrival: opts.arrival };
  const settleField =
    resolveField<SettleRule>({ ...base, mode: 'merged' }, keys.settle) ?? synthetic(keys.settle, { kind: 'ask' }, '', '');
  const settleValue = settleField.state === 'one' ? settleField.shown?.value : null;
  const ctx: Ctx = { ...base, settle: settleValue && typeof settleValue === 'object' ? settleValue : { kind: 'ask' } };

  const firstRef = fold.order[0]?.id ?? '';
  const title = resolveField<string>(ctx, keys.title) ?? synthetic(keys.title, '', firstRef, '');
  const templateField = resolveField<string>(ctx, keys.template);
  const template = typeof templateField?.shown?.value === 'string' ? templateField.shown.value : null;

  const blocks: BlockView[] = [];
  for (const id of fold.lists.get(keys.blocks) ?? []) {
    const styleValue = resolveField<BlockStyle>(ctx, keys.blockStyle(id))?.shown?.value ?? null;
    const last = fold.lastStyle.get(id);
    const style: BlockStyle = isStyle(styleValue) ? styleValue : isStyle(last) ? last : { kind: 'p' };
    const writtenBy: ActorId[] = [];
    if (style.kind === 'table') {
      const table = buildTable(ctx, id, writtenBy);
      if (styleValue === null && table.rows.length === 0) continue;
      blocks.push({ id, style, sentences: [], marks: [], table, writtenBy });
      continue;
    }
    const sentences: SentenceView[] = [];
    for (const s of fold.lists.get(keys.sentences(id)) ?? []) {
      const f = resolveField<string>(ctx, keys.sentence(id, s));
      if (!hasValue(f)) continue;
      sentences.push({ id: s, field: f as Field<string> });
      laneActors(f, writtenBy);
    }
    if (styleValue === null && sentences.length === 0) continue;
    const text = blockText(sentences);
    const marks: MarkView[] = [];
    for (const k of [...(fold.markKeys.get(id) ?? [])].sort()) {
      const v = resolveField<Json>(ctx, k)?.shown?.value;
      if (!v || typeof v !== 'object' || Array.isArray(v)) continue;
      const m = v as Record<string, Json>;
      const type = m.type as MarkType;
      if (!MARK_TYPES.has(type) || typeof m.quote !== 'string' || typeof m.occurrence !== 'number') continue;
      if (countOccurrences(text, m.quote) < m.occurrence) continue; // the words changed: stop showing it
      const mark: MarkView = { type, quote: m.quote, occurrence: m.occurrence };
      if (type === 'link') {
        if (!safeHref(m.href)) continue;
        mark.href = m.href;
      }
      marks.push(mark);
    }
    const block: BlockView = { id, style, sentences, marks, writtenBy };
    if (style.kind === 'li' && style.list === 'check') {
      const insRef = fold.insertedBy.get(`${keys.blocks}\n${id}`) ?? '';
      block.tick = resolveField<boolean>(ctx, keys.tick(id)) ?? synthetic(keys.tick(id), false, insRef, '');
    }
    blocks.push(block);
  }

  // List numbers are worked out from the order, never stored.
  const counters = [0, 0, 0];
  for (const b of blocks) {
    if (b.style.kind !== 'li') {
      counters.fill(0);
      continue;
    }
    const ind = Math.min(2, Math.max(0, b.style.indent ?? 0));
    for (let j = ind + 1; j < 3; j++) counters[j] = 0;
    if (b.style.list === 'number') b.number = ++counters[ind]!;
    else counters[ind] = 0;
  }

  const writers: Record<ActorId, WriterView> = {};
  for (const a of fold.actors) {
    const name = resolveField<string>(ctx, keys.writerName(a))?.shown?.value;
    const colour = resolveField<WriterColour>(ctx, keys.writerColour(a))?.shown?.value;
    writers[a] = { actor: a, name: typeof name === 'string' ? name : '', colour: colour ?? null };
  }

  const rules: RuleView[] = [];
  for (const r of fold.lists.get(keys.rules) ?? []) {
    const f = resolveField<RuleDef>(ctx, keys.rule(r));
    if (!hasValue(f)) continue;
    const def = (f.shown?.value ?? f.lanes.find((l) => l.value !== null)?.value) as RuleDef;
    let result: RuleResult;
    try {
      result = checkRule(def, blocks, writers);
    } catch {
      result = { state: 'unknown' }; // a rule with fields of the wrong kind is treated like a rule this version doesn't know
    }
    rules.push({ id: r, field: f as Field<RuleDef>, result });
  }

  const clashes: string[] = [];
  const note = (f: Field<unknown> | undefined) => {
    if (f?.state === 'clash') clashes.push(f.key);
  };
  note(title);
  note(settleField);
  for (const b of blocks) {
    for (const s of b.sentences) note(s.field);
    note(b.tick);
    if (b.table) {
      note(b.table.name);
      for (const c of b.table.columns) note(c.def);
      for (const row of b.table.rows) {
        note(row.alive);
        for (const c of b.table.columns) note(row.cells[c.id]);
      }
    }
  }
  for (const r of rules) note(r.field);

  return {
    docId,
    title,
    template,
    blocks,
    rules,
    settle: settleField,
    writers,
    needsLook: { clashes, broken: rules.filter((r) => r.result.state === 'broken').map((r) => r.id) },
  };
}

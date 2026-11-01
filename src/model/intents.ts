// Turning what someone did into ops. Every function is pure: it reads the view and returns ops.
// Explanation: src/contracts/engine.ts (Intents) and docs/plan/3-how-its-built.md, sections 1.3 to 1.8.

import {
  keys,
  type BlockStyle,
  type BlockView,
  type ChangeId,
  type DocView,
  type Field,
  type Intents,
  type ItemId,
  type Json,
  type Op,
} from '../contracts';
import { newItemId } from './ids';
import { splitSentences } from './sentences';
import { safeHref } from './view';

function findBlock(view: DocView, block: ItemId): BlockView | undefined {
  return view.blocks.find((b) => b.id === block);
}

/** The ops that add sentence slots for `text` after `after` in `block`. */
function sentenceOps(block: ItemId, after: ItemId | null, parts: string[]): Op[] {
  const ops: Op[] = [];
  let prev = after;
  for (const p of parts) {
    const s = newItemId();
    ops.push({ o: 'ins', list: keys.sentences(block), id: s, after: prev });
    ops.push({ o: 'set', k: keys.sentence(block, s), v: p });
    prev = s;
  }
  return ops;
}

/** The current text of a sentence that can be typed in: not in clash, and not deleted. */
function typeable(f: Field<string>): string | null {
  if (f.state === 'clash') return null;
  return typeof f.shown?.value === 'string' ? f.shown.value : null;
}

/**
 * The block's new text, without the sentences in clash (those show as lanes and are changed by picking).
 * Unchanged sentences at the start and end are matched; the ones between are rewritten, added or deleted.
 */
function setText(view: DocView, block: ItemId, text: string): Op[] {
  const b = findBlock(view, block);
  if (!b || b.table) return [];
  const old = b.sentences
    .map((s) => ({ id: s.id, text: typeable(s.field) }))
    .filter((s): s is { id: ItemId; text: string } => s.text !== null);
  const next = splitSentences(text);
  let pre = 0;
  while (pre < old.length && pre < next.length && old[pre]!.text === next[pre]) pre++;
  let post = 0;
  while (
    post < old.length - pre &&
    post < next.length - pre &&
    old[old.length - 1 - post]!.text === next[next.length - 1 - post]
  )
    post++;
  const oldMid = old.slice(pre, old.length - post);
  const newMid = next.slice(pre, next.length - post);
  const ops: Op[] = [];
  const pairs = Math.min(oldMid.length, newMid.length);
  for (let i = 0; i < pairs; i++) ops.push({ o: 'set', k: keys.sentence(block, oldMid[i]!.id), v: newMid[i]! });
  for (let i = pairs; i < oldMid.length; i++) ops.push({ o: 'set', k: keys.sentence(block, oldMid[i]!.id), v: null });
  if (newMid.length > pairs) {
    // New sentences go right after the typeable sentence before them. Added before every typeable sentence,
    // they go after whatever comes before the first one (a sentence in clash, or the start).
    let after: ItemId | null;
    if (pre + pairs > 0) after = old[pre + pairs - 1]!.id;
    else if (old.length > 0) {
      const first = b.sentences.findIndex((s) => s.id === old[0]!.id);
      after = first > 0 ? b.sentences[first - 1]!.id : null;
    } else after = lastId(b.sentences);
    ops.push(...sentenceOps(block, after, newMid.slice(pairs)));
  }
  return ops;
}

function lastId<T extends { id: ItemId }>(items: readonly T[]): ItemId | null {
  return items.length > 0 ? items[items.length - 1]!.id : null;
}

function markKey(type: string, quote: string, occurrence: number): string {
  return `${type}|${occurrence}|${quote}`;
}

export const intents: Intents = {
  setTitle: (_view, text) => [{ o: 'set', k: keys.title, v: text }],

  setText,

  insertBlock(_view, after, style, text) {
    const block = newItemId();
    const ops: Op[] = [
      { o: 'ins', list: keys.blocks, id: block, after },
      { o: 'set', k: keys.blockStyle(block), v: style as unknown as Json },
      ...sentenceOps(block, null, splitSentences(text)),
    ];
    return { ops, block };
  },

  deleteBlock(view, block) {
    const b = findBlock(view, block);
    const ops: Op[] = [{ o: 'set', k: keys.blockStyle(block), v: null }];
    if (!b) return ops;
    for (const s of b.sentences) ops.push({ o: 'set', k: keys.sentence(block, s.id), v: null });
    for (const r of b.table?.rows ?? []) ops.push({ o: 'set', k: keys.row(block, r.id), v: null });
    return ops;
  },

  setStyle: (block, style: BlockStyle) => [{ o: 'set', k: keys.blockStyle(block), v: style as unknown as Json }],

  setTick: (block, ticked) => [{ o: 'set', k: keys.tick(block), v: ticked }],

  setMark(block, type, quote, occurrence, on, href) {
    if (!quote || occurrence < 1) return [];
    if (type === 'link' && on && !safeHref(href)) return [];
    const v: Json = on ? { type, quote, occurrence, ...(type === 'link' ? { href: href!.trim() } : {}) } : null;
    return [{ o: 'set', k: keys.mark(block, markKey(type, quote, occurrence)), v }];
  },

  pick(field, lane) {
    const all = [...field.lanes, ...field.kept, ...(field.shown ? [field.shown] : [])];
    const chosen = all.find((l) => l.ref === lane);
    if (!chosen) return [];
    const others: ChangeId[] = [];
    for (const l of all) if (l.ref !== lane && !others.includes(l.ref)) others.push(l.ref);
    return [{ o: 'set', k: field.key, v: (chosen.value ?? null) as Json, others }];
  },

  unpick(field) {
    if (field.kept.length === 0 || !field.shown) return [];
    const refs: ChangeId[] = [field.shown.ref];
    for (const l of field.kept) if (!refs.includes(l.ref)) refs.push(l.ref);
    return [{ o: 'set', k: field.key, v: { $lanes: refs } }];
  },

  setSettle: (rule) => [{ o: 'set', k: keys.settle, v: rule as unknown as Json }],

  createTable(_view, after, name, columns) {
    const block = newItemId();
    const ops: Op[] = [
      { o: 'ins', list: keys.blocks, id: block, after },
      { o: 'set', k: keys.blockStyle(block), v: { kind: 'table' } },
      { o: 'set', k: keys.tableName(block), v: name },
    ];
    let prev: ItemId | null = null;
    for (const def of columns.slice(0, 8)) {
      const c = newItemId();
      ops.push({ o: 'ins', list: keys.columns(block), id: c, after: prev });
      ops.push({ o: 'set', k: keys.column(block, c), v: { name: def.name, kind: def.kind } });
      prev = c;
    }
    return { ops, block };
  },

  addColumn(view, table, def) {
    const column = newItemId();
    const cols = findBlock(view, table)?.table?.columns ?? [];
    return {
      column,
      ops: [
        { o: 'ins', list: keys.columns(table), id: column, after: lastId(cols) },
        { o: 'set', k: keys.column(table, column), v: { name: def.name, kind: def.kind } },
      ],
    };
  },

  setColumn: (table, column, def) => [{ o: 'set', k: keys.column(table, column), v: { name: def.name, kind: def.kind } }],

  addRow(view, table, values) {
    const row = newItemId();
    const rows = findBlock(view, table)?.table?.rows ?? [];
    const ops: Op[] = [
      { o: 'ins', list: keys.rows(table), id: row, after: lastId(rows) },
      { o: 'set', k: keys.row(table, row), v: true },
    ];
    for (const [column, text] of Object.entries(values)) ops.push({ o: 'set', k: keys.cell(table, row, column), v: text });
    return { ops, row };
  },

  // Changing a cell also says "this row is still here", so a delete made while apart shows as two versions.
  setCell: (table, row, column, text) => [
    { o: 'set', k: keys.cell(table, row, column), v: text },
    { o: 'set', k: keys.row(table, row), v: true },
  ],

  deleteRow: (table, row) => [{ o: 'set', k: keys.row(table, row), v: null }],

  setTableName: (table, name) => [{ o: 'set', k: keys.tableName(table), v: name }],

  addRule(view, def) {
    const rule = newItemId();
    return {
      rule,
      ops: [
        { o: 'ins', list: keys.rules, id: rule, after: lastId(view.rules) },
        { o: 'set', k: keys.rule(rule), v: def as unknown as Json },
      ],
    };
  },

  deleteRule: (rule) => [{ o: 'set', k: keys.rule(rule), v: null }],

  setWriterName: (me, name) => [{ o: 'set', k: keys.writerName(me), v: name }],

  setWriterColour: (me, colour) => [{ o: 'set', k: keys.writerColour(me), v: colour }],

  setTemplate: (template) => [{ o: 'set', k: keys.template, v: template }],
};

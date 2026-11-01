// Finding fields in a DocView by their register key, and counting them by kind.

import type { DocView, Field, ItemId, SettleRule } from '../contracts';

export type FieldKind = 'sentence' | 'cell' | 'row' | 'tick' | 'title' | 'rule' | 'settle' | 'column' | 'table-name' | 'other';

export interface Located {
  key: string;
  kind: FieldKind;
  field: Field<unknown>;
  /** The block it sits in, for jumping there. */
  block: ItemId | null;
  /** The table's name, for cells, rows and columns. */
  table?: string;
}

/** Every field the view shows, with where it sits. */
export function allFields(view: DocView): Located[] {
  const out: Located[] = [];
  out.push({ key: view.title.key, kind: 'title', field: view.title as Field<unknown>, block: null });
  out.push({ key: view.settle.key, kind: 'settle', field: view.settle as Field<unknown>, block: null });
  for (const b of view.blocks) {
    for (const s of b.sentences) out.push({ key: s.field.key, kind: 'sentence', field: s.field as Field<unknown>, block: b.id });
    if (b.tick) out.push({ key: b.tick.key, kind: 'tick', field: b.tick as Field<unknown>, block: b.id });
    const t = b.table;
    if (t) {
      const table = shownText(t.name) || 'the table';
      out.push({ key: t.name.key, kind: 'table-name', field: t.name as Field<unknown>, block: b.id, table });
      for (const c of t.columns) out.push({ key: c.def.key, kind: 'column', field: c.def as Field<unknown>, block: b.id, table });
      for (const r of t.rows) {
        out.push({ key: r.alive.key, kind: 'row', field: r.alive as Field<unknown>, block: b.id, table });
        for (const cell of Object.values(r.cells)) out.push({ key: cell.key, kind: 'cell', field: cell as Field<unknown>, block: b.id, table });
      }
    }
  }
  for (const r of view.rules) out.push({ key: r.field.key, kind: 'rule', field: r.field as Field<unknown>, block: null });
  return out;
}

export function fieldIndex(view: DocView): Map<string, Located> {
  return new Map(allFields(view).map((f) => [f.key, f]));
}

/** The block a register key belongs to: "b/<block>/…" → block. */
export function blockOfKey(key: string): ItemId | null {
  const m = /^b\/([^/]+)\//.exec(key);
  return m?.[1] ?? null;
}

export function kindOfKey(key: string): FieldKind {
  if (key === 'title') return 'title';
  if (key === 'settle') return 'settle';
  if (key.startsWith('rule/')) return 'rule';
  if (/^b\/[^/]+\/s\/[^/]+$/.test(key)) return 'sentence';
  if (/^b\/[^/]+\/cell\//.test(key)) return 'cell';
  if (/^b\/[^/]+\/row\/[^/]+$/.test(key)) return 'row';
  if (/^b\/[^/]+\/tick$/.test(key)) return 'tick';
  if (/^b\/[^/]+\/col\//.test(key)) return 'column';
  if (/^b\/[^/]+\/name$/.test(key)) return 'table-name';
  return 'other';
}

/** The text a string field shows (empty while it's in clash). */
export function shownText(f: Field<string>): string {
  return f.shown?.value ?? '';
}

/** "1 sentence, 1 cell and 1 row": what the open clashes are, by kind. */
export function clashParts(keys: readonly string[]): string[] {
  const counts = new Map<string, number>();
  for (const k of keys) {
    const kind = kindOfKey(k);
    const word = kind === 'sentence' ? 'sentence' : kind === 'cell' ? 'cell' : kind === 'row' ? 'row' : kind === 'tick' ? 'tick' : kind === 'title' ? 'title' : kind === 'rule' ? 'rule' : kind === 'settle' ? 'settle rule' : 'other spot';
    counts.set(word, (counts.get(word) ?? 0) + 1);
  }
  const order = ['sentence', 'cell', 'row', 'tick', 'title', 'rule', 'settle rule', 'other spot'];
  return order.filter((w) => counts.has(w)).map((w) => `${counts.get(w)} ${counts.get(w) === 1 ? w : `${w}s`}`);
}

export function settleName(rule: SettleRule | null | undefined, nameOf: (actor: string) => string): string {
  switch (rule?.kind) {
    case 'newest':
      return 'Keep the newest one';
    case 'person':
      return `One person's version wins: ${nameOf(rule.actor)}`;
    case 'smaller':
      return 'For numbers, keep the smaller one';
    default:
      return 'Always ask';
  }
}

/** The short name settled spots use in "Settled: newest · 1 other". */
export function settleShort(rule: SettleRule | null | undefined): string {
  switch (rule?.kind) {
    case 'newest':
      return 'newest';
    case 'person':
      return 'person';
    case 'smaller':
      return 'smaller';
    default:
      return 'ask';
  }
}

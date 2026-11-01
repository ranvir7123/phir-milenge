// Naming rules and describing their results. Spec: 2-user-experience.md, "Adding a rule" and "Check rules".

import type { ActorId, ColumnView, DocView, Field, ItemId, RowView, RuleDef, RuleView, TableView } from '../contracts';
import { shownText } from './fields';
import { cutName, nameOf } from './format';

export interface TableRef {
  block: ItemId;
  name: string;
  table: TableView;
}

/** Every table in the doc with the name it shows. */
export function tablesOf(view: DocView): TableRef[] {
  return view.blocks.filter((b) => b.table).map((b, i) => ({ block: b.id, name: shownText(b.table!.name) || `Table ${i + 1}`, table: b.table! }));
}

export function columnName(c: ColumnView | undefined): string {
  return c?.def.shown?.value?.name ?? c?.def.lanes[0]?.value?.name ?? 'a deleted column';
}

/** A rule's short name: the one it carries, or one made from its sentence. */
export function ruleName(def: RuleDef | null | undefined, view: DocView): string {
  if (!def) return 'Deleted rule';
  if (typeof def.name === 'string' && def.name.trim()) return def.name.trim();
  const t = tablesOf(view).find((x) => x.block === def.table);
  const col = (id: unknown) => columnName(t?.table.columns.find((c) => c.id === id));
  if (def.kind === 'unique') {
    const u = def as Extract<RuleDef, { kind: 'unique' }>;
    const times = typeof u.times === 'number' ? u.times : 1;
    const what = u.value ? `${u.value} ` : u.of ? `${col(u.of)} ` : '';
    return `${col(u.column)}: ${what}only ${times} ${times === 1 ? 'time' : 'times'}`;
  }
  if (def.kind === 'limit') {
    const lim = def as Extract<RuleDef, { kind: 'limit' }>;
    const what = lim.where ? lim.where.equals : lim.total ? `Total of ${col(lim.total)}` : 'Rows';
    return `${what}: within ${lim.max}`;
  }
  return 'A newer kind of rule';
}

/** The rule's definition as shown (null while two versions are open, or when deleted). */
export function ruleDef(r: RuleView): RuleDef | null {
  return (r.field.shown?.value ?? null) as RuleDef | null;
}

/** Broken rules first, then the rest, in the doc's order. */
export function sortedRules(view: DocView): RuleView[] {
  const rank = (r: RuleView) => (r.field.state === 'clash' ? 0 : r.result.state === 'broken' ? 1 : r.result.state === 'unknown' ? 2 : 3);
  return view.rules
    .map((r, i) => ({ r, i }))
    .filter(({ r }) => r.field.state === 'clash' || r.field.shown?.value != null)
    .sort((a, b) => rank(a.r) - rank(b.r) || a.i - b.i)
    .map(({ r }) => r);
}

/** "Ration card 4471 has Family kit 2 times." from "One kit per ration card. Ration card 4471 has Family kit 2 times." */
export function messageWithoutName(message: string, name: string): string {
  const prefix = `${name}.`;
  if (message.toLowerCase().startsWith(prefix.toLowerCase())) return message.slice(prefix.length).trim();
  return message;
}

const norm = (s: string) => s.trim().toLocaleLowerCase();

/** A cell's values: every version until someone picks. */
function cellValues(field: Field<string> | undefined): string[] {
  if (!field) return [];
  if (field.state === 'clash') return field.lanes.map((l) => l.value ?? '').filter((v) => v.trim() !== '');
  return field.shown?.value?.trim() ? [field.shown.value] : [];
}

function columnByName(table: TableView, names: string[]): ItemId | null {
  return table.columns.find((c) => names.includes(norm(columnName(c))))?.id ?? null;
}

/** Who wrote a row: whoever put it in, the same as the fill-in sheet's message. */
function rowWriter(row: RowView): ActorId | null {
  return row.alive.shown?.actor ?? row.alive.lanes[0]?.actor ?? null;
}

/** "A", "A and B", "A, B and C". */
function listWords(items: string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

/** A broken rule lists this many rows, then "and 2 more". */
const DETAIL_ROWS = 4;

/**
 * The Rules panel's words for a broken rule: each row with its writer, Camp or Place and Day or Date where the table
 * has them. "Ration card 4471 has Kit Family kit (Rina, Gosaba, Mon) and Kit Family kit (Tanmoy, Basanti, Tue).
 * Each list was fine alone." Spec: 2-user-experience.md, "Check rules", point 5 (same pattern as the fill-in sheet).
 * Falls back to the engine's own words when it can't name the rows.
 */
export function brokenDetail(r: RuleView, view: DocView): string {
  if (r.result.state !== 'broken') return '';
  const def = ruleDef(r);
  const plain = messageWithoutName(r.result.message, ruleName(def, view));
  if (!def || def.kind !== 'unique') return plain;
  const u = def as Extract<RuleDef, { kind: 'unique' }>;
  const table = tablesOf(view).find((t) => t.block === u.table)?.table;
  if (!table || typeof u.column !== 'string') return plain;
  const ids = new Set(r.result.where.map((w) => w.row).filter((x): x is ItemId => !!x));
  const rows = table.rows.filter((row) => ids.has(row.id));
  if (rows.length === 0) return plain;

  const col = columnName(table.columns.find((c) => c.id === u.column));
  const of = typeof u.of === 'string' ? u.of : null;
  const ofName = of ? columnName(table.columns.find((c) => c.id === of)) : null;
  const wanted = typeof u.value === 'string' && u.value.trim() ? norm(u.value) : null;
  const max = typeof u.times === 'number' && u.times >= 1 ? Math.floor(u.times) : 1;
  const place = columnByName(table, ['camp', 'place']);
  const day = columnByName(table, ['day', 'date']);

  // The rows that share a value, as the engine counts them.
  const groups = new Map<string, { shown: string; rows: RowView[] }>();
  for (const row of rows) {
    const seen = new Set<string>();
    for (const v of cellValues(row.cells[u.column])) {
      const k = norm(v);
      if (seen.has(k)) continue;
      seen.add(k);
      const g = groups.get(k);
      if (g) g.rows.push(row);
      else groups.set(k, { shown: v.trim(), rows: [row] });
    }
  }

  const sentences: string[] = [];
  let eachFineAlone = true;
  for (const g of groups.values()) {
    if (g.rows.length <= max) continue;
    const byWriter = new Map<ActorId | null, number>();
    const items = g.rows.map((row) => {
      const who = rowWriter(row);
      byWriter.set(who, (byWriter.get(who) ?? 0) + 1);
      const parts = [who ? cutName(nameOf(view, who)) : '', place ? (cellValues(row.cells[place])[0]?.trim() ?? '') : '', day ? (cellValues(row.cells[day])[0]?.trim() ?? '') : ''].filter(Boolean);
      const paren = parts.length > 0 ? `(${parts.join(', ')})` : '';
      if (!of || !ofName) return paren;
      const counted = cellValues(row.cells[of]).find((v) => wanted === null || norm(v) === wanted)?.trim() ?? '';
      return `${ofName} ${counted}${paren ? ` ${paren}` : ''}`;
    });
    if (byWriter.has(null) || [...byWriter.values()].some((n) => n > max)) eachFineAlone = false;
    const shown = items.slice(0, DETAIL_ROWS);
    if (items.length > DETAIL_ROWS) shown.push(`${items.length - DETAIL_ROWS} more`);
    if (of && ofName) sentences.push(`${col} ${g.shown} has ${listWords(shown)}.`);
    else if (items.every(Boolean)) sentences.push(`${col} ${g.shown} is in ${g.rows.length} rows: ${listWords(shown)}.`);
    else sentences.push(`${col} ${g.shown} is in ${g.rows.length} rows.`);
  }
  if (sentences.length === 0) return plain;
  if (eachFineAlone) sentences.push('Each list was fine alone.');
  return sentences.join(' ');
}

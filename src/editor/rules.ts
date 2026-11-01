// The live "Breaks a rule: …" line in the fill-in sheet. It checks one row that isn't in the doc yet against
// everything this phone holds. After the row goes in, the engine's own check is what the Rules panel shows.

import type { BlockView, DocView, Field, ItemId, RowView } from '../contracts';
import { cutName, writerName } from './words';

const norm = (s: string) => s.trim().toLocaleLowerCase();

function cellValues(field: Field<string> | undefined): string[] {
  if (!field) return [];
  // Until someone picks, every value counts.
  if (field.state === 'clash') return field.lanes.map((l) => l.value ?? '').filter(Boolean);
  return field.shown?.value ? [field.shown.value] : [];
}

function rowAlive(row: RowView): boolean {
  if (row.alive.state === 'clash') return true;
  return row.alive.shown?.value === true;
}

function lowerFirst(name: string): string {
  return /^[A-Z][a-z]/.test(name) ? name[0]!.toLowerCase() + name.slice(1) : name;
}

function colByName(block: BlockView, names: string[]): ItemId | null {
  for (const c of block.table?.columns ?? []) {
    const n = norm(c.def.shown?.value?.name ?? '');
    if (names.includes(n)) return c.id;
  }
  return null;
}

function colName(block: BlockView, id: ItemId): string {
  return block.table?.columns.find((c) => c.id === id)?.def.shown?.value?.name ?? '';
}

/** "(Rina, Gosaba, Mon)": the row's writer, then its Camp or Place, then its Day or Date, where the table has them. */
function rowWhere(view: DocView, block: BlockView, row: RowView): string {
  const parts: string[] = [];
  const actor = row.alive.shown?.actor ?? row.alive.lanes[0]?.actor;
  if (actor) parts.push(cutName(writerName(view, actor)));
  const place = colByName(block, ['camp', 'place']);
  if (place) {
    const v = cellValues(row.cells[place])[0];
    if (v) parts.push(v);
  }
  const day = colByName(block, ['day', 'date']);
  if (day) {
    const v = cellValues(row.cells[day])[0];
    if (v) parts.push(v);
  }
  return parts.length ? ` (${parts.join(', ')})` : '';
}

/** The first rule the row would break, in the sheet's words, or null. `editing` is the row being changed. */
export function ruleWarning(view: DocView, block: BlockView, values: Record<ItemId, string>, editing: ItemId | null): string | null {
  const table = block.table;
  if (!table) return null;
  const rows = table.rows.filter((r) => r.id !== editing && rowAlive(r));
  for (const rule of view.rules) {
    const def = rule.field.shown?.value;
    if (!def || def.table !== block.id) continue;
    const name = lowerFirst(typeof def.name === 'string' && def.name ? def.name : 'a rule of this doc');
    if (def.kind === 'unique' && typeof def.column === 'string') {
      const column = def.column;
      const mine = norm(values[column] ?? '');
      if (!mine) continue;
      const of = typeof def.of === 'string' ? def.of : null;
      const want = typeof def.value === 'string' ? norm(def.value) : null;
      const times = typeof def.times === 'number' ? def.times : 1;
      const counts = (vals: Record<ItemId, string[]>) => {
        // "any value" (no value set) counts every row with this card.
        if (!of || want === null) return true;
        return (vals[of] ?? []).some((x) => norm(x) === want);
      };
      if (!counts(Object.fromEntries(Object.entries(values).map(([k, v]) => [k, v ? [v] : []])))) continue;
      const same = rows.filter((r) => {
        if (!cellValues(r.cells[column]).some((v) => norm(v) === mine)) return false;
        return counts(Object.fromEntries(Object.entries(r.cells).map(([k, f]) => [k, cellValues(f)])));
      });
      if (same.length + 1 <= times) continue;
      const first = same[0]!;
      const label = `${colName(block, column)} ${values[column]!.trim()}`;
      if (of) {
        const ofValue = cellValues(first.cells[of])[0] ?? '';
        return `Breaks a rule: ${name}. ${label} already has ${colName(block, of)} ${ofValue}${rowWhere(view, block, first)}, as far as this phone knows.`;
      }
      return `Breaks a rule: ${name}. ${label} is already in the table${rowWhere(view, block, first)}, as far as this phone knows.`;
    }
    if (def.kind === 'limit' && typeof def.max === 'number') {
      // A rule from another phone may be malformed: a "where" that isn't a column and a value means "skip this rule".
      const w = def.where as { column?: unknown; equals?: unknown } | undefined;
      if (w !== undefined && (typeof w !== 'object' || w === null || typeof w.column !== 'string' || typeof w.equals !== 'string')) continue;
      const where = w as { column: ItemId; equals: string } | undefined;
      const matches = (vals: string[] | undefined) => !where || (vals ?? []).some((v) => norm(v) === norm(where.equals));
      if (!matches(values[where?.column ?? ''] ? [values[where!.column]!] : [])) continue;
      const counted = rows.filter((r) => matches(cellValues(r.cells[where?.column ?? ''])));
      const total = typeof def.total === 'string' ? def.total : null;
      if (total) {
        const num = (s: string | undefined) => Number((s ?? '').replace(/,/g, '').trim()) || 0;
        const sum = counted.reduce((n, r) => n + num(cellValues(r.cells[total])[0]), 0) + num(values[total]);
        if (sum > def.max) return `Breaks a rule: ${name}. This would make the total ${sum.toLocaleString('en-IN')}, as far as this phone knows.`;
        continue;
      }
      const n = counted.length + 1;
      if (n > def.max) return `Breaks a rule: ${name}. This would be number ${n}, as far as this phone knows.`;
    }
  }
  return null;
}

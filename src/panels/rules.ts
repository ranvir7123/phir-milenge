// Naming rules and describing their results. Spec: 2-user-experience.md, "Adding a rule" and "Check rules".

import type { ColumnView, DocView, ItemId, RuleDef, RuleView, TableView } from '../contracts';
import { shownText } from './fields';

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

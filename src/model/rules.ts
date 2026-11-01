// Check rules, worked out on the doc as shown, counting every version of an open clash (section 1.8).
// Messages follow the UX plan's one pattern for any table:
// "One kit per ration card. Ration card 4471 has Kit Family kit 2 times."

import type { ActorId, BlockView, Field, ItemId, RowView, RuleDef, RuleResult, TableView, WriterView } from '../contracts';

/** Spaces at either end and capital letters are ignored. */
export function norm(v: unknown): string {
  return typeof v === 'string' ? v.trim().toLowerCase() : typeof v === 'number' ? String(v) : '';
}

/** Every value a cell has: all versions while it's in clash, else the one shown. */
function cellValues(f: Field<string> | undefined): string[] {
  if (!f) return [];
  const ls = f.state === 'clash' ? f.lanes : f.shown ? [f.shown] : [];
  const out: string[] = [];
  for (const l of ls) if (typeof l.value === 'string' && l.value.trim() !== '') out.push(l.value);
  return out;
}

function columnName(table: TableView, column: ItemId): string | null {
  const c = table.columns.find((x) => x.id === column);
  const def = c?.def.shown?.value ?? c?.def.lanes.find((l) => l.value)?.value;
  return def ? def.name : null;
}

function times(n: number): string {
  return n === 1 ? '1 time' : `${n} times`;
}

function listWords(parts: string[]): string {
  if (parts.length <= 1) return parts.join('');
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

function shortName(def: { name?: string }, fallback: string): string {
  return typeof def.name === 'string' && def.name.trim() !== '' ? def.name.trim() : fallback;
}

function asNumber(v: string): number | null {
  return /^\s*-?\d+(\.\d+)?\s*$/.test(v) ? Number(v) : null;
}

export function checkRule(
  def: RuleDef | null | undefined,
  blocks: readonly BlockView[],
  _writers: Readonly<Record<ActorId, WriterView>>,
): RuleResult {
  if (!def || typeof def !== 'object') return { state: 'unknown' };
  if (def.kind !== 'unique' && def.kind !== 'limit') return { state: 'unknown' };
  const block = blocks.find((b) => b.id === def.table && b.table);
  const table = block?.table;
  if (!block || !table) return { state: 'unknown' };

  if (def.kind === 'unique') {
    const d = def as Extract<RuleDef, { kind: 'unique' }>;
    const col = columnName(table, d.column);
    const of = typeof d.of === 'string' ? d.of : null;
    const ofName = of ? columnName(table, of) : null;
    if (col === null || (of && ofName === null)) return { state: 'unknown' };
    const max = typeof d.times === 'number' && d.times >= 1 ? Math.floor(d.times) : 1;
    const wanted = typeof d.value === 'string' && d.value.trim() !== '' ? norm(d.value) : null;
    // Card value → the rows that have it, with the counted value of each row.
    const groups = new Map<string, { shown: string; rows: { row: RowView; counted: string | null }[] }>();
    for (const row of table.rows) {
      let counted: string | null = null;
      if (of) {
        const vals = cellValues(row.cells[of]).filter((v) => wanted === null || norm(v) === wanted);
        if (vals.length === 0) continue;
        counted = vals[0]!;
      }
      const seenHere = new Set<string>();
      for (const v of cellValues(row.cells[d.column])) {
        const k = norm(v);
        if (seenHere.has(k)) continue;
        seenHere.add(k);
        const g = groups.get(k);
        if (g) g.rows.push({ row, counted });
        else groups.set(k, { shown: v.trim(), rows: [{ row, counted }] });
      }
    }
    const sentences: string[] = [];
    const where: { block: ItemId; row: ItemId }[] = [];
    for (const g of groups.values()) {
      if (g.rows.length <= max) continue;
      for (const r of g.rows) if (!where.some((w) => w.row === r.row.id)) where.push({ block: block.id, row: r.row.id });
      if (of && ofName) {
        const kinds = new Map<string, string>();
        for (const r of g.rows) if (r.counted !== null && !kinds.has(norm(r.counted))) kinds.set(norm(r.counted), r.counted.trim());
        if (kinds.size === 1) sentences.push(`${col} ${g.shown} has ${ofName} ${[...kinds.values()][0]} ${times(g.rows.length)}.`);
        else sentences.push(`${col} ${g.shown} has ${listWords([...kinds.values()].map((v) => `${ofName} ${v}`))}.`);
      } else {
        sentences.push(`${col} ${g.shown} is in ${g.rows.length} rows.`);
      }
    }
    if (sentences.length === 0) return { state: 'ok' };
    const fallback = `${col}: ${wanted !== null ? d.value!.trim() : ofName ?? col} only ${times(max)}`;
    return { state: 'broken', message: `${shortName(d, fallback)}. ${sentences.join(' ')}`, where };
  }

  const d = def as Extract<RuleDef, { kind: 'limit' }>;
  if (typeof d.max !== 'number') return { state: 'unknown' };
  const whereCol = d.where ? columnName(table, d.where.column) : null;
  if (d.where && whereCol === null) return { state: 'unknown' };
  const totalCol = d.total ? columnName(table, d.total) : null;
  if (d.total && totalCol === null) return { state: 'unknown' };
  const rows: RowView[] = [];
  let sum = 0;
  for (const row of table.rows) {
    if (d.where && !cellValues(row.cells[d.where.column]).some((v) => norm(v) === norm(d.where!.equals))) continue;
    rows.push(row);
    if (d.total) {
      // Every version counts until someone picks: the largest one is what this phone can't rule out.
      const nums = cellValues(row.cells[d.total]).map(asNumber).filter((n): n is number => n !== null);
      if (nums.length > 0) sum += Math.max(...nums);
    }
  }
  const amount = d.total ? sum : rows.length;
  if (amount <= d.max) return { state: 'ok' };
  const scope = d.where ? `where ${whereCol} is ${d.where.equals.trim()}` : '';
  const what = d.total ? `The total of ${totalCol}${scope ? ` ${scope}` : ''}` : `Rows${scope ? ` ${scope}` : ''}`;
  const fallback = `${d.where ? d.where.equals.trim() : 'Rows'} stay within ${d.max}`;
  return {
    state: 'broken',
    message: `${shortName(d, fallback)}. ${what}: ${amount}, more than ${d.max}.`,
    where: rows.map((r) => ({ block: block.id, row: r.id })),
  };
}

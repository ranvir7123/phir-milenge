// Writes the ops of a new doc's first change, block by block, with the shared register keys.
// A new doc has no view yet for the Intents to read, so a template spells out its ops here.
// Every key comes from `keys` in src/contracts/doc.ts, and every value has that file's shapes.

import { keys } from '../contracts';
import type { BlockStyle, ColumnDef, ItemId, Op, RuleDef, SettleRule } from '../contracts';

export interface PageBuilder {
  /** A text block. Its text must be one sentence or empty: templates never need more. */
  block(style: BlockStyle, text: string): ItemId;
  /** A table with its columns. Returns the table's id and each column's id, in order. */
  table(name: string, columns: ColumnDef[]): { table: ItemId; columns: ItemId[] };
  rule(def: RuleDef): ItemId;
  ops(): Op[];
}

export function page(opts: { title: string; template: string; newItemId: () => string }): PageBuilder {
  const { newItemId } = opts;
  const settle: SettleRule = { kind: 'ask' };
  const ops: Op[] = [
    { o: 'set', k: keys.title, v: opts.title },
    { o: 'set', k: keys.template, v: opts.template },
    { o: 'set', k: keys.settle, v: settle },
  ];
  let lastBlock: ItemId | null = null;
  let lastRule: ItemId | null = null;

  function addBlock(style: BlockStyle): ItemId {
    const id = newItemId();
    ops.push({ o: 'ins', list: keys.blocks, id, after: lastBlock });
    ops.push({ o: 'set', k: keys.blockStyle(id), v: { ...style } });
    lastBlock = id;
    return id;
  }

  return {
    block(style, text) {
      const id = addBlock(style);
      if (text !== '') {
        const s = newItemId();
        ops.push({ o: 'ins', list: keys.sentences(id), id: s, after: null });
        ops.push({ o: 'set', k: keys.sentence(id, s), v: text });
      }
      return id;
    },
    table(name, columns) {
      const table = addBlock({ kind: 'table' });
      ops.push({ o: 'set', k: keys.tableName(table), v: name });
      const ids: ItemId[] = [];
      let after: ItemId | null = null;
      for (const def of columns) {
        const c = newItemId();
        ops.push({ o: 'ins', list: keys.columns(table), id: c, after });
        ops.push({ o: 'set', k: keys.column(table, c), v: { name: def.name, kind: def.kind } });
        ids.push(c);
        after = c;
      }
      return { table, columns: ids };
    },
    rule(def) {
      const id = newItemId();
      ops.push({ o: 'ins', list: keys.rules, id, after: lastRule });
      ops.push({ o: 'set', k: keys.rule(id), v: { ...def } });
      lastRule = id;
      return id;
    },
    ops: () => ops.slice(),
  };
}

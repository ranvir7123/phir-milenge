// Doc templates (Blank, Camp log, …). Owned by track F. Shapes: src/contracts/templates.ts.
// Words on the cards and in the new docs: docs/plan/2-user-experience.md, "Start a new doc: templates".
import type { TemplateInfo } from '../contracts';
import { page } from './build';

export const blank: TemplateInfo = {
  id: 'blank',
  name: 'Blank doc',
  description: 'An empty page',
  ops: (_me, _intents, newItemId) => page({ title: 'Untitled doc', template: 'blank', newItemId }).ops(),
};

/** The column names of the Camp log's table, in the order the fill-in sheet shows them. */
export const CAMP_LOG_COLUMNS = ['Family', 'Ration card', 'Kit', 'Camp', 'Day'] as const;

export const campLog: TemplateInfo = {
  id: 'camp-log',
  name: 'Camp log',
  description: 'Headings, a Kits given out table and two rules',
  ops(_me, _intents, newItemId) {
    const p = page({ title: 'Camp log', template: 'camp-log', newItemId });
    p.block({ kind: 'h2' }, 'Roads and boats');
    p.block({ kind: 'h2' }, 'Medical');
    p.block({ kind: 'h2' }, 'What we need');
    const kits = p.table(
      'Kits given out',
      CAMP_LOG_COLUMNS.map((name) => ({ name, kind: 'words' as const })),
    );
    const [, card, kit] = kits.columns as [string, string, string, string, string];
    // "In Kits given out, each Ration card can have Kit = any value only 1 time."
    p.rule({ kind: 'unique', name: 'One kit per ration card', table: kits.table, column: card, of: kit });
    // "In Kits given out, rows where Kit is Tarpaulin stay within 500."
    p.rule({
      kind: 'limit',
      name: 'Tarpaulins stay within 500',
      table: kits.table,
      where: { column: kit, equals: 'Tarpaulin' },
      max: 500,
    });
    return p.ops();
  },
};

export const tripNotes: TemplateInfo = {
  id: 'trip-notes',
  name: 'Trip notes',
  description: 'A plan, a packing checklist and a money table',
  ops(_me, _intents, newItemId) {
    const p = page({ title: 'Trip notes', template: 'trip-notes', newItemId });
    p.block({ kind: 'h2' }, 'The plan');
    p.block({ kind: 'p' }, '');
    p.block({ kind: 'h2' }, 'Packing list');
    p.block({ kind: 'li', list: 'check', indent: 0 }, '');
    p.block({ kind: 'h2' }, 'Money');
    const money = p.table('Money spent', [
      { name: 'What', kind: 'words' },
      { name: 'Paid by', kind: 'words' },
      { name: 'Amount', kind: 'number' },
    ]);
    const amount = money.columns[2] as string;
    p.rule({ kind: 'limit', name: 'Spending stays within 5000', table: money.table, total: amount, max: 5000 });
    return p.ops();
  },
};

export const meetingNotes: TemplateInfo = {
  id: 'meeting-notes',
  name: 'Meeting notes',
  description: 'Who came, what was decided, and a to-do list',
  ops(_me, _intents, newItemId) {
    const p = page({ title: 'Meeting notes', template: 'meeting-notes', newItemId });
    p.block({ kind: 'h2' }, 'Who came');
    p.block({ kind: 'li', list: 'bullet', indent: 0 }, '');
    p.block({ kind: 'h2' }, 'What we decided');
    p.block({ kind: 'li', list: 'number', indent: 0 }, '');
    p.block({ kind: 'h2' }, 'To do');
    p.block({ kind: 'li', list: 'check', indent: 0 }, '');
    return p.ops();
  },
};

/** In the order the "Start a new doc" sheet shows them. */
export const templates: TemplateInfo[] = [blank, campLog, tripNotes, meetingNotes];

export function templateById(id: string | null): TemplateInfo | undefined {
  return templates.find((t) => t.id === id);
}

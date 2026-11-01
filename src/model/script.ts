// The two-versions script test: three phones work apart on one Camp log, then catch each other
// in shuffled orders. Steps from docs/plan/3-how-its-built.md, section 6.2. Run with `npm run selftest`.

import { ASIF, BASE, RINA, TANMOY } from '../contracts/fixtures';
import type { BlockView, Change, ColumnDef, DocView, Field, Fingerprint, ItemId, Op } from '../contracts';
import { Engine } from './engine';
import { intents } from './intents';
import { runSelfTest } from './selftest';

const DOC = 'c0ffee00c0ffee00c0ffee00c0ffee00';
const T0 = Date.UTC(2026, 9, 26, 0, 0); // Mon 26 Oct 2026, 5:30 am IST

export interface ScriptStep {
  title: string;
  passed: boolean;
  detail: string;
}

export interface ScriptResult {
  steps: ScriptStep[];
  runs: number;
  same: number;
  fingerprint: Fingerprint;
  /** Every phone's truck back after they all caught each other. */
  phones: Record<string, Fingerprint>;
  passed: boolean;
}

let clock = 0;
function next(): number {
  clock += 1;
  return T0 + clock * 60_000;
}

function edit(phone: Engine, make: (view: DocView) => Op[]): Change {
  return phone.commit(make(phone.view()), { t: next() });
}

function blockStarting(view: DocView, text: string): BlockView {
  const b = view.blocks.find((x) => x.sentences.some((s) => s.field.lanes.some((l) => typeof l.value === 'string' && l.value.startsWith(text))));
  if (!b) throw new Error(`No block starts with "${text}"`);
  return b;
}

function textOf(b: BlockView): string {
  return b.sentences.map((s) => s.field.shown?.value ?? '').join('');
}

function catchFrom(to: Engine, from: Engine): void {
  to.receive([...from.changes()], { actor: from.me, via: 'beam' });
}

/** A phone that has caught every listed phone, to look at what they made together. */
function together(...phones: Engine[]): Engine {
  const all = new Map<string, Change>();
  for (const p of phones) for (const c of p.changes()) all.set(c.id, c);
  return new Engine(DOC, 'checker000000000', [...all.values()]);
}

function laneValues(f: Field<unknown>): unknown[] {
  return f.lanes.map((l) => l.value);
}

export function runTwoVersionsScript(orders = 1000, seed = 2026): ScriptResult {
  clock = 0;
  const steps: ScriptStep[] = [];
  const step = (title: string, passed: boolean, detail: string) => steps.push({ title, passed, detail });

  // Base camp makes the Camp log before the camps split.
  const base = new Engine(DOC, BASE);
  edit(base, () => [
    ...intents.setTitle(base.view(), 'Camp log: Sundarbans cyclone relief'),
    ...intents.setTemplate('camp-log'),
    ...intents.setWriterName(BASE, 'Base camp'),
    ...intents.setWriterColour(BASE, 'plain'),
  ]);
  let after: ItemId | null = null;
  const addBlock = (style: BlockView['style'], text: string) => {
    const { ops, block } = intents.insertBlock(base.view(), after, style, text);
    base.commit(ops, { t: next() });
    after = block;
    return block;
  };
  addBlock({ kind: 'h2' }, 'Roads and boats');
  const ferry = addBlock({ kind: 'p' }, 'Gosaba ferry runs every two hours from the main jetty. Take the road via Sonakhali instead.');
  const water = addBlock({ kind: 'p' }, 'Water tanks are full at Gosaba. Medicine came on Sunday.');
  const roads = addBlock({ kind: 'p' }, 'Old road notes. The bridge at Basanti is weak. Use the east road.');
  const cols: ColumnDef[] = [
    { name: 'Ration card', kind: 'words' },
    { name: 'Family', kind: 'words' },
    { name: 'Kit', kind: 'words' },
  ];
  const tbl = intents.createTable(base.view(), after, 'Kits given out', cols);
  base.commit(tbl.ops, { t: next() });
  const table = tbl.block;
  const colIds = base.view().blocks.find((b) => b.id === table)!.table!.columns.map((c) => c.id);
  const [card, family, kit] = colIds as [ItemId, ItemId, ItemId];
  const sardar = intents.addRow(base.view(), table, { [card]: '5102', [family]: 'Sardar', [kit]: 'Tarpaulin' });
  base.commit(sardar.ops, { t: next() });
  edit(base, (v) => intents.addRule(v, { kind: 'unique', name: 'One kit per ration card', table, column: card, of: kit }).ops);
  edit(base, (v) =>
    intents.addRule(v, { kind: 'limit', name: 'Tarpaulins stay within 500', table, where: { column: kit, equals: 'Tarpaulin' }, max: 500 }).ops,
  );

  // Each phone catches the Camp log, then they split up.
  const rina = new Engine(DOC, RINA, base.changes());
  const asif = new Engine(DOC, ASIF, base.changes());
  const tanmoy = new Engine(DOC, TANMOY, base.changes());
  edit(rina, () => [...intents.setWriterName(RINA, 'Rina'), ...intents.setWriterColour(RINA, 'yellow')]);
  edit(asif, () => [...intents.setWriterName(ASIF, 'Asif'), ...intents.setWriterColour(ASIF, 'pink')]);
  edit(tanmoy, () => [...intents.setWriterName(TANMOY, 'Tanmoy'), ...intents.setWriterColour(TANMOY, 'orange')]);

  // 1. Rina and Asif each rewrite the ferry sentence.
  const rinaFerry = 'Gosaba ferry runs every hour from the main jetty. ';
  const asifFerry = 'Gosaba ferry is stopped: the jetty is under water. ';
  edit(rina, (v) => intents.setText(v, ferry, `${rinaFerry}Take the road via Sonakhali instead.`));
  edit(asif, (v) => intents.setText(v, ferry, `${asifFerry}Take the road via Sonakhali instead.`));
  {
    const b = together(rina, asif).view().blocks.find((x) => x.id === ferry)!;
    const lanes = laneValues(b.sentences[0]!.field);
    const ok =
      b.sentences[0]!.field.state === 'clash' &&
      lanes.length === 2 &&
      lanes.includes(rinaFerry) &&
      lanes.includes(asifFerry) &&
      b.sentences[1]!.field.state === 'one';
    step('Rina and Asif each rewrite the ferry sentence', ok, `two lanes: ${lanes.map((x) => JSON.stringify(x)).join(' and ')}`);
  }

  // 2. Rina changes sentence 1 of a paragraph while Asif changes sentence 2.
  edit(rina, (v) => intents.setText(v, water, 'Water tanks are half full at Gosaba. Medicine came on Sunday.'));
  edit(asif, (v) => intents.setText(v, water, 'Water tanks are full at Gosaba. Medicine came on Monday.'));
  {
    const b = together(rina, asif).view().blocks.find((x) => x.id === water)!;
    const ok = textOf(b) === 'Water tanks are half full at Gosaba. Medicine came on Monday.' && b.sentences.every((s) => s.field.state === 'one');
    step('Rina changes sentence 1 while Asif changes sentence 2', ok, `both kept, no clash: "${textOf(b)}"`);
  }

  // 3. Tanmoy deletes a paragraph while Rina edits one of its sentences.
  edit(tanmoy, (v) => intents.deleteBlock(v, roads));
  edit(rina, (v) => intents.setText(v, roads, 'Old road notes. The bridge at Basanti is broken. Use the east road.'));
  {
    const b = together(rina, tanmoy).view().blocks.find((x) => x.id === roads);
    const f = b?.sentences[0]?.field;
    const ok =
      !!b &&
      b.sentences.length === 1 &&
      f?.state === 'clash' &&
      f.lanes.some((l) => l.value === null && l.actor === TANMOY) &&
      f.lanes.some((l) => l.value === 'The bridge at Basanti is broken. ' && l.actor === RINA);
    step('Tanmoy deletes a paragraph while Rina edits one of its sentences', ok, 'that sentence shows "Deleted by Tanmoy" and Rina\'s text; the rest is gone');
  }

  // 4. Rina and Asif each add a row for ration card 4471 with a family kit.
  edit(rina, (v) => intents.addRow(v, table, { [card]: '4471', [family]: 'Mondal', [kit]: 'Family kit' }).ops);
  edit(asif, (v) => intents.addRow(v, table, { [card]: '4471 ', [family]: 'Mondal', [kit]: 'family kit' }).ops);
  {
    const rule = together(rina, asif).view().rules[0]!;
    const ok = rule.result.state === 'broken' && rule.result.message.includes('Ration card 4471 has Kit Family kit 2 times.');
    step('Rina and Asif each add a row for ration card 4471', ok, rule.result.state === 'broken' ? `rule broken: "${rule.result.message}"` : 'rule not broken');
  }

  // 5. Both change the same table cell.
  edit(rina, (v) => intents.setCell(table, sardar.row, family, 'Sardar Bibi'));
  edit(asif, (v) => intents.setCell(table, sardar.row, family, 'Sardar Das'));
  {
    const row = together(rina, asif).view().blocks.find((x) => x.id === table)!.table!.rows.find((r) => r.id === sardar.row)!;
    const f = row.cells[family]!;
    const ok = f.state === 'clash' && f.lanes.length === 2 && row.alive.state === 'one';
    step('Both change the same table cell', ok, `two versions of the cell: ${laneValues(f).map((x) => JSON.stringify(x)).join(' and ')}`);
  }

  // 6. Asif catches the others, picks a lane, then undoes it.
  catchFrom(asif, rina);
  catchFrom(asif, tanmoy);
  {
    const field = asif.view().blocks.find((x) => x.id === ferry)!.sentences[0]!.field;
    const mine = field.lanes.find((l) => l.actor === ASIF)!;
    asif.commit(intents.pick(field, mine.ref), { t: next() });
    const picked = asif.view().blocks.find((x) => x.id === ferry)!.sentences[0]!.field;
    const undone = asif.undo({ t: next() });
    const back = asif.view().blocks.find((x) => x.id === ferry)!.sentences[0]!.field;
    const rinaSees = together(rina, asif).view().blocks.find((x) => x.id === ferry)!.sentences[0]!.field;
    const ok =
      picked.state === 'one' &&
      picked.shown?.value === asifFerry &&
      picked.kept.length === 1 &&
      picked.pickedBy === ASIF &&
      !!undone &&
      back.state === 'clash' &&
      back.lanes.length === 2 &&
      rinaSees.state === 'clash';
    step('Asif picks a lane, then undoes it', ok, `after the pick: one version, 1 other; after undo: ${back.lanes.length} lanes again, on every phone`);
  }

  // 7. Base camp catches everyone and sets "Keep the newest one".
  catchFrom(base, rina);
  catchFrom(base, asif);
  catchFrom(base, tanmoy);
  const openBefore = base.view().needsLook.clashes.length;
  edit(base, () => intents.setSettle({ kind: 'newest' }));
  {
    const v = base.view();
    const settled: Field<unknown>[] = [];
    for (const b of v.blocks) {
      for (const s of b.sentences) if (s.field.state === 'settled') settled.push(s.field);
      for (const r of b.table?.rows ?? []) {
        if (r.alive.state === 'settled') settled.push(r.alive);
        for (const c of Object.values(r.cells)) if (c.state === 'settled') settled.push(c);
      }
    }
    const ok =
      openBefore > 0 &&
      v.needsLook.clashes.length === 0 &&
      settled.length === openBefore &&
      settled.every((f) => f.kept.length === 1 && f.how?.kind === 'newest');
    step('Keep the newest one', ok, `${settled.length} of ${openBefore} clashes settled, each with 1 other kept`);
  }

  // 8. Every phone catches every other phone, then 1,000 shuffled arrival orders.
  const phones = [base, rina, asif, tanmoy];
  for (let round = 0; round < 2; round++) {
    for (const to of phones) for (const from of phones) if (to !== from) catchFrom(to, from);
  }
  const prints: Record<string, Fingerprint> = {};
  const names = ['Base camp', 'Rina', 'Asif', 'Tanmoy'];
  phones.forEach((p, i) => (prints[names[i]!] = p.fingerprint()));
  const all = new Map<string, Change>();
  for (const p of phones) for (const c of p.changes()) all.set(c.id, c);
  const result = runSelfTest([...all.values()], orders, seed, DOC);
  const phonesAgree = Object.values(prints).every((f) => f.hex === result.fingerprint.hex);
  step(
    `Every phone catches every other phone in ${orders} shuffled orders`,
    result.same === result.runs && phonesAgree,
    `${result.same} of ${result.runs} the same; ${phonesAgree ? 'every phone shows the same words' : 'the phones show different words'}`,
  );

  return {
    steps,
    runs: result.runs,
    same: result.same,
    fingerprint: result.fingerprint,
    phones: prints,
    passed: steps.every((s) => s.passed),
  };
}

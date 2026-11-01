// Builds the demo's starting docs: one Camp log that Base camp started on Sunday 25 Oct,
// caught by every camp before they split up, then a week of writing apart (Mon 26 to Fri 30 Oct),
// and Asif's week brought to Base camp this morning. Same output every run.
// Story, beats and what each device holds: docs/plan/4-demo-pitch-handin.md, sections 2 and 7.

import type { Change, DocEngine, DocId, DocView, EngineModule, ItemId, Op } from '../contracts';
import { campLog } from '../templates';
import { deterministic, type FakeClock } from './deterministic';
import { WRITERS, type DemoWriter } from './writers';

export const DEMO_TITLE = 'Camp log: Sundarbans cyclone relief';

/** A time in India (UTC+5:30) in Oct or Nov 2026, as ms since 1970. */
export function ist(month: 10 | 11, day: number, hour: number, minute: number): number {
  return Date.UTC(2026, month - 1, day, hour, minute) - 330 * 60_000;
}

/** Times the demo talks about, in the plan's own words. */
export const TIMES = {
  /** Base camp starts the doc, the evening before the camps split up. */
  started: ist(10, 25, 17, 0),
  /** "Gosaba ferry runs at 6 am. Bring ration cards to the jetty." (Mon morning) */
  rinaFerry: ist(10, 26, 6, 5),
  /** "No ferry to Gosaba today. The jetty is under water; …" (Mon 4:10 pm) */
  asifFerry: ist(10, 26, 16, 10),
  /** "This morning's boat brought Asif's doc to Base camp." */
  asifReachesBase: ist(11, 1, 9, 40),
} as const;

/** What the starting docs say, so tests and the playground can find their spots. */
export const TEXT = {
  ferryBefore: 'Gosaba ferry times are not known yet. Ask at the jetty.',
  ferryRina: 'Gosaba ferry runs at 6 am. Bring ration cards to the jetty.',
  ferryAsif: 'No ferry to Gosaba today. The jetty is under water; wait for the relief boat at 2 pm.',
  roadBefore: 'The road to Sonakhali is open for trucks. Diesel is at the Canning pump.',
  roadRina: 'The road to Sonakhali is open for trucks until 4 pm. Diesel is at the Canning pump.',
  roadAsif: 'The road to Sonakhali is open for trucks. Diesel is at the Canning pump, 40 litres left.',
  truckBefore: 'Next supply truck: Thursday.',
  truckAsif: 'Next supply truck: Wednesday night.',
  truckTanmoy: 'Next supply truck: Friday, because the Basanti bridge is closed.',
  doctorBefore: "Doctor's boat comes on Wednesday. Keep the sick list ready.",
  doctorRina: "Doctor's boat comes on Wednesday. Keep the sick list ready by 9 am.",
  waterBefore: 'Drinking water for 300 people.',
  waterRina: 'Drinking water for 450 people.',
  waterTanmoy: 'Drinking water for 520 people.',
  food: 'Dry food packets for 120 families.',
} as const;

export interface StartingDoc {
  /** Whose phone this doc comes from. */
  who: 'base' | 'rina' | 'asif' | 'tanmoy';
  writer: DemoWriter;
  /** The name "Save a file" would give it, so the pen drive file looks like any saved file. */
  fileName: string;
  changes: Change[];
}

export interface Scenario {
  docId: DocId;
  title: string;
  docs: Record<StartingDoc['who'], StartingDoc>;
  /** Base camp after catching Rina and Tanmoy's file too: the biggest doc beamed on stage. */
  everything: Change[];
}

/** One simulated phone in the script. */
class Phone {
  engine!: DocEngine;
  constructor(
    readonly w: DemoWriter,
    private readonly m: EngineModule,
    private readonly clock: FakeClock,
  ) {}

  view(): DocView {
    return this.engine.view();
  }

  write(t: number, ops: Op[]): Change {
    this.clock.set(t);
    return this.engine.commit(ops, { place: this.w.place, t });
  }

  /** Catch everything the other phone has, by beam. */
  catchFrom(other: Phone, t: number): void {
    this.clock.set(t);
    if (!this.engine) this.engine = this.m.openDoc(other.engine.docId, this.w.actor, []);
    this.engine.receive([...other.engine.changes()], { actor: other.w.actor, via: 'beam' });
  }

  /** First time in this doc: the app writes your name and colour into it. */
  join(t: number): Change {
    const i = this.m.intents;
    return this.write(t, [...i.setWriterName(this.w.actor, this.w.name), ...i.setWriterColour(this.w.actor, this.w.colour)]);
  }
}

function textOf(b: DocView['blocks'][number]): string {
  return b.sentences.map((s) => s.field.shown?.value ?? '').join('');
}

function blockWith(view: DocView, text: string): ItemId {
  const b = view.blocks.find((x) => x.style.kind !== 'table' && textOf(x) === text);
  if (!b) throw new Error(`Demo script: no block reads "${text}"`);
  return b.id;
}

function kitsTable(view: DocView) {
  const b = view.blocks.find((x) => x.table?.name.shown?.value === 'Kits given out');
  if (!b?.table) throw new Error('Demo script: no "Kits given out" table');
  const col = (name: string): ItemId => {
    const c = b.table?.columns.find((x) => x.def.shown?.value?.name === name);
    if (!c) throw new Error(`Demo script: no column "${name}"`);
    return c.id;
  };
  const row = (family: string): ItemId => {
    const familyCol = col('Family');
    const r = b.table?.rows.find((x) => x.cells[familyCol]?.shown?.value === family);
    if (!r) throw new Error(`Demo script: no row for "${family}"`);
    return r.id;
  };
  return { id: b.id, col, row };
}

type Row = { Family: string; 'Ration card': string; Kit: string; Camp: string; Day: string };

export function buildScenario(m: EngineModule): Scenario {
  return deterministic(20261101, TIMES.started, (clock) => build(m, clock));
}

function build(m: EngineModule, clock: FakeClock): Scenario {
  const i = m.intents;
  const phone = (w: DemoWriter) => new Phone(w, m, clock);
  const base = phone(WRITERS.base);
  const rina = phone(WRITERS.rina);
  const asif = phone(WRITERS.asif);
  const tanmoy = phone(WRITERS.tanmoy);
  const meher = phone(WRITERS.meher);

  const row = (p: Phone, t: number, values: Row) => {
    const view = p.view();
    const kits = kitsTable(view);
    const byId: Record<ItemId, string> = {};
    for (const [name, v] of Object.entries(values)) byId[kits.col(name)] = v;
    p.write(t, i.addRow(view, kits.id, byId).ops);
  };
  const cells = (p: Phone, t: number, family: string, values: Partial<Row>) => {
    const kits = kitsTable(p.view());
    const r = kits.row(family);
    p.write(t, Object.entries(values).flatMap(([name, v]) => i.setCell(kits.id, r, kits.col(name), v as string)));
  };
  const text = (p: Phone, t: number, before: string, after: string) => {
    const view = p.view();
    p.write(t, i.setText(view, blockWith(view, before), after));
  };
  const insert = (p: Phone, t: number, afterText: string, style: Parameters<typeof i.insertBlock>[2], words: string) => {
    const view = p.view();
    p.write(t, i.insertBlock(view, blockWith(view, afterText), style, words).ops);
  };
  const bullet = { kind: 'li', list: 'bullet', indent: 0 } as const;
  const para = { kind: 'p' } as const;

  // ---- Sunday 25 Oct: Base camp starts the doc from the Camp log template.
  clock.set(TIMES.started);
  base.engine = m.createDoc(base.w.actor, campLog.ops(base.w.actor, i, m.newItemId), { t: TIMES.started }).engine;
  base.write(ist(10, 25, 17, 1), [
    ...i.setWriterName(base.w.actor, base.w.name),
    ...i.setWriterColour(base.w.actor, base.w.colour),
    ...i.setTitle(base.view(), DEMO_TITLE),
  ]);
  insert(base, ist(10, 25, 17, 6), 'Roads and boats', para, TEXT.ferryBefore);
  insert(base, ist(10, 25, 17, 8), TEXT.ferryBefore, para, TEXT.roadBefore);
  insert(base, ist(10, 25, 17, 9), TEXT.roadBefore, para, TEXT.truckBefore);
  insert(base, ist(10, 25, 17, 12), 'Medical', para, TEXT.doctorBefore);
  insert(base, ist(10, 25, 17, 15), 'What we need', bullet, TEXT.waterBefore);
  insert(base, ist(10, 25, 17, 16), TEXT.waterBefore, bullet, TEXT.food);
  row(base, ist(10, 25, 17, 20), { Family: 'Sardar', 'Ration card': '3392', Kit: 'Waiting', Camp: 'Gosaba', Day: 'Sun' });

  // ---- Sunday evening: every camp catches the doc and picks a colour, then all swap again,
  // so every phone leaves with the same doc and all four colours taken (the judge writes in plain).
  const camps = [rina, asif, tanmoy, meher];
  camps.forEach((p, n) => {
    p.catchFrom(base, ist(10, 25, 18, 0 + n * 5));
    p.join(ist(10, 25, 18, 1 + n * 5));
  });
  camps.forEach((p, n) => base.catchFrom(p, ist(10, 25, 18, 30 + n)));
  camps.forEach((p, n) => p.catchFrom(base, ist(10, 25, 18, 40 + n)));

  // ---- The week apart. Nobody meets anybody.
  // Rina, Gosaba camp
  text(rina, TIMES.rinaFerry, TEXT.ferryBefore, TEXT.ferryRina);
  row(rina, ist(10, 26, 7, 40), { Family: 'Mondal', 'Ration card': '4471', Kit: 'Family kit', Camp: 'Gosaba', Day: 'Mon' });
  cells(rina, ist(10, 26, 8, 15), 'Sardar', { Kit: 'Family kit', Day: 'Mon' });
  text(rina, ist(10, 26, 9, 20), TEXT.roadBefore, TEXT.roadRina);
  text(rina, ist(10, 27, 7, 10), TEXT.doctorBefore, TEXT.doctorRina);
  text(rina, ist(10, 27, 12, 30), TEXT.waterBefore, TEXT.waterRina);
  insert(rina, ist(10, 28, 10, 0), TEXT.doctorRina, para, 'Gosaba camp: 3 children with diarrhoea since Tuesday. We need more ORS packets.');
  row(rina, ist(10, 29, 9, 0), { Family: 'Pramanik', 'Ration card': '5120', Kit: 'Family kit', Camp: 'Gosaba', Day: 'Thu' });
  row(rina, ist(10, 29, 9, 25), { Family: 'Bibi', 'Ration card': '6034', Kit: 'Tarpaulin', Camp: 'Gosaba', Day: 'Thu' });
  insert(rina, ist(10, 30, 8, 0), TEXT.food, bullet, 'Torch batteries for the night watch.');

  // Asif, Patharpratima camp
  text(asif, TIMES.asifFerry, TEXT.ferryBefore, TEXT.ferryAsif);
  text(asif, ist(10, 26, 18, 0), TEXT.roadBefore, TEXT.roadAsif);
  text(asif, ist(10, 27, 9, 0), TEXT.truckBefore, TEXT.truckAsif);
  row(asif, ist(10, 27, 11, 0), { Family: 'Jana', 'Ration card': '2875', Kit: 'Family kit', Camp: 'Patharpratima', Day: 'Tue' });
  row(asif, ist(10, 28, 8, 30), { Family: 'Maity', 'Ration card': '3011', Kit: 'Tarpaulin', Camp: 'Patharpratima', Day: 'Wed' });
  insert(asif, ist(10, 28, 14, 0), TEXT.doctorBefore, para, 'Patharpratima camp: the clinic tent is up. Two nurses are on duty from 8 am.');
  insert(asif, ist(10, 29, 16, 0), TEXT.food, bullet, 'Rope and bamboo poles for 20 tents.');

  // Tanmoy, Basanti camp
  {
    const view = tanmoy.view();
    tanmoy.write(ist(10, 26, 17, 0), i.deleteBlock(view, blockWith(view, TEXT.doctorBefore)));
  }
  row(tanmoy, ist(10, 27, 10, 20), { Family: 'Mondal', 'Ration card': '4471', Kit: 'Family kit', Camp: 'Basanti', Day: 'Tue' });
  cells(tanmoy, ist(10, 27, 15, 0), 'Sardar', { Kit: 'Tarpaulin', Camp: 'Basanti', Day: 'Tue' });
  text(tanmoy, ist(10, 27, 18, 0), TEXT.waterBefore, TEXT.waterTanmoy);
  text(tanmoy, ist(10, 28, 9, 0), TEXT.truckBefore, TEXT.truckTanmoy);
  insert(tanmoy, ist(10, 28, 11, 0), 'Medical', para, 'Basanti camp: 12 people with fever since Sunday. ORS packets will run out by Thursday.');
  row(tanmoy, ist(10, 29, 12, 0), { Family: 'Naskar', 'Ration card': '1450', Kit: 'Family kit', Camp: 'Basanti', Day: 'Thu' });

  // ---- This morning: the boat brings Asif's week to Base camp.
  base.catchFrom(asif, TIMES.asifReachesBase);

  const docId = base.engine.docId;
  const starting = (who: StartingDoc['who'], p: Phone): StartingDoc => {
    const changes = [...p.engine.changes()];
    const last = Math.max(...changes.filter((c) => c.actor === p.w.actor).map((c) => c.t));
    return { who, writer: p.w, fileName: fileName(DEMO_TITLE, p.w.name, last), changes };
  };

  const everything = m.openDoc(docId, base.w.actor, [
    ...base.engine.changes(),
    ...rina.engine.changes(),
    ...tanmoy.engine.changes(),
  ]);

  return {
    docId,
    title: DEMO_TITLE,
    docs: {
      base: starting('base', base),
      rina: starting('rina', rina),
      asif: starting('asif', asif),
      tanmoy: starting('tanmoy', tanmoy),
    },
    everything: [...everything.changes()],
  };
}

/** The beam speed estimate until the beam test gives a real one (3-how-its-built.md, "Beam speed"). */
export const BEAM_BYTES_PER_SECOND = 2 * 1024;
/** One beam of any demo doc, even the whole thing after every catch, takes under this. */
export const BEAM_SECONDS_CAP = 5;

export interface StartingFile {
  who: StartingDoc['who'];
  fileName: string;
  bytes: Uint8Array;
}

/** The starting docs as .relay files, plus the whole doc after every catch (for the size check). */
export function startingFiles(m: EngineModule): { docs: StartingFile[]; everything: Uint8Array } {
  const s = buildScenario(m);
  // Encoding runs on the same fixed clock, so a file never carries the time it was made.
  return deterministic(1, TIMES.asifReachesBase, () => ({
    docs: (['base', 'rina', 'asif', 'tanmoy'] as const).map((who) => ({
      who,
      fileName: s.docs[who].fileName,
      bytes: m.encodePhir({ docId: s.docId, title: s.title, changes: s.docs[who].changes }),
    })),
    everything: m.encodePhir({ docId: s.docId, title: s.title, changes: s.everything }),
  }));
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** "Camp log - Sundarbans cyclone relief - Rina - Fri 8.00 am.relay", as "Save a file" names it. */
export function fileName(title: string, writer: string, t: number): string {
  const d = new Date(t + 330 * 60_000); // read as UTC fields = India time
  const h = d.getUTCHours();
  const clock = `${h % 12 === 0 ? 12 : h % 12}.${String(d.getUTCMinutes()).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`;
  const safe = title.replace(/[\\/:*?"<>|]+/g, ' -').replace(/\s+/g, ' ').trim();
  return `${safe} - ${writer} - ${DAYS[d.getUTCDay()]} ${clock}.relay`;
}

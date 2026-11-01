import { beforeAll, describe, expect, it } from 'vitest';
import type { Change, DocView, Field } from '../contracts';
import type { Scenario } from './scenario';
import { engine as m } from '../model';
import { BEAM_BYTES_PER_SECOND, BEAM_SECONDS_CAP, TEXT, TIMES, buildScenario, fileName, startingFiles } from './scenario';
import { STARTING_FILES } from './starting-files';
import { WRITERS } from './writers';

// Until track A lands, src/model throws "not built yet" and these wait.
const engineBuilt = (() => {
  try {
    m.newItemId();
    return true;
  } catch (e) {
    return !String(e).includes('not built yet');
  }
})();

const textOf = (b: DocView['blocks'][number]) => b.sentences.map((s) => s.field.shown?.value ?? '').join('');
const lanesOf = (f: Field<unknown>) => f.lanes.map((l) => l.actor).sort();

describe('fileName', () => {
  it('names a file the way "Save a file" does, in India time', () => {
    expect(fileName('Camp log: Sundarbans cyclone relief', 'Rina', TIMES.rinaFerry)).toBe(
      'Camp log - Sundarbans cyclone relief - Rina - Mon 6.05 am.phir',
    );
    expect(fileName('Camp log', 'Asif', TIMES.asifFerry)).toBe('Camp log - Asif - Mon 4.10 pm.phir');
  });
});

describe.skipIf(!engineBuilt)('the demo starting docs', () => {
  let s: Scenario;
  let everything: DocView;
  beforeAll(() => {
    s = buildScenario(m);
    everything = m.openDoc(s.docId, WRITERS.base.actor, s.everything).view();
  });

  it('gives the same bytes every run', () => {
    const a = startingFiles(m);
    const b = startingFiles(m);
    expect(a.docs.map((f) => f.fileName)).toEqual(b.docs.map((f) => f.fileName));
    a.docs.forEach((f, n) => expect(Buffer.from(f.bytes).equals(Buffer.from(b.docs[n]!.bytes))).toBe(true));
    expect(Buffer.from(a.everything).equals(Buffer.from(b.everything))).toBe(true);
  });

  it('keeps every file small enough to beam in under 5 seconds', () => {
    const { docs, everything: all } = startingFiles(m);
    for (const f of [...docs.map((d) => d.bytes), all]) {
      expect(f.length / BEAM_BYTES_PER_SECOND).toBeLessThan(BEAM_SECONDS_CAP);
    }
  });

  it('reads back from its .phir file unchanged', () => {
    for (const f of startingFiles(m).docs) {
      const back = m.decodePhir(f.bytes);
      expect(back.ok).toBe(true);
      if (!back.ok) continue;
      expect(back.docId).toBe(s.docId);
      expect(back.title).toBe('Camp log: Sundarbans cyclone relief');
      expect(back.changes.map((c) => c.id).sort()).toEqual(s.docs[f.who].changes.map((c) => c.id).sort());
    }
  });

  it.each(['base', 'rina', 'asif', 'tanmoy'] as const)("%s's starting doc has no clashes yet", (who) => {
    const v = m.openDoc(s.docId, s.docs[who].writer.actor, s.docs[who].changes).view();
    expect(v.needsLook.clashes).toEqual([]);
    expect(v.title.shown?.value).toBe('Camp log: Sundarbans cyclone relief');
  });

  it('gives every writer their name and colour, so the judge writes in plain', () => {
    const w = everything.writers;
    expect(Object.values(w).map((x) => [x.name, x.colour]).sort()).toEqual(
      [
        ['Asif', 'pink'],
        ['Base camp', 'plain'],
        ['Meher', 'red'],
        ['Rina', 'yellow'],
        ['Tanmoy', 'orange'],
      ].sort(),
    );
  });

  it('dates Rina and Asif\'s ferry lines Monday 6:05 am and Monday 4:10 pm', () => {
    const ferry = everything.blocks.find((b) => b.sentences.some((x) => x.field.lanes.some((l) => l.value?.startsWith('Gosaba ferry runs') === true)));
    expect(ferry).toBeDefined();
    const lanes = ferry!.sentences[0]!.field.lanes;
    expect(lanes.find((l) => l.actor === WRITERS.rina.actor)?.t).toBe(TIMES.rinaFerry);
    expect(lanes.find((l) => l.actor === WRITERS.asif.actor)?.t).toBe(TIMES.asifFerry);
    expect(lanes.find((l) => l.actor === WRITERS.rina.actor)?.place).toBe('Gosaba camp');
  });

  it('has 7 clashes once every camp is in: the ferry (2 sentences), truck, doctor, water and Sardar row (2 cells)', () => {
    expect(everything.needsLook.clashes).toHaveLength(7);
    const ferry = everything.blocks.find((b) => b.sentences[0]?.field.lanes.some((l) => l.value?.startsWith('No ferry')));
    expect(ferry?.sentences[0]?.field.state).toBe('clash');
    expect(lanesOf(ferry!.sentences[0]!.field)).toEqual([WRITERS.rina.actor, WRITERS.asif.actor].sort());

    const kits = everything.blocks.find((b) => b.table?.name.shown?.value === 'Kits given out')!.table!;
    const col = (n: string) => kits.columns.find((c) => c.def.shown?.value?.name === n)!.id;
    const sardar = kits.rows.find((r) => r.cells[col('Family')]?.shown?.value === 'Sardar')!;
    expect(sardar.cells[col('Kit')]?.state).toBe('clash');
    expect(sardar.cells[col('Day')]?.state).toBe('clash');
    expect(sardar.cells[col('Camp')]?.shown?.value).toBe('Basanti');
  });

  it('keeps both merged sentences of the road line, one from Rina and one from Asif', () => {
    expect(everything.blocks.map(textOf)).toContain(
      'The road to Sonakhali is open for trucks until 4 pm. Diesel is at the Canning pump, 40 litres left.',
    );
  });

  it('breaks "One kit per ration card" on 4471, the two Mondal rows', () => {
    const rule = everything.rules.find((r) => r.field.shown?.value?.name === 'One kit per ration card')!;
    expect(rule.result.state).toBe('broken');
    if (rule.result.state === 'broken') expect(rule.result.message).toContain('4471');
  });

  it('ends on the same doc whatever order the camps arrive in', () => {
    const r = m.runSelfTest(s.everything, 50, 7);
    expect(r.differing).toEqual([]);
    expect(r.same).toBe(50);
  });

  it('shows Rina\'s 6 am line in normal-sync mode on Base camp, since it arrives after Asif\'s', () => {
    const arrival = new Map<string, number>();
    const add = (cs: readonly Change[]) => cs.forEach((c) => arrival.has(c.id) || arrival.set(c.id, arrival.size));
    add(s.docs.base.changes);
    add(s.docs.tanmoy.changes);
    add(s.docs.rina.changes);
    const v = m.openDoc(s.docId, WRITERS.base.actor, s.everything).view({ mode: 'normal-sync', arrival });
    expect(v.blocks.map(textOf)).toContain(TEXT.ferryRina);
  });

  it('shows Asif\'s line when the settle rule is "Keep the newest one"', () => {
    const doc = m.openDoc(s.docId, WRITERS.base.actor, s.everything);
    doc.commit(m.intents.setSettle({ kind: 'newest' }), { t: TIMES.asifReachesBase + 60_000 });
    expect(doc.view().blocks.map(textOf)).toContain(TEXT.ferryAsif);
  });

  it('matches the stored starting files the setup page loads (run npm run demo:docs if this fails)', () => {
    for (const who of ['base', 'rina', 'asif', 'tanmoy'] as const) {
      const stored = STARTING_FILES[who];
      const back = m.decodePhir(Uint8Array.from(Buffer.from(stored.phir, 'base64')));
      expect(back.ok).toBe(true);
      if (!back.ok) continue;
      expect(stored.fileName).toBe(s.docs[who].fileName);
      const fromFile = m.openDoc(back.docId, s.docs[who].writer.actor, back.changes).fingerprint();
      const fromScript = m.openDoc(s.docId, s.docs[who].writer.actor, s.docs[who].changes).fingerprint();
      expect(fromFile).toEqual(fromScript);
    }
  });
});

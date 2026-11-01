import { describe, expect, it } from 'vitest';
import { buildScenario } from '../demo/scenario';
import { WRITERS } from '../demo/writers';
import { engine as model } from '../model';
import { trailRows } from './knowledge';
import { brokenDetail } from './rules';
import { trailLine } from './WhoHas';

// The panels' words on the real demo docs, built the same way the demo setup builds them.
const scenario = buildScenario(model);
const JUDGE = '9a9a9a9a9a9a9a9a';

describe('a broken rule names its rows', () => {
  it('names both Mondal rows with their writer, camp and day', () => {
    const base = model.openDoc(scenario.docId, WRITERS.base.actor, scenario.everything);
    const view = base.view();
    const broken = view.rules.find((r) => r.result.state === 'broken');
    expect(broken).toBeDefined();
    expect(brokenDetail(broken!, view)).toBe(
      'Ration card 4471 has Kit Family kit (Rina, Gosaba, Mon) and Kit Family kit (Tanmoy, Basanti, Tue). Each list was fine alone.',
    );
  });
});

describe('"Where this has been" agrees with "3 of 4 have it"', () => {
  it('gives a plain time only to the phones the count names', () => {
    // Base camp this morning, with Asif's week. The judge catches it, then Rina's beam and Tanmoy's file reach Base camp.
    const base = model.openDoc(scenario.docId, WRITERS.base.actor, [...scenario.docs.base.changes]);
    const judge = model.openDoc(scenario.docId, JUDGE, []);
    judge.receive([...base.changes()], { actor: WRITERS.base.actor, via: 'beam' });
    base.receive([...judge.changes()], { actor: JUDGE, via: 'beam' });
    base.receive([...scenario.docs.rina.changes], { actor: WRITERS.rina.actor, via: 'beam' });
    base.receive([...scenario.docs.tanmoy.changes], { actor: WRITERS.tanmoy.actor, via: 'file' });
    // Asif's laptop catches Base camp.
    const asif = model.openDoc(scenario.docId, WRITERS.asif.actor, [...scenario.docs.asif.changes]);
    asif.receive([...base.changes()], { actor: WRITERS.base.actor, via: 'beam' });

    const view = asif.view();
    const partLines: string[] = [];
    for (const b of view.blocks) {
      const rows = trailRows(asif, view, b.id);
      const holders = new Set([...asif.whoHas(b.id), asif.me]);
      const timed = new Set(rows.filter((r) => r.via !== 'not-yet' && !r.partial).map((r) => r.actor));
      expect(timed, `block ${b.id}`).toEqual(holders);
      for (const r of rows) if (r.partial) partLines.push(trailLine(r, view, Date.now()));
    }
    // The case the run-through found: some phone has the newest words but not the whole paragraph, and says so.
    expect(partLines.length).toBeGreaterThan(0);
    for (const line of partLines) expect(line).toMatch(/doesn't have all of it yet$/i);
  });
});

import { describe, expect, it } from 'vitest';
import { BASE, RINA, sampleView } from '../contracts/fixtures';
import { summarise } from './catchSummary';
import { agoForm, clockForm, cutName, quoteStart } from './format';
import { caughtUp, missingCount, writerRows } from './knowledge';
import { ruleName } from './rules';
import { truckPattern } from './truckPattern';
import { MEHER, catchResult, playChanges, playEngine, playView } from './playData';

// Times are made in this computer's own time zone, the same way the screens read them.
const at = (month: number, d: number, h: number, m: number) => new Date(2026, month - 1, d, h, m).getTime();
const NOW = at(11, 1, 10, 30); // Sun 1 Nov 2026, 10:30 am

describe('time words', () => {
  it('uses "min ago" under an hour, then the clock form', () => {
    expect(agoForm(NOW - 20_000, NOW)).toBe('Just now');
    expect(agoForm(NOW - 12 * 60_000, NOW)).toBe('12 min ago');
    expect(agoForm(at(11, 1, 6, 5), NOW)).toBe('Today 6:05 am');
  });

  it('writes Yesterday, the weekday within 6 days, then the date', () => {
    expect(clockForm(at(10, 31, 16, 30), NOW)).toBe('Yesterday 4:30 pm');
    expect(clockForm(at(10, 26, 6, 5), NOW)).toBe('Mon 6:05 am');
    expect(clockForm(at(10, 24, 6, 5), NOW)).toBe('24 Oct, 6:05 am');
  });
});

describe('names and quotes', () => {
  it('cuts names over 16 letters with "…"', () => {
    expect(cutName('Meherunnisa Khatun')).toBe('Meherunnisa Khatu…');
    expect(cutName('Base camp')).toBe('Base camp');
  });

  it('quotes the first three words', () => {
    expect(quoteStart('Gosaba ferry runs every two hours.')).toBe('Gosaba ferry runs…');
    expect(quoteStart('Roads.')).toBe('Roads');
  });
});

describe('rule names', () => {
  it('uses the short name a rule carries, or makes one from its sentence', () => {
    expect(ruleName({ kind: 'unique', table: 'blkkits00001', column: 'colcard00001', name: 'One kit per ration card' }, sampleView)).toBe('One kit per ration card');
    expect(ruleName({ kind: 'unique', table: 'blkkits00001', column: 'colcard00001', of: 'colkit000001', value: 'Family kit' }, sampleView)).toBe('Ration card: Family kit only 1 time');
    expect(ruleName({ kind: 'limit', table: 'blkkits00001', where: { column: 'colkit000001', equals: 'Tarpaulin' }, max: 500 }, sampleView)).toBe('Tarpaulin: within 500');
  });
});

describe('the truck back picture', () => {
  const hex = '5f0c1c3e9b7a6d2e4f8a1b0c9d8e7f6a5b4c3d2e1f0a9b8c7d6e5f4a3b2c1d0e';

  it('is the same for the same hash', () => {
    expect(truckPattern(hex)).toEqual(truckPattern(hex));
  });

  it('repaints when the hash changes', () => {
    const other = `${hex.slice(0, 8)}ff${hex.slice(10)}`;
    expect(truckPattern(other)).not.toEqual(truckPattern(hex));
  });

  it('only uses the writer colours, the text colour and the panel colour', () => {
    for (const s of truckPattern('0123456789abcdef'.repeat(4))) {
      expect(['yellow', 'orange', 'pink', 'red', 'text', 'ground']).toContain(s.fill ?? s.stroke);
    }
  });
});

describe('who holds what, as far as this phone knows', () => {
  const changes = playChanges(NOW);
  const engine = playEngine({ changes, view: playView, me: BASE });

  it('counts how many of a device’s edits are missing', () => {
    // Meher has everything except Base camp's second edit and Pritha's tick.
    expect(missingCount(MEHER, engine)).toBe(2);
  });

  it('says which phone brought each writer’s newest work', () => {
    const rows = writerRows(engine, playView);
    const rina = rows.find((r) => r.actor === RINA)!;
    expect(rina.via).toBe(MEHER);
    expect(rows.find((r) => r.actor === MEHER)!.direct).toBe(true);
    expect(rows[0]!.actor).toBe(RINA); // newest first
  });

  it('counts the devices that hold everything this one has', () => {
    const c = caughtUp(engine, playView);
    expect(c.total).toBe(7);
    expect(c.have).toBe(1);
  });
});

describe('what the Caught screen says', () => {
  const changes = playChanges(NOW);
  const engine = playEngine({ changes, view: playView, me: BASE });

  it('leads with the new words and whose work came along', () => {
    const s = summarise(engine, playView, catchResult('beam', MEHER, changes), 'Meher', NOW);
    if (s.kind !== 'new') throw new Error('expected new work');
    expect(s.title).toBe('Caught from Meher');
    expect(s.lead).toBe("65 new words and 3 new rows. Rina's, Asif's, Tanmoy's and Joy's work came with Meher's beam.");
    expect(s.writers[0]).toEqual({ actor: RINA, head: 'Rina, 34 words and 1 row', sub: 'Last written 2 min ago, came via Meher' });
    expect(s.writers.find((w) => w.actor === MEHER)!.sub).toBe('Last written 12 min ago, came direct');
    expect(s.beamBack).toBe(true);
    expect(s.evenLine).toBeNull();
  });

  it('flags open clashes the catch touched and broken rules', () => {
    const s = summarise(engine, playView, catchResult('beam', MEHER, changes), 'Meher', NOW);
    if (s.kind !== 'new') throw new Error('expected new work');
    expect(s.flags.map((f) => f.text)).toEqual([
      'Two versions of 1 sentence: "Gosaba ferry runs…". Pick one, or leave both.',
      'Two versions of 1 cell in Kits given out. Pick one, or leave both.',
      'Rule broken: one kit per ration card. Ration card 4471 has Family kit 2 times.',
    ]);
    expect(s.decisions).toContain("Rina added a rule: one kit per ration card. It's already broken here.");
    expect(s.decisions).toContain('Asif kept "No ferry to Gosaba today…" over 1 other.');
  });

  it('hides Beam back for a file, and says when the sender already has everything', () => {
    const file = summarise(engine, playView, catchResult('file', MEHER, changes), 'Meher', NOW);
    expect(file.beamBack).toBe(false);
    const even = summarise(engine, playView, catchResult('even-after', MEHER, changes), 'Meher', NOW);
    expect(even.kind === 'new' && even.evenLine).toBe('Meher already has everything you have.');
  });

  it('says nothing new, and how much the sender is missing', () => {
    const behind = summarise(engine, playView, catchResult('behind', RINA, changes), 'Rina', NOW);
    expect(behind).toMatchObject({ kind: 'behind', title: 'Nothing new from Rina', body: 'You already had everything Rina beamed. Rina is missing 7 of your changes.' });
    const even = summarise(engine, playView, catchResult('even', RINA, changes), 'Rina', NOW);
    expect(even).toMatchObject({ kind: 'even', title: 'Already caught up with Rina' });
  });

  it('cuts a long sender name everywhere', () => {
    const s = summarise(engine, playView, catchResult('beam', MEHER, changes), 'Meherunnisa Khatun', NOW);
    expect(s.title).toBe('Caught from Meherunnisa Khatu…');
  });
});


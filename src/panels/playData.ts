// Made-up phones, changes and catches for the panels playground (?play=panels). Not used by the app itself.
// Story: Base camp (this laptop) catches Meher, who carries Rina's, Tanmoy's, Asif's and Joy's work.

import type { ActorId, Change, DocEngine, DocView, Fingerprint, Intents, Json, Op, ReceiveResult, ReplayStep, SelfTestResult } from '../contracts';
import { ASIF, BASE, RINA, TANMOY, sampleFingerprint, sampleView } from '../contracts/fixtures';

export const MEHER = 'e5e5e5e5e5e5e5e5';
export const JOY = 'f6f6f6f6f6f6f6f6';
export const PRITHA = 'a7a7a7a7a7a7a7a7';

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

const FERRY = 'b/blkferry0001/s/snt000000002';
const KIT_CELL = 'b/blkkits00001/cell/row000000002/colkit000001';

export const playView: DocView = {
  ...sampleView,
  writers: {
    ...sampleView.writers,
    [MEHER]: { actor: MEHER, name: 'Meher', colour: 'red' },
    [JOY]: { actor: JOY, name: 'Joy', colour: null },
    [PRITHA]: { actor: PRITHA, name: 'Pritha', colour: 'plain' },
  },
};

/** Builds the story's changes, with times counted back from `now`. */
export function playChanges(now: number): Change[] {
  const c = (actor: ActorId, seq: number, ago: number, deps: string[], ops: Op[], extra: Partial<Change> = {}): Change => ({
    id: `${actor}:${seq}`,
    actor,
    seq,
    deps,
    t: now - ago,
    kind: 'edit',
    ops,
    ...extra,
  });
  const note = (actor: ActorId, seq: number, ago: number, deps: string[], from: ActorId, via: 'beam' | 'file' = 'beam', place?: string): Change => ({
    id: `${actor}:${seq}`,
    actor,
    seq,
    deps,
    t: now - ago,
    kind: 'note',
    ops: [],
    from: { actor: from, via },
    place,
  });
  const set = (k: string, v: Json, others?: string[]): Op => (others ? { o: 'set', k, v, others } : { o: 'set', k, v });

  return [
    c(BASE, 1, 3 * DAY, [], [set('title', 'Camp log: Sundarbans cyclone relief'), set('b/blkroads0001/s/snt000000001', 'Roads and boats')], { place: 'Canning' }),
    note(RINA, 1, 2 * DAY, [`${BASE}:1`], BASE, 'beam', 'Gosaba camp'),
    note(ASIF, 1, 2 * DAY - HOUR, [`${BASE}:1`], BASE, 'beam', 'Basanti camp'),
    note(TANMOY, 1, 2 * DAY - 2 * HOUR, [`${BASE}:1`], BASE, 'beam', 'Patharpratima camp'),
    note(MEHER, 1, 2 * DAY - 3 * HOUR, [`${BASE}:1`], BASE, 'beam', 'on the boat'),
    note(JOY, 1, 2 * DAY - 4 * HOUR, [`${BASE}:1`], BASE, 'file'),
    note(PRITHA, 1, 2 * DAY - 5 * HOUR, [`${BASE}:1`], BASE),
    c(BASE, 2, DAY, [`${BASE}:1`], [set('b/blkbring0001/s/snt000000004', 'Tarpaulins for 40 families')], { place: 'Canning' }),
    c(PRITHA, 2, 22 * HOUR, [`${PRITHA}:1`], [set('b/blkbring0001/tick', true)]),
    note(BASE, 3, 20 * HOUR, [`${BASE}:2`, `${PRITHA}:2`], PRITHA),
    c(RINA, 2, 6 * HOUR, [`${RINA}:1`], [set(FERRY, 'Gosaba ferry runs every two hours from the main jetty.')], { place: 'Gosaba camp' }),
    c(
      RINA,
      3,
      5 * HOUR,
      [`${RINA}:2`],
      [
        set('b/blkfever001/s/snt000000010', 'Basanti camp: 12 people with fever since Sunday, mostly children under ten.'),
        { o: 'ins', list: 'rules', id: 'rule00000001', after: null },
        set('rule/rule00000001', { kind: 'unique', name: 'One kit per ration card', table: 'blkkits00001', column: 'colcard00001' }),
      ],
      { place: 'Gosaba camp' },
    ),
    c(
      RINA,
      4,
      2 * MIN,
      [`${RINA}:3`],
      [
        set('b/blkferry0001/s/snt000000005', 'Bring ration cards to the jetty before the boat leaves at noon.'),
        { o: 'ins', list: 'b/blkkits00001/rows', id: 'row000000004', after: 'row000000003' },
        set('b/blkkits00001/cell/row000000004/colcard00001', '6120'),
      ],
      { place: 'Gosaba camp' },
    ),
    c(TANMOY, 2, 3 * HOUR, [`${TANMOY}:1`], [set('b/blkferry0001/s/snt000000003', 'Take the road via Sonakhali instead.'), set('b/blkfever001/s/snt000000011', 'ORS packets will run out by Thursday.')], { place: 'Patharpratima camp' }),
    c(ASIF, 2, 40 * MIN, [`${ASIF}:1`], [set(FERRY, 'Gosaba ferry is stopped: the jetty is under water.')], { place: 'Basanti camp' }),
    c(ASIF, 3, 35 * MIN, [`${ASIF}:2`, `${TANMOY}:2`], [set('b/blkboats001/s/snt000000020', 'No ferry to Gosaba today, use the Sonakhali road.', [`${TANMOY}:2`])], { place: 'Basanti camp' }),
    c(JOY, 2, DAY - HOUR, [`${JOY}:1`], [{ o: 'ins', list: 'b/blkkits00001/rows', id: 'row000000005', after: 'row000000004' }, { o: 'ins', list: 'b/blkkits00001/rows', id: 'row000000006', after: 'row000000005' }, set(KIT_CELL, 'Tarpaulin')]),
    note(MEHER, 2, 30 * MIN, [`${MEHER}:1`, `${RINA}:3`], RINA, 'beam', 'on the boat'),
    note(MEHER, 3, 25 * MIN, [`${MEHER}:2`, `${TANMOY}:2`, `${ASIF}:3`, `${JOY}:2`], TANMOY, 'beam', 'on the boat'),
    note(MEHER, 4, 15 * MIN, [`${MEHER}:3`, `${RINA}:4`], RINA, 'beam', 'on the boat'),
    c(MEHER, 5, 12 * MIN, [`${MEHER}:4`], [set('b/blkboats001/s/snt000000021', 'Relief boat from Canning reaches Gosaba at 2 pm.')], { place: 'on the boat' }),
    note(BASE, 4, 1 * MIN, [`${BASE}:3`, `${MEHER}:5`], MEHER, 'beam', 'Canning'),
  ];
}

/** The edits the Meher catch brought (everything Base camp didn't have before its 4th change). */
export const MEHER_CATCH_EDITS = [`${RINA}:2`, `${RINA}:3`, `${RINA}:4`, `${TANMOY}:2`, `${ASIF}:2`, `${ASIF}:3`, `${JOY}:2`, `${MEHER}:5`];

export function catchResult(kind: 'beam' | 'file' | 'even-after' | 'behind' | 'even', from: ActorId, changes: Change[]): ReceiveResult {
  const note = changes.find((c) => c.id === `${BASE}:4`) ?? null;
  const fromNote = note ? { ...note, from: { actor: from, via: kind === 'file' ? ('file' as const) : ('beam' as const) } } : null;
  if (kind === 'behind' || kind === 'even') {
    return { added: [], newEdits: [], onlyNotes: true, duplicates: 12, waiting: 0, note: fromNote, senderMissing: kind === 'behind' };
  }
  return {
    added: MEHER_CATCH_EDITS,
    newEdits: MEHER_CATCH_EDITS,
    onlyNotes: false,
    duplicates: 3,
    waiting: 0,
    note: fromNote,
    senderMissing: kind !== 'even-after',
  };
}

export interface PlayEngineOpts {
  me?: ActorId;
  view?: DocView;
  changes?: Change[];
  fingerprint?: Fingerprint;
  holders?: ActorId[];
  replay?: ReplayStep[];
  onCommit?(ops: Op[]): void;
}

/** A made-up engine over the story's changes. Commits are reported, not applied. */
export function playEngine(opts: PlayEngineOpts = {}): DocEngine {
  const view = opts.view ?? playView;
  const me = opts.me ?? BASE;
  const changes = opts.changes ?? playChanges(Date.now());
  const fp = opts.fingerprint ?? sampleFingerprint;
  let seq = 100;
  return {
    docId: view.docId,
    me,
    changes: () => changes,
    heads: () => [],
    view: () => view,
    receive: () => catchResult('beam', MEHER, changes),
    commit: (ops) => {
      opts.onCommit?.(ops);
      return { id: `${me}:${++seq}`, actor: me, seq, deps: [], t: Date.now(), kind: 'edit', ops };
    },
    undo: () => null,
    redo: () => null,
    fingerprint: () => fp,
    whoHas: () => opts.holders ?? [ASIF, BASE, RINA],
    trail: () => {
      const t = Date.now();
      return [
        { actor: ASIF, t: t - 40 * MIN, via: 'wrote' as const },
        { actor: MEHER, t: t - 25 * MIN, via: 'beam' as const },
        { actor: BASE, t: t - 1 * MIN, via: 'beam' as const },
      ];
    },
    replay: () => opts.replay ?? [],
  };
}

/** Made-up intents: they return a marker op so the playground can show what was asked. */
export const playIntents: Intents = new Proxy({} as Intents, {
  get: (_t, name) =>
    (...args: unknown[]) => {
      const marker: Op = { o: 'set', k: `play/${String(name)}`, v: JSON.parse(JSON.stringify(args.filter((a) => typeof a !== 'object' || !a || !('blocks' in (a as object))) ?? null)) };
      if (name === 'addRule') return { ops: [marker], rule: 'rule00000099' };
      if (name === 'insertBlock' || name === 'createTable') return { ops: [marker], block: 'blk000000099' };
      return [marker];
    },
});

/** A made-up self-test that takes a little time per order. `bad` lists the order numbers (counted across calls, from 0) that come out different. */
export function playSelfTest(msPerOrder: number, bad: number[] = []) {
  let done = 0;
  return (_changes: readonly Change[], orders: number): SelfTestResult => {
    const start = performance.now();
    while (performance.now() - start < msPerOrder * orders) {
      // Stand-in for the real merging work.
    }
    const differing = [];
    for (let i = 0; i < orders; i++) {
      const run = done + i;
      // Like the real self-test, run numbers count from the start of this call.
      if (bad.includes(run)) differing.push({ run: i, order: [`${RINA}:4`, `${ASIF}:2`, `${TANMOY}:2`, `${MEHER}:5`].sort(() => (run % 2 ? 1 : -1)), fingerprint: { words: ['lotus', 'river', 'kite'] as [string, string, string], digits: '17', hex: `9a${run.toString(16)}3c7e0b5d2f4a6c8e1b3d5f7a9c0e2b4d6f8a1c3e5b7d9f0a2c4e6b8d1f3a5c7` } });
    }
    done += orders;
    return { runs: orders, same: orders - differing.length, fingerprint: sampleFingerprint, differing };
  };
}

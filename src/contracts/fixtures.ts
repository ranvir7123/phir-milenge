// Made-up data so tracks C, D and E can build screens before the engine (track A) exists.
// Matches the demo story: Camp log, the ferry clash, a deleted-against-changed row, a broken rule.

import type { DocView, Field, Fingerprint, Lane } from './doc';
import type { DocEngine, ReceiveResult } from './engine';

export const RINA = 'a1a1a1a1a1a1a1a1';
export const ASIF = 'b2b2b2b2b2b2b2b2';
export const TANMOY = 'c3c3c3c3c3c3c3c3';
export const BASE = 'd4d4d4d4d4d4d4d4';

const MON_6AM = Date.UTC(2026, 9, 26, 0, 35); // Mon 26 Oct 2026, 6:05 am IST
const MON_4PM = Date.UTC(2026, 9, 26, 10, 40); // Mon 26 Oct 2026, 4:10 pm IST

function one<T>(key: string, value: T, actor = BASE, t = MON_6AM, place?: string): Field<T> {
  const lane: Lane<T> = { value, ref: `${actor}:1`, actor, t, place };
  return { key, state: 'one', shown: lane, lanes: [lane], kept: [] };
}

function clash<T>(key: string, lanes: Lane<T>[]): Field<T> {
  return { key, state: 'clash', shown: null, lanes, kept: [] };
}

export const sampleView: DocView = {
  docId: '0123456789abcdef0123456789abcdef',
  title: one('title', 'Camp log: Sundarbans cyclone relief'),
  template: 'camp-log',
  writers: {
    [RINA]: { actor: RINA, name: 'Rina', colour: 'yellow' },
    [TANMOY]: { actor: TANMOY, name: 'Tanmoy', colour: 'orange' },
    [ASIF]: { actor: ASIF, name: 'Asif', colour: 'pink' },
    [BASE]: { actor: BASE, name: 'Base camp', colour: 'plain' },
  },
  settle: one('settle', { kind: 'ask' }),
  blocks: [
    {
      id: 'blkroads0001',
      style: { kind: 'h2' },
      sentences: [{ id: 'snt000000001', field: one('b/blkroads0001/s/snt000000001', 'Roads and boats') }],
      marks: [],
      writtenBy: [BASE],
    },
    {
      id: 'blkferry0001',
      style: { kind: 'p' },
      sentences: [
        {
          id: 'snt000000002',
          field: clash('b/blkferry0001/s/snt000000002', [
            { value: 'Gosaba ferry runs every two hours from the main jetty. ', ref: `${RINA}:4`, actor: RINA, t: MON_6AM, place: 'Gosaba camp' },
            { value: 'Gosaba ferry is stopped: the jetty is under water. ', ref: `${ASIF}:7`, actor: ASIF, t: MON_4PM, place: 'Basanti camp' },
          ]),
        },
        {
          id: 'snt000000003',
          field: one('b/blkferry0001/s/snt000000003', 'Take the road via Sonakhali instead.', TANMOY, MON_6AM, 'Patharpratima camp'),
        },
      ],
      marks: [{ type: 'bold', quote: 'Sonakhali', occurrence: 1 }],
      writtenBy: [RINA, ASIF, TANMOY],
    },
    {
      id: 'blkbring0001',
      style: { kind: 'li', list: 'check', indent: 0 },
      sentences: [{ id: 'snt000000004', field: one('b/blkbring0001/s/snt000000004', 'Tarpaulins for 40 families', RINA) }],
      marks: [],
      tick: one('b/blkbring0001/tick', true, RINA),
      writtenBy: [RINA],
    },
    {
      id: 'blkkits00001',
      style: { kind: 'table' },
      sentences: [],
      marks: [],
      table: {
        name: one('b/blkkits00001/name', 'Kits given out'),
        columns: [
          { id: 'colcard00001', def: one('b/blkkits00001/col/colcard00001', { name: 'Ration card', kind: 'words' as const }) },
          { id: 'colname00001', def: one('b/blkkits00001/col/colname00001', { name: 'Family', kind: 'words' as const }) },
          { id: 'colkit000001', def: one('b/blkkits00001/col/colkit000001', { name: 'Kit', kind: 'words' as const }) },
        ],
        rows: [
          {
            id: 'row000000001',
            alive: one('b/blkkits00001/row/row000000001', true as const, RINA),
            cells: {
              colcard00001: one('b/blkkits00001/cell/row000000001/colcard00001', '4471', RINA),
              colname00001: one('b/blkkits00001/cell/row000000001/colname00001', 'Mondal', RINA),
              colkit000001: one('b/blkkits00001/cell/row000000001/colkit000001', 'Family kit', RINA),
            },
          },
          {
            id: 'row000000002',
            alive: one('b/blkkits00001/row/row000000002', true as const, ASIF),
            cells: {
              colcard00001: one('b/blkkits00001/cell/row000000002/colcard00001', '4471', ASIF),
              colname00001: one('b/blkkits00001/cell/row000000002/colname00001', 'Mondal', ASIF),
              colkit000001: clash('b/blkkits00001/cell/row000000002/colkit000001', [
                { value: 'Family kit', ref: `${ASIF}:9`, actor: ASIF, t: MON_6AM },
                { value: 'Tarpaulin', ref: `${TANMOY}:3`, actor: TANMOY, t: MON_4PM },
              ]),
            },
          },
          {
            id: 'row000000003',
            alive: clash('b/blkkits00001/row/row000000003', [
              { value: null, ref: `${TANMOY}:5`, actor: TANMOY, t: MON_4PM },
              { value: true as const, ref: `${RINA}:6`, actor: RINA, t: MON_6AM },
            ]),
            cells: {
              colcard00001: one('b/blkkits00001/cell/row000000003/colcard00001', '5102', RINA),
              colname00001: one('b/blkkits00001/cell/row000000003/colname00001', 'Sardar', RINA),
              colkit000001: one('b/blkkits00001/cell/row000000003/colkit000001', 'Tarpaulin', RINA),
            },
          },
        ],
      },
      writtenBy: [RINA, ASIF, TANMOY],
    },
  ],
  rules: [
    {
      id: 'rule00000001',
      field: one('rule/rule00000001', { kind: 'unique', table: 'blkkits00001', column: 'colcard00001' }),
      result: {
        state: 'broken',
        message: 'One kit per ration card. Ration card 4471 has Family kit 2 times.',
        where: [
          { block: 'blkkits00001', row: 'row000000001' },
          { block: 'blkkits00001', row: 'row000000002' },
        ],
      },
    },
    {
      id: 'rule00000002',
      field: one('rule/rule00000002', { kind: 'limit', table: 'blkkits00001', where: { column: 'colkit000001', equals: 'Tarpaulin' }, max: 500 }),
      result: { state: 'ok' },
    },
  ],
  needsLook: {
    clashes: ['b/blkferry0001/s/snt000000002', 'b/blkkits00001/cell/row000000002/colkit000001', 'b/blkkits00001/row/row000000003'],
    broken: ['rule00000001'],
  },
};

export const sampleFingerprint: Fingerprint = {
  words: ['chai', 'jetty', 'mango'],
  digits: '42',
  hex: '5f0c1c3e9b7a6d2e4f8a1b0c9d8e7f6a5b4c3d2e1f0a9b8c7d6e5f4a3b2c1d0e',
};

export const sampleCatch: ReceiveResult = {
  added: [`${ASIF}:7`, `${ASIF}:9`],
  newEdits: [`${ASIF}:7`, `${ASIF}:9`],
  onlyNotes: false,
  duplicates: 0,
  waiting: 0,
  note: null,
  senderMissing: true,
};

/** A stand-in engine that only returns the sample data. Commits and receives do nothing. */
export function fakeEngine(view: DocView = sampleView): DocEngine {
  return {
    docId: view.docId,
    me: RINA,
    changes: () => [],
    heads: () => [],
    view: () => view,
    receive: () => sampleCatch,
    commit: (ops) => ({ id: `${RINA}:99`, actor: RINA, seq: 99, deps: [], t: Date.now(), kind: 'edit', ops }),
    undo: () => null,
    redo: () => null,
    fingerprint: () => sampleFingerprint,
    whoHas: () => [ASIF, BASE, RINA],
    trail: () => [
      { actor: ASIF, t: MON_4PM, via: 'wrote' },
      { actor: BASE, t: MON_4PM + 3_600_000, via: 'beam' },
      { actor: RINA, t: MON_4PM + 7_200_000, via: 'beam' },
    ],
    replay: () => [],
  };
}

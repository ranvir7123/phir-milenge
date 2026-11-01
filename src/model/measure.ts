// How fast the engine is with a big doc: 20,000 changes from four phones that work apart and catch each other.
// Run with: npm run selftest -- measure

import { keys, type Change, type Op } from '../contracts';
import { Engine } from './engine';
import { newItemId } from './ids';
import { intents } from './intents';
import { decodePhir, encodePhir } from './phir';
import { seededRandom, shuffle } from './selftest';

const DOC = 'meas0000meas0000meas0000meas0000';
const PHONES = ['a1a1a1a1a1a1a1a1', 'b2b2b2b2b2b2b2b2', 'c3c3c3c3c3c3c3c3', 'd4d4d4d4d4d4d4d4'];

/** A doc with 100 paragraphs and a table, then edits from four phones until there are `total` changes. */
export function bigHistory(total: number, seed = 7): Change[] {
  const rnd = seededRandom(seed);
  let t = Date.UTC(2026, 9, 20);
  const base = new Engine(DOC, PHONES[3]!);
  const ops: Op[] = [...intents.setTitle(base.view(), 'Camp log, big')];
  let after: string | null = null;
  const sentences: { block: string; id: string }[] = [];
  for (let i = 0; i < 100; i++) {
    const ins = intents.insertBlock(base.view(), after, { kind: 'p' }, `Para ${i} one. Para ${i} two. Para ${i} three.`);
    ops.push(...ins.ops);
    after = ins.block;
  }
  base.commit(ops, { t: (t += 1000) });
  const tbl = intents.createTable(base.view(), after, 'Kits given out', [
    { name: 'Ration card', kind: 'words' },
    { name: 'Kit', kind: 'words' },
  ]);
  base.commit(tbl.ops, { t: (t += 1000) });
  for (const b of base.view().blocks) for (const s of b.sentences) sentences.push({ block: b.id, id: s.id });
  const cols = base.view().blocks.find((b) => b.id === tbl.block)!.table!.columns.map((c) => c.id);

  const phones = PHONES.map((p) => (p === PHONES[3] ? base : new Engine(DOC, p, [...base.changes()])));
  const count = () => {
    const all = new Set<string>();
    for (const p of phones) for (const c of p.changes()) all.add(c.id);
    return all.size;
  };
  let made = count();
  while (made < total) {
    // Each phone works apart for a while: a burst of sentence edits and new rows.
    for (const p of phones) {
      for (let i = 0; i < 250 && made < total; i++, made++) {
        t += 1 + Math.floor(rnd() * 3000);
        if (rnd() < 0.85) {
          const s = sentences[Math.floor(rnd() * sentences.length)]!;
          p.commit([{ o: 'set', k: keys.sentence(s.block, s.id), v: `Edit ${made} by ${p.me.slice(0, 2)}. ` }], { t });
        } else {
          const row = newItemId();
          p.commit(
            [
              { o: 'ins', list: keys.rows(tbl.block), id: row, after: null },
              { o: 'set', k: keys.row(tbl.block, row), v: true },
              { o: 'set', k: keys.cell(tbl.block, row, cols[0]!), v: String(1000 + Math.floor(rnd() * 9000)) },
              { o: 'set', k: keys.cell(tbl.block, row, cols[1]!), v: rnd() < 0.5 ? 'Family kit' : 'Tarpaulin' },
            ],
            { t },
          );
        }
      }
    }
    // Then each catches the next one round the ring (this also writes notes).
    for (let i = 0; i < phones.length; i++) {
      const from = phones[(i + 1) % phones.length]!;
      phones[i]!.receive([...from.changes()], { actor: from.me, via: 'beam' });
    }
    made = count();
  }
  const all = new Map<string, Change>();
  for (const p of phones) for (const c of p.changes()) all.set(c.id, c);
  return [...all.values()];
}

function ms(f: () => void): number {
  const s = performance.now();
  f();
  return performance.now() - s;
}

export interface Measurement {
  changes: number;
  edits: number;
  rounds: { openDoc: number; view: number; fingerprint: number; receiveOne: number }[];
  phirBytes: number;
  jsonBytes: number;
  encode: number;
  decode: number;
}

export function measure(total = 20_000, rounds = 3): Measurement {
  const changes = shuffle(bigHistory(total), seededRandom(99)); // the order a store hands them back in
  const out: Measurement = {
    changes: changes.length,
    edits: changes.filter((c) => c.kind === 'edit').length,
    rounds: [],
    phirBytes: 0,
    jsonBytes: JSON.stringify(changes).length,
    encode: 0,
    decode: 0,
  };
  for (let r = 0; r < rounds; r++) {
    let e!: Engine;
    const openDoc = ms(() => (e = new Engine(DOC, 'e5e5e5e5e5e5e5e5', changes)));
    const view = ms(() => e.view());
    const fingerprint = ms(() => e.fingerprint());
    const writer = new Engine(DOC, 'f6f6f6f6f6f6f6f6', changes);
    const block = writer.view().blocks[0]!.id;
    const one = writer.commit(intents.setText(writer.view(), block, 'One new sentence.'), { t: Date.now() });
    const receiveOne = ms(() => {
      e.receive([one], { actor: writer.me, via: 'beam' });
      e.view();
    });
    out.rounds.push({ openDoc, view, fingerprint, receiveOne });
  }
  let bytes!: Uint8Array;
  out.encode = ms(() => (bytes = encodePhir({ docId: DOC, title: 'Camp log, big', changes })));
  out.phirBytes = bytes.length;
  out.decode = ms(() => {
    const r = decodePhir(bytes);
    if (!r.ok) throw new Error('could not read back');
  });
  return out;
}

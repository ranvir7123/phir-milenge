// The 1,000-order self-test: the same changes, fed through the real receive path in shuffled arrival
// orders, must give the same truck back every time (section 1.12).

import type { Change, ChangeId, DocId, SelfTestResult } from '../contracts';
import { Engine } from './engine';

/** A small seeded random generator (mulberry32), so a failing order can be replayed. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffle<T>(items: readonly T[], random: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

const CHECKER = 'selftest00000000';

export function runSelfTest(
  changes: readonly Change[],
  orders: number,
  seed = 1,
  docId: DocId = 'selftest',
): SelfTestResult {
  const expected = new Engine(docId, CHECKER, changes).fingerprint();
  const random = seededRandom(seed);
  const differing: SelfTestResult['differing'] = [];
  let same = 0;
  for (let run = 0; run < orders; run++) {
    const order = shuffle(changes, random);
    const engine = new Engine(docId, CHECKER);
    // Arrive in a few catches of random sizes, with some sent twice, the way beams and files arrive.
    let i = 0;
    while (i < order.length) {
      const size = 1 + Math.floor(random() * Math.max(1, order.length / 3));
      const batch = order.slice(i, i + size);
      if (random() < 0.3 && i > 0) batch.push(order[Math.floor(random() * i)]!);
      engine.receive(batch, { actor: null, via: random() < 0.5 ? 'beam' : 'file' });
      i += size;
    }
    const print = engine.fingerprint();
    if (print.hex === expected.hex && engine.waiting() === 0) same++;
    else differing.push({ run, order: order.map((c) => c.id as ChangeId), fingerprint: print });
  }
  return { runs: orders, same, fingerprint: expected, differing };
}

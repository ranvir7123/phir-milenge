// The engine every other track uses. Signatures: src/contracts/engine.ts.
// Explanation: docs/plan/3-how-its-built.md, section 1.

import type { ActorId, Change, DocEngine, DocId, EngineModule, Op } from '../contracts';
import { Engine } from './engine';
import { newActorId, newDocId, newItemId } from './ids';
import { CLASH_SLOT, intents } from './intents';
import { decodePhir, encodePhir, PHIR_FORMAT } from './phir';
import { runSelfTest } from './selftest';
import { splitSentences } from './sentences';

export function openDoc(docId: DocId, me: ActorId, changes: Change[]): DocEngine {
  return new Engine(docId, me, changes);
}

export function createDoc(me: ActorId, ops: Op[], opts?: { place?: string; t?: number }): { engine: DocEngine; first: Change } {
  const engine = new Engine(newDocId(), me);
  const first = engine.commit(ops, opts);
  return { engine, first };
}

export const engine: EngineModule = {
  newActorId,
  newDocId,
  newItemId,
  openDoc,
  createDoc,
  encodePhir,
  decodePhir,
  runSelfTest: (changes, orders, seed) => runSelfTest(changes, orders, seed),
  splitSentences,
  intents,
};

export { CLASH_SLOT, intents, splitSentences, newActorId, newDocId, newItemId, runSelfTest, encodePhir, decodePhir, PHIR_FORMAT };

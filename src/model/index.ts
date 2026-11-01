// Track A replaces every stub below with the real engine. The signatures come from src/contracts/engine.ts
// and must not change. Explanation: docs/plan/3-how-its-built.md, section 1.

import type { EngineModule, Intents } from '../contracts';

function notBuilt(name: string): never {
  throw new Error(`Engine: ${name} is not built yet (track A)`);
}

const intents: Intents = new Proxy({} as Intents, {
  get: (_target, name) => () => notBuilt(`intents.${String(name)}`),
});

export const engine: EngineModule = {
  newActorId: () => notBuilt('newActorId'),
  newDocId: () => notBuilt('newDocId'),
  newItemId: () => notBuilt('newItemId'),
  openDoc: () => notBuilt('openDoc'),
  createDoc: () => notBuilt('createDoc'),
  encodePhir: () => notBuilt('encodePhir'),
  decodePhir: () => notBuilt('decodePhir'),
  runSelfTest: () => notBuilt('runSelfTest'),
  splitSentences: () => notBuilt('splitSentences'),
  intents,
};

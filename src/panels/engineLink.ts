// Where the panels reach the engine module's intents and self-test. The panels playground swaps in
// made-up versions so every screen can be looked at before (and apart from) the real engine.

import type { EngineModule, Intents } from '../contracts';
import { engine as model } from '../model';

let playIntents: Intents | null = null;
let playSelfTest: EngineModule['runSelfTest'] | null = null;

export function intents(): Intents {
  return playIntents ?? model.intents;
}

export function runSelfTest(...args: Parameters<EngineModule['runSelfTest']>): ReturnType<EngineModule['runSelfTest']> {
  return (playSelfTest ?? model.runSelfTest)(...args);
}

/** For the playground only. */
export function usePlayEngine(i: Intents | null, selfTest: EngineModule['runSelfTest'] | null) {
  playIntents = i;
  playSelfTest = selfTest;
}

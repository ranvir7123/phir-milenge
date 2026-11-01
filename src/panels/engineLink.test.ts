import { describe, expect, it } from 'vitest';
import { engine as model } from '../model';
import { intents, runSelfTest } from './engineLink';

describe('the panels reach the real engine', () => {
  it('still uses the real intents and self-test after every practice page has loaded', async () => {
    // The app loads every practice page's file at start-up, so none of them may swap the engine just by loading.
    await import('../app/playgrounds');
    expect(intents()).toBe(model.intents);
    const changes = model.openDoc('doc0000000000001', 'a1a1a1a1a1a1a1a1', []).changes();
    expect(runSelfTest(changes, 1, 1).fingerprint).toEqual(model.runSelfTest(changes, 1, 1).fingerprint);
  });
});

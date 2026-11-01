import { describe, expect, test } from 'vitest';
import type { Change } from '../contracts';
import { caughtUp, caughtUpLabel } from './caughtUp';

function c(actor: string, seq: number, deps: string[], kind: Change['kind'] = 'edit'): Change {
  return { id: `${actor}:${seq}`, actor, seq, deps, t: seq, kind, ops: [] };
}

describe('caughtUp', () => {
  test('a doc only this phone has', () => {
    const r = caughtUp([c('me', 1, []), c('me', 2, ['me:1'])], 'me');
    expect(r).toEqual({ devices: 1, caughtUp: 1, behind: [] });
    expect(caughtUpLabel(r)).toBe('Only you');
  });

  test('a phone whose note covers everything is caught up', () => {
    const changes = [c('me', 1, []), c('rina', 1, ['me:1'], 'note')];
    expect(caughtUp(changes, 'me')).toEqual({ devices: 2, caughtUp: 2, behind: [] });
  });

  test('after this phone writes again, the other phone is behind', () => {
    const changes = [c('me', 1, []), c('rina', 1, ['me:1'], 'note'), c('me', 2, ['rina:1'])];
    const r = caughtUp(changes, 'me');
    expect(r).toEqual({ devices: 2, caughtUp: 1, behind: ['rina'] });
    expect(caughtUpLabel(r)).toBe('1 of 2');
  });

  test('a writer who saw only part of the doc is behind', () => {
    const changes = [c('base', 1, []), c('asif', 1, ['base:1']), c('rina', 1, ['base:1']), c('me', 1, ['asif:1', 'rina:1'], 'note')];
    const r = caughtUp(changes, 'me');
    expect(r.devices).toBe(4);
    expect(r.caughtUp).toBe(1);
    expect(r.behind.sort()).toEqual(['asif', 'base', 'rina']);
  });

  test('history reached through other writers counts', () => {
    const changes = [c('base', 1, []), c('asif', 1, ['base:1']), c('rina', 1, ['asif:1'])];
    const r = caughtUp(changes, 'me');
    expect(r).toEqual({ devices: 4, caughtUp: 2, behind: ['base', 'asif'] });
  });
});

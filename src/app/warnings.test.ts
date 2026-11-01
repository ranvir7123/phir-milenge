import { describe, expect, test } from 'vitest';
import type { Change } from '../contracts';
import { clockAhead, clockAheadText, daysLeft, roomText } from './warnings';

const DAY = 86_400_000;
const MB = 1_000_000;

describe('daysLeft', () => {
  test('plenty of room says nothing', () => {
    expect(daysLeft({ used: 10 * MB, available: 1000 * MB }, 0, 10 * DAY)).toBeNull();
  });

  test('the space left divided by how fast this phone has been writing', () => {
    // 10 MB in 5 days is 2 MB a day; 4 MB left is 2 days.
    expect(daysLeft({ used: 10 * MB, available: 4 * MB }, 0, 5 * DAY)).toBe(2);
  });

  test('a phone set up an hour ago counts as one day of writing', () => {
    expect(daysLeft({ used: 10 * MB, available: 1000 * MB }, 0, DAY / 24)).toBeNull();
    expect(daysLeft({ used: 10 * MB, available: 30 * MB }, 0, DAY / 24)).toBe(3);
  });

  test('nothing measured says nothing', () => {
    expect(daysLeft({ used: 0, available: 0 }, 0, DAY)).toBeNull();
  });
});

describe('roomText', () => {
  test('the approved words, with the days worked out', () => {
    expect(roomText(2)).toBe('This phone has room for about 2 more days of writing.');
    expect(roomText(1)).toBe('This phone has room for about 1 more day of writing.');
    expect(roomText(0)).toBe('This phone has room for less than a day of writing.');
  });
});

function c(actor: string, t: number): Change {
  return { id: `${actor}:${t}`, actor, seq: t, deps: [], t, kind: 'edit', ops: [] };
}

describe('clockAhead', () => {
  const NOW = 1_000_000_000;

  test('more than half of the other phones ahead of this clock', () => {
    const changes = [c('me', NOW + DAY), c('a', NOW + DAY), c('b', NOW + DAY), c('c', NOW - DAY)];
    expect(clockAhead(changes, 'me', NOW)).toBe(2);
    expect(clockAheadText(2)).toBe(
      "Times from 2 other phones are later than this phone's clock. Check the date and time in this phone's settings.",
    );
  });

  test('half or fewer says nothing', () => {
    expect(clockAhead([c('a', NOW + DAY), c('b', NOW - DAY)], 'me', NOW)).toBe(0);
  });

  test('a minute apart is normal, and this phone is never counted', () => {
    expect(clockAhead([c('me', NOW + DAY), c('a', NOW + 30_000)], 'me', NOW)).toBe(0);
  });

  test("a writer's newest time decides", () => {
    expect(clockAhead([c('a', NOW - DAY), c('a', NOW + DAY)], 'me', NOW)).toBe(1);
    expect(clockAheadText(1)).toBe("Times from 1 other phone are later than this phone's clock. Check the date and time in this phone's settings.");
  });
});

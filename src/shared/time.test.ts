import { describe, expect, test } from 'vitest';
import { fileTime, formatTime } from './time';

// Local times, so the tests hold in any time zone.
const NOW = new Date(2026, 10, 1, 10, 30).getTime(); // Sun 1 Nov 2026, 10:30 am
const at = (month: number, day: number, h: number, m: number) => new Date(2026, month, day, h, m).getTime();

describe('formatTime, the "ago" form', () => {
  test('under a minute', () => {
    expect(formatTime(NOW - 20_000, NOW, 'ago')).toBe('Just now');
  });
  test('under an hour counts minutes', () => {
    expect(formatTime(NOW - 2 * 60_000, NOW, 'ago')).toBe('2 min ago');
    expect(formatTime(NOW - 59 * 60_000, NOW, 'ago')).toBe('59 min ago');
  });
  test('an hour or more falls back to the clock form', () => {
    expect(formatTime(at(10, 1, 9, 14), NOW, 'ago')).toBe('Today 9:14 am');
  });
});

describe('formatTime, the clock form', () => {
  test('today and yesterday', () => {
    expect(formatTime(at(10, 1, 10, 14), NOW, 'clock')).toBe('Today 10:14 am');
    expect(formatTime(at(9, 31, 16, 30), NOW, 'clock')).toBe('Yesterday 4:30 pm');
  });
  test('within the last 6 days uses the weekday', () => {
    expect(formatTime(at(9, 26, 6, 5), NOW, 'clock')).toBe('Mon 6:05 am');
  });
  test('older uses the date', () => {
    expect(formatTime(at(9, 24, 6, 5), NOW, 'clock')).toBe('24 Oct, 6:05 am');
  });
  test('noon and midnight', () => {
    expect(formatTime(at(10, 1, 0, 0), NOW, 'clock')).toBe('Today 12:00 am');
    expect(formatTime(at(9, 31, 12, 0), NOW, 'clock')).toBe('Yesterday 12:00 pm');
  });
  test('a time later than this clock shows its date', () => {
    expect(formatTime(at(10, 3, 21, 0), NOW, 'clock')).toBe('3 Nov, 9:00 pm');
  });
});

describe('fileTime', () => {
  test('uses a dot, because file names cannot hold a colon', () => {
    expect(fileTime(at(9, 26, 16, 30))).toBe('Mon 4.30 pm');
  });
});

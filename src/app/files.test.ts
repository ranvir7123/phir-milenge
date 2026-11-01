import { describe, expect, test } from 'vitest';
import { phirFileName, sizeText } from './files';

// Mon 26 Oct 2026, 4:30 pm local time.
const MON_430 = new Date(2026, 9, 26, 16, 30).getTime();

describe('phirFileName', () => {
  test('the example from the user experience plan', () => {
    expect(phirFileName('Camp log: Sundarbans cyclone relief', 'Rina', MON_430)).toBe(
      'Camp log - Sundarbans cyclone relief - Rina - Mon 4.30 pm.phir',
    );
  });
  test('characters a file name cannot hold are dropped', () => {
    expect(phirFileName('Kits / tarps? "today"', 'Asif', MON_430)).toBe('Kits tarps today - Asif - Mon 4.30 pm.phir');
  });
  test('an empty title', () => {
    expect(phirFileName('  ', 'Asif', MON_430)).toBe('Untitled doc - Asif - Mon 4.30 pm.phir');
  });
  test('a very long title is cut', () => {
    const name = phirFileName('x'.repeat(300), 'Asif', MON_430);
    expect(name).toBe(`${'x'.repeat(80)} - Asif - Mon 4.30 pm.phir`);
  });
});

describe('sizeText', () => {
  test('kilobytes, at least 1', () => {
    expect(sizeText(100)).toBe('1 KB');
    expect(sizeText(14 * 1024 + 100)).toBe('14 KB');
    expect(sizeText(3 * 1024 * 1024)).toBe('3.0 MB');
  });
});

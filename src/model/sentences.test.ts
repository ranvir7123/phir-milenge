import { describe, expect, test } from 'vitest';
import fc from 'fast-check';
import { splitSentences } from './sentences';

describe('splitSentences', () => {
  test('cuts after . ! ? and the Bengali full stop, keeping the spaces with the sentence before', () => {
    expect(splitSentences('Gosaba ferry runs. Take the road!  Is it open? হ্যাঁ। Done')).toEqual([
      'Gosaba ferry runs. ',
      'Take the road!  ',
      'Is it open? ',
      'হ্যাঁ। ',
      'Done',
    ]);
  });

  test('cuts after a line end', () => {
    expect(splitSentences('one\ntwo')).toEqual(['one\n', 'two']);
    expect(splitSentences('One.\nTwo.')).toEqual(['One.\n', 'Two.']);
  });

  test('does not cut inside a number like 3.5', () => {
    expect(splitSentences('It is 3.5 km away. Go.')).toEqual(['It is 3.5 km away. ', 'Go.']);
  });

  test('keeps closing quotes and brackets with the sentence', () => {
    expect(splitSentences('He said "stop." Then left.')).toEqual(['He said "stop." ', 'Then left.']);
  });

  test('empty text has no sentences', () => {
    expect(splitSentences('')).toEqual([]);
  });

  test('joining the pieces always gives back the exact text', () => {
    const chars = fc.constantFrom('a', 'b', ' ', '.', '!', '?', '।', '\n', '\t', '"', ')', '3', 'ক');
    fc.assert(
      fc.property(fc.array(chars, { maxLength: 80 }).map((a) => a.join('')), (text) => {
        const parts = splitSentences(text);
        expect(parts.join('')).toBe(text);
        for (const p of parts) expect(p.length).toBeGreaterThan(0);
      }),
      { numRuns: 2000 },
    );
    fc.assert(
      fc.property(fc.string({ maxLength: 120 }), (text) => {
        expect(splitSentences(text).join('')).toBe(text);
      }),
      { numRuns: 1000 },
    );
  });
});

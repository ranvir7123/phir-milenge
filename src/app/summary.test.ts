import { describe, expect, test } from 'vitest';
import { ASIF, BASE, RINA, sampleView, TANMOY } from '../contracts/fixtures';
import type { Change } from '../contracts';
import { lastEvent, lastLine, needsLookLine, writersInOrder, writersLine } from './summary';

function c(actor: string, seq: number, t: number, kind: Change['kind'] = 'edit', from?: Change['from']): Change {
  return { id: `${actor}:${seq}`, actor, seq, deps: [], t, kind, ops: [], from };
}

describe('needsLookLine', () => {
  test('counts broken rules, sentences and cells', () => {
    expect(needsLookLine(sampleView)).toBe('1 rule broken · 1 sentence with two versions · 1 cell with two values · 1 other spot with two versions');
  });
  test('is empty when nothing needs a look', () => {
    expect(needsLookLine({ ...sampleView, needsLook: { clashes: [], broken: [] } })).toBe('');
  });
});

describe('lastEvent', () => {
  test('my own latest edit', () => {
    expect(lastEvent([c(RINA, 1, 100), c(ASIF, 1, 500)], sampleView, RINA)).toEqual({ kind: 'you', name: '', t: 100 });
  });
  test('a later catch wins over an older edit, and names the sender', () => {
    const note = c(RINA, 2, 900, 'note', { actor: ASIF, via: 'beam' });
    expect(lastEvent([c(RINA, 1, 100), note], sampleView, RINA)).toEqual({ kind: 'beam', name: 'Asif', t: 900 });
  });
  test('a file catch', () => {
    const note = c(RINA, 2, 900, 'note', { actor: null, via: 'file' });
    expect(lastLine(lastEvent([note], sampleView, RINA), 'Today 9:00 am')).toBe('Opened a file, Today 9:00 am');
  });
  test('a doc this phone never wrote in shows the latest edit', () => {
    expect(lastEvent([c(TANMOY, 1, 100), c(BASE, 1, 300)], sampleView, RINA)).toEqual({ kind: 'beam', name: 'Base camp', t: 300 });
  });
});

describe('lastLine', () => {
  test('the docs-home wording', () => {
    expect(lastLine({ kind: 'you', name: '', t: 0 }, '2 min ago')).toBe('You, 2 min ago');
    expect(lastLine({ kind: 'beam', name: 'Meher', t: 0 }, 'Today 10:14 am')).toBe('Caught from Meher, Today 10:14 am');
    expect(lastLine(null, 'x')).toBe('');
  });
});

describe('writers', () => {
  test('in the order they first wrote, notes left out', () => {
    const changes = [c(BASE, 1, 1), c(RINA, 1, 2), c(ASIF, 1, 3, 'note'), c(BASE, 2, 4), c(TANMOY, 1, 5)];
    expect(writersInOrder(changes, sampleView).map((w) => w.name)).toEqual(['Base camp', 'Rina', 'Tanmoy']);
  });
  test('up to four by name, then +N', () => {
    const ws = ['A', 'B', 'C', 'D', 'E', 'F'].map((name, i) => ({ actor: String(i), name, colour: null }));
    const { shown, more } = writersLine(ws);
    expect(shown.map((w) => w.name)).toEqual(['A', 'B', 'C', 'D']);
    expect(more).toBe(2);
  });
});

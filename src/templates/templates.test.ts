import { describe, expect, it } from 'vitest';
import type { Intents, Op, RuleDef } from '../contracts';
import { campLog, templates } from './index';

// Templates don't read the Intents, so a stand-in that fails loudly is enough.
const noIntents = new Proxy({} as Intents, {
  get: () => () => {
    throw new Error('templates should not call the Intents');
  },
});

function counter() {
  let n = 0;
  return () => `item${String(++n).padStart(8, '0')}`;
}

function opsOf(id: string): Op[] {
  const t = templates.find((x) => x.id === id);
  if (!t) throw new Error(`no template ${id}`);
  return t.ops('a1a1a1a1a1a1a1a1', noIntents, counter());
}

function sets(ops: Op[]): Map<string, unknown> {
  const m = new Map<string, unknown>();
  for (const op of ops) if (op.o === 'set') m.set(op.k, op.v);
  return m;
}

describe('templates', () => {
  it('lists Blank doc, Camp log, Trip notes and Meeting notes, in that order', () => {
    expect(templates.map((t) => [t.id, t.name, t.description])).toEqual([
      ['blank', 'Blank doc', 'An empty page'],
      ['camp-log', 'Camp log', 'Headings, a Kits given out table and two rules'],
      ['trip-notes', 'Trip notes', 'A plan, a packing checklist and a money table'],
      ['meeting-notes', 'Meeting notes', 'Who came, what was decided, and a to-do list'],
    ]);
  });

  it.each(templates.map((t) => t.id))('%s sets its title, its template id and "Always ask"', (id) => {
    const v = sets(opsOf(id));
    expect(v.get('template')).toBe(id);
    expect(v.get('settle')).toEqual({ kind: 'ask' });
    expect(typeof v.get('title')).toBe('string');
  });

  it.each(templates.map((t) => t.id))('%s writes each register once and puts items after ones that exist', (id) => {
    const ops = opsOf(id);
    const keysWritten = ops.filter((o) => o.o === 'set').map((o) => (o.o === 'set' ? o.k : ''));
    expect(new Set(keysWritten).size).toBe(keysWritten.length);
    const seen = new Set<string>();
    for (const op of ops) {
      if (op.o !== 'ins') continue;
      expect(seen.has(op.id)).toBe(false);
      if (op.after !== null) expect(seen.has(op.after)).toBe(true);
      seen.add(op.id);
    }
  });

  it('gives the same ops for the same ids, so a doc never depends on when it was made', () => {
    expect(campLog.ops('x', noIntents, counter())).toEqual(campLog.ops('x', noIntents, counter()));
  });

  it('Blank doc is "Untitled doc" with an empty page', () => {
    const ops = opsOf('blank');
    expect(sets(ops).get('title')).toBe('Untitled doc');
    expect(ops.some((o) => o.o === 'ins')).toBe(false);
  });

  it('Camp log has its three headings, the Kits given out table and both rules', () => {
    const ops = opsOf('camp-log');
    const v = sets(ops);
    expect(v.get('title')).toBe('Camp log');

    const blocks = ops.filter((o) => o.o === 'ins' && o.list === 'blocks').map((o) => (o.o === 'ins' ? o.id : ''));
    expect(blocks).toHaveLength(4);
    const [roads, medical, need, table] = blocks as [string, string, string, string];
    const textOf = (b: string) =>
      ops
        .filter((o) => o.o === 'set' && o.k.startsWith(`b/${b}/s/`))
        .map((o) => (o.o === 'set' ? o.v : ''))
        .join('');
    expect([roads, medical, need].map(textOf)).toEqual(['Roads and boats', 'Medical', 'What we need']);
    for (const b of [roads, medical, need]) expect(v.get(`b/${b}/style`)).toEqual({ kind: 'h2' });

    expect(v.get(`b/${table}/style`)).toEqual({ kind: 'table' });
    expect(v.get(`b/${table}/name`)).toBe('Kits given out');
    const cols = ops.filter((o) => o.o === 'ins' && o.list === `b/${table}/cols`).map((o) => (o.o === 'ins' ? o.id : ''));
    expect(cols.map((c) => v.get(`b/${table}/col/${c}`))).toEqual([
      { name: 'Family', kind: 'words' },
      { name: 'Ration card', kind: 'words' },
      { name: 'Kit', kind: 'words' },
      { name: 'Camp', kind: 'words' },
      { name: 'Day', kind: 'words' },
    ]);

    const rules = ops.filter((o) => o.o === 'ins' && o.list === 'rules').map((o) => (o.o === 'ins' ? o.id : ''));
    const defs = rules.map((r) => v.get(`rule/${r}`) as RuleDef);
    expect(defs).toEqual([
      { kind: 'unique', name: 'One kit per ration card', table, column: cols[1], of: cols[2] },
      { kind: 'limit', name: 'Tarpaulins stay within 500', table, where: { column: cols[2], equals: 'Tarpaulin' }, max: 500 },
    ]);
  });
});

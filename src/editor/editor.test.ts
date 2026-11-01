// The editor's step from what's on screen to engine changes (buildOps), run against the real engine.

import { describe, expect, test } from 'vitest';
import { getSchema } from '@tiptap/core';
import type { Node as PMNode } from '@tiptap/pm/model';
import type { BlockView, DocView } from '../contracts';
import { intents, openDoc } from '../model';
import { buildOps } from './Editor';
import { CLASH_MARK, readBlock, viewEngineText, viewToJSON } from './model';
import { makeExtensions, type Bridge } from './schema';
import { ruleWarning } from './rules';
import { linkAllowed, normaliseLink, writerColour } from './words';

const DOC = 'e0e0e0e0e0e0e0e0e0e0e0e0e0e0e0e0';
const A = 'aaaaaaaaaaaaaaaa';
const B = 'bbbbbbbbbbbbbbbb';
let t = 1_000;
const at = () => ({ t: (t += 1000) });

// buildOps only needs the schema; the bridge is for the live editor.
const bridge = new Proxy({}, { get: () => () => undefined }) as unknown as Bridge;
const schema = getSchema(makeExtensions(bridge));

function start(text = 'One. Two. Three.') {
  const a = openDoc(DOC, A, []);
  const { ops, block } = intents.insertBlock(a.view(), null, { kind: 'p' }, text);
  a.commit([...intents.setTitle(a.view(), 'Trip notes'), ...ops], at());
  return { a, block };
}

/** A and B both change "Two." so the block reads: One. [two versions] Three. */
function clashed() {
  const { a, block } = start();
  const b = openDoc(DOC, B, [...a.changes()]);
  a.commit(intents.setText(a.view(), block, 'One. Two by A. Three.'), at());
  b.commit(intents.setText(b.view(), block, 'One. Two by B. Three.'), at());
  a.receive([...b.changes()], { actor: B, via: 'beam' });
  return { a, block };
}

const blockOf = (v: DocView, id: string) => v.blocks.find((b) => b.id === id) as BlockView;
const shape = (b: BlockView) => b.sentences.map((s) => (s.field.state === 'clash' ? '[two]' : String(s.field.shown?.value ?? '')));
const docOf = (v: DocView): PMNode => schema.nodeFromJSON(viewToJSON(v, { lanes: true }));

/** The editor's doc with the block's text runs replaced: `parts` go between the clash boxes. */
function typed(v: DocView, block: string, parts: string[]): PMNode {
  const json = viewToJSON(v, { lanes: true });
  const node = json.content!.find((n) => n.attrs?.id === block)!;
  const clashes = (node.content ?? []).filter((c) => c.type === 'clash');
  node.content = parts.flatMap((p, i) => [...(p ? [{ type: 'text', text: p }] : []), ...(clashes[i] ? [clashes[i]] : [])]);
  return schema.nodeFromJSON(json);
}

describe('editor to engine', () => {
  test('an untouched doc sends nothing, with or without two versions', () => {
    const { a } = start();
    expect(buildOps(a.view(), docOf(a.view()), schema).ops).toEqual([]);
    const { a: c } = clashed();
    expect(buildOps(c.view(), docOf(c.view()), schema).ops).toEqual([]);
  });

  test('the text sent for a block with two versions has one marker where they sit', () => {
    const { a, block } = clashed();
    const b = blockOf(a.view(), block);
    expect(viewEngineText(b)).toBe(`One. ${CLASH_MARK}Three.`);
    const para = docOf(a.view()).child(1);
    expect(readBlock(para).engineText).toBe(`One. ${CLASH_MARK}Three.`);
    expect(readBlock(para).plainText).toBe('One. Three.');
  });

  test('typing before and after a sentence with two versions lands on the side it was typed', () => {
    const { a, block } = clashed();
    let { ops } = buildOps(a.view(), typed(a.view(), block, ['One. Before. ', 'After. Three.']), schema);
    a.commit(ops, at());
    expect(shape(blockOf(a.view(), block))).toEqual(['One. ', 'Before. ', '[two]', 'After. ', 'Three.']);
    // And the editor reads back the same thing, so nothing more is sent.
    ({ ops } = buildOps(a.view(), docOf(a.view()), schema));
    expect(ops).toEqual([]);
  });

  test('a new paragraph typed after a block goes in after it', () => {
    const { a, block } = start();
    const json = viewToJSON(a.view(), { lanes: true });
    json.content!.push({ type: 'para', attrs: { id: null, kind: 'p', list: null, indent: 0 }, content: [{ type: 'text', text: 'Fresh line.' }] });
    const { ops, newIds } = buildOps(a.view(), schema.nodeFromJSON(json), schema);
    a.commit(ops, at());
    expect(newIds.length).toBe(1);
    const blocks = a.view().blocks;
    expect(blocks.map((b) => b.id)[0]).toBe(block);
    expect(shape(blocks[1]!)).toEqual(['Fresh line.']);
  });

  test('bold on a word is sent as a mark and reads back the same', () => {
    const { a, block } = start();
    const json = viewToJSON(a.view(), { lanes: true });
    const node = json.content!.find((n) => n.attrs?.id === block)!;
    node.content = [{ type: 'text', text: 'One. ' }, { type: 'text', text: 'Two.', marks: [{ type: 'bold' }] }, { type: 'text', text: ' Three.' }];
    const { ops } = buildOps(a.view(), schema.nodeFromJSON(json), schema);
    a.commit(ops, at());
    expect(blockOf(a.view(), block).marks.map((m) => [m.type, m.quote])).toEqual([['bold', 'Two.']]);
    expect(buildOps(a.view(), docOf(a.view()), schema).ops).toEqual([]);
  });
});

describe('words and checks', () => {
  test('links: only web, phone and email addresses', () => {
    expect(linkAllowed('https://example.org')).toBe(true);
    expect(linkAllowed('tel:+919800000000')).toBe(true);
    expect(linkAllowed('mailto:camp@example.org')).toBe(true);
    expect(linkAllowed('javascript:alert(1)')).toBe(false);
    expect(linkAllowed('data:text/html,hi')).toBe(false);
    expect(normaliseLink('example.org')).toBe('https://example.org');
  });

  test('a writer colour this app does not know counts as plain', () => {
    const v = { writers: { [A]: { name: 'Rina', colour: 'red); background: url(x' } } } as unknown as DocView;
    expect(writerColour(v, A)).toBe('plain');
  });

  test('a malformed rule from another phone is skipped, not a crash', () => {
    const v = {
      rules: [{ field: { shown: { value: { kind: 'limit', table: 'tb', max: 1, where: 'not an object' } } } }],
      writers: {},
    } as unknown as DocView;
    const block = { id: 'tb', table: { columns: [], rows: [] } } as unknown as BlockView;
    expect(ruleWarning(v, block, {}, null)).toBeNull();
  });
});

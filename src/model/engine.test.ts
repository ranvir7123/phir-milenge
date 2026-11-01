import { describe, expect, test } from 'vitest';
import fc from 'fast-check';
import { keys, type BlockView, type Change, type DocView, type Field, type Op } from '../contracts';
import { Engine } from './engine';
import { intents } from './intents';
import { engine as model, openDoc, createDoc } from './index';
import { seededRandom, shuffle, runSelfTest } from './selftest';
import { sortChanges } from './order';
import { WORDS } from './words';
import { fingerprintOf } from './fingerprint';
import { runTwoVersionsScript } from './script';

const DOC = 'd0c0d0c0d0c0d0c0d0c0d0c0d0c0d0c0';
const A = 'aaaaaaaaaaaaaaaa';
const B = 'bbbbbbbbbbbbbbbb';
const C = 'cccccccccccccccc';

let t = 1_000;
const at = () => ({ t: (t += 1000) });

function start(text = 'One. Two. Three.'): { a: Engine; block: string } {
  const a = new Engine(DOC, A);
  const { ops, block } = intents.insertBlock(a.view(), null, { kind: 'p' }, text);
  a.commit([...intents.setTitle(a.view(), 'Trip notes'), ...ops], at());
  return { a, block };
}

function copy(from: Engine, me: string): Engine {
  return new Engine(DOC, me, [...from.changes()]);
}

function blockOf(e: Engine, id: string): BlockView {
  return e.view().blocks.find((b) => b.id === id)!;
}

function text(b: BlockView): string {
  return b.sentences.map((s) => s.field.shown?.value ?? '').join('');
}

describe('the fixed sort', () => {
  test('deps first, then writer time, writer id, counter', () => {
    const c1: Change = { id: `${B}:1`, actor: B, seq: 1, deps: [], t: 5, kind: 'edit', ops: [] };
    const c2: Change = { id: `${A}:1`, actor: A, seq: 1, deps: [], t: 5, kind: 'edit', ops: [] };
    const c3: Change = { id: `${A}:2`, actor: A, seq: 2, deps: [`${A}:1`, `${B}:1`], t: 1, kind: 'edit', ops: [] };
    const c4: Change = { id: `${C}:1`, actor: C, seq: 1, deps: [], t: 2, kind: 'edit', ops: [] };
    expect(sortChanges([c3, c1, c4, c2]).map((c) => c.id)).toEqual([`${C}:1`, `${A}:1`, `${B}:1`, `${A}:2`]);
  });
});

describe('receive', () => {
  test('skips duplicates and holds changes whose deps are missing until they arrive', () => {
    const { a } = start();
    a.commit(intents.setTitle(a.view(), 'Trip notes 2'), at());
    const [first, second] = a.changes();
    const b = new Engine(DOC, B);
    const r1 = b.receive([second!], { actor: A, via: 'file' });
    expect(r1.added).toEqual([]);
    expect(r1.waiting).toBe(1);
    const r2 = b.receive([first!, second!], { actor: A, via: 'file' });
    expect(r2.added).toEqual([first!.id, second!.id]);
    expect(r2.duplicates).toBe(1);
    expect(r2.waiting).toBe(0);
    expect(b.view().title.shown?.value).toBe('Trip notes 2');
  });

  test('writes a note after a catch that brought edits, none for notes only', () => {
    const { a } = start();
    const b = new Engine(DOC, B);
    const r = b.receive([...a.changes()], { actor: A, via: 'beam' });
    expect(r.newEdits.length).toBe(1);
    expect(r.onlyNotes).toBe(false);
    expect(r.note?.kind).toBe('note');
    expect(r.note?.from).toEqual({ actor: A, via: 'beam' });
    expect(r.senderMissing).toBe(false);
    // A catches B's note back: only notes, so no note of its own, and no ping-pong.
    const back = a.receive([...b.changes()], { actor: B, via: 'beam' });
    expect(back.onlyNotes).toBe(true);
    expect(back.note).toBeNull();
    expect(back.senderMissing).toBe(false);
  });

  test('says when the sender is missing some of this phone\'s changes', () => {
    const { a } = start();
    const b = copy(a, B);
    b.commit(intents.setTitle(b.view(), 'B was here'), at());
    a.commit(intents.setTitle(a.view(), 'A was here'), at());
    expect(b.receive([...a.changes()], { actor: A, via: 'beam' }).senderMissing).toBe(true);
  });
});

describe('two versions, nobody loses', () => {
  test('two phones changing the same sentence while apart keep both; different sentences combine', () => {
    const { a, block } = start();
    const b = copy(a, B);
    a.commit(intents.setText(a.view(), block, 'One. Two by A. Three.'), at());
    b.commit(intents.setText(b.view(), block, 'One. Two by B. Three!'), at());
    a.receive([...b.changes()], { actor: B, via: 'beam' });
    const s = blockOf(a, block).sentences;
    expect(s.map((x) => x.field.state)).toEqual(['one', 'clash', 'one']);
    expect(s[1]!.field.lanes.map((l) => [l.actor, l.value])).toEqual([
      [A, 'Two by A. '],
      [B, 'Two by B. '],
    ]);
    expect(s[2]!.field.shown?.value).toBe('Three!');
    expect(a.view().needsLook.clashes).toEqual([s[1]!.field.key]);
  });

  test('a change made after seeing a value replaces it', () => {
    const { a, block } = start();
    const b = copy(a, B);
    b.commit(intents.setText(b.view(), block, 'One. Two. Three and more.'), at());
    expect(blockOf(b, block).sentences.every((s) => s.field.state === 'one')).toBe(true);
    expect(text(blockOf(b, block))).toBe('One. Two. Three and more.');
  });

  test('the same words typed on two phones are not a clash', () => {
    const { a, block } = start();
    const b = copy(a, B);
    a.commit(intents.setText(a.view(), block, 'One. Same. Three.'), at());
    b.commit(intents.setText(b.view(), block, 'One. Same. Three.'), at());
    a.receive([...b.changes()], { actor: B, via: 'beam' });
    expect(blockOf(a, block).sentences.every((s) => s.field.state === 'one')).toBe(true);
  });

  test('a deleted paragraph against a changed sentence shows "deleted" as a lane', () => {
    const { a, block } = start();
    const b = copy(a, B);
    a.commit(intents.deleteBlock(a.view(), block), at());
    b.commit(intents.setText(b.view(), block, 'One. Two changed. Three.'), at());
    a.receive([...b.changes()], { actor: B, via: 'beam' });
    const blk = blockOf(a, block);
    expect(blk.sentences.length).toBe(1);
    expect(blk.sentences[0]!.field.lanes.map((l) => [l.actor, l.value])).toEqual([
      [A, null],
      [B, 'Two changed. '],
    ]);
  });

  test('a deleted block with nothing in clash is gone', () => {
    const { a, block } = start();
    a.commit(intents.deleteBlock(a.view(), block), at());
    expect(a.view().blocks.find((b) => b.id === block)).toBeUndefined();
  });

  test('formatting and block style never clash: the later writer time wins', () => {
    const { a, block } = start();
    const b = copy(a, B);
    a.commit(intents.setStyle(block, { kind: 'h2' }), at());
    b.commit(intents.setStyle(block, { kind: 'h3' }), at());
    a.receive([...b.changes()], { actor: B, via: 'beam' });
    expect(blockOf(a, block).style).toEqual({ kind: 'h3' });
    expect(a.view().needsLook.clashes).toEqual([]);
  });

  test('only a writer can change their own name', () => {
    const { a } = start();
    const b = copy(a, B);
    b.commit([{ o: 'set', k: keys.writerName(A), v: 'Not A' }, ...intents.setWriterName(B, 'Bina')], at());
    a.commit(intents.setWriterName(A, 'Asha'), at());
    a.receive([...b.changes()], { actor: B, via: 'beam' });
    expect(a.view().writers[A]?.name).toBe('Asha');
    expect(a.view().writers[B]?.name).toBe('Bina');
  });
});

function clashed(): { a: Engine; b: Engine; block: string; field: () => Field<string> } {
  const { a, block } = start();
  const b = copy(a, B);
  a.commit(intents.setText(a.view(), block, 'One. Two by A. Three.'), at());
  b.commit(intents.setText(b.view(), block, 'One. Two by B. Three.'), at());
  a.receive([...b.changes()], { actor: B, via: 'beam' });
  b.receive([...a.changes()], { actor: A, via: 'beam' });
  return { a, b, block, field: () => blockOf(a, block).sentences[1]!.field };
}

describe('pick, unpick and settle rules', () => {
  test('Keep this one folds the lanes, keeps the other behind "1 other", and undoing a pick brings the lanes back', () => {
    const { a, b, block, field } = clashed();
    const bLane = field().lanes.find((l) => l.actor === B)!;
    a.commit(intents.pick(field(), bLane.ref), at());
    const picked = field();
    expect(picked.state).toBe('one');
    expect(picked.shown?.value).toBe('Two by B. ');
    expect(picked.shown?.actor).toBe(B); // still B's words
    expect(picked.pickedBy).toBe(A);
    expect(picked.kept.map((l) => l.value)).toEqual(['Two by A. ']);

    a.commit(intents.unpick(picked), at());
    expect(field().state).toBe('clash');
    expect(field().lanes.map((l) => l.value)).toEqual(['Two by A. ', 'Two by B. ']);

    b.receive([...a.changes()], { actor: A, via: 'beam' });
    expect(blockOf(b, block).sentences[1]!.field.state).toBe('clash');
    expect(b.fingerprint()).toEqual(a.fingerprint());
  });

  test('undo of a pick brings the lanes back too', () => {
    const { a, field } = clashed();
    a.commit(intents.pick(field(), field().lanes[0]!.ref), at());
    expect(field().state).toBe('one');
    expect(a.undo(at())).not.toBeNull();
    expect(field().state).toBe('clash');
    expect(a.redo(at())).not.toBeNull();
    expect(field().state).toBe('one');
  });

  test('settle rules apply when shown, keep the loser, and Always ask brings every lane back', () => {
    const { a, field } = clashed();
    a.commit(intents.setSettle({ kind: 'newest' }), at());
    expect(field().state).toBe('settled');
    expect(field().shown?.value).toBe('Two by B. ');
    expect(field().kept.map((l) => l.value)).toEqual(['Two by A. ']);
    expect(a.view().needsLook.clashes).toEqual([]);
    a.commit(intents.setSettle({ kind: 'person', actor: A }), at());
    expect(field().shown?.value).toBe('Two by A. ');
    a.commit(intents.setSettle({ kind: 'smaller' }), at());
    expect(field().state).toBe('clash'); // not numbers: it can't decide
    a.commit(intents.setSettle({ kind: 'ask' }), at());
    expect(field().state).toBe('clash');
  });

  test('For numbers, keep the smaller one', () => {
    const a = new Engine(DOC, A);
    const tbl = intents.createTable(a.view(), null, 'Stock', [{ name: 'Item', kind: 'words' }, { name: 'Count', kind: 'number' }]);
    a.commit(tbl.ops, at());
    const [item, count] = blockOf(a, tbl.block).table!.columns.map((c) => c.id) as [string, string];
    const row = intents.addRow(a.view(), tbl.block, { [item]: 'Tarpaulin', [count]: '40' });
    a.commit(row.ops, at());
    const b = copy(a, B);
    a.commit(intents.setCell(tbl.block, row.row, count, '35'), at());
    b.commit(intents.setCell(tbl.block, row.row, count, '50'), at());
    a.receive([...b.changes()], { actor: B, via: 'beam' });
    a.commit(intents.setSettle({ kind: 'smaller' }), at());
    const cell = blockOf(a, tbl.block).table!.rows[0]!.cells[count]!;
    expect(cell.state).toBe('settled');
    expect(cell.shown?.value).toBe('35');
  });
});

describe('undo and redo', () => {
  test('undo takes back only this phone\'s own changes, and skips a spot someone else changed since', () => {
    const { a, block } = start();
    a.commit(intents.setText(a.view(), block, 'One. Two by A. Three.'), at());
    const b = copy(a, B);
    b.commit(intents.setText(b.view(), block, 'One. Two by B. Three.'), at());
    a.receive([...b.changes()], { actor: B, via: 'beam' });
    expect(text(blockOf(a, block))).toBe('One. Two by B. Three.');
    // A's last change was sentence 2, which B has since changed: nothing of A's is left to take back.
    expect(a.undo(at())).toBeNull();
    expect(text(blockOf(a, block))).toBe('One. Two by B. Three.');
  });

  test('undo takes back the parts of a change nobody else has touched', () => {
    const { a, block } = start();
    a.commit(intents.setText(a.view(), block, 'One. Two. Three. Four.'), at()); // "Three." becomes "Three. "
    const b = copy(a, B);
    b.commit(intents.setText(b.view(), block, 'One. Two. Three. Four by B.'), at());
    a.receive([...b.changes()], { actor: B, via: 'beam' });
    expect(a.undo(at())).not.toBeNull();
    expect(text(blockOf(a, block))).toBe('One. Two. Three.Four by B.');
  });

  test('undo and redo of a sentence change', () => {
    const { a, block } = start();
    a.commit(intents.setText(a.view(), block, 'One. Two changed. Three.'), at());
    a.commit(intents.setText(a.view(), block, 'One. Two changed again. Three.'), at());
    a.undo(at());
    expect(text(blockOf(a, block))).toBe('One. Two changed. Three.');
    a.undo(at());
    expect(text(blockOf(a, block))).toBe('One. Two. Three.');
    expect(blockOf(a, block).sentences[1]!.field.shown?.actor).toBe(A);
    a.redo(at());
    expect(text(blockOf(a, block))).toBe('One. Two changed. Three.');
    expect(a.undo(at())).not.toBeNull();
    expect(text(blockOf(a, block))).toBe('One. Two. Three.');
    expect(a.undo(at())).toBeNull(); // the doc's first change is never undone
  });

  test('undo of an added paragraph removes it', () => {
    const { a, block } = start();
    const ins = intents.insertBlock(a.view(), block, { kind: 'p' }, 'New one.');
    a.commit(ins.ops, at());
    expect(a.view().blocks.length).toBe(2);
    a.undo(at());
    expect(a.view().blocks.length).toBe(1);
  });
});

describe('setText', () => {
  test('a changed sentence writes only its slot; added and removed sentences add slots or write null', () => {
    const { a, block } = start();
    const ops = intents.setText(a.view(), block, 'One. Two! Three.');
    expect(ops).toEqual([{ o: 'set', k: keys.sentence(block, blockOf(a, block).sentences[1]!.id), v: 'Two! ' }]);
    a.commit(intents.setText(a.view(), block, 'Zero. One. Three. Four.'), at());
    expect(text(blockOf(a, block))).toBe('Zero. One. Three. Four.');
    a.commit(intents.setText(a.view(), block, ''), at());
    expect(blockOf(a, block).sentences).toEqual([]);
    expect(a.view().blocks.length).toBe(1); // an emptied paragraph stays, empty
  });

  test('sentences in clash are left alone; new text goes around them', () => {
    const { a, block, field } = clashed();
    a.commit(intents.setText(a.view(), block, 'One. Three. Four.'), at());
    const b = blockOf(a, block);
    expect(b.sentences.map((s) => s.field.state)).toEqual(['one', 'clash', 'one', 'one']);
    expect(field().state).toBe('clash');
  });
});

describe('tables, ticks, marks, lists', () => {
  test('a deleted row against a changed cell shows two versions of the row', () => {
    const a = new Engine(DOC, A);
    const tbl = intents.createTable(a.view(), null, 'Kits', [{ name: 'Card', kind: 'words' }]);
    a.commit(tbl.ops, at());
    const col = blockOf(a, tbl.block).table!.columns[0]!.id;
    const row = intents.addRow(a.view(), tbl.block, { [col]: '4471' });
    a.commit(row.ops, at());
    const b = copy(a, B);
    a.commit(intents.deleteRow(tbl.block, row.row), at());
    b.commit(intents.setCell(tbl.block, row.row, col, '4472'), at());
    a.receive([...b.changes()], { actor: B, via: 'beam' });
    const r = blockOf(a, tbl.block).table!.rows[0]!;
    expect(r.alive.state).toBe('clash');
    expect(r.alive.lanes.map((l) => l.value)).toEqual([null, true]);
    expect(r.cells[col]!.shown?.value).toBe('4472');
  });

  test('rows added while apart come out in the order they were written', () => {
    const a = new Engine(DOC, A);
    const tbl = intents.createTable(a.view(), null, 'Kits', [{ name: 'Card', kind: 'words' }]);
    a.commit(tbl.ops, at());
    const col = blockOf(a, tbl.block).table!.columns[0]!.id;
    const b = copy(a, B);
    a.commit(intents.addRow(a.view(), tbl.block, { [col]: 'first' }).ops, at());
    b.commit(intents.addRow(b.view(), tbl.block, { [col]: 'second' }).ops, at());
    a.commit(intents.addRow(a.view(), tbl.block, { [col]: 'third' }).ops, at());
    a.receive([...b.changes()], { actor: B, via: 'beam' });
    expect(blockOf(a, tbl.block).table!.rows.map((r) => r.cells[col]!.shown?.value)).toEqual(['first', 'second', 'third']);
  });

  test('ticks clash like sentences, marks follow their words, numbers are worked out', () => {
    const a = new Engine(DOC, A);
    const ids: string[] = [];
    let after: string | null = null;
    for (const [style, words] of [
      [{ kind: 'li', list: 'number', indent: 0 }, 'First'],
      [{ kind: 'li', list: 'number', indent: 1 }, 'Inner'],
      [{ kind: 'li', list: 'number', indent: 0 }, 'Second'],
      [{ kind: 'li', list: 'check', indent: 0 }, 'Tarpaulins for 40 families'],
    ] as const) {
      const ins = intents.insertBlock(a.view(), after, style, words);
      a.commit(ins.ops, at());
      ids.push(ins.block);
      after = ins.block;
    }
    expect(a.view().blocks.map((b) => b.number)).toEqual([1, 1, 2, undefined]);
    const check = ids[3]!;
    expect(blockOf(a, check).tick?.shown?.value).toBe(false);
    const b = copy(a, B);
    a.commit(intents.setTick(check, true), at());
    b.commit(intents.setTick(check, false), at());
    a.receive([...b.changes()], { actor: B, via: 'beam' });
    expect(blockOf(a, check).tick?.state).toBe('clash');

    a.commit(intents.setMark(check, 'bold', 'families', 1, true), at());
    expect(blockOf(a, check).marks).toEqual([{ type: 'bold', quote: 'families', occurrence: 1 }]);
    expect(intents.setMark(check, 'link', 'families', 1, true, 'javascript:alert(1)')).toEqual([]);
    a.commit(intents.setText(a.view(), check, 'Tarpaulins for 40 homes'), at());
    expect(blockOf(a, check).marks).toEqual([]);
  });
});

describe('check rules', () => {
  function kits(): { a: Engine; table: string; card: string; kit: string; count: string } {
    const a = new Engine(DOC, A);
    const tbl = intents.createTable(a.view(), null, 'Kits given out', [
      { name: 'Ration card', kind: 'words' },
      { name: 'Kit', kind: 'words' },
      { name: 'Count', kind: 'number' },
    ]);
    a.commit(tbl.ops, at());
    const [card, kit, count] = blockOf(a, tbl.block).table!.columns.map((c) => c.id) as [string, string, string];
    return { a, table: tbl.block, card, kit, count };
  }

  test('no repeats: "One kit per ration card. Ration card 4471 has Kit Family kit 2 times."', () => {
    const { a, table, card, kit } = kits();
    a.commit(intents.addRule(a.view(), { kind: 'unique', name: 'One kit per ration card', table, column: card, of: kit }).ops, at());
    a.commit(intents.addRow(a.view(), table, { [card]: '4471', [kit]: 'Family kit' }).ops, at());
    expect(a.view().rules[0]!.result.state).toBe('ok');
    a.commit(intents.addRow(a.view(), table, { [card]: '4471 ', [kit]: 'family kit' }).ops, at());
    const r = a.view().rules[0]!.result;
    expect(r).toMatchObject({ state: 'broken', message: 'One kit per ration card. Ration card 4471 has Kit Family kit 2 times.' });
    expect(a.view().needsLook.broken).toEqual([a.view().rules[0]!.id]);
    a.commit(intents.addRow(a.view(), table, { [card]: '4471', [kit]: 'Tarpaulin' }).ops, at());
    expect(a.view().rules[0]!.result).toMatchObject({
      message: 'One kit per ration card. Ration card 4471 has Kit Family kit and Kit Tarpaulin.',
    });
  });

  test('count or total stays within, and unknown rule kinds give unknown', () => {
    const { a, table, kit, count } = kits();
    a.commit(intents.addRule(a.view(), { kind: 'limit', name: 'Tarpaulins stay within 50', table, where: { column: kit, equals: 'Tarpaulin' }, total: count, max: 50 }).ops, at());
    a.commit(intents.addRule(a.view(), { kind: 'from-the-future', table }).ops, at());
    a.commit(intents.addRow(a.view(), table, { [kit]: 'Tarpaulin', [count]: '30' }).ops, at());
    expect(a.view().rules[0]!.result.state).toBe('ok');
    a.commit(intents.addRow(a.view(), table, { [kit]: 'tarpaulin', [count]: '25' }).ops, at());
    expect(a.view().rules[0]!.result).toMatchObject({
      state: 'broken',
      message: 'Tarpaulins stay within 50. The total of Count where Kit is Tarpaulin: 55, more than 50.',
    });
    expect(a.view().rules[1]!.result).toEqual({ state: 'unknown' });
  });
});

describe('the truck back', () => {
  test('256 different friendly words of 3 to 6 letters', () => {
    expect(WORDS.length).toBe(256);
    expect(new Set(WORDS).size).toBe(256);
    for (const w of WORDS) expect(w).toMatch(/^[a-z]{3,6}$/);
  });

  test('the same doc gives the same words; one changed letter changes them', () => {
    const { a, block } = start();
    const b = copy(a, B);
    expect(b.fingerprint()).toEqual(a.fingerprint());
    const before = a.fingerprint();
    a.commit(intents.setText(a.view(), block, 'One. Two. Three!'), at());
    expect(a.fingerprint().hex).not.toBe(before.hex);
    expect(a.fingerprint().digits).toMatch(/^\d\d$/);
    // Notes never change the truck back.
    const r = b.receive([...a.changes()], { actor: A, via: 'beam' });
    expect(r.note).not.toBeNull();
    expect(b.fingerprint()).toEqual(a.fingerprint());
  });

  test('made from what the doc says, not its history', () => {
    const { a, block } = start();
    const v1 = fingerprintOf(a.view());
    a.commit(intents.setText(a.view(), block, 'One. Two. Three. Four.'), at());
    a.commit(intents.setText(a.view(), block, 'One. Two. Three.'), at());
    expect(fingerprintOf(a.view()).hex).toBe(v1.hex);
  });
});

describe('who has this, the trail, the normal-sync view, replay', () => {
  test('who has a block, and how it travelled', () => {
    const { a, block } = start();
    const b = new Engine(DOC, B);
    b.receive([...a.changes()], { actor: A, via: 'beam' });
    const c = new Engine(DOC, C);
    c.receive([...b.changes()], { actor: B, via: 'file' });
    a.receive([...c.changes()], { actor: C, via: 'beam' });
    expect(a.whoHas(block)).toEqual([A, B, C]);
    expect(a.trail(block).map((s) => [s.actor, s.via])).toEqual([
      [A, 'wrote'],
      [B, 'beam'],
      [C, 'file'],
    ]);
    a.commit(intents.setText(a.view(), block, 'One. Two. Three. More.'), at());
    expect(a.whoHas(block)).toEqual([A]);
  });

  test('a normal sync keeps only the version that arrived last', () => {
    const { a, block } = clashed();
    const arrival = new Map(a.changes().map((c, i) => [c.id, i]));
    const bRef = blockOf(a, block).sentences[1]!.field.lanes.find((l) => l.actor === B)!.ref;
    arrival.set(bRef, -5); // B's change reached this phone first
    const normal = a.view({ mode: 'normal-sync', arrival }).blocks.find((b) => b.id === block)!;
    expect(normal.sentences[1]!.field.state).toBe('one');
    expect(normal.sentences[1]!.field.shown?.actor).toBe(A);
    expect(blockOf(a, block).sentences[1]!.field.state).toBe('clash'); // the doc itself is unchanged
  });

  test('replay steps through every edit, skipping notes', () => {
    const { a } = start();
    const b = new Engine(DOC, B);
    b.receive([...a.changes()], { actor: A, via: 'beam' });
    b.commit(intents.setTitle(b.view(), 'Trip notes, day 2'), at());
    const steps = b.replay();
    expect(steps.map((s) => s.actor)).toEqual([A, B]);
    expect(steps[1]!.view.title.shown?.value).toBe('Trip notes, day 2');
  });
});

describe('who wrote what, formatting, and bad input', () => {
  test('a block knows every writer whose words it shows', () => {
    const { a, block } = start();
    const b = copy(a, B);
    b.commit(intents.setText(b.view(), block, 'One. Two by B. Three.'), at());
    a.receive([...b.changes()], { actor: B, via: 'beam' });
    expect(blockOf(a, block).writtenBy).toEqual([A, B]);
    a.commit(intents.setText(a.view(), block, 'One. Two by A. Three.'), at());
    expect(blockOf(a, block).writtenBy).toEqual([A]);
  });

  test('bold on one phone and not bold on another: the later writer time wins, no clash', () => {
    const { a, block } = start();
    a.commit(intents.setMark(block, 'bold', 'Two', 1, true), at());
    const b = copy(a, B);
    b.commit(intents.setMark(block, 'bold', 'Two', 1, false), at());
    a.commit(intents.setMark(block, 'italic', 'One', 1, true), at());
    a.receive([...b.changes()], { actor: B, via: 'beam' });
    expect(blockOf(a, block).marks).toEqual([{ type: 'italic', quote: 'One', occurrence: 1 }]);
    expect(a.view().needsLook.clashes).toEqual([]);
  });

  test('a change with a bad op is refused, and the doc stays as it was', () => {
    const { a } = start();
    const before = a.fingerprint();
    const bad = { id: `${B}:1`, actor: B, seq: 1, deps: [...a.heads()], t: 1, kind: 'edit', ops: [{ o: 'set', k: 5, v: 'x' }] };
    const proto = { id: '__proto__:1', actor: '__proto__', seq: 1, deps: [], t: 1, kind: 'edit', ops: [] };
    const huge = { id: `${B}:${2 ** 53}`, actor: B, seq: 2 ** 53, deps: [], t: 1, kind: 'edit', ops: [] };
    const r = a.receive([bad, null, proto, huge] as unknown as Change[], { actor: B, via: 'file' });
    expect(r.added).toEqual([]);
    expect(a.fingerprint()).toEqual(before);
  });

  test('a made-up chain of "show these lanes again" values stays quick', () => {
    const { a, block } = start();
    const key = blockOf(a, block).sentences[0]!.field.key;
    // Each change points at every earlier one: opening every path, even 8 deep, would take millions of steps.
    const refs = [...a.changes()].map((c) => c.id).slice(0, 1);
    for (let i = 0; i < 40; i++) refs.push(a.commit([{ o: 'set', k: key, v: { $lanes: [...refs] } }], at()).id);
    const started = Date.now();
    a.view();
    expect(Date.now() - started).toBeLessThan(500);
  });

  test('every intent is there', () => {
    const names = [
      'setTitle', 'setText', 'insertBlock', 'deleteBlock', 'setStyle', 'setTick', 'setMark', 'pick', 'unpick', 'setSettle',
      'createTable', 'addColumn', 'setColumn', 'addRow', 'setCell', 'deleteRow', 'setTableName', 'addRule', 'deleteRule',
      'setWriterName', 'setWriterColour', 'setTemplate',
    ];
    for (const n of names) expect(typeof (intents as unknown as Record<string, unknown>)[n], n).toBe('function');
    expect(Object.keys(intents).sort()).toEqual([...names].sort());
  });
});

describe('the module', () => {
  test('ids have the right shapes', () => {
    expect(model.newActorId()).toMatch(/^[0-9a-f]{16}$/);
    expect(model.newDocId()).toMatch(/^[0-9a-f]{32}$/);
    expect(model.newItemId()).toMatch(/^[0-9a-z]{12}$/);
  });

  test('createDoc and openDoc give the same doc', () => {
    const { engine: e, first } = createDoc(A, intents.setTitle({} as DocView, 'Hello'), { t: 5 });
    expect(first.id).toBe(`${A}:1`);
    const again = openDoc(e.docId, B, [first]);
    expect(again.fingerprint()).toEqual(e.fingerprint());
    expect(again.view().title.shown?.value).toBe('Hello');
  });
});

/** Random writers making random edits and catching each other, driven by one seed. */
function randomHistory(seed: number, steps: number): Change[] {
  const rnd = seededRandom(seed);
  const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rnd() * xs.length)]!;
  const words = ['Ferry', 'runs', 'stops', 'today', 'water', 'road', '4471', 'kit', 'রাস্তা', 'ok'];
  const sentence = () => `${Array.from({ length: 1 + Math.floor(rnd() * 3) }, () => pick(words)).join(' ')}${pick(['. ', '! ', '? ', '. '])}`;
  const first = new Engine(DOC, A);
  first.commit(intents.insertBlock(first.view(), null, { kind: 'p' }, 'Start here. Then more.').ops, { t: 1 });
  const tbl = intents.createTable(first.view(), null, 'T', [{ name: 'Card', kind: 'words' }, { name: 'N', kind: 'number' }]);
  first.commit(tbl.ops, { t: 2 });
  const phones = [first, copy(first, B), copy(first, C)];
  let clock = 10;
  for (let i = 0; i < steps; i++) {
    const p = pick(phones);
    const v = p.view();
    const texts = v.blocks.filter((b) => !b.table);
    const r = rnd();
    let ops: Op[] = [];
    const time = { t: (clock += Math.floor(rnd() * 3)) }; // clocks can tie
    if (r < 0.3 && texts.length > 0) {
      const b = pick(texts);
      ops = intents.setText(v, b.id, Array.from({ length: 1 + Math.floor(rnd() * 3) }, sentence).join(''));
    } else if (r < 0.4) {
      ops = intents.insertBlock(v, pick([null, ...v.blocks.map((b) => b.id)]), pick([{ kind: 'p' }, { kind: 'h2' }, { kind: 'li', list: 'number', indent: 0 }] as const), sentence()).ops;
    } else if (r < 0.47 && texts.length > 0) {
      ops = intents.deleteBlock(v, pick(texts).id);
    } else if (r < 0.55) {
      const t = v.blocks.find((b) => b.id === tbl.block);
      if (t?.table) {
        const cols = t.table.columns.map((c) => c.id);
        if (rnd() < 0.5 || t.table.rows.length === 0) ops = intents.addRow(v, tbl.block, { [cols[0]!]: pick(words), [cols[1]!]: String(Math.floor(rnd() * 9)) }).ops;
        else if (rnd() < 0.7) ops = intents.setCell(tbl.block, pick(t.table.rows).id, pick(cols), pick(words));
        else ops = intents.deleteRow(tbl.block, pick(t.table.rows).id);
      }
    } else if (r < 0.65) {
      const clash = v.blocks.flatMap((b) => b.sentences.map((s) => s.field)).filter((f) => f.state === 'clash');
      if (clash.length > 0) {
        const f = pick(clash);
        ops = intents.pick(f, pick(f.lanes).ref);
      }
    } else if (r < 0.7) {
      ops = intents.setSettle(pick([{ kind: 'ask' }, { kind: 'newest' }, { kind: 'smaller' }, { kind: 'person', actor: B }] as const));
    } else if (r < 0.75) {
      p.undo(time);
    } else if (r < 0.78 && texts.length > 0) {
      ops = intents.setStyle(pick(texts).id, pick([{ kind: 'p' }, { kind: 'h1' }] as const));
    } else {
      const from = pick(phones);
      if (from !== p) p.receive([...from.changes()], { actor: from.me, via: 'beam' });
    }
    if (ops.length > 0) p.commit(ops, time);
  }
  const all = new Map<string, Change>();
  for (const p of phones) for (const c of p.changes()) all.set(c.id, c);
  return [...all.values()];
}

describe('any order, same doc', () => {
  test('random writers, random edits: every arrival order gives the same truck back', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 2 ** 31 - 1 }), (seed) => {
        const changes = randomHistory(seed, 60);
        const result = runSelfTest(changes, 15, seed);
        expect(result.differing).toEqual([]);
        expect(result.same).toBe(15);
      }),
      { numRuns: 40 },
    );
  });

  test('phones that caught each other in any order show the same doc', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 2 ** 31 - 1 }), (seed) => {
        const changes = randomHistory(seed, 40);
        const rnd = seededRandom(seed);
        const x = new Engine(DOC, 'x000000000000000', shuffle(changes, rnd));
        const y = new Engine(DOC, 'y000000000000000');
        for (const c of shuffle(changes, rnd)) y.receive([c], { actor: null, via: 'file' });
        expect(y.fingerprint()).toEqual(x.fingerprint());
        const edits = (e: Engine) => e.changes().filter((c) => c.kind === 'edit').map((c) => c.id).sort();
        expect(edits(y)).toEqual(edits(x));
      }),
      { numRuns: 30 },
    );
  });
});

describe('the two-versions script test', () => {
  test('all eight steps pass (100 orders here; npm run selftest runs 1,000)', () => {
    const result = runTwoVersionsScript(100);
    for (const s of result.steps) expect(`${s.title}: ${s.passed ? 'passed' : 'FAILED'} (${s.detail})`).toContain('passed');
    expect(result.same).toBe(100);
  });
});

import { describe, expect, test } from 'vitest';
import fc from 'fast-check';
import { zlibSync, strToU8 } from 'fflate';
import type { Change } from '../contracts';
import { Engine } from './engine';
import { intents } from './intents';
import { decodePhir, encodePhir, MAX_UNPACKED, readPhir } from './phir';

const DOC = 'd0c0d0c0d0c0d0c0d0c0d0c0d0c0d0c0';
const A = 'aaaaaaaaaaaaaaaa';
const B = 'bbbbbbbbbbbbbbbb';

function sampleDoc(): { docId: string; title: string; changes: Change[] } {
  const a = new Engine(DOC, A);
  a.commit([...intents.setTitle(a.view(), 'Camp log, Gosaba'), ...intents.insertBlock(a.view(), null, { kind: 'p' }, 'Ferry runs at 6. রাস্তা বন্ধ।').ops], { t: 1 });
  const b = new Engine(DOC, B);
  b.receive([...a.changes()], { actor: A, via: 'beam' }); // writes a note
  b.commit(intents.setTitle(b.view(), 'Camp log, Gosaba (day 2)'), { t: 2 });
  return { docId: DOC, title: 'Camp log, Gosaba (day 2)', changes: [...b.changes()] };
}

function withHeader(format: number, body: Uint8Array): Uint8Array {
  const out = new Uint8Array(5 + body.length);
  out.set([0x50, 0x48, 0x49, 0x52, format]);
  out.set(body, 5);
  return out;
}

describe('the .phir file', () => {
  test('starts with PHIR and format 1, and gives back every change, notes included', () => {
    const doc = sampleDoc();
    expect(doc.changes.some((c) => c.kind === 'note')).toBe(true);
    const bytes = encodePhir(doc);
    expect([...bytes.subarray(0, 5)]).toEqual([0x50, 0x48, 0x49, 0x52, 1]);
    const back = decodePhir(bytes);
    expect(back).toEqual({ ok: true, format: 1, docId: DOC, title: doc.title, changes: doc.changes });
    if (!back.ok) return;
    expect(new Engine(DOC, 'cccccccccccccccc', back.changes).fingerprint()).toEqual(new Engine(DOC, B, doc.changes).fingerprint());
  });

  test('anything that isn\'t a Phir Milenge file says so', () => {
    expect(decodePhir(new Uint8Array())).toEqual({ ok: false, reason: 'not-phir' });
    expect(decodePhir(strToU8('PHI'))).toEqual({ ok: false, reason: 'not-phir' });
    expect(decodePhir(strToU8('Hello, this is a text file.'))).toEqual({ ok: false, reason: 'not-phir' });
    expect(decodePhir(Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toEqual({ ok: false, reason: 'not-phir' });
  });

  test('a file from a newer Phir Milenge stops at once', () => {
    const bytes = encodePhir(sampleDoc());
    bytes[4] = 2;
    expect(decodePhir(bytes)).toEqual({ ok: false, reason: 'newer', format: 2 });
  });

  test('every single changed byte after the header is caught as damaged', () => {
    const bytes = encodePhir(sampleDoc());
    for (let i = 5; i < bytes.length; i++) {
      const bad = bytes.slice();
      bad[i]! ^= 0x01;
      const r = decodePhir(bad);
      expect(r.ok, `byte ${i}`).toBe(false);
      expect(r.ok ? null : r.reason).toBe('damaged');
    }
  });

  test('a cut-off file is damaged, at every length', () => {
    const bytes = encodePhir(sampleDoc());
    for (let n = 5; n < bytes.length; n++) {
      expect(decodePhir(bytes.subarray(0, n))).toMatchObject({ ok: false, reason: 'damaged' });
    }
  });

  test('random bytes after the header never open', () => {
    fc.assert(
      fc.property(fc.uint8Array({ maxLength: 400 }), (body) => {
        const r = decodePhir(withHeader(1, body));
        expect(r).toMatchObject({ ok: false, reason: 'damaged', format: 1 });
      }),
      { numRuns: 500 },
    );
  });

  test('a good zlib bundle with the wrong things inside is damaged', () => {
    const pack = (x: unknown) => withHeader(1, zlibSync(strToU8(JSON.stringify(x))));
    expect(decodePhir(pack('just a string'))).toMatchObject({ ok: false, reason: 'damaged' });
    expect(decodePhir(pack({ docId: DOC, title: 'T', changes: 'nope' }))).toMatchObject({ ok: false, reason: 'damaged' });
    expect(decodePhir(pack({ docId: DOC, title: 'T', changes: [{ id: 'x' }] }))).toMatchObject({ ok: false, reason: 'damaged' });
    const bad = { id: `${A}:1`, actor: A, seq: 1, deps: [], t: 1, kind: 'edit', ops: [null] };
    expect(decodePhir(pack({ docId: DOC, title: 'T', changes: [bad] }))).toMatchObject({ ok: false, reason: 'damaged' });
    expect(decodePhir(withHeader(1, strToU8('{"not":"compressed"}')))).toMatchObject({ ok: false, reason: 'damaged' });
  });

  test('a small file that would unpack to something huge is stopped early, as damaged', () => {
    const huge = new Uint8Array(3_000_000).fill(0x20); // 3 MB of spaces squeezes to a few KB
    const bomb = withHeader(1, zlibSync(huge, { level: 9 }));
    expect(bomb.length).toBeLessThan(10_000);
    expect(readPhir(bomb, 1_000_000)).toMatchObject({ ok: false, reason: 'damaged', format: 1 });
    const doc = sampleDoc();
    expect(readPhir(encodePhir(doc), 1_000_000)).toMatchObject({ ok: true, changes: doc.changes });
    expect(MAX_UNPACKED).toBeGreaterThanOrEqual(32_000_000);
  });

  test('a squeezed doc is much smaller than its JSON', () => {
    const doc = sampleDoc();
    const a = new Engine(DOC, A, doc.changes);
    const block = a.view().blocks[0]!.id;
    for (let i = 0; i < 200; i++) a.commit(intents.setText(a.view(), block, `Ferry runs at ${i}. রাস্তা বন্ধ।`), { t: 10 + i });
    const changes = [...a.changes()];
    const bytes = encodePhir({ docId: DOC, title: 'T', changes });
    expect(bytes.length).toBeLessThan(JSON.stringify(changes).length / 3);
  });
});

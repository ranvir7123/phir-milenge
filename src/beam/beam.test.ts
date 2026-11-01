import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { decodeBase45, encodeBase45 } from './base45';
import { crc32 } from './crc32';
import { decodeFrame, decodeHello, encodeFrame, encodeHello, frameToText, textToFrame } from './frames';
import { FountainDecoder, FountainEncoder, pieceCount } from './fountain';
import { BeamSender } from './sender';
import { BeamCatcher } from './catcher';
import type { BeamHello } from '../contracts';

const text = (s: string) => new TextEncoder().encode(s);
const str = (b: Uint8Array) => new TextDecoder().decode(b);

describe('base45 (RFC 9285)', () => {
  it('encodes the examples in the RFC', () => {
    expect(encodeBase45(text('AB'))).toBe('BB8');
    expect(encodeBase45(text('Hello!!'))).toBe('%69 VD92EX0');
    expect(encodeBase45(text('base-45'))).toBe('UJCLQE7W581');
    expect(encodeBase45(text('ietf!'))).toBe('QED8WEX0');
  });

  it('decodes the examples in the RFC', () => {
    expect(str(decodeBase45('QED8WEX0')!)).toBe('ietf!');
    expect(str(decodeBase45('BB8')!)).toBe('AB');
    expect(str(decodeBase45('%69 VD92EX0')!)).toBe('Hello!!');
    expect(str(decodeBase45('UJCLQE7W581')!)).toBe('base-45');
  });

  it('refuses text that is not base45', () => {
    expect(decodeBase45('GGW')).toBeNull(); // the RFC's example of a value over 65535
    expect(decodeBase45('ab')).toBeNull(); // lower case is not in the alphabet
    expect(decodeBase45('A')).toBeNull(); // a length of 3n+1 can't happen
    expect(decodeBase45(':;')).toBeNull();
  });

  it('gives back any bytes exactly', () => {
    fc.assert(
      fc.property(fc.uint8Array({ maxLength: 600 }), (bytes) => {
        expect(decodeBase45(encodeBase45(bytes))).toEqual(bytes);
      }),
    );
  });
});

describe('crc32', () => {
  it('matches the standard check value', () => {
    expect(crc32(text('123456789'))).toBe(0xcbf43926);
  });
});

describe('frames', () => {
  const header = { kind: 0, beamId: 0xdeadbeef, size: 12345, pieceSize: 400, number: 77, spare: 3 };

  it('round-trips header and body through QR text', () => {
    const body = new Uint8Array([1, 2, 3, 250, 0, 32]);
    const back = textToFrame(frameToText(encodeFrame(header, body)));
    expect(back).toBeInstanceOf(Uint8Array);
    const frame = decodeFrame(back as Uint8Array);
    expect(frame.ok).toBe(true);
    if (!frame.ok) return;
    expect(frame.header).toEqual({ ...header, version: 1 });
    expect(frame.body).toEqual(body);
  });

  it('only uses characters a QR code holds in alphanumeric mode', () => {
    const t = frameToText(encodeFrame(header, new Uint8Array(300).map((_, i) => i * 7)));
    expect(t).toMatch(/^[0-9A-Z $%*+\-./:]+$/);
  });

  it('throws away a frame with any one character changed', () => {
    const t = frameToText(encodeFrame(header, new Uint8Array(50).fill(9)));
    for (let i = 3; i < t.length - 1; i++) {
      const c = t[i] === '0' ? '1' : '0';
      const bytes = textToFrame(t.slice(0, i) + c + t.slice(i + 1));
      if (bytes instanceof Uint8Array) expect(decodeFrame(bytes).ok).toBe(false);
    }
  });

  it('tells other QR codes apart', () => {
    expect(textToFrame('upi://pay?pa=someone@bank')).toBe('foreign');
    expect(textToFrame('PM:QED8WEX0')).toBe('damaged');
  });

  it('spots a frame from a newer Phir Milenge', () => {
    const bytes = encodeFrame(header, new Uint8Array(4));
    bytes[0] = 2;
    const view = new DataView(bytes.buffer);
    view.setUint32(bytes.length - 4, crc32(bytes, 0, bytes.length - 4));
    expect(decodeFrame(bytes)).toEqual({ ok: false, reason: 'newer' });
  });

  it('carries a hello, cutting very long titles', () => {
    const hello: BeamHello = { format: 1, docId: 'd1', title: 'x'.repeat(500), senderName: 'Rina', senderActor: 'a1', size: 9 };
    const back = decodeHello(encodeHello(hello))!;
    expect(back.title.length).toBe(120);
    expect(back.senderName).toBe('Rina');
    expect(decodeHello(text('{"format":1}'))).toBeNull();
    expect(decodeHello(text('not json'))).toBeNull();
  });
});

// A small seeded generator so a failing case can be run again.
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('fountain code', () => {
  it('rebuilds the exact bytes from the pieces alone', () => {
    const payload = new Uint8Array(1000).map((_, i) => (i * 31) & 0xff);
    const enc = new FountainEncoder(payload, 128, 42);
    const dec = new FountainDecoder(payload.length, 128, 42);
    for (let n = 0; n < enc.k; n++) expect(dec.add(n, enc.frame(n))).toBe(true);
    expect(dec.done).toBe(true);
    expect(dec.result()).toEqual(payload);
  });

  it('rebuilds the exact bytes from mixes alone (catching starts after the pieces went by)', () => {
    const payload = new Uint8Array(5000).map((_, i) => (i * 13 + 5) & 0xff);
    const enc = new FountainEncoder(payload, 200, 7);
    const dec = new FountainDecoder(payload.length, 200, 7);
    let n = enc.k;
    while (!dec.done) dec.add(n, enc.frame(n++));
    expect(dec.result()).toEqual(payload);
    expect(n - enc.k).toBeLessThan(enc.k + 12);
  });

  it('handles an empty payload and a one-piece payload', () => {
    for (const payload of [new Uint8Array(0), new Uint8Array([5, 6, 7])]) {
      const enc = new FountainEncoder(payload, 400, 1);
      const dec = new FountainDecoder(payload.length, 400, 1);
      dec.add(enc.k + 3, enc.frame(enc.k + 3));
      expect(dec.done).toBe(true);
      expect(dec.result()).toEqual(payload);
    }
  });

  it('any payload, frames dropped, shuffled and started halfway: always the exact bytes back', () => {
    fc.assert(
      fc.property(
        fc.uint8Array({ minLength: 0, maxLength: 6000 }),
        fc.constantFrom(50, 200, 400, 700),
        fc.integer({ min: 0, max: 2 ** 31 }),
        fc.double({ min: 0, max: 0.6, noNaN: true }),
        (payload, pieceSize, seed, dropRate) => {
          const random = rng(seed);
          const enc = new FountainEncoder(payload, pieceSize, seed);
          const dec = new FountainDecoder(payload.length, pieceSize, seed);
          // Start anywhere in the loop, drop some frames, and let the rest arrive in a shuffled order.
          const start = Math.floor(random() * enc.k * 2);
          const numbers: number[] = [];
          for (let n = start; numbers.length < enc.k * 4 + 40; n++) if (random() >= dropRate) numbers.push(n);
          for (let i = numbers.length - 1; i > 0; i--) {
            const j = Math.floor(random() * (i + 1));
            [numbers[i], numbers[j]] = [numbers[j]!, numbers[i]!];
          }
          for (const n of numbers) {
            if (dec.done) break;
            dec.add(n, enc.frame(n));
          }
          expect(dec.done).toBe(true);
          expect(dec.result()).toEqual(payload);
        },
      ),
      { numRuns: 300 },
    );
  });

  it('needs only a few more than k frames on average', () => {
    let extra = 0;
    const runs = 40;
    for (let r = 0; r < runs; r++) {
      const payload = new Uint8Array(20000).map((_, i) => (i * r) & 0xff);
      const enc = new FountainEncoder(payload, 400, r * 977);
      const dec = new FountainDecoder(payload.length, 400, r * 977);
      const random = rng(r);
      let used = 0;
      for (let n = Math.floor(random() * 100); !dec.done; n++) {
        if (random() < 0.3) continue; // the camera missed it
        dec.add(n, enc.frame(n));
        used++;
      }
      extra += used - enc.k;
    }
    expect(pieceCount(20000, 400)).toBe(50);
    expect(extra / runs).toBeLessThan(4);
  });
});

describe('sender and catcher', () => {
  const hello: BeamHello = { format: 1, docId: 'doc-1', title: 'Camp log: Sundarbans cyclone relief', senderName: 'Meher', senderActor: 'm1', size: 0 };

  function beam(payload: Uint8Array, pieceSize: number, start: number, drop: (i: number) => boolean) {
    const sender = new BeamSender(payload, pieceSize, { ...hello, size: payload.length });
    const catcher = new BeamCatcher();
    const updates: string[] = [];
    let i = start;
    while (catcher.state !== 'done' && i < start + 5000) {
      if (!drop(i)) updates.push(catcher.read(sender.frameText(i), i).type);
      i++;
    }
    return { sender, catcher, updates };
  }

  it('catches the exact bytes and hears the hello early', () => {
    const payload = new Uint8Array(20 * 1024).map((_, i) => (i * 7 + 3) & 0xff);
    const { catcher, updates } = beam(payload, 400, 0, () => false);
    expect(catcher.payload).toEqual(payload);
    expect(catcher.hello?.title).toBe('Camp log: Sundarbans cyclone relief');
    expect(updates.indexOf('hello')).toBe(9);
    expect(catcher.stats.used).toBe(catcher.pieces);
  });

  it('catches starting halfway, with a shaky hand dropping frames', () => {
    const payload = new Uint8Array(9000).map((_, i) => (i * 11) & 0xff);
    const random = rng(99);
    const { catcher } = beam(payload, 200, 1000, () => random() < 0.4);
    expect(catcher.state).toBe('done');
    expect(catcher.payload).toEqual(payload);
  });

  it('every frame text fits a QR code (version 40, level L, alphanumeric holds 4296 characters)', () => {
    const sender = new BeamSender(new Uint8Array(60 * 1024), 700, hello);
    for (let i = 0; i < 30; i++) expect(sender.frameText(i).length).toBeLessThan(4296);
  });

  it('says so when a code is not ours, and ignores misreads', () => {
    const catcher = new BeamCatcher();
    expect(catcher.read('https://example.com', 0).type).toBe('foreign');
    expect(catcher.read('PM:ZZZZ/', 0).type).toBe('misread');
    expect(catcher.state).toBe('looking');
  });

  it('refuses frames that claim a size no beam could have', () => {
    const catcher = new BeamCatcher();
    const huge = { kind: 0, beamId: 1, size: 0xffffffff, pieceSize: 1, number: 0, spare: 0 };
    expect(catcher.read(frameToText(encodeFrame(huge, new Uint8Array(1))), 0).type).toBe('misread');
    const wrongBody = { kind: 0, beamId: 1, size: 1000, pieceSize: 400, number: 0, spare: 0 };
    expect(catcher.read(frameToText(encodeFrame(wrongBody, new Uint8Array(10))), 0).type).toBe('misread');
    expect(catcher.state).toBe('looking');
  });

  it('follows the sender to a new beam', () => {
    const a = new BeamSender(new Uint8Array(4000).fill(1), 400, hello);
    const b = new BeamSender(new Uint8Array(4000).fill(2), 400, hello);
    const catcher = new BeamCatcher();
    catcher.read(a.frameText(0), 0);
    catcher.read(a.frameText(1), 1);
    const types = [0, 1, 2, 3].map((i) => catcher.read(b.frameText(i), 2 + i).type);
    expect(types).toEqual(['ignored', 'ignored', 'ignored', 'restarted']);
    for (let i = 4; catcher.state !== 'done'; i++) catcher.read(b.frameText(i), 10 + i);
    expect(catcher.payload).toEqual(new Uint8Array(4000).fill(2));
  });

  it('says the beam is damaged when the pieces do not fit together', () => {
    const payload = new Uint8Array(1000).fill(4);
    const catcher = new BeamCatcher();
    // A sender whose beam id doesn't match its payload: every frame is well formed, the whole is wrong.
    const header = { kind: 0, beamId: crc32(payload) ^ 1, size: payload.length, pieceSize: 400, spare: 0 };
    const enc = new FountainEncoder(payload, 400, header.beamId);
    let last = '';
    for (let n = 0; n < enc.k; n++) last = catcher.read(frameToText(encodeFrame({ ...header, number: n }, enc.frame(n))), n).type;
    expect(last).toBe('damaged');
    expect(catcher.state).toBe('damaged');
    expect(catcher.payload).toBeNull();
  });
});

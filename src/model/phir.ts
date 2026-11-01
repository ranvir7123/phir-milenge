// The .phir bytes (docs/plan/3-how-its-built.md, section 3.1): the letters PHIR, a format number,
// then the doc as JSON squeezed with zlib. A beam carries exactly these bytes too.

import { Inflate, strFromU8, strToU8, zlibSync } from 'fflate';
import type { Change, DocId, PhirDecodeResult } from '../contracts';
import { isChange } from './engine';

/** The format this version writes. A newer app reads every older format. */
export const PHIR_FORMAT = 1;
const MAGIC = [0x50, 0x48, 0x49, 0x52]; // "PHIR"
/** The most a doc may unpack to. 20,000 changes are about 5 MB, so this leaves lots of room. */
export const MAX_UNPACKED = 64_000_000;

export function encodePhir(doc: { docId: DocId; title: string; changes: readonly Change[] }): Uint8Array {
  const json = JSON.stringify({ docId: doc.docId, title: doc.title, format: PHIR_FORMAT, changes: doc.changes });
  const body = zlibSync(strToU8(json), { level: 9 });
  const out = new Uint8Array(MAGIC.length + 1 + body.length);
  out.set(MAGIC);
  out[MAGIC.length] = PHIR_FORMAT;
  out.set(body, MAGIC.length + 1);
  return out;
}

/** zlib's own checksum. fflate skips it when unpacking, so it's checked here. */
function adler32(bytes: Uint8Array): number {
  let a = 1;
  let b = 0;
  for (let i = 0; i < bytes.length; ) {
    const end = Math.min(i + 5552, bytes.length); // the most bytes before the sums must be cut down
    for (; i < end; i++) {
      a += bytes[i]!;
      b += a;
    }
    a %= 65521;
    b %= 65521;
  }
  return ((b << 16) | a) >>> 0;
}

/**
 * Unpack a zlib bundle a small piece at a time, giving up once it passes `max` bytes,
 * so a tiny made-up file can't unpack to gigabytes. Null when it isn't zlib or is too big.
 */
function unpack(body: Uint8Array, max: number): Uint8Array | null {
  const cmf = body[0]!;
  const flg = body[1]!;
  // zlib's 2-byte header: deflate, a window it allows, no preset dictionary, and its own check.
  if ((cmf & 0x0f) !== 8 || cmf >> 4 > 7 || (flg & 0x20) !== 0 || ((cmf << 8) | flg) % 31 !== 0) return null;
  const data = body.subarray(2, body.length - 4);
  const parts: Uint8Array[] = [];
  let size = 0;
  let tooBig = false;
  const inflate = new Inflate((chunk) => {
    size += chunk.length;
    if (size > max) {
      tooBig = true;
      throw new Error('too big');
    }
    parts.push(chunk);
  });
  const STEP = 4096; // deflate can grow about 1,000 times, so one piece makes at most about 4 MB
  try {
    if (data.length === 0) inflate.push(data, true);
    for (let i = 0; i < data.length; i += STEP) inflate.push(data.subarray(i, i + STEP), i + STEP >= data.length);
  } catch (e) {
    if (tooBig) return null;
    throw e;
  }
  const out = new Uint8Array(size);
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

export function decodePhir(bytes: Uint8Array): PhirDecodeResult {
  return readPhir(bytes, MAX_UNPACKED);
}

/** decodePhir with the size limit given, so tests can use a small one. */
export function readPhir(bytes: Uint8Array, maxUnpacked: number): PhirDecodeResult {
  if (bytes.length < MAGIC.length + 1 || MAGIC.some((m, i) => bytes[i] !== m)) return { ok: false, reason: 'not-phir' };
  const format = bytes[MAGIC.length]!;
  if (format > PHIR_FORMAT) return { ok: false, reason: 'newer', format };
  const damaged: PhirDecodeResult = { ok: false, reason: 'damaged', format };
  if (format < 1) return damaged;

  const body = bytes.subarray(MAGIC.length + 1);
  if (body.length < 6) return damaged;
  let doc: unknown;
  try {
    const raw = unpack(body, maxUnpacked);
    if (!raw) return damaged;
    const sum = body.length - 4;
    const expected = ((body[sum]! << 24) | (body[sum + 1]! << 16) | (body[sum + 2]! << 8) | body[sum + 3]!) >>> 0;
    if (adler32(raw) !== expected) return damaged;
    doc = JSON.parse(strFromU8(raw));
  } catch {
    return damaged;
  }

  if (!doc || typeof doc !== 'object') return damaged;
  const d = doc as Record<string, unknown>;
  if (typeof d.docId !== 'string' || typeof d.title !== 'string' || !Array.isArray(d.changes)) return damaged;
  if (!d.changes.every(isChange)) return damaged;
  return { ok: true, format, docId: d.docId, title: d.title, changes: d.changes as Change[] };
}

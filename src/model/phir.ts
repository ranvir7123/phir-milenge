// The .phir bytes (docs/plan/3-how-its-built.md, section 3.1): the letters PHIR, a format number,
// then the doc as JSON squeezed with zlib. A beam carries exactly these bytes too.

import { strFromU8, strToU8, unzlibSync, zlibSync } from 'fflate';
import type { Change, DocId, PhirDecodeResult } from '../contracts';
import { isChange } from './engine';

/** The format this version writes. A newer app reads every older format. */
export const PHIR_FORMAT = 1;
const MAGIC = [0x50, 0x48, 0x49, 0x52]; // "PHIR"

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

export function decodePhir(bytes: Uint8Array): PhirDecodeResult {
  if (bytes.length < MAGIC.length + 1 || MAGIC.some((m, i) => bytes[i] !== m)) return { ok: false, reason: 'not-phir' };
  const format = bytes[MAGIC.length]!;
  if (format > PHIR_FORMAT) return { ok: false, reason: 'newer', format };
  const damaged: PhirDecodeResult = { ok: false, reason: 'damaged', format };
  if (format < 1) return damaged;

  const body = bytes.subarray(MAGIC.length + 1);
  if (body.length < 6) return damaged;
  let doc: unknown;
  try {
    const raw = unzlibSync(body);
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

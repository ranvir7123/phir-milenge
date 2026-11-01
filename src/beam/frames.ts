// One frame = one QR code. Layout (docs/plan/3-how-its-built.md section 2.2):
//
//   byte 0      frame format version (1). Stays first in every future version.
//   byte 1      kind: 0 = a piece or a mix, 1 = hello
//   bytes 2-5   beam id: the CRC-32 of the whole payload, so it doubles as the payload's checksum
//   bytes 6-9   payload size in bytes
//   bytes 10-11 piece size in bytes
//   bytes 12-15 frame number (for pieces and mixes: which piece or mix; for hello: its place in the loop)
//   byte 16     spare: how much of the other phone's beam this phone has caught (face to face). 0 = unused
//   body
//   last 4      CRC-32 of everything before it, so a misread frame is thrown away, never used
//
// On screen the bytes are written as text: "PM:" + base45 + "/". The prefix tells our codes apart from
// any other QR code; the closing "/" keeps a reader from trimming a base45 space off the end.

import type { BeamHello } from '../contracts';
import { decodeBase45, encodeBase45 } from './base45';
import { crc32 } from './crc32';

export const FRAME_VERSION = 1;
export const HEADER_BYTES = 17;
export const CHECK_BYTES = 4;
const PREFIX = 'PM:';
const SUFFIX = '/';

export const KIND_DATA = 0;
export const KIND_HELLO = 1;

export interface FrameHeader {
  version: number;
  kind: number;
  beamId: number;
  size: number;
  pieceSize: number;
  number: number;
  spare: number;
}

export function encodeFrame(header: Omit<FrameHeader, 'version'>, body: Uint8Array): Uint8Array {
  const bytes = new Uint8Array(HEADER_BYTES + body.length + CHECK_BYTES);
  const view = new DataView(bytes.buffer);
  view.setUint8(0, FRAME_VERSION);
  view.setUint8(1, header.kind);
  view.setUint32(2, header.beamId >>> 0);
  view.setUint32(6, header.size >>> 0);
  view.setUint16(10, header.pieceSize);
  view.setUint32(12, header.number >>> 0);
  view.setUint8(16, header.spare & 0xff);
  bytes.set(body, HEADER_BYTES);
  view.setUint32(HEADER_BYTES + body.length, crc32(bytes, 0, HEADER_BYTES + body.length));
  return bytes;
}

export type DecodedFrame =
  | { ok: true; header: FrameHeader; body: Uint8Array }
  /** A frame from a newer Phir Milenge whose layout this version can't read. */
  | { ok: false; reason: 'newer' }
  /** Misread or cut short. */
  | { ok: false; reason: 'damaged' };

export function decodeFrame(bytes: Uint8Array): DecodedFrame {
  if (bytes.length < HEADER_BYTES + CHECK_BYTES) return { ok: false, reason: 'damaged' };
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const end = bytes.length - CHECK_BYTES;
  if (view.getUint32(end) !== crc32(bytes, 0, end)) return { ok: false, reason: 'damaged' };
  const version = view.getUint8(0);
  if (version !== FRAME_VERSION) return { ok: false, reason: version > FRAME_VERSION ? 'newer' : 'damaged' };
  return {
    ok: true,
    header: {
      version,
      kind: view.getUint8(1),
      beamId: view.getUint32(2),
      size: view.getUint32(6),
      pieceSize: view.getUint16(10),
      number: view.getUint32(12),
      spare: view.getUint8(16),
    },
    body: bytes.subarray(HEADER_BYTES, end),
  };
}

export function frameToText(bytes: Uint8Array): string {
  return PREFIX + encodeBase45(bytes) + SUFFIX;
}

/** 'foreign' means a QR code that isn't one of ours (a payment code, say). */
export function textToFrame(text: string): Uint8Array | 'foreign' | 'damaged' {
  if (!text.startsWith(PREFIX)) return 'foreign';
  if (!text.endsWith(SUFFIX)) return 'damaged';
  return decodeBase45(text.slice(PREFIX.length, -SUFFIX.length)) ?? 'damaged';
}

// The hello's body is its JSON. Long titles and names are cut so a hello always fits in one code.
const MAX_TITLE = 120;
const MAX_NAME = 60;

export function encodeHello(hello: BeamHello): Uint8Array {
  const cut: BeamHello = {
    format: hello.format,
    docId: hello.docId.slice(0, 80),
    title: hello.title.slice(0, MAX_TITLE),
    senderName: hello.senderName.slice(0, MAX_NAME),
    senderActor: hello.senderActor.slice(0, 80),
    size: hello.size,
  };
  return new TextEncoder().encode(JSON.stringify(cut));
}

export function decodeHello(body: Uint8Array): BeamHello | null {
  try {
    const v = JSON.parse(new TextDecoder().decode(body)) as Partial<BeamHello>;
    if (
      typeof v.format !== 'number' ||
      typeof v.docId !== 'string' ||
      typeof v.title !== 'string' ||
      typeof v.senderName !== 'string' ||
      typeof v.senderActor !== 'string' ||
      typeof v.size !== 'number'
    ) {
      return null;
    }
    return { format: v.format, docId: v.docId, title: v.title, senderName: v.senderName, senderActor: v.senderActor, size: v.size };
  } catch {
    return null;
  }
}

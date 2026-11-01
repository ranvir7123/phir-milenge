// Turns the QR texts a camera reads, in any order, back into the payload. Knows nothing about cameras,
// so it is tested to the byte without one.

import type { BeamHello } from '../contracts';
import { crc32 } from './crc32';
import { FountainDecoder } from './fountain';
import { KIND_DATA, KIND_HELLO, decodeFrame, decodeHello, textToFrame } from './frames';

export type CatchUpdate =
  /** A QR code that isn't a Phir Milenge beam. */
  | { type: 'foreign' }
  /** One of ours, misread. Thrown away. */
  | { type: 'misread' }
  /** A frame from a newer Phir Milenge this version can't read. */
  | { type: 'newer' }
  /** The first hello of this beam. */
  | { type: 'hello'; hello: BeamHello }
  /** A piece or mix; `useful` when it taught us something new. */
  | { type: 'piece'; useful: boolean }
  /** The camera moved to a different beam, so catching started again. */
  | { type: 'restarted' }
  | { type: 'done'; payload: Uint8Array }
  /** Every piece arrived but the payload's checksum doesn't match. */
  | { type: 'damaged' }
  /** Already finished; nothing more to do. */
  | { type: 'ignored' };

export interface CatchStats {
  /** Readable frames of this beam, repeats and hellos included. */
  seen: number;
  /** Frames that taught us something new. */
  used: number;
  /** When the first frame of this beam was read, in ms (from the `now` passed in). */
  firstAt: number | null;
  /** When the last useful frame was read. */
  lastUsefulAt: number | null;
  /** When the payload was complete. */
  doneAt: number | null;
}

/** Frames in a row from another beam before we follow it (a sender who started a new beam). */
const SWITCH_AFTER = 4;

// Limits on what a frame may claim, so a made-up code can't make the phone reserve huge amounts of memory.
// One QR code holds under 3,000 bytes, and a beam over 16 MB would take hours.
const MAX_PIECE = 2900;
const MAX_SIZE = 16 * 1024 * 1024;
const MAX_PIECES = 20000;

export class BeamCatcher {
  private decoder: FountainDecoder | null = null;
  private key = '';
  private otherKey = '';
  private otherCount = 0;
  private finished: 'done' | 'damaged' | null = null;
  private result: Uint8Array | null = null;
  hello: BeamHello | null = null;
  stats: CatchStats = { seen: 0, used: 0, firstAt: null, lastUsefulAt: null, doneAt: null };

  /** 0 to 1. */
  get progress(): number {
    if (!this.decoder) return 0;
    return this.decoder.rank / this.decoder.k;
  }

  get pieces(): number {
    return this.decoder?.k ?? 0;
  }

  get size(): number {
    return this.decoder?.size ?? 0;
  }

  get pieceSize(): number {
    return this.decoder?.pieceSize ?? 0;
  }

  get state(): 'looking' | 'catching' | 'done' | 'damaged' {
    return this.finished ?? (this.decoder ? 'catching' : 'looking');
  }

  get payload(): Uint8Array | null {
    return this.result;
  }

  read(text: string, now: number): CatchUpdate {
    if (this.finished) return { type: 'ignored' };
    const bytes = textToFrame(text);
    if (bytes === 'foreign') return { type: 'foreign' };
    if (bytes === 'damaged') return { type: 'misread' };
    const frame = decodeFrame(bytes);
    if (!frame.ok) return { type: frame.reason === 'newer' ? 'newer' : 'misread' };
    const { header, body } = frame;
    if (
      (header.kind !== KIND_DATA && header.kind !== KIND_HELLO) ||
      header.pieceSize < 1 ||
      header.pieceSize > MAX_PIECE ||
      header.size > MAX_SIZE ||
      Math.ceil(header.size / header.pieceSize) > MAX_PIECES ||
      (header.kind === KIND_DATA && body.length !== header.pieceSize)
    ) {
      return { type: 'misread' };
    }

    const key = `${header.beamId}:${header.size}:${header.pieceSize}`;
    let restarted = false;
    if (key !== this.key) {
      if (this.decoder && this.decoder.rank > 0) {
        this.otherCount = key === this.otherKey ? this.otherCount + 1 : 1;
        this.otherKey = key;
        if (this.otherCount < SWITCH_AFTER) return { type: 'ignored' };
        restarted = true;
      }
      this.decoder = new FountainDecoder(header.size, header.pieceSize, header.beamId);
      this.key = key;
      this.hello = null;
      this.stats = { seen: 0, used: 0, firstAt: now, lastUsefulAt: null, doneAt: null };
    }
    this.otherCount = 0;
    this.stats.seen++;
    this.stats.firstAt ??= now;

    if (header.kind === KIND_HELLO) {
      if (this.hello) return restarted ? { type: 'restarted' } : { type: 'piece', useful: false };
      const hello = decodeHello(body);
      if (!hello) return { type: 'misread' };
      this.hello = hello;
      return { type: 'hello', hello };
    }

    const useful = this.decoder!.add(header.number, body);
    if (useful) {
      this.stats.used++;
      this.stats.lastUsefulAt = now;
    }
    if (this.decoder!.done) {
      const payload = this.decoder!.result();
      this.stats.doneAt = now;
      if (crc32(payload) !== header.beamId) {
        this.finished = 'damaged';
        return { type: 'damaged' };
      }
      this.finished = 'done';
      this.result = payload;
      return { type: 'done', payload };
    }
    return restarted ? { type: 'restarted' } : { type: 'piece', useful };
  }
}

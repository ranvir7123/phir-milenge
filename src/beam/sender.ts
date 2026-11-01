// Turns a payload into the endless loop of QR texts the Beam screen shows.

import type { BeamHello } from '../contracts';
import { crc32 } from './crc32';
import { FountainEncoder } from './fountain';
import { KIND_DATA, KIND_HELLO, encodeFrame, encodeHello, frameToText } from './frames';

/** Every 10th frame is a hello (docs/plan/3-how-its-built.md section 2.2). */
export const HELLO_EVERY = 10;

export class BeamSender {
  readonly beamId: number;
  readonly pieces: number;
  private readonly encoder: FountainEncoder;
  private readonly helloBody: Uint8Array | null;
  /** Face to face: how much of the other phone's beam this phone has caught (0 = not catching). */
  spare = 0;

  constructor(
    readonly payload: Uint8Array,
    readonly pieceSize: number,
    hello: BeamHello | null,
  ) {
    this.beamId = crc32(payload);
    this.encoder = new FountainEncoder(payload, pieceSize, this.beamId);
    this.pieces = this.encoder.k;
    this.helloBody = hello ? encodeHello(hello) : null;
  }

  private header(kind: number, number: number) {
    return { kind, beamId: this.beamId, size: this.payload.length, pieceSize: this.pieceSize, number, spare: this.spare };
  }

  /** The bytes of the i-th frame on screen (i counts from 0 and never ends). */
  frameBytes(i: number): Uint8Array {
    if (this.helloBody && i % HELLO_EVERY === HELLO_EVERY - 1) {
      return encodeFrame(this.header(KIND_HELLO, i), this.helloBody);
    }
    const number = this.helloBody ? i - Math.floor((i + 1) / HELLO_EVERY) : i;
    return encodeFrame(this.header(KIND_DATA, number), this.encoder.frame(number));
  }

  frameText(i: number): string {
    return frameToText(this.frameBytes(i));
  }
}

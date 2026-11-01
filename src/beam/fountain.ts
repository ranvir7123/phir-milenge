// The fountain code (docs/plan/3-how-its-built.md section 2.2).
// The payload is cut into k pieces. Frames 0 to k-1 are the pieces themselves; every frame after that
// is a "mix": a random half of the pieces XORed together. Which pieces go into mix n comes from a random
// generator seeded by the beam id and n, so the catcher can work it out from the header alone.
// Catching solves for the k pieces by Gaussian elimination over the frames that arrive, in any order.

export function pieceCount(size: number, pieceSize: number): number {
  return Math.max(1, Math.ceil(size / pieceSize));
}

// Mixes the beam id and frame number into one well-spread 32-bit seed (murmur3's finaliser).
function seedFor(beamId: number, number: number): number {
  let h = (beamId ^ Math.imul(number + 1, 0x9e3779b1)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}

// mulberry32: small, fast and the same on every browser.
function generator(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return (t ^ (t >>> 14)) >>> 0;
  };
}

/** Which pieces frame `number` holds, as a bit set of k bits. */
export function piecesIn(beamId: number, number: number, k: number): Uint32Array {
  const words = new Uint32Array(Math.ceil(k / 32));
  if (number < k) {
    words[number >>> 5] = 1 << (number & 31);
    return words;
  }
  const next = generator(seedFor(beamId, number));
  for (let w = 0; w < words.length; w++) words[w] = next();
  if (k % 32 !== 0) words[words.length - 1]! &= (1 << (k % 32)) - 1;
  if (words.every((w) => w === 0)) {
    const only = number % k;
    words[only >>> 5] = 1 << (only & 31);
  }
  return words;
}

export class FountainEncoder {
  readonly k: number;
  private readonly pieces: Uint8Array[];

  constructor(
    payload: Uint8Array,
    readonly pieceSize: number,
    readonly beamId: number,
  ) {
    this.k = pieceCount(payload.length, pieceSize);
    this.pieces = [];
    for (let i = 0; i < this.k; i++) {
      const piece = new Uint8Array(pieceSize);
      piece.set(payload.subarray(i * pieceSize, Math.min(payload.length, (i + 1) * pieceSize)));
      this.pieces.push(piece);
    }
  }

  /** The body of frame `number`: a piece for numbers below k, a mix after that. Never runs out. */
  frame(number: number): Uint8Array {
    if (number < this.k) return this.pieces[number]!;
    const set = piecesIn(this.beamId, number, this.k);
    const out = new Uint8Array(this.pieceSize);
    for (let i = 0; i < this.k; i++) {
      if (set[i >>> 5]! & (1 << (i & 31))) xorInto(out, this.pieces[i]!);
    }
    return out;
  }
}

function xorInto(target: Uint8Array, source: Uint8Array): void {
  for (let i = 0; i < target.length; i++) target[i]! ^= source[i]!;
}

interface Row {
  set: Uint32Array;
  data: Uint8Array;
}

export class FountainDecoder {
  readonly k: number;
  private readonly rows: (Row | undefined)[];
  private found = 0;

  constructor(
    readonly size: number,
    readonly pieceSize: number,
    readonly beamId: number,
  ) {
    this.k = pieceCount(size, pieceSize);
    this.rows = new Array<Row | undefined>(this.k);
  }

  /** How many independent pieces are known so far (k means done). */
  get rank(): number {
    return this.found;
  }

  get done(): boolean {
    return this.found === this.k;
  }

  /** Adds frame `number`. Returns true when it taught us something new. */
  add(number: number, body: Uint8Array): boolean {
    if (this.done || body.length !== this.pieceSize) return false;
    const set = piecesIn(this.beamId, number, this.k);
    const data = body.slice();
    // Keep the rows in echelon form: row c starts at piece c. Clear the new row's pieces one at a time.
    for (let w = 0; w < set.length; w++) {
      while (set[w] !== 0) {
        const low = set[w]! & -set[w]!;
        const c = w * 32 + (31 - Math.clz32(low));
        const row = this.rows[c];
        if (!row) {
          this.rows[c] = { set, data };
          this.found++;
          return true;
        }
        for (let v = w; v < set.length; v++) set[v]! ^= row.set[v]!;
        xorInto(data, row.data);
      }
    }
    return false;
  }

  /** The payload, once done. */
  result(): Uint8Array {
    if (!this.done) throw new Error('The beam is not complete yet');
    // Back substitution: from the last piece up, clear every later piece out of each row.
    for (let c = this.k - 1; c >= 0; c--) {
      const row = this.rows[c]!;
      for (let j = c + 1; j < this.k; j++) {
        if (row.set[j >>> 5]! & (1 << (j & 31))) {
          xorInto(row.data, this.rows[j]!.data);
          row.set[j >>> 5]! ^= 1 << (j & 31);
        }
      }
    }
    const out = new Uint8Array(this.size);
    for (let c = 0; c < this.k; c++) {
      const start = c * this.pieceSize;
      out.set(this.rows[c]!.data.subarray(0, Math.min(this.pieceSize, this.size - start)), start);
    }
    return out;
  }
}

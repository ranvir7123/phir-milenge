// Base45 (RFC 9285): bytes written with the 45 characters a QR code's alphanumeric mode holds.
// Two bytes become three characters; a last single byte becomes two.

const ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:';
const VALUE = new Map<string, number>([...ALPHABET].map((c, i) => [c, i]));

export function encodeBase45(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i + 1 < bytes.length; i += 2) {
    const n = bytes[i]! * 256 + bytes[i + 1]!;
    out += ALPHABET[n % 45]! + ALPHABET[Math.floor(n / 45) % 45]! + ALPHABET[Math.floor(n / 2025)]!;
  }
  if (bytes.length % 2 === 1) {
    const n = bytes[bytes.length - 1]!;
    out += ALPHABET[n % 45]! + ALPHABET[Math.floor(n / 45)]!;
  }
  return out;
}

/** Returns null for text that isn't valid base45 (a wrong character, a wrong length, or a value too big). */
export function decodeBase45(text: string): Uint8Array | null {
  if (text.length % 3 === 1) return null;
  const out = new Uint8Array(Math.floor(text.length / 3) * 2 + (text.length % 3 === 2 ? 1 : 0));
  let o = 0;
  for (let i = 0; i < text.length; i += 3) {
    const c = VALUE.get(text[i]!);
    const d = VALUE.get(text[i + 1]!);
    if (c === undefined || d === undefined) return null;
    if (i + 2 < text.length) {
      const e = VALUE.get(text[i + 2]!);
      if (e === undefined) return null;
      const n = c + d * 45 + e * 2025;
      if (n > 0xffff) return null;
      out[o++] = n >> 8;
      out[o++] = n & 0xff;
    } else {
      const n = c + d * 45;
      if (n > 0xff) return null;
      out[o++] = n;
    }
  }
  return out;
}

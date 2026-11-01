// The QR code printed on the link card and shown in the README must open the live app.
// This reads the picture back with ZXing, the reader iPhones and laptops use.

import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { prepareZXingModule, readBarcodesFromImageData } from 'zxing-wasm/reader';

const APP = 'https://ranvir7123.github.io/phir-milenge/';
const root = join(__dirname, '..', '..');
const SCALE = 4;

/** Draws the SVG's 1-by-1 squares as camera-like pixels. */
function pixels(svg: string): ImageData {
  const size = Number(/viewBox="0 0 (\d+) \d+"/.exec(svg)?.[1]);
  const side = size * SCALE;
  const data = new Uint8ClampedArray(side * side * 4).fill(255);
  for (const [, x, y] of svg.matchAll(/M(\d+) (\d+)h1v1h-1z/g)) {
    for (let dy = 0; dy < SCALE; dy++) {
      for (let dx = 0; dx < SCALE; dx++) {
        const i = ((Number(y) * SCALE + dy) * side + Number(x) * SCALE + dx) * 4;
        data[i] = data[i + 1] = data[i + 2] = 0;
      }
    }
  }
  return { data, width: side, height: side, colorSpace: 'srgb' } as unknown as ImageData;
}

beforeAll(async () => {
  const wasm = createRequire(import.meta.url).resolve('zxing-wasm/reader/zxing_reader.wasm');
  await prepareZXingModule({ overrides: { wasmBinary: readFileSync(wasm).buffer as ArrayBuffer }, fireImmediately: true });
});

describe("the app's QR code", () => {
  it('in docs/handin/app-qr.svg opens the live app', async () => {
    const svg = readFileSync(join(root, 'docs', 'handin', 'app-qr.svg'), 'utf8');
    const found = await readBarcodesFromImageData(pixels(svg), { formats: ['QRCode'] });
    expect(found.map((b) => b.text)).toEqual([APP]);
  });

  it('on the link card is the same picture', () => {
    const card = readFileSync(join(root, 'docs', 'handin', 'link-card.html'), 'utf8');
    const svg = readFileSync(join(root, 'docs', 'handin', 'app-qr.svg'), 'utf8');
    const path = (s: string) => /<path fill="#000000" d="([^"]+)"/.exec(s)?.[1];
    expect(path(card)).toBeDefined();
    expect(path(card)).toBe(path(svg));
    expect(card).toContain(APP);
  });
});

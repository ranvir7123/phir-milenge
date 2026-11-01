// The whole beam without a camera: frames drawn as real QR codes (the same drawing the Beam screen
// uses), read back by ZXing (the same reader iPhones and laptops use), caught to the exact bytes.

import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { beforeAll, describe, expect, it } from 'vitest';
import qrcode from 'qrcode-generator';
import { prepareZXingModule, readBarcodesFromImageData } from 'zxing-wasm/reader';
import { BeamCatcher } from './catcher';
import { BeamSender } from './sender';
import { qrVersionFor } from './qr';

const SCALE = 3;
const QUIET = 4;

/** The QR code as camera-like pixels: black modules on white, with the 4-module border. */
function picture(text: string, version: Parameters<typeof qrcode>[0]) {
  const qr = qrcode(version, 'L');
  qr.addData(text, 'Alphanumeric');
  qr.make();
  const n = qr.getModuleCount();
  const side = (n + QUIET * 2) * SCALE;
  const data = new Uint8ClampedArray(side * side * 4).fill(255);
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (!qr.isDark(r, c)) continue;
      for (let y = 0; y < SCALE; y++) {
        for (let x = 0; x < SCALE; x++) {
          const i = (((r + QUIET) * SCALE + y) * side + (c + QUIET) * SCALE + x) * 4;
          data[i] = data[i + 1] = data[i + 2] = 0;
        }
      }
    }
  }
  return { data, width: side, height: side, colorSpace: 'srgb' } as unknown as ImageData;
}

beforeAll(async () => {
  const wasm = createRequire(import.meta.url).resolve('zxing-wasm/reader/zxing_reader.wasm');
  await prepareZXingModule({ overrides: { wasmBinary: readFileSync(wasm).buffer as ArrayBuffer }, fireImmediately: true });
});

describe('real QR codes read by ZXing', () => {
  it('catches a 20 KB beam in 400-byte pieces to the exact bytes', async () => {
    const payload = new Uint8Array(20 * 1024).map((_, i) => (i * 37 + 11) & 0xff);
    const sender = new BeamSender(payload, 400, { format: 1, docId: 'd', title: 'Camp log: Sundarbans cyclone relief', senderName: 'Meher', senderActor: 'm', size: payload.length });
    const version = qrVersionFor(sender.frameText(0).length);
    const catcher = new BeamCatcher();
    // Start halfway through the loop and skip every fourth frame, as a shaky hand would.
    for (let i = 30; catcher.state !== 'done' && i < 400; i++) {
      if (i % 4 === 0) continue;
      const text = sender.frameText(i);
      const found = await readBarcodesFromImageData(picture(text, version), { formats: ['QRCode'], tryHarder: false });
      expect(found[0]?.text).toBe(text);
      catcher.read(found[0]!.text, i);
    }
    expect(catcher.state).toBe('done');
    expect(catcher.payload).toEqual(payload);
    expect(catcher.hello?.senderName).toBe('Meher');
  }, 60_000);

  it('reads the biggest frames (700-byte pieces) back exactly', async () => {
    const sender = new BeamSender(new Uint8Array(60 * 1024).map((_, i) => i & 0xff), 700, null);
    const text = sender.frameText(200);
    const found = await readBarcodesFromImageData(picture(text, qrVersionFor(text.length)), { formats: ['QRCode'] });
    expect(found[0]?.text).toBe(text);
  }, 30_000);
});

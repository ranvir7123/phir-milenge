// Draws one frame as a QR code: alphanumeric mode, error correction level L, black on a white card
// with a 4-module quiet border, straight onto a canvas, every module on whole device pixels.

import qrcode from 'qrcode-generator';

const QUIET = 4;

type TypeNumber = Parameters<typeof qrcode>[0];

function make(text: string, type: TypeNumber) {
  const qr = qrcode(type, 'L');
  qr.addData(text, 'Alphanumeric');
  qr.make();
  return qr;
}

const sizeForLength = new Map<number, TypeNumber>();

/** The smallest QR version that holds this many characters, so every frame of a beam has the same size. */
export function qrVersionFor(length: number): TypeNumber {
  const known = sizeForLength.get(length);
  if (known) return known;
  const sample = '0'.repeat(length);
  for (let t = 1; t <= 40; t++) {
    try {
      make(sample, t as TypeNumber);
      sizeForLength.set(length, t as TypeNumber);
      return t as TypeNumber;
    } catch {
      // Too long for this version; try the next.
    }
  }
  throw new Error(`A frame of ${length} characters is too long for one QR code`);
}

/** Draws `text` filling at most `cssSize` CSS pixels. Returns the module count (border included). */
export function drawQr(canvas: HTMLCanvasElement, text: string, cssSize: number, version: TypeNumber = 0): number {
  const qr = make(text, version);
  const n = qr.getModuleCount();
  const total = n + QUIET * 2;
  const dpr = window.devicePixelRatio || 1;
  const scale = Math.max(1, Math.floor((cssSize * dpr) / total));
  const px = total * scale;
  if (canvas.width !== px) {
    canvas.width = px;
    canvas.height = px;
    canvas.style.width = `${px / dpr}px`;
    canvas.style.height = `${px / dpr}px`;
  }
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, px, px);
  ctx.fillStyle = '#000000';
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (qr.isDark(r, c)) ctx.fillRect((c + QUIET) * scale, (r + QUIET) * scale, scale, scale);
    }
  }
  return total;
}

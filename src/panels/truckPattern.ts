// The truck back's painted picture, drawn from the doc's fingerprint hash in the writer colours.
// Same hash, same picture; one changed byte repaints a part. Mirrored left to right, like truck art.
// Everything sits in a 120 × 120 box.

export type Paint = 'yellow' | 'orange' | 'pink' | 'red' | 'text' | 'ground';

export interface Shape {
  /** An SVG path, or a circle. */
  d?: string;
  circle?: { cx: number; cy: number; r: number };
  fill?: Paint;
  /** Drawn as a line instead of filled. */
  stroke?: Paint;
}

const PAINTS: Paint[] = ['yellow', 'orange', 'pink', 'red', 'text'];

/** The hash as bytes, read in a loop so a short hash still works. */
function bytesOf(hex: string): number[] {
  const clean = hex.replace(/[^0-9a-f]/gi, '');
  const out: number[] = [];
  for (let i = 0; i + 1 < clean.length; i += 2) out.push(parseInt(clean.slice(i, i + 2), 16));
  return out.length > 0 ? out : [0];
}

function mirror(d: (x: (v: number) => number) => string): string[] {
  return [d((v) => v), d((v) => 120 - v)];
}

function circle(cx: number, cy: number, r: number, fill: Paint): Shape {
  return { circle: { cx, cy, r }, fill };
}

const CENTRES: ((c: Paint) => Shape[])[] = [
  // Diamond with a dark eye
  (c) => [{ d: 'M60 18l14 22-14 22-14-22z', fill: c }, circle(60, 40, 6, 'ground')],
  // Four-petal flower
  (c) => [circle(60, 31, 8, c), circle(60, 49, 8, c), circle(51, 40, 8, c), circle(69, 40, 8, c), circle(60, 40, 4.5, 'ground')],
  // Eight-point star
  (c) => [{ d: 'M60 18l5 14 14-5-5 13 14 5-14 5 5 13-14-5-5 14-5-14-14 5 5-13-14-5 14-5-5-13 14 5z', fill: c }],
  // Eye
  (c) => [{ d: 'M38 40q22-22 44 0q-22 22-44 0z', fill: c }, circle(60, 40, 7, 'ground')],
  // Fan of rays
  (c) => [{ d: 'M60 58L42 28h8l10 24 10-24h8z', fill: c }, { d: 'M60 58L52 22h16z', fill: c }, circle(60, 58, 5, c)],
  // Hexagon with a dark centre
  (c) => [{ d: 'M60 20l17 10v20l-17 10-17-10V30z', fill: c }, { d: 'M60 32l7 4v8l-7 4-7-4v-8z', fill: 'ground' }],
];

const SIDES: ((c: Paint) => Shape[])[] = [
  // Triangles pointing in
  (c) => mirror((x) => `M${x(22)} 28L${x(35)} 41L${x(22)} 54z`).map((d) => ({ d, fill: c })),
  // Round dots
  (c) => [circle(27, 41, 7, c), circle(93, 41, 7, c)],
  // Leaves
  (c) => mirror((x) => `M${x(20)} 41Q${x(28)} 26 ${x(36)} 41Q${x(28)} 56 ${x(20)} 41z`).map((d) => ({ d, fill: c })),
  // Chevrons
  (c) => mirror((x) => `M${x(20)} 30L${x(32)} 41L${x(20)} 52M${x(26)} 30L${x(38)} 41L${x(26)} 52`).map((d) => ({ d, stroke: c })),
];

const PAIRS: ((c: Paint) => Shape[])[] = [
  // Rings
  (c) => [circle(30, 80, 10, c), circle(90, 80, 10, c), circle(30, 80, 3.8, 'ground'), circle(90, 80, 3.8, 'ground')],
  // Diamonds
  (c) => mirror((x) => `M${x(30)} 69L${x(40)} 80L${x(30)} 91L${x(20)} 80z`).map((d) => ({ d, fill: c })),
  // Squares
  (c) => [{ d: 'M22 72h16v16H22z', fill: c }, { d: 'M82 72h16v16H82z', fill: c }],
  // Small flowers
  (c) => [30, 90].flatMap((cx) => [circle(cx, 74, 5, c), circle(cx, 86, 5, c), circle(cx - 6, 80, 5, c), circle(cx + 6, 80, 5, c), circle(cx, 80, 2.5, 'ground')]),
];

const BARS: ((c: Paint) => Shape[])[] = [
  (c) => [{ d: 'M44 76h32v6H44z', fill: c }],
  (c) => [{ d: 'M44 82l5-6 5 6 6-6 6 6 5-6 5 6', stroke: c }],
  (c) => [circle(48, 79, 3.5, c), circle(60, 79, 3.5, c), circle(72, 79, 3.5, c)],
];

const ACCENTS: ((c: Paint) => Shape[])[] = [
  (c) => [{ d: 'M47 90h26l-13 13z', fill: c }],
  (c) => [{ d: 'M46 92a14 14 0 0 0 28 0z', fill: c }],
  (c) => [{ d: 'M48 96l4-5 4 5-4 5zM56 96l4-5 4 5-4 5zM64 96l4-5 4 5-4 5z', fill: c }],
];

/** A row of small triangles hanging from (or standing on) the line y. */
function teeth(y: number, dir: 1 | -1): string {
  let d = `M8 ${y}`;
  for (let x = 8; x < 112; x += 8) d += `L${x + 4} ${y + dir * 6}L${x + 8} ${y}`;
  return `${d}z`;
}

const FRAMES: ((c: Paint) => Shape[])[] = [
  // Dots along the top and bottom edges
  (c) => [16, 30, 44, 60, 76, 90, 104].flatMap((x) => [circle(x, 9, 2, c), circle(x, 111, 2, c)]),
  // Teeth along the top and bottom edges
  (c) => [{ d: teeth(7, 1), fill: c }, { d: teeth(113, -1), fill: c }],
  // A thin painted border
  (c) => [{ d: 'M8 8h104v104H8z', stroke: c }],
];

/** Picks a paint for a part, never the same as the part painted just before it. */
function paintFrom(byte: number, avoid: Paint | null): Paint {
  const p = PAINTS[byte % PAINTS.length]!;
  return p === avoid ? PAINTS[(byte + 1) % PAINTS.length]! : p;
}

/** The picture for a fingerprint hash: a list of shapes, back to front. */
export function truckPattern(hex: string): Shape[] {
  const b = bytesOf(hex);
  // Bytes 0 to 3 make the words and digits, so the picture reads from byte 4 on.
  const at = (i: number) => b[(4 + i) % b.length] ?? 0;
  const pick = <T,>(list: T[], i: number) => list[at(i) % list.length]!;

  const shapes: Shape[] = [{ d: 'M6 0h108a6 6 0 0 1 6 6v108a6 6 0 0 1-6 6H6a6 6 0 0 1-6-6V6a6 6 0 0 1 6-6z', fill: 'ground' }];
  const frameC = paintFrom(at(1), null);
  const centreC = paintFrom(at(3), null);
  const sideC = paintFrom(at(5), centreC);
  const pairC = paintFrom(at(7), sideC);
  const barC = paintFrom(at(9), pairC);
  const accentC = paintFrom(at(11), barC);
  shapes.push(...pick(FRAMES, 0)(frameC));
  shapes.push(...pick(CENTRES, 2)(centreC));
  shapes.push(...pick(SIDES, 4)(sideC));
  shapes.push(...pick(PAIRS, 6)(pairC));
  shapes.push(...pick(BARS, 8)(barC));
  shapes.push(...pick(ACCENTS, 10)(accentC));
  return shapes;
}

/** The CSS colour for a paint. */
export function paintVar(p: Paint): string {
  switch (p) {
    case 'yellow':
      return 'var(--w-yellow)';
    case 'orange':
      return 'var(--w-orange)';
    case 'pink':
      return 'var(--w-pink)';
    case 'red':
      return 'var(--w-red)';
    case 'text':
      return 'var(--text)';
    default:
      return 'var(--raised)';
  }
}

/** The same colours as plain values, for pictures drawn outside the page (an image address can't read CSS variables). */
const PAINT_HEX: Record<Paint, string> = {
  yellow: '#F0E442',
  orange: '#E69F00',
  pink: '#CC79A7',
  red: '#D55E00',
  text: '#E8E4DC',
  ground: '#292725',
};

/**
 * The picture as an image address, so the self-test can show 1,000 small truck backs as cheap
 * background images instead of 1,000 drawings.
 */
export function truckImage(hex: string): string {
  const parts = truckPattern(hex).map((s) =>
    s.circle
      ? `<circle cx="${s.circle.cx}" cy="${s.circle.cy}" r="${s.circle.r}" fill="${PAINT_HEX[s.fill ?? 'ground']}"/>`
      : s.stroke
        ? `<path d="${s.d}" fill="none" stroke="${PAINT_HEX[s.stroke]}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>`
        : `<path d="${s.d}" fill="${PAINT_HEX[s.fill ?? 'ground']}"/>`,
  );
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><rect width="120" height="120" fill="${PAINT_HEX.ground}"/>${parts.join('')}</svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

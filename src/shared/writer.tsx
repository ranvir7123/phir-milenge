// A writer's colour: a thin 3px bar next to their name, or a plain ring for a Plain writer.
import type { WriterColour } from '../contracts';

export const COLOURS: { colour: WriterColour; name: string; css: string }[] = [
  { colour: 'yellow', name: 'Yellow', css: 'var(--w-yellow)' },
  { colour: 'orange', name: 'Orange', css: 'var(--w-orange)' },
  { colour: 'pink', name: 'Pink', css: 'var(--w-pink)' },
  { colour: 'red', name: 'Red', css: 'var(--w-red)' },
  { colour: 'plain', name: 'Plain', css: 'var(--text)' },
];

export function colourCss(colour: WriterColour | null): string | null {
  return COLOURS.find((c) => c.colour === colour && c.colour !== 'plain')?.css ?? null;
}

/** The bar (or ring) shown before a writer's name. A writer who hasn't picked yet shows a ring too. */
export function WriterMark({ colour, height = 14 }: { colour: WriterColour | null; height?: number }) {
  const css = colourCss(colour);
  if (!css) return <span className="writer-ring" aria-hidden="true" />;
  return <span className="writer-bar" style={{ background: css, height }} aria-hidden="true" />;
}

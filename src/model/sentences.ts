// Cutting a block's text into sentences. Joining the pieces always gives back the exact text.
// Explanation: docs/plan/3-how-its-built.md, section 1.4.

const ENDS = new Set(['.', '!', '?', '।']);
const CLOSERS = new Set(['"', "'", '”', '’', ')', ']']);

function isSpace(ch: string): boolean {
  return ch === ' ' || ch === '\t' || ch === ' ';
}

/**
 * Cuts after . ! ? । (and any closing quotes or brackets after them) when a space or the end follows,
 * and after every line end. Spaces stay with the sentence before them.
 */
export function splitSentences(text: string): string[] {
  const out: string[] = [];
  const n = text.length;
  let start = 0;
  let i = 0;
  while (i < n) {
    const ch = text[i]!;
    if (ch === '\n') {
      i++;
      out.push(text.slice(start, i));
      start = i;
      continue;
    }
    if (ENDS.has(ch)) {
      let j = i;
      while (j < n && ENDS.has(text[j]!)) j++;
      while (j < n && CLOSERS.has(text[j]!)) j++;
      if (j === n || isSpace(text[j]!) || text[j] === '\n') {
        while (j < n && isSpace(text[j]!)) j++;
        if (j < n && text[j] === '\n') j++;
        out.push(text.slice(start, j));
        start = j;
        i = j;
        continue;
      }
      i = j;
      continue;
    }
    i++;
  }
  if (start < n) out.push(text.slice(start));
  return out;
}

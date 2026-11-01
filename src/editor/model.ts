// Turning the engine's DocView into the editor's document, and the editor's blocks back into text and marks.
// The engine is the only source of truth: this file never decides what the doc says, it only translates.

import type { JSONContent } from '@tiptap/core';
import type { Node as PMNode } from '@tiptap/pm/model';
import type { BlockKind, BlockStyle, BlockView, DocView, ItemId, ListKind, MarkType, MarkView } from '../contracts';
import { linkAllowed } from './words';

/**
 * Where a sentence with two versions sits in the editor's text. intents.setText is given the block's text
 * without those sentences (the engine leaves them alone), so this never reaches the engine.
 */
export const CLASH_MARK = '￼';

export const MARK_ORDER: MarkType[] = ['bold', 'italic', 'underline', 'link'];

/** The attributes every text block carries in the editor. `id` is null until the engine gives it one. */
export interface ParaAttrs {
  id: ItemId | null;
  kind: Exclude<BlockKind, 'table'>;
  list: ListKind | null;
  indent: 0 | 1 | 2;
  /** Shown only: the list number the engine worked out. */
  number: number | null;
  /** Shown only: the tick the engine shows (null when the tick has two versions). */
  ticked: boolean | null;
}

export function styleOf(attrs: Pick<ParaAttrs, 'kind' | 'list' | 'indent'>): BlockStyle {
  if (attrs.kind === 'li') return { kind: 'li', list: attrs.list ?? 'bullet', indent: attrs.indent ?? 0 };
  return { kind: attrs.kind };
}

export function sameStyle(a: BlockStyle, b: BlockStyle): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind !== 'li') return true;
  return (a.list ?? 'bullet') === (b.list ?? 'bullet') && (a.indent ?? 0) === (b.indent ?? 0);
}

/** Every match of `quote` in `text`, left to right, without overlaps: the engine's "occurrence" counting. */
export function matchesOf(text: string, quote: string): number[] {
  const out: number[] = [];
  if (!quote) return out;
  let at = text.indexOf(quote);
  while (at >= 0) {
    out.push(at);
    at = text.indexOf(quote, at + quote.length);
  }
  return out;
}

function markId(m: MarkView): string {
  return `${m.type}|${m.quote}|${m.occurrence}|${m.type === 'link' ? (m.href ?? '') : ''}`;
}

export function sameMarks(a: MarkView[], b: MarkView[]): boolean {
  if (a.length !== b.length) return false;
  const ids = new Set(a.map(markId));
  return b.every((m) => ids.has(markId(m)));
}

/** Marks in `next` that are not in `prev` (to turn on), and the reverse (to turn off). */
export function diffMarks(prev: MarkView[], next: MarkView[]): { on: MarkView[]; off: MarkView[] } {
  const p = new Set(prev.map(markId));
  const n = new Set(next.map(markId));
  return { on: next.filter((m) => !p.has(markId(m))), off: prev.filter((m) => !n.has(markId(m))) };
}

type Seg = { kind: 'text'; text: string } | { kind: 'clash'; key: string };

/** The block as the editor shows it: shown sentences as text, each sentence in clash as one lanes box. */
function segments(block: BlockView, lanes: boolean): Seg[] {
  const segs: Seg[] = [];
  for (const s of block.sentences) {
    if (s.field.state === 'clash' && lanes) {
      segs.push({ kind: 'clash', key: s.field.key });
      continue;
    }
    const text = s.field.state === 'clash' ? (s.field.lanes.at(-1)?.value ?? '') : (s.field.shown?.value ?? '');
    if (!text) continue;
    const last = segs.at(-1);
    if (last?.kind === 'text') last.text += text;
    else segs.push({ kind: 'text', text });
  }
  return segs;
}

/** The block's text the way intents.setText takes it: without the sentences that are in clash. */
export function viewEngineText(block: BlockView): string {
  return block.sentences.map((s) => (s.field.state === 'clash' ? '' : (s.field.shown?.value ?? ''))).join('');
}

/** The block's words only, the text marks are counted in. */
export function viewPlainText(block: BlockView): string {
  return block.sentences.map((s) => (s.field.state === 'clash' ? '' : (s.field.shown?.value ?? ''))).join('');
}

/** For each character of `text`, which marks cover it. Marks whose words aren't there simply don't show. */
function marksPerChar(text: string, marks: MarkView[]): MarkView[][] {
  const per: MarkView[][] = Array.from({ length: text.length }, () => []);
  for (const m of marks) {
    if (m.type === 'link' && (!m.href || !linkAllowed(m.href))) continue;
    const at = matchesOf(text, m.quote)[m.occurrence - 1];
    if (at === undefined) continue;
    for (let i = at; i < at + m.quote.length; i++) {
      const here = per[i]!;
      const same = here.findIndex((x) => x.type === m.type);
      if (same >= 0) here[same] = m;
      else here.push(m);
    }
  }
  return per;
}

function pmMark(m: MarkView): { type: string; attrs?: Record<string, unknown> } {
  return m.type === 'link' ? { type: 'link', attrs: { href: m.href } } : { type: m.type };
}

function textRuns(text: string, per: MarkView[][]): JSONContent[] {
  const out: JSONContent[] = [];
  let start = 0;
  const sig = (i: number) =>
    per[i]!
      .map((m) => `${m.type}${m.href ?? ''}`)
      .sort()
      .join(',');
  for (let i = 1; i <= text.length; i++) {
    if (i < text.length && sig(i) === sig(start)) continue;
    const marks = [...per[start]!].sort((a, b) => MARK_ORDER.indexOf(a.type) - MARK_ORDER.indexOf(b.type));
    const node: JSONContent = { type: 'text', text: text.slice(start, i) };
    if (marks.length) node.marks = marks.map(pmMark);
    out.push(node);
    start = i;
  }
  return out;
}

/** One text block's inline content: text runs with their marks, and a lanes box for each sentence in clash. */
export function blockInline(block: BlockView, lanes = true): JSONContent[] {
  const segs = segments(block, lanes);
  const plain = segs.map((s) => (s.kind === 'text' ? s.text : '')).join('');
  const per = marksPerChar(plain, block.marks);
  const out: JSONContent[] = [];
  let offset = 0;
  for (const seg of segs) {
    if (seg.kind === 'clash') {
      out.push({ type: 'clash', attrs: { key: seg.key, block: block.id } });
      continue;
    }
    out.push(...textRuns(seg.text, per.slice(offset, offset + seg.text.length)));
    offset += seg.text.length;
  }
  return out;
}

export function paraAttrs(block: BlockView): ParaAttrs {
  const kind = block.style.kind === 'table' ? 'p' : block.style.kind;
  return {
    id: block.id,
    kind,
    list: kind === 'li' ? (block.style.list ?? 'bullet') : null,
    indent: kind === 'li' ? (block.style.indent ?? 0) : 0,
    number: block.number ?? null,
    ticked: block.tick ? (block.tick.state === 'clash' ? null : block.tick.shown?.value === true) : null,
  };
}

/** The whole editor document for a view. `lanes: false` is the normal-sync look (no lanes at all). */
export function viewToJSON(view: DocView, opts: { lanes?: boolean } = {}): JSONContent {
  const lanes = opts.lanes ?? true;
  const title: JSONContent =
    view.title.state === 'clash' && lanes
      ? { type: 'title', content: [{ type: 'clash', attrs: { key: view.title.key, block: 'title' } }] }
      : { type: 'title' };
  const titleText =
    view.title.state === 'clash' ? (view.title.lanes.at(-1)?.value ?? '') : (view.title.shown?.value ?? '');
  if (!(view.title.state === 'clash' && lanes) && titleText) title.content = [{ type: 'text', text: titleText }];

  const blocks: JSONContent[] = view.blocks.map((b) => {
    if (b.style.kind === 'table') return { type: 'table', attrs: { id: b.id } };
    const content = blockInline(b, lanes);
    const node: JSONContent = { type: 'para', attrs: { ...paraAttrs(b) } };
    if (content.length) node.content = content;
    return node;
  });
  // There is always somewhere to type.
  if (blocks.length === 0) blocks.push({ type: 'para', attrs: { id: null, kind: 'p', list: null, indent: 0, number: null, ticked: null } });
  return { type: 'doc', content: [title, ...blocks] };
}

/** What the editor holds in one text block: the engine's text, the plain words and the marks over them. */
export function readBlock(node: PMNode): { engineText: string; plainText: string; marks: MarkView[]; clashes: string[] } {
  let engineText = '';
  let plainText = '';
  const clashes: string[] = [];
  // Mark ranges over plainText, per mark type (and link address).
  const open = new Map<string, { type: MarkType; href?: string; from: number }>();
  const ranges: { type: MarkType; href?: string; from: number; to: number }[] = [];
  const closeAll = (keep: Set<string>, at: number) => {
    for (const [sig, r] of open) {
      if (keep.has(sig)) continue;
      ranges.push({ ...r, to: at });
      open.delete(sig);
    }
  };
  node.forEach((child) => {
    if (child.type.name === 'clash') {
      clashes.push(String(child.attrs.key));
      return;
    }
    if (!child.isText) return;
    const text = child.text ?? '';
    const here = new Set<string>();
    for (const mark of child.marks) {
      const type = mark.type.name as MarkType;
      if (!MARK_ORDER.includes(type)) continue;
      const href = type === 'link' ? String(mark.attrs.href ?? '') : undefined;
      const sig = `${type}|${href ?? ''}`;
      here.add(sig);
      if (!open.has(sig)) open.set(sig, { type, href, from: plainText.length });
    }
    closeAll(here, plainText.length);
    engineText += text;
    plainText += text;
  });
  closeAll(new Set(), plainText.length);

  const marks: MarkView[] = [];
  for (const r of ranges) {
    if (r.to <= r.from) continue;
    const quote = plainText.slice(r.from, r.to);
    const found = matchesOf(plainText, quote);
    let occurrence = found.indexOf(r.from) + 1;
    // Overlapping repeats ("aaa") can't be anchored exactly; the nearest earlier match is kept.
    if (occurrence === 0) occurrence = Math.max(1, found.filter((p) => p < r.from).length);
    const m: MarkView = { type: r.type, quote, occurrence };
    if (r.type === 'link') {
      if (!r.href || !linkAllowed(r.href)) continue;
      m.href = r.href;
    }
    marks.push(m);
  }
  return { engineText, plainText, marks, clashes };
}

/** The editor-side attributes of a text block node, typed. */
export function attrsOf(node: PMNode): ParaAttrs {
  return node.attrs as ParaAttrs;
}

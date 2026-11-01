// New words after a catch: they type themselves in (at most 5 seconds in all), then glow in the writer's colour
// until they've been read (3 seconds after they were fully on screen). Also the Find highlights.

import { useEffect, useRef, useState, type MutableRefObject } from 'react';
import type { Editor as TiptapEditor } from '@tiptap/react';
import type { Node as PMNode } from '@tiptap/pm/model';
import { Decoration } from '@tiptap/pm/view';
import type { ActorId, ChangeId, DocView, EditorProps, Field, ItemId } from '../contracts';
import { colourVar, cutName, writerColour, writerName } from './words';

export interface GlowSpot {
  /** A block id, or 'title'. */
  block: ItemId;
  from: number;
  to: number;
  actor: ActorId;
  colour: string;
  name: string;
}

export interface GlowState {
  spots: GlowSpot[];
  /** Changes whose words are new: lanes and table cells light up from these. */
  refs: ReadonlySet<ChangeId>;
  /** While typing in: how many letters of all the spots are showing so far. */
  typed: number | null;
}

const TYPE_MS = 5000;
const LETTERS_PER_SECOND = 28;
const READ_MS = 3000;

function isNew(field: Field<unknown>, refs: ReadonlySet<ChangeId>, before: Map<string, Field<unknown>>): boolean {
  if (!field.shown) return false;
  if (refs.has(field.shown.ref)) return true;
  // A pick that arrived: the lanes folded into one version.
  return before.get(field.key)?.state === 'clash' && field.state !== 'clash';
}

function fieldsByKey(view: DocView): Map<string, Field<unknown>> {
  const all = new Map<string, Field<unknown>>([[view.title.key, view.title]]);
  for (const b of view.blocks) for (const s of b.sentences) all.set(s.field.key, s.field);
  return all;
}

/** Where the new words are, by block and letter offset (each sentence with two versions counts as one). */
export function glowSpots(view: DocView, refs: ReadonlySet<ChangeId>, before: DocView | null): GlowSpot[] {
  const prev = before ? fieldsByKey(before) : new Map<string, Field<unknown>>();
  const spots: GlowSpot[] = [];
  const spot = (block: ItemId, from: number, to: number, actor: ActorId) =>
    spots.push({
      block,
      from,
      to,
      actor,
      colour: colourVar(writerColour(view, actor)) ?? 'var(--raised)',
      name: cutName(writerName(view, actor)),
    });
  const title = view.title;
  if (title.state !== 'clash' && title.shown?.value && isNew(title, refs, prev)) spot('title', 0, title.shown.value.length, title.shown.actor);
  for (const block of view.blocks) {
    let at = 0;
    for (const s of block.sentences) {
      if (s.field.state === 'clash') {
        at += 1;
        continue;
      }
      const text = s.field.shown?.value ?? '';
      if (text && s.field.shown && isNew(s.field, refs, prev)) spot(block.id, at, at + text.trimEnd().length, s.field.shown.actor);
      at += text.length;
    }
  }
  return spots;
}

/** Turns a block-relative spot into document positions. */
function locate(doc: PMNode, block: ItemId): number | null {
  let found: number | null = null;
  doc.forEach((node, pos) => {
    if (found !== null) return;
    if (block === 'title' ? node.type.name === 'title' : node.attrs.id === block) found = pos + 1;
  });
  return found;
}

export function glowDecorations(doc: PMNode, glow: GlowState | null): Decoration[] {
  if (!glow) return [];
  const out: Decoration[] = [];
  let left = glow.typed;
  for (const s of glow.spots) {
    const start = locate(doc, s.block);
    if (start === null) continue;
    const node = doc.resolve(start).parent;
    const from = start + Math.min(s.from, node.content.size);
    const to = start + Math.min(s.to, node.content.size);
    if (to <= from) continue;
    const style = `--c: ${s.colour}`;
    if (left === null || left >= to - from) {
      out.push(Decoration.inline(from, to, { class: 'pm-new', style }));
      if (left !== null) left -= to - from;
      continue;
    }
    const cut = from + Math.max(0, left);
    if (cut > from) out.push(Decoration.inline(from, cut, { class: 'pm-new', style }));
    out.push(Decoration.inline(cut, to, { class: 'pm-unseen' }));
    if (left >= 0) {
      out.push(
        Decoration.widget(
          cut,
          () => {
            const caret = document.createElement('span');
            caret.className = 'pm-caret';
            caret.style.setProperty('--c', s.colour);
            caret.setAttribute('aria-hidden', 'true');
            const label = document.createElement('span');
            label.className = 'pm-caret-name';
            label.textContent = s.name;
            caret.appendChild(label);
            return caret;
          },
          { key: `caret:${s.actor}`, side: -1 },
        ),
      );
    }
    left = -1;
  }
  return out;
}

/** Runs the glow for the Editor: type-in, then fade each spot 3 s after it was fully on screen. */
export function useGlow(
  props: EditorProps,
  editorRef: MutableRefObject<TiptapEditor | null>,
  _say: (text: string) => void,
): GlowState | null {
  const [state, setState] = useState<GlowState | null>(null);
  const before = useRef<DocView | null>(null);
  const lastView = useRef<DocView>(props.view);
  const seenAt = useRef(new Map<GlowSpot, number>());
  const doneRef = useRef(props.onGlowDone);
  doneRef.current = props.onGlowDone;

  // Remember the view before each change, so a pick that folds lanes can glow.
  useEffect(() => {
    before.current = lastView.current;
    lastView.current = props.view;
  }, [props.view]);

  const glow = props.glow;
  useEffect(() => {
    if (!glow) {
      setState(null);
      return;
    }
    const refs = new Set(glow.changes);
    const spots = glowSpots(props.view, refs, before.current);
    seenAt.current = new Map();
    setState({ spots, refs, typed: glow.typeIn && spots.length ? 0 : null });
    // Jump to the first new words.
    window.setTimeout(() => {
      const ed = editorRef.current;
      const first = spots[0];
      if (!ed || ed.isDestroyed || !first) return;
      const start = locate(ed.state.doc, first.block);
      if (start === null) return;
      try {
        const dom = ed.view.domAtPos(start).node as HTMLElement;
        (dom.nodeType === 1 ? dom : dom.parentElement)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      } catch {
        /* the block went away */
      }
    }, 50);
    // Only a new catch restarts the glow; later view changes keep the same spots.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [glow]);

  // Type the words in.
  const typing = state?.typed !== null && state !== null;
  useEffect(() => {
    if (!typing || !state) return;
    const total = state.spots.reduce((n, s) => n + (s.to - s.from), 0);
    const ms = Math.min(TYPE_MS, (total / LETTERS_PER_SECOND) * 1000);
    const started = performance.now();
    let frame = 0;
    const step = () => {
      const t = performance.now() - started;
      if (t >= ms) {
        setState((s) => (s ? { ...s, typed: null } : s));
        return;
      }
      setState((s) => (s ? { ...s, typed: Math.floor((t / ms) * total) } : s));
      frame = window.setTimeout(step, 40);
    };
    frame = window.setTimeout(step, 40);
    return () => window.clearTimeout(frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [typing, state?.spots]);

  // Fade each spot once it has been read.
  useEffect(() => {
    if (!state || state.typed !== null) return;
    if (state.spots.length === 0) {
      if (props.glow) doneRef.current();
      return;
    }
    const timer = window.setInterval(() => {
      const ed = editorRef.current;
      if (!ed || ed.isDestroyed) return;
      const now = performance.now();
      const scroller = ed.view.dom.closest('.ed-scroll');
      const box = scroller?.getBoundingClientRect() ?? { top: 0, bottom: window.innerHeight };
      const keep: GlowSpot[] = [];
      for (const s of state.spots) {
        const start = locate(ed.state.doc, s.block);
        if (start === null) continue;
        let visible = false;
        try {
          const a = ed.view.coordsAtPos(start + s.from);
          const b = ed.view.coordsAtPos(start + s.to);
          visible = a.top >= box.top && b.bottom <= box.bottom && !document.hidden;
        } catch {
          visible = false;
        }
        const seen = seenAt.current.get(s);
        if (visible && seen === undefined) seenAt.current.set(s, now);
        if (seen !== undefined && now - seen >= READ_MS) continue;
        keep.push(s);
      }
      if (keep.length !== state.spots.length) setState({ ...state, spots: keep });
    }, 400);
    return () => window.clearInterval(timer);
  }, [state, editorRef, props.glow]);

  return state;
}

/** Every place `query` appears in the page's own text (title, headings, paragraphs, list items). */
export function findInDoc(doc: PMNode, query: string): { from: number; to: number; block: ItemId | null }[] {
  const q = query.trim().toLocaleLowerCase();
  if (!q) return [];
  const out: { from: number; to: number; block: ItemId | null }[] = [];
  doc.forEach((node, pos) => {
    if (!node.isTextblock) return;
    // Text runs between clash boxes, searched one stretch at a time.
    let run = '';
    let runStart = pos + 1;
    const flushRun = () => {
      const lower = run.toLocaleLowerCase();
      let at = lower.indexOf(q);
      while (at >= 0) {
        out.push({ from: runStart + at, to: runStart + at + q.length, block: node.attrs.id ? String(node.attrs.id) : null });
        at = lower.indexOf(q, at + q.length);
      }
    };
    node.forEach((child, offset) => {
      if (child.isText) {
        if (!run) runStart = pos + 1 + offset;
        run += child.text ?? '';
      } else {
        flushRun();
        run = '';
      }
    });
    flushRun();
  });
  return out;
}

export function findDecorations(doc: PMNode, find: { query: string; current: number } | null): Decoration[] {
  if (!find || !find.query.trim()) return [];
  return findInDoc(doc, find.query).map((m, i) =>
    Decoration.inline(m.from, m.to, { class: i === find.current ? 'pm-find pm-find-on' : 'pm-find' }),
  );
}

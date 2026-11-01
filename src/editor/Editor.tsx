// The editor: a Google-Docs-style page on top of the engine.
// Typing goes into TipTap first; after a short pause (or when the cursor leaves the block) the editor works out
// what changed and turns it into intents. The engine's view is the only truth: when it changes, the editor's
// document is brought in line with it, with the cursor kept where it was.

import { useCallback, useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { EditorContent, useEditor, type Editor as TiptapEditor } from '@tiptap/react';
import type { Node as PMNode, Schema } from '@tiptap/pm/model';
import { TextSelection } from '@tiptap/pm/state';
import type { Decoration } from '@tiptap/pm/view';
import type { BlockView, DocView, EditorProps, Field, ItemId, Lane, Op } from '../contracts';
import { engine as model } from '../model';
import { Decided, Lanes } from './Lanes';
import { Icon } from './icons';
import {
  attrsOf,
  blockInline,
  CLASH_MARK,
  diffMarks,
  paraAttrs,
  readBlock,
  sameStyle,
  styleOf,
  viewEngineText,
  viewToJSON,
  type ParaAttrs,
} from './model';
import { engineMeta, makeExtensions, type Bridge } from './schema';
import { TableBlock } from './TableBlock';
import { Toolbar, type SheetName } from './Toolbar';
import { glowDecorations, findDecorations, useGlow } from './glow';
import { countWords, FindBar, FindQuery, Hl, OutlinePanel, WordCount } from './Panels';
import { LinkCard, Sheets } from './Sheets';
import {
  needsLookLine,
  NORMAL_SYNC_BLOCKED,
  NORMAL_SYNC_LABEL,
  NOTHING_TO_REDO,
  NOTHING_TO_UNDO,
  linkAllowed,
  PICK_FIRST,
} from './words';
import './editor.css';

const PAUSE_MS = 500;

export interface Note {
  text: string;
  at: number;
  action?: { label: string; run(): void };
}

type Slot = { el: HTMLElement; sid: number; kind: 'clash' | 'tick' | 'below' | 'table'; key: string };

/** Finds the field a sentence key belongs to, and the block it sits in. */
function findSentence(view: DocView, key: string): { block: BlockView; field: Field<string>; id: ItemId } | null {
  for (const block of view.blocks)
    for (const s of block.sentences) if (s.field.key === key) return { block, field: s.field, id: s.id };
  return null;
}

/** The marks the editor shows for a block as the engine has it, read back the same way typing is read. */
function shownMarks(schema: Schema, block: BlockView) {
  const content = blockInline(block);
  return readBlock(schema.nodeFromJSON({ type: 'para', attrs: paraAttrs(block), content })).marks;
}

/** Everything that changed between the engine's last view and the editor's document, as intents. */
export function buildOps(base: DocView, doc: PMNode, schema: Schema): { ops: Op[]; newIds: { pos: number; id: ItemId }[] } {
  const I = model.intents;
  const ops: Op[] = [];
  const newIds: { pos: number; id: ItemId }[] = [];
  const byId = new Map(base.blocks.map((b) => [b.id, b]));
  const seen = new Set<ItemId>();
  let prev: ItemId | null = null;
  doc.forEach((node, pos) => {
    if (node.type.name === 'title') {
      let clash = false;
      node.forEach((c) => {
        if (c.type.name === 'clash') clash = true;
      });
      if (base.title.state === 'clash' || clash) return;
      const text = node.textContent;
      if (text !== (base.title.shown?.value ?? '')) ops.push(...I.setTitle(base, text));
      return;
    }
    if (node.type.name === 'table') {
      const id = node.attrs.id ? String(node.attrs.id) : null;
      if (id) {
        seen.add(id);
        prev = id;
      }
      return;
    }
    const a = attrsOf(node);
    const read = readBlock(node);
    const style = styleOf(a);
    const known = a.id && !seen.has(a.id) ? byId.get(a.id) : undefined;
    if (known) {
      seen.add(known.id);
      if (!sameStyle(style, known.style)) ops.push(...I.setStyle(known.id, style));
      if (read.engineText !== viewEngineText(known)) ops.push(...I.setText(base, known.id, read.engineText));
      const { on, off } = diffMarks(shownMarks(schema, known), read.marks);
      for (const m of off) ops.push(...I.setMark(known.id, m.type, m.quote, m.occurrence, false, m.href));
      for (const m of on) ops.push(...I.setMark(known.id, m.type, m.quote, m.occurrence, true, m.href));
      prev = known.id;
      return;
    }
    const text = read.engineText.split(CLASH_MARK).join('');
    const made = I.insertBlock(base, prev, style, text);
    ops.push(...made.ops);
    for (const m of read.marks) ops.push(...I.setMark(made.block, m.type, m.quote, m.occurrence, true, m.href));
    newIds.push({ pos, id: made.block });
    seen.add(made.block);
    prev = made.block;
  });
  for (const b of base.blocks) if (!seen.has(b.id) && b.style.kind !== 'table') ops.push(...I.deleteBlock(base, b.id));
  return { ops, newIds };
}

/** Where a sentence ends inside its block, counting each sentence with two versions as one place. */
function sentenceEnd(block: BlockView, sentence: ItemId): number | null {
  let at = 0;
  for (const s of block.sentences) {
    const text = s.field.state === 'clash' ? null : (s.field.shown?.value ?? '');
    if (s.id === sentence) return text === null ? null : at + text.trimEnd().length;
    at += text === null ? 1 : text.length;
  }
  return null;
}

let slotIds = 0;
const slotIdOf = new WeakMap<HTMLElement, number>();

export function Editor(props: EditorProps) {
  const propsRef = useRef(props);
  propsRef.current = props;
  const baseRef = useRef<DocView>(props.view);
  const pendingRef = useRef(false);
  const timerRef = useRef<number | null>(null);
  const lastBlockRef = useRef<number>(-1);
  const focusRef = useRef<string | null>(null);
  const belowRef = useRef<ReadonlySet<string>>(new Set());
  const extraRef = useRef<(doc: PMNode) => Decoration[]>(() => []);
  const pendingCursorRef = useRef<{ block: ItemId; sentence: ItemId } | null>(null);
  const editorRef = useRef<TiptapEditor | null>(null);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [note, setNote] = useState<Note | null>(null);
  const [sheet, setSheet] = useState<SheetName | null>(null);
  const [panel, setPanel] = useState<'find' | 'outline' | 'word-count' | null>(null);
  const [linkCard, setLinkCard] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [, redraw] = useReducer((n: number) => n + 1, 0);
  const lanes = props.mode === 'edit';

  const say = useCallback((text: string, action?: Note['action']) => setNote({ text, at: Date.now(), action }), []);

  useEffect(() => {
    if (!note) return;
    const timer = window.setTimeout(() => setNote(null), note.action ? 6000 : 4000);
    return () => window.clearTimeout(timer);
  }, [note]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  /** Sends what was typed to the engine. False when it couldn't (the words stay on screen, waiting). */
  const flush = useCallback((): boolean => {
    const ed = editorRef.current;
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (!ed || ed.isDestroyed || !pendingRef.current) return true;
    if (ed.view.composing) {
      timerRef.current = window.setTimeout(() => flush(), PAUSE_MS);
      return false;
    }
    const p = propsRef.current;
    if (p.mode !== 'edit') {
      pendingRef.current = false;
      return true;
    }
    let built: ReturnType<typeof buildOps>;
    try {
      built = buildOps(baseRef.current, ed.state.doc, ed.schema);
    } catch (err) {
      console.error('editor: could not turn typing into changes', err);
      return false;
    }
    pendingRef.current = false;
    if (built.ops.length) p.commit(built.ops);
    if (built.newIds.length) {
      const tr = ed.state.tr;
      for (const { pos, id } of built.newIds) tr.setNodeAttribute(pos, 'id', id);
      tr.setMeta(engineMeta, true).setMeta('addToHistory', false);
      ed.view.dispatch(tr);
    }
    if (built.ops.length) baseRef.current = p.engine.view();
    return true;
  }, []);

  /** Runs a toolbar or lane action: typing is sent first, then the action's ops. */
  const act = useCallback(
    (make: () => Op[]) => {
      flush();
      let ops: Op[];
      try {
        ops = make();
      } catch (err) {
        console.error('editor: action failed', err);
        say("Couldn't make that change.");
        return;
      }
      if (ops.length) propsRef.current.commit(ops);
    },
    [flush, say],
  );

  const undo = useCallback(() => {
    flush();
    const p = propsRef.current;
    const before = p.engine.changes().length;
    p.undo();
    if (p.engine.changes().length === before) say(NOTHING_TO_UNDO);
  }, [flush, say]);

  const redo = useCallback(() => {
    flush();
    const p = propsRef.current;
    const before = p.engine.changes().length;
    p.redo();
    if (p.engine.changes().length === before) say(NOTHING_TO_REDO);
  }, [flush, say]);

  const openPanel = useCallback(
    (what: 'find' | 'outline' | 'word-count') => {
      flush();
      setPanel(what);
    },
    [flush],
  );

  const bridge = useMemo<Bridge>(
    () => ({
      belowBlocks: () => belowRef.current,
      emptyBlank: () => {
        const v = propsRef.current.view;
        return v.template === 'blank' && v.blocks.length <= 1 && !(v.blocks[0]?.sentences.length ?? 0);
      },
      focusBlock: () => focusRef.current,
      extraDecorations: (doc) => extraRef.current(doc),
      note: (text) => say(text),
      undo: () => undo(),
      redo: () => redo(),
      openLink: () => {
        flush();
        setSheet('link');
      },
      openFind: () => openPanel('find'),
      canEdit: () => propsRef.current.mode === 'edit',
      blockedEdit: () => say(NORMAL_SYNC_BLOCKED),
    }),
    [say, undo, redo, flush, openPanel],
  );

  const collectSlots = useCallback((ed: TiptapEditor) => {
    const els = Array.from(ed.view.dom.querySelectorAll<HTMLElement>('[data-slot]'));
    setSlots((prev) => {
      if (prev.length === els.length && prev.every((s, i) => s.el === els[i])) return prev;
      return els.map((el) => {
        let sid = slotIdOf.get(el);
        if (sid === undefined) {
          sid = ++slotIds;
          slotIdOf.set(el, sid);
        }
        const kind = el.dataset.slot as Slot['kind'];
        return { el, sid, kind, key: (kind === 'clash' ? el.dataset.key : el.dataset.block) ?? '' };
      });
    });
  }, []);

  const editor = useEditor({
    extensions: makeExtensions(bridge),
    content: viewToJSON(props.view, { lanes }),
    editorProps: {
      attributes: { class: 'pm-doc', spellcheck: 'true', 'aria-label': 'Doc', 'aria-multiline': 'true', role: 'textbox' },
      handleClick: (view, pos, event) => {
        const link = view.state.doc.resolve(pos).marks().find((m) => m.type.name === 'link');
        const href = link ? String(link.attrs.href ?? '') : '';
        if (!href) return false;
        if ((event.ctrlKey || event.metaKey) && linkAllowed(href)) {
          window.open(href, '_blank', 'noopener,noreferrer');
          return true;
        }
        setLinkCard(href);
        return false;
      },
    },
    onCreate: ({ editor: ed }) => {
      editorRef.current = ed;
      collectSlots(ed);
    },
    onMount: ({ editor: ed }) => {
      // The page's DOM exists only once EditorContent has mounted it.
      editorRef.current = ed;
      collectSlots(ed);
    },
    onTransaction: ({ editor: ed, transaction: tr }) => {
      editorRef.current = ed;
      collectSlots(ed);
      if (!tr.docChanged || tr.getMeta(engineMeta)) return;
      pendingRef.current = true;
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
      const structural = tr.before.childCount !== tr.doc.childCount;
      timerRef.current = window.setTimeout(() => flush(), structural ? 0 : PAUSE_MS);
    },
    onSelectionUpdate: ({ editor: ed }) => {
      const index = ed.state.selection.$head.index(0);
      if (index !== lastBlockRef.current) {
        lastBlockRef.current = index;
        if (pendingRef.current) window.setTimeout(() => flush(), 0);
      }
    },
    onBlur: () => {
      if (pendingRef.current) flush();
    },
  });
  editorRef.current = editor;

  // The lanes, tick boxes and tables go into the page's empty boxes. Watch the page, so boxes made when the
  // page first appears (or after any change) are always filled.
  const pageRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const page = pageRef.current;
    if (!editor || !page) return;
    let frame = 0;
    const run = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (!editor.isDestroyed) collectSlots(editor);
      });
    };
    run();
    const watch = new MutationObserver(run);
    watch.observe(page, { childList: true, subtree: true });
    return () => {
      cancelAnimationFrame(frame);
      watch.disconnect();
    };
  }, [editor, collectSlots]);

  // Engine → editor: whenever the view changes, bring the page in line with it.
  useLayoutEffect(() => {
    const ed = editorRef.current;
    if (!ed || ed.isDestroyed) return;
    if (pendingRef.current) {
      const committedBefore = props.engine.changes().length;
      if (!flush()) return;
      // Our own typing just became a change: the view that change makes is on its way.
      if (props.engine.changes().length !== committedBefore) return;
    }
    const desired = ed.schema.nodeFromJSON(viewToJSON(props.view, { lanes }));
    const doc = ed.state.doc;
    const tr = ed.state.tr;
    const start = doc.content.findDiffStart(desired.content);
    if (start != null) {
      const end = doc.content.findDiffEnd(desired.content);
      let endA = end?.a ?? doc.content.size;
      let endB = end?.b ?? desired.content.size;
      const overlap = start - Math.min(endA, endB);
      if (overlap > 0) {
        endA += overlap;
        endB += overlap;
      }
      try {
        tr.replace(start, endA, desired.slice(start, endB));
      } catch {
        tr.replaceWith(0, doc.content.size, desired.content);
      }
    }
    baseRef.current = props.view;
    tr.setMeta(engineMeta, true).setMeta('addToHistory', false);
    const want = pendingCursorRef.current;
    if (want) {
      pendingCursorRef.current = null;
      const block = props.view.blocks.find((b) => b.id === want.block);
      const offset = block ? sentenceEnd(block, want.sentence) : null;
      if (block && offset !== null) {
        tr.doc.forEach((node, pos) => {
          if (node.type.name === 'para' && node.attrs.id === want.block)
            tr.setSelection(TextSelection.create(tr.doc, pos + 1 + Math.min(offset, node.content.size)));
        });
      }
      ed.view.dispatch(tr.scrollIntoView());
      ed.view.focus();
    } else ed.view.dispatch(tr);
  }, [props.view, lanes, props.engine, flush]);

  // Spots with something under them: kept marks, settled marks, a tick with two versions.
  useMemo(() => {
    const below = new Set<string>();
    if (props.view.title.kept.length) below.add('title');
    for (const b of props.view.blocks) {
      if (b.tick && (b.tick.state === 'clash' || b.tick.kept.length)) below.add(b.id);
      if (b.sentences.some((s) => s.field.state !== 'clash' && s.field.kept.length)) below.add(b.id);
    }
    belowRef.current = lanes ? below : new Set();
  }, [props.view, lanes]);

  // Glow after a catch, and the words Find is showing.
  const glow = useGlow(props, editorRef, say);
  const [find, setFind] = useState<{ query: string; current: number } | null>(null);
  extraRef.current = (doc) => [...glowDecorations(doc, glow), ...findDecorations(doc, find)];
  useEffect(() => {
    const ed = editorRef.current;
    if (ed && !ed.isDestroyed) ed.view.dispatch(ed.state.tr.setMeta(engineMeta, true).setMeta('addToHistory', false));
  }, [glow, find]);

  // Jump to a block (from the side panel, Find or the outline), and light it up briefly.
  const jumpTo = useCallback((block: ItemId) => {
    const ed = editorRef.current;
    if (!ed || ed.isDestroyed) return;
    let dom: HTMLElement | null = null;
    ed.state.doc.forEach((node, pos) => {
      if (!dom && node.attrs.id === block) dom = ed.view.nodeDOM(pos) as HTMLElement | null;
    });
    if (!dom) return;
    (dom as HTMLElement).scrollIntoView({ block: 'center', behavior: 'smooth' });
    focusRef.current = block;
    ed.view.dispatch(ed.state.tr.setMeta(engineMeta, true));
    window.setTimeout(() => {
      if (focusRef.current !== block) return;
      focusRef.current = null;
      if (!ed.isDestroyed) ed.view.dispatch(ed.state.tr.setMeta(engineMeta, true));
    }, 2500);
  }, []);
  useEffect(() => {
    if (props.focusBlock) jumpTo(props.focusBlock);
  }, [props.focusBlock, jumpTo]);

  // The phone's "⋯" menu asks for Find, Outline or Word count.
  const requestAt = props.request?.at;
  useEffect(() => {
    const r = propsRef.current.request;
    if (r) openPanel(r.what);
  }, [requestAt, openPanel]);

  // Typing that hasn't reached the engine yet goes in before the editor closes.
  useEffect(() => () => void flush(), [flush]);

  // Normal-sync: nothing to type, nothing pending.
  useEffect(() => {
    if (props.mode !== 'edit') setSheet(null);
    redraw();
  }, [props.mode]);

  const I = model.intents;
  const keep = useCallback(
    <T,>(field: Field<T>, lane: Lane<T>) => act(() => I.pick(field as Field<unknown>, lane.ref)),
    [act, I],
  );

  const renderSlot = (slot: Slot) => {
    const view = props.view;
    if (slot.kind === 'clash') {
      if (slot.key === view.title.key && view.title.state === 'clash') {
        return (
          <Lanes
            view={view}
            field={view.title}
            what="title"
            show={(v) => <Hl text={v} />}
            now={now}
            onKeep={(lane) => keep(view.title, lane)}
            onEdit={(lane) => {
              keep(view.title, lane);
              window.setTimeout(() => {
                const ed = editorRef.current;
                if (ed && !ed.isDestroyed) ed.commands.focus(ed.state.doc.firstChild!.nodeSize - 1);
              }, 0);
            }}
          />
        );
      }
      const found = findSentence(view, slot.key);
      if (!found || found.field.state !== 'clash') return null;
      const other = found.field.lanes.find((l) => l.value !== null)?.value ?? '';
      return (
        <Lanes
          view={view}
          field={found.field}
          what="sentence"
          show={(v) => <Hl text={v} />}
          deletedShows={<s>{other}</s>}
          now={now}
          onKeep={(lane) => keep(found.field, lane)}
          onEdit={(lane) => {
            pendingCursorRef.current = { block: found.block.id, sentence: found.id };
            keep(found.field, lane);
          }}
        />
      );
    }
    const block = view.blocks.find((b) => b.id === slot.key);
    if (slot.kind === 'table') {
      if (!block?.table) return null;
      return (
        <TableBlock
          view={view}
          block={block}
          me={props.me}
          layout={props.layout}
          readOnly={!lanes}
          now={now}
          act={act}
          say={say}
          onKeep={keep}
          undo={undo}
          glow={glow}
        />
      );
    }
    if (slot.kind === 'tick') {
      const tick = block?.tick;
      if (!block || !tick) return null;
      const clash = tick.state === 'clash';
      const ticked = !clash && tick.shown?.value === true;
      return (
        <button
          type="button"
          className={`pm-tick${ticked ? ' is-on' : ''}${clash ? ' is-clash' : ''}`}
          role="checkbox"
          aria-checked={clash ? 'mixed' : ticked}
          aria-label={ticked ? 'Done. Tap to untick' : 'Not done. Tap to tick'}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            if (!lanes) return say(NORMAL_SYNC_BLOCKED);
            if (clash) return say(PICK_FIRST);
            act(() => I.setTick(block.id, !ticked));
          }}
        >
          <span className="pm-tickbox">{ticked && <Icon name="tick" />}</span>
        </button>
      );
    }
    // Below a block: the tick's two versions, and the quiet "Kept by" marks.
    if (slot.key === 'title') {
      return <Decided view={view} field={view.title} me={props.me} show={(v) => <Hl text={v} />} now={now} onUse={(l) => keep(view.title, l)} />;
    }
    if (!block) return null;
    return (
      <>
        {block.tick?.state === 'clash' && (
          <Lanes
            view={view}
            field={block.tick}
            what="tick"
            show={(v) => (v ? 'Done' : 'Not done')}
            now={now}
            onKeep={(lane) => keep(block.tick!, lane)}
          />
        )}
        {block.tick && block.tick.state !== 'clash' && block.tick.kept.length > 0 && (
          <Decided view={view} field={block.tick} me={props.me} show={(v) => (v ? 'Done' : 'Not done')} now={now} onUse={(l) => keep(block.tick!, l)} />
        )}
        {block.sentences
          .filter((s) => s.field.state !== 'clash' && s.field.kept.length > 0)
          .map((s) => (
            <Decided
              key={s.id}
              view={view}
              field={s.field}
              me={props.me}
              show={(v) => <Hl text={v} />}
              deletedShows={<s>{s.field.shown?.value ?? ''}</s>}
              now={now}
              onUse={(l) => keep(s.field, l)}
            />
          ))}
      </>
    );
  };

  const look = lanes ? needsLookLine(props.view) : null;
  const big = props.bigScreen;
  const phone = props.layout === 'phone';

  return (
    <FindQuery.Provider value={find?.query ?? ''}>
    <div className={`ed ed-${props.layout}${big ? ' ed-big' : ''}${lanes ? '' : ' ed-ns'}`}>
      {editor && (
        <Toolbar
          editor={editor}
          layout={props.layout}
          disabled={!lanes}
          onUndo={undo}
          onRedo={redo}
          onSheet={(s) => {
            flush();
            setSheet(s);
          }}
          onOpen={(what) => {
            flush();
            if (what === 'find' || what === 'outline') return openPanel(what);
            props.onOpen(what);
          }}
          onBlocked={() => say(NORMAL_SYNC_BLOCKED)}
        />
      )}
      {phone && look && (
        <button type="button" className="ed-look" onClick={() => props.onOpen('needs-look')}>
          <Icon name="alert" />
          <span>{look}</span>
          <span className="ed-look-go" aria-hidden="true">
            ›
          </span>
        </button>
      )}
      {panel === 'find' && editor && (
        <FindBar
          editor={editor}
          view={props.view}
          onChange={setFind}
          onJump={jumpTo}
          onClose={() => {
            setPanel(null);
            setFind(null);
          }}
        />
      )}
      <div className="ed-scroll">
        <div className="ed-page" ref={pageRef}>
          {!lanes && <p className="ed-ns-label">{NORMAL_SYNC_LABEL}</p>}
          <EditorContent editor={editor} />
        </div>
      </div>
      {note && (
        <div className="ed-note" role="status" key={note.at}>
          <span>{note.text}</span>
          {note.action && (
            <button
              type="button"
              className="ed-note-act"
              onClick={() => {
                note.action!.run();
                setNote(null);
              }}
            >
              {note.action.label}
            </button>
          )}
        </div>
      )}
      {editor && sheet && (
        <Sheets
          editor={editor}
          sheet={sheet}
          layout={props.layout}
          view={props.view}
          onSheet={setSheet}
          onAddRule={() => props.onOpen('add-rule')}
          act={act}
          say={say}
          flush={flush}
        />
      )}
      {panel === 'outline' && <OutlinePanel view={props.view} layout={props.layout} onJump={jumpTo} onClose={() => setPanel(null)} />}
      {panel === 'word-count' && <WordCount view={props.view} layout={props.layout} onClose={() => setPanel(null)} />}
      {editor && linkCard && (
        <LinkCard
          editor={editor}
          href={linkCard}
          layout={props.layout}
          onClose={() => setLinkCard(null)}
          onChange={() => {
            setLinkCard(null);
            setSheet('link');
          }}
        />
      )}
      {!phone && !big && (
        <button type="button" className="ed-wc" onClick={() => openPanel('word-count')}>
          {countWords(props.view).total.toLocaleString('en-IN')} words
        </button>
      )}
      {slots.map((slot) => createPortal(renderSlot(slot), slot.el, String(slot.sid)))}
    </div>
    </FindQuery.Provider>
  );
}

export type { ParaAttrs };

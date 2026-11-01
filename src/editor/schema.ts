// The editor's document shape: a title, then flat blocks (text blocks and tables), as the engine stores them.
// Sentences with two versions sit inside their paragraph as "clash" boxes; React draws them (see Editor.tsx).

import { Extension, Node, mergeAttributes, type AnyExtension } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { Plugin, PluginKey, TextSelection, type EditorState, type Transaction } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import { InputRule, inputRules } from '@tiptap/pm/inputrules';
import type { Node as PMNode } from '@tiptap/pm/model';
import type { ListKind } from '../contracts';
import { linkAllowed, EMPTY_DOC, EMPTY_TIP, NOT_DELETED, PICK_FIRST, UNTITLED } from './words';
import type { ParaAttrs } from './model';

/** What the editor's plugins ask of the React side. */
export interface Bridge {
  /** Blocks with something to show under them (kept marks, a tick with two versions). */
  belowBlocks(): ReadonlySet<string>;
  /** A new Blank doc with nothing in it yet. */
  emptyBlank(): boolean;
  focusBlock(): string | null;
  /** Decorations for glowing words and find matches, by position. */
  extraDecorations(doc: PMNode): Decoration[];
  note(text: string): void;
  undo(): void;
  redo(): void;
  openLink(): void;
  openFind(): void;
  canEdit(): boolean;
  blockedEdit(): void;
}

export const engineMeta = 'phirEngine';

function listFrom(el: HTMLElement): { list: ListKind; indent: 0 | 1 | 2 } {
  const parent = el.parentElement;
  let list: ListKind = parent?.tagName === 'OL' ? 'number' : 'bullet';
  if (
    el.dataset.type === 'taskItem' ||
    parent?.dataset.type === 'taskList' ||
    el.querySelector(':scope > input[type=checkbox], :scope > label > input[type=checkbox]')
  )
    list = 'check';
  let depth = 0;
  const level = Number(el.getAttribute('aria-level'));
  if (level >= 1) depth = level - 1;
  else for (let p = parent?.parentElement; p; p = p.parentElement) if (p.tagName === 'UL' || p.tagName === 'OL') depth++;
  return { list, indent: Math.min(2, depth) as 0 | 1 | 2 };
}

const PhirDoc = Node.create({ name: 'doc', topNode: true, content: 'title block+' });

const Title = Node.create({
  name: 'title',
  content: '(text | clash)*',
  marks: '',
  defining: true,
  parseHTML: () => [],
  renderHTML: () => ['h1', { class: 'pm-title' }, 0],
});

const Para = Node.create({
  name: 'para',
  group: 'block',
  content: '(text | clash)*',
  marks: '_',
  defining: true,
  addAttributes() {
    return {
      id: { default: null, keepOnSplit: false, parseHTML: () => null, renderHTML: (a) => (a.id ? { 'data-id': a.id } : {}) },
      kind: { default: 'p', keepOnSplit: true, parseHTML: () => null, renderHTML: (a) => ({ 'data-kind': a.kind }) },
      list: { default: null, keepOnSplit: true, parseHTML: () => null, renderHTML: (a) => (a.list ? { 'data-list': a.list } : {}) },
      indent: { default: 0, keepOnSplit: true, parseHTML: () => null, renderHTML: (a) => ({ 'data-indent': String(a.indent) }) },
      number: {
        default: null,
        keepOnSplit: false,
        parseHTML: () => null,
        renderHTML: (a) => (a.number != null ? { 'data-number': `${a.number}.` } : {}),
      },
      ticked: { default: null, keepOnSplit: false, parseHTML: () => null, renderHTML: (a) => (a.ticked ? { 'data-ticked': 'true' } : {}) },
    };
  },
  parseHTML() {
    const heading = (kind: 'h1' | 'h2' | 'h3') => () => ({ kind, list: null, indent: 0 });
    return [
      {
        tag: 'div[data-kind]',
        priority: 60,
        getAttrs: (el) => {
          const kind = (el as HTMLElement).dataset.kind;
          if (kind !== 'p' && kind !== 'h1' && kind !== 'h2' && kind !== 'h3' && kind !== 'li') return false;
          const list = (el as HTMLElement).dataset.list ?? null;
          const indent = Math.min(2, Math.max(0, Number((el as HTMLElement).dataset.indent) || 0));
          return { kind, list: kind === 'li' ? (list ?? 'bullet') : null, indent: kind === 'li' ? indent : 0 };
        },
      },
      { tag: 'p', getAttrs: () => ({ kind: 'p', list: null, indent: 0 }) },
      { tag: 'h1', getAttrs: heading('h1') },
      { tag: 'h2', getAttrs: heading('h2') },
      { tag: 'h3', getAttrs: heading('h3') },
      { tag: 'h4', getAttrs: heading('h3') },
      { tag: 'h5', getAttrs: heading('h3') },
      { tag: 'h6', getAttrs: heading('h3') },
      {
        tag: 'li',
        getAttrs: (el) => ({ kind: 'li', ...listFrom(el as HTMLElement) }),
        contentElement: (el) => {
          const only = (el as HTMLElement).children.length === 1 ? (el as HTMLElement).firstElementChild : null;
          return only && only.tagName === 'P' ? (only as HTMLElement) : (el as HTMLElement);
        },
      },
    ];
  },
  renderHTML({ node, HTMLAttributes }) {
    return ['div', mergeAttributes({ class: `pm-block pm-${node.attrs.kind}` }, HTMLAttributes), 0];
  },
});

/** A sentence (or the title) with two or more versions. Never typed in; React draws the lanes. */
const Clash = Node.create({
  name: 'clash',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: false,
  draggable: false,
  addAttributes() {
    return { key: { default: '' }, block: { default: '' } };
  },
  parseHTML: () => [],
  renderHTML: () => ['span', { class: 'pm-clash' }],
  renderText: () => '',
  addNodeView() {
    return ({ node }) => {
      const dom = document.createElement('span');
      dom.className = 'pm-clash';
      dom.contentEditable = 'false';
      dom.dataset.slot = 'clash';
      dom.dataset.key = String(node.attrs.key);
      return {
        dom,
        ignoreMutation: () => true,
        stopEvent: () => true,
        update: (next) => next.type.name === 'clash' && next.attrs.key === node.attrs.key,
      };
    };
  },
});

/** A table. Its rows and cells are drawn by React from the engine's view. */
const Table = Node.create({
  name: 'table',
  group: 'block',
  atom: true,
  selectable: false,
  draggable: false,
  isolating: true,
  addAttributes() {
    return { id: { default: null, parseHTML: () => null } };
  },
  parseHTML: () => [],
  renderHTML: () => ['div', { class: 'pm-table' }],
  addNodeView() {
    return ({ node }) => {
      const dom = document.createElement('div');
      dom.className = 'pm-table';
      dom.contentEditable = 'false';
      dom.dataset.slot = 'table';
      dom.dataset.block = String(node.attrs.id);
      return {
        dom,
        ignoreMutation: () => true,
        stopEvent: () => true,
        update: (next) => next.type.name === 'table' && next.attrs.id === node.attrs.id,
      };
    };
  },
});

// ---------------------------------------------------------------------------------------------
// Keeping clashes and tables whole: typing never removes, moves or splits a sentence with two versions.
// ---------------------------------------------------------------------------------------------

interface Inventory {
  clashes: Map<string, string>; // key → id of the node holding it
  clashesPerNode: Map<string, number>; // holder id → how many separate nodes hold its clashes
  tables: Set<string>;
  titleMixed: boolean;
}

function inventory(doc: PMNode): Inventory {
  const clashes = new Map<string, string>();
  const holders = new Map<string, Set<number>>();
  const tables = new Set<string>();
  let titleMixed = false;
  doc.forEach((node, _offset, index) => {
    if (node.type.name === 'table') {
      if (node.attrs.id) tables.add(String(node.attrs.id));
      return;
    }
    const holder = node.type.name === 'title' ? 'title' : String(node.attrs.id ?? `new${index}`);
    let hasClash = false;
    let hasText = false;
    node.forEach((child) => {
      if (child.type.name === 'clash') {
        hasClash = true;
        clashes.set(String(child.attrs.key), `${holder}|${String(child.attrs.block)}`);
        const set = holders.get(String(child.attrs.block)) ?? new Set<number>();
        set.add(index);
        holders.set(String(child.attrs.block), set);
      } else if (child.isText) hasText = true;
    });
    if (node.type.name === 'title' && hasClash && hasText) titleMixed = true;
  });
  const clashesPerNode = new Map<string, number>();
  for (const [block, set] of holders) clashesPerNode.set(block, set.size);
  return { clashes, clashesPerNode, tables, titleMixed };
}

function keepsWhole(before: PMNode, after: PMNode): 'ok' | 'clash' | 'table' {
  const a = inventory(before);
  const b = inventory(after);
  if (b.titleMixed) return 'clash';
  for (const [key, where] of a.clashes) if (b.clashes.get(key) !== where) return 'clash';
  for (const key of b.clashes.keys()) if (!a.clashes.has(key)) return 'clash';
  for (const n of b.clashesPerNode.values()) if (n > 1) return 'clash';
  for (const id of a.tables) if (!b.tables.has(id)) return 'table';
  return 'ok';
}

/** Splits a text block at the cursor, the way Google Docs does: headings go back to Normal, lists carry on. */
function splitBlock(state: EditorState, dispatch: ((tr: Transaction) => void) | undefined, bridge: Bridge): boolean {
  const { $from, $to } = state.selection;
  if ($from.parent !== $to.parent) return false;
  const node = $from.parent;
  const tr = state.tr;
  if (!state.selection.empty) tr.deleteSelection();
  const pos = tr.mapping.map($from.pos);
  const $pos = tr.doc.resolve(pos);
  const para = state.schema.nodes.para!;

  if (node.type.name === 'title') {
    if (node.childCount && node.firstChild?.type.name === 'clash') return true;
    tr.split(pos, 1, [{ type: para, attrs: { kind: 'p' } }]);
    if (dispatch) dispatch(tr.scrollIntoView());
    return true;
  }
  if (node.type.name !== 'para') return false;
  const attrs = node.attrs as ParaAttrs;

  // Enter on an empty list item ends the list.
  if (attrs.kind === 'li' && node.content.size === 0) {
    if (dispatch) dispatch(tr.setNodeMarkup($pos.before(), undefined, { ...attrs, kind: 'p', list: null, indent: 0 }));
    return true;
  }
  const offset = $pos.parentOffset;
  let clashBefore = false;
  let clashAfter = false;
  tr.doc.resolve(pos).parent.forEach((child, childOffset) => {
    if (child.type.name !== 'clash') return;
    if (childOffset < offset) clashBefore = true;
    else clashAfter = true;
  });
  if (clashBefore && clashAfter) {
    bridge.note(PICK_FIRST);
    return true;
  }
  const atEnd = offset === $pos.parent.content.size;
  const heading = attrs.kind === 'h1' || attrs.kind === 'h2' || attrs.kind === 'h3';
  const after = heading && atEnd ? { kind: 'p', list: null, indent: 0 } : { kind: attrs.kind, list: attrs.list, indent: attrs.indent };
  tr.split(pos, 1, [{ type: para, attrs: { ...after, id: null, number: null, ticked: null } }]);
  if (clashAfter && attrs.id) {
    // The sentences with two versions went into the second half: it keeps the block, the first half is new.
    const firstStart = tr.doc.resolve(tr.mapping.map($from.pos, -1)).before();
    const second = tr.doc.resolve(firstStart).nodeAfter;
    if (second) {
      const secondStart = firstStart + second.nodeSize;
      tr.setNodeMarkup(firstStart, undefined, { ...attrs, id: null, number: null, ticked: null });
      tr.setNodeMarkup(secondStart, undefined, { ...tr.doc.nodeAt(secondStart)!.attrs, id: attrs.id, kind: attrs.kind, list: attrs.list, indent: attrs.indent });
    }
  }
  if (dispatch) dispatch(tr.scrollIntoView());
  return true;
}

export function setListAttrs(state: EditorState, dispatch: ((tr: Transaction) => void) | undefined, change: (a: ParaAttrs) => Partial<ParaAttrs> | null): boolean {
  const { from, to } = state.selection;
  const tr = state.tr;
  let any = false;
  state.doc.nodesBetween(from, to, (node, pos) => {
    if (node.type.name !== 'para') return false;
    const next = change(node.attrs as ParaAttrs);
    if (next) {
      tr.setNodeMarkup(pos, undefined, { ...node.attrs, ...next });
      any = true;
    }
    return false;
  });
  if (any && dispatch) dispatch(tr);
  return any;
}

function blockShortcut(pattern: RegExp, attrs: Partial<ParaAttrs>): InputRule {
  return new InputRule(pattern, (state, _match, start, end) => {
    const $start = state.doc.resolve(start);
    if ($start.parent.type.name !== 'para' || $start.parentOffset !== 0) return null;
    const tr = state.tr.delete(start, end);
    const current = $start.parent.attrs as ParaAttrs;
    tr.setNodeMarkup($start.before(), undefined, {
      ...current,
      kind: 'p',
      list: null,
      indent: current.kind === 'li' ? current.indent : 0,
      ...attrs,
    });
    return tr;
  });
}

/** Our keys, shortcuts, guards and decorations. */
function phirExtension(bridge: Bridge): AnyExtension {
  return Extension.create({
    name: 'phir',
    priority: 1000,
    addKeyboardShortcuts() {
      const style = (attrs: Partial<ParaAttrs>) => () =>
        setListAttrs(this.editor.state, this.editor.view.dispatch, () => ({ list: null, indent: 0, ...attrs }));
      const list = (kind: ListKind) => () =>
        setListAttrs(this.editor.state, this.editor.view.dispatch, (a) =>
          a.kind === 'li' && a.list === kind ? { kind: 'p', list: null, indent: 0 } : { kind: 'li', list: kind },
        );
      const indent = (by: 1 | -1) => () => {
        const parent = this.editor.state.selection.$from.parent;
        if (parent.type.name !== 'para' || parent.attrs.kind !== 'li') return true;
        setListAttrs(this.editor.state, this.editor.view.dispatch, (a) =>
          a.kind === 'li' ? { indent: Math.max(0, Math.min(2, a.indent + by)) as 0 | 1 | 2 } : null,
        );
        return true;
      };
      return {
        'Mod-z': () => (bridge.undo(), true),
        'Mod-y': () => (bridge.redo(), true),
        'Shift-Mod-z': () => (bridge.redo(), true),
        'Mod-k': () => (bridge.openLink(), true),
        'Mod-f': () => (bridge.openFind(), true),
        'Mod-Alt-0': style({ kind: 'p' }),
        'Mod-Alt-1': style({ kind: 'h1' }),
        'Mod-Alt-2': style({ kind: 'h2' }),
        'Mod-Alt-3': style({ kind: 'h3' }),
        'Mod-Shift-7': list('number'),
        'Mod-Shift-8': list('bullet'),
        'Mod-Shift-9': list('check'),
        Tab: indent(1),
        'Shift-Tab': indent(-1),
        Enter: () => splitBlock(this.editor.state, this.editor.view.dispatch, bridge),
        Backspace: () => {
          const { state } = this.editor;
          const { $from, empty } = state.selection;
          if (!empty || $from.parentOffset !== 0 || $from.parent.type.name !== 'para') return false;
          const a = $from.parent.attrs as ParaAttrs;
          if (a.kind !== 'li') return false;
          // Backspace at the start of a list item first steps it out, then turns it back into Normal text.
          return setListAttrs(state, this.editor.view.dispatch, () =>
            a.indent > 0 ? { indent: (a.indent - 1) as 0 | 1 } : { kind: 'p', list: null, indent: 0 },
          );
        },
      };
    },
    addProseMirrorPlugins() {
      const key = new PluginKey('phir');
      const guard = new Plugin({
        key,
        filterTransaction: (tr, state) => {
          if (!tr.docChanged || tr.getMeta(engineMeta)) return true;
          if (!bridge.canEdit()) {
            bridge.blockedEdit();
            return false;
          }
          const result = keepsWhole(state.doc, tr.doc);
          if (result === 'ok') return true;
          bridge.note(result === 'clash' ? (tr.getMeta('uiEvent') === 'paste' ? PICK_FIRST : NOT_DELETED) : NOT_DELETED);
          return false;
        },
        props: {
          handleTextInput: (view, from) => {
            const $from = view.state.doc.resolve(from);
            if ($from.parent.type.name === 'title' && $from.parent.firstChild?.type.name === 'clash') {
              bridge.note(PICK_FIRST);
              return true;
            }
            return false;
          },
          handleKeyDown: (_view, event) => {
            if (bridge.canEdit()) return false;
            const typing = event.key.length === 1 || event.key === 'Enter' || event.key === 'Backspace' || event.key === 'Delete';
            if (typing && !event.ctrlKey && !event.metaKey) {
              bridge.blockedEdit();
              return true;
            }
            return false;
          },
          decorations: (state) => {
            const decos: Decoration[] = [];
            const below = bridge.belowBlocks();
            const focus = bridge.focusBlock();
            const blank = bridge.emptyBlank();
            const belowSlot = (at: number, id: string) =>
              Decoration.widget(
                at,
                () => {
                  const el = document.createElement('span');
                  el.className = 'pm-below';
                  el.contentEditable = 'false';
                  el.dataset.slot = 'below';
                  el.dataset.block = id;
                  return el;
                },
                { key: `below:${id}`, side: 1, ignoreSelection: true, stopEvent: () => true },
              );
            state.doc.forEach((node, pos, index) => {
              if (node.type.name === 'title') {
                if (node.content.size === 0) decos.push(Decoration.node(pos, pos + node.nodeSize, { class: 'is-empty', 'data-placeholder': UNTITLED }));
                if (below.has('title')) decos.push(belowSlot(pos + node.nodeSize - 1, 'title'));
                return;
              }
              const id = node.attrs.id ? String(node.attrs.id) : null;
              if (id && id === focus) decos.push(Decoration.node(pos, pos + node.nodeSize, { class: 'pm-focus' }));
              if (node.type.name !== 'para') return;
              const a = node.attrs as ParaAttrs;
              if (blank && index === 1 && node.content.size === 0) {
                // The tip is drawn by the paragraph itself, on its own line below the empty one.
                decos.push(
                  Decoration.node(pos, pos + node.nodeSize, {
                    class: 'is-empty pm-blank',
                    'data-placeholder': EMPTY_DOC,
                    'data-tip': EMPTY_TIP,
                  }),
                );
              }
              if (a.kind === 'li' && a.list === 'check' && id) {
                decos.push(
                  Decoration.widget(
                    pos + 1,
                    () => {
                      const box = document.createElement('span');
                      box.className = 'pm-tickslot';
                      box.contentEditable = 'false';
                      box.dataset.slot = 'tick';
                      box.dataset.block = id;
                      return box;
                    },
                    { key: `tick:${id}`, side: -1, ignoreSelection: true, stopEvent: () => true },
                  ),
                );
              }
              if (id && below.has(id)) decos.push(belowSlot(pos + node.nodeSize - 1, id));
            });
            decos.push(...bridge.extraDecorations(state.doc));
            return DecorationSet.create(state.doc, decos);
          },
        },
      });
      const shortcuts = inputRules({
        rules: [
          blockShortcut(/^#\s$/, { kind: 'h1' }),
          blockShortcut(/^##\s$/, { kind: 'h2' }),
          blockShortcut(/^###\s$/, { kind: 'h3' }),
          blockShortcut(/^[-*]\s$/, { kind: 'li', list: 'bullet' }),
          blockShortcut(/^1[.)]\s$/, { kind: 'li', list: 'number' }),
          blockShortcut(/^\[ ?\]\s$/, { kind: 'li', list: 'check' }),
        ],
      });
      return [guard, shortcuts];
    },
  });
}

export function makeExtensions(bridge: Bridge): AnyExtension[] {
  return [
    StarterKit.configure({
      document: false,
      paragraph: false,
      heading: false,
      blockquote: false,
      bulletList: false,
      orderedList: false,
      listItem: false,
      listKeymap: false,
      code: false,
      codeBlock: false,
      horizontalRule: false,
      hardBreak: false,
      strike: false,
      undoRedo: false,
      trailingNode: false,
      link: {
        openOnClick: false,
        autolink: false,
        linkOnPaste: true,
        isAllowedUri: (url) => linkAllowed(url),
        HTMLAttributes: { rel: 'noopener noreferrer nofollow', target: null },
      },
    }),
    PhirDoc,
    Title,
    Para,
    Clash,
    Table,
    phirExtension(bridge),
  ];
}

/** Put the cursor at a text offset inside a block (counting each clash box as one). */
export function selectInBlock(state: EditorState, blockId: string, offset: number | 'end'): Transaction | null {
  let found: Transaction | null = null;
  state.doc.forEach((node, pos) => {
    if (found || node.type.name !== 'para' || node.attrs.id !== blockId) return;
    const at = offset === 'end' ? node.content.size : Math.min(offset, node.content.size);
    found = state.tr.setSelection(TextSelection.create(state.doc, pos + 1 + at));
  });
  return found;
}

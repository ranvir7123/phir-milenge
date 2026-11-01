// Toolbar actions on the editor's own document. They change what's on screen; the pause-and-send step
// in Editor.tsx turns the result into intents, like typing.

import type { Editor as TiptapEditor } from '@tiptap/react';
import type { ListKind } from '../contracts';
import type { ParaAttrs } from './model';
import { setListAttrs } from './schema';

export type TextStyle = 'p' | 'h1' | 'h2' | 'h3';

export const STYLE_NAMES: Record<TextStyle, { long: string; short: string; keys: string }> = {
  p: { long: 'Normal text', short: 'Normal', keys: 'Ctrl+Alt+0' },
  h1: { long: 'Heading 1', short: 'H1', keys: 'Ctrl+Alt+1' },
  h2: { long: 'Heading 2', short: 'H2', keys: 'Ctrl+Alt+2' },
  h3: { long: 'Heading 3', short: 'H3', keys: 'Ctrl+Alt+3' },
};

export const LIST_NAMES: Record<ListKind, { name: string; keys: string }> = {
  bullet: { name: 'Bulleted list', keys: 'Ctrl+Shift+8' },
  number: { name: 'Numbered list', keys: 'Ctrl+Shift+7' },
  check: { name: 'Checklist', keys: 'Ctrl+Shift+9' },
};

export function currentBlock(ed: TiptapEditor): { where: 'title' | 'para' | 'other'; attrs: ParaAttrs | null } {
  const parent = ed.state.selection.$from.parent;
  if (parent.type.name === 'title') return { where: 'title', attrs: null };
  if (parent.type.name === 'para') return { where: 'para', attrs: parent.attrs as ParaAttrs };
  return { where: 'other', attrs: null };
}

export function setStyle(ed: TiptapEditor, kind: TextStyle): void {
  setListAttrs(ed.state, ed.view.dispatch, () => ({ kind, list: null, indent: 0 }));
  ed.view.focus();
}

export function toggleList(ed: TiptapEditor, list: ListKind): void {
  setListAttrs(ed.state, ed.view.dispatch, (a) =>
    a.kind === 'li' && a.list === list ? { kind: 'p', list: null, indent: 0 } : { kind: 'li', list },
  );
  ed.view.focus();
}

export function indentBy(ed: TiptapEditor, by: 1 | -1): void {
  setListAttrs(ed.state, ed.view.dispatch, (a) =>
    a.kind === 'li' ? { indent: Math.max(0, Math.min(2, a.indent + by)) as 0 | 1 | 2 } : null,
  );
  ed.view.focus();
}

export function toggleMark(ed: TiptapEditor, mark: 'bold' | 'italic' | 'underline'): void {
  const chain = ed.chain().focus();
  if (mark === 'bold') chain.toggleBold().run();
  else if (mark === 'italic') chain.toggleItalic().run();
  else chain.toggleUnderline().run();
}

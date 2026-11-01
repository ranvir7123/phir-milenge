// The phone toolbar (Undo | Redo | Normal ▾ | Bold | Insert | Replay) and the laptop toolbar, in the
// order docs/plan/2-user-experience.md gives. Buttons never take the cursor out of the doc.

import { useEffect, useReducer, useRef, useState, type ReactNode } from 'react';
import type { Editor as TiptapEditor } from '@tiptap/react';
import { Icon, type IconName } from './icons';
import { currentBlock, LIST_NAMES, setStyle, STYLE_NAMES, toggleList, toggleMark, type TextStyle } from './commands';

export type SheetName = 'text' | 'insert' | 'link' | 'table';

interface ToolbarProps {
  editor: TiptapEditor;
  layout: 'phone' | 'laptop';
  disabled: boolean;
  onUndo(): void;
  onRedo(): void;
  onSheet(sheet: SheetName): void;
  onOpen(what: 'replay' | 'find' | 'outline' | 'add-rule'): void;
  onBlocked(): void;
}

function Tool({
  icon,
  label,
  keys,
  on,
  onPress,
  children,
  className,
}: {
  icon?: IconName;
  label: string;
  keys?: string;
  on?: boolean;
  onPress(): void;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      className={`ed-tool${on ? ' is-on' : ''}${className ? ` ${className}` : ''}`}
      aria-label={label}
      aria-pressed={on === undefined ? undefined : on}
      title={keys ? `${label} (${keys})` : label}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onPress}
    >
      {icon && <Icon name={icon} />}
      {children}
    </button>
  );
}

function useEditorTick(editor: TiptapEditor) {
  const [, bump] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    editor.on('transaction', bump);
    editor.on('selectionUpdate', bump);
    editor.on('focus', bump);
    return () => {
      editor.off('transaction', bump);
      editor.off('selectionUpdate', bump);
      editor.off('focus', bump);
    };
  }, [editor]);
}

export function Toolbar({ editor, layout, disabled, onUndo, onRedo, onSheet, onOpen, onBlocked }: ToolbarProps) {
  useEditorTick(editor);
  const { where, attrs } = currentBlock(editor);
  const style: TextStyle = attrs && attrs.kind !== 'li' ? attrs.kind : 'p';
  const guard = (run: () => void) => () => (disabled ? onBlocked() : run());
  const marksOk = where === 'para';

  if (layout === 'phone') {
    return (
      <div className="ed-toolbar" role="toolbar" aria-label="Formatting">
        <Tool icon="undo" label="Undo" keys="Ctrl+Z" onPress={guard(onUndo)} />
        <Tool icon="redo" label="Redo" keys="Ctrl+Y" onPress={guard(onRedo)} />
        <Tool label={`Text style: ${STYLE_NAMES[style].long}`} className="ed-style" onPress={guard(() => onSheet('text'))}>
          <span>{STYLE_NAMES[style].short}</span>
          <Icon name="down" className="ed-caret" />
        </Tool>
        <Tool icon="bold" label="Bold" keys="Ctrl+B" on={marksOk && editor.isActive('bold')} onPress={guard(() => toggleMark(editor, 'bold'))} />
        <Tool icon="plus" label="Insert" onPress={guard(() => onSheet('insert'))} />
        <Tool icon="replay" label="Replay" onPress={() => onOpen('replay')} />
      </div>
    );
  }

  const list = attrs?.kind === 'li' ? attrs.list : null;
  return (
    <div className="ed-toolbar" role="toolbar" aria-label="Formatting">
      <Tool icon="undo" label="Undo" keys="Ctrl+Z" onPress={guard(onUndo)} />
      <Tool icon="redo" label="Redo" keys="Ctrl+Y" onPress={guard(onRedo)} />
      <span className="ed-sep" />
      <StyleMenu editor={editor} style={style} disabled={disabled} onBlocked={onBlocked} />
      <span className="ed-sep" />
      <Tool icon="bold" label="Bold" keys="Ctrl+B" on={marksOk && editor.isActive('bold')} onPress={guard(() => toggleMark(editor, 'bold'))} />
      <Tool icon="italic" label="Italic" keys="Ctrl+I" on={marksOk && editor.isActive('italic')} onPress={guard(() => toggleMark(editor, 'italic'))} />
      <Tool
        icon="underline"
        label="Underline"
        keys="Ctrl+U"
        on={marksOk && editor.isActive('underline')}
        onPress={guard(() => toggleMark(editor, 'underline'))}
      />
      <span className="ed-sep" />
      <Tool icon="bullet" label={LIST_NAMES.bullet.name} keys={LIST_NAMES.bullet.keys} on={list === 'bullet'} onPress={guard(() => toggleList(editor, 'bullet'))} />
      <Tool icon="number" label={LIST_NAMES.number.name} keys={LIST_NAMES.number.keys} on={list === 'number'} onPress={guard(() => toggleList(editor, 'number'))} />
      <Tool icon="check" label={LIST_NAMES.check.name} keys={LIST_NAMES.check.keys} on={list === 'check'} onPress={guard(() => toggleList(editor, 'check'))} />
      <span className="ed-sep" />
      <Tool icon="link" label="Link" keys="Ctrl+K" on={marksOk && editor.isActive('link')} onPress={guard(() => onSheet('link'))} />
      <span className="ed-sep" />
      <Tool icon="table" label="Table" onPress={guard(() => onSheet('table'))} />
      <Tool icon="rule" label="Add a rule" onPress={guard(() => onOpen('add-rule'))} />
      <span className="ed-sep" />
      <Tool icon="find" label="Find in doc" keys="Ctrl+F" onPress={() => onOpen('find')} />
      <Tool icon="outline" label="Outline" onPress={() => onOpen('outline')} />
      <span className="ed-sep" />
      <Tool icon="replay" label="Replay" onPress={() => onOpen('replay')} />
    </div>
  );
}

function StyleMenu({ editor, style, disabled, onBlocked }: { editor: TiptapEditor; style: TextStyle; disabled: boolean; onBlocked(): void }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('mousedown', close);
    return () => window.removeEventListener('mousedown', close);
  }, [open]);
  return (
    <div className="ed-menu-wrap" ref={wrap}>
      <Tool label={`Text style: ${STYLE_NAMES[style].long}`} className="ed-style ed-style-wide" onPress={() => (disabled ? onBlocked() : setOpen((o) => !o))}>
        <span>{STYLE_NAMES[style].long}</span>
        <Icon name="down" className="ed-caret" />
      </Tool>
      {open && (
        <div className="ed-menu" role="menu">
          {(Object.keys(STYLE_NAMES) as TextStyle[]).map((s) => (
            <button
              key={s}
              type="button"
              role="menuitemradio"
              aria-checked={s === style}
              className={`ed-menu-item st-${s}${s === style ? ' is-on' : ''}`}
              title={`${STYLE_NAMES[s].long} (${STYLE_NAMES[s].keys})`}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                setStyle(editor, s);
                setOpen(false);
              }}
            >
              {STYLE_NAMES[s].long}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

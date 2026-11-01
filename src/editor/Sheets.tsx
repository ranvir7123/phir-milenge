// The phone's Text and Insert sheets, the link box and card, and "New table".

import { useState } from 'react';
import type { Editor as TiptapEditor } from '@tiptap/react';
import type { ColumnDef, DocView, ItemId, Op } from '../contracts';
import { engine as model } from '../model';
import { Icon } from './icons';
import { Sheet } from './Sheet';
import type { SheetName } from './Toolbar';
import { currentBlock, indentBy, LIST_NAMES, setStyle, STYLE_NAMES, toggleList, toggleMark, type TextStyle } from './commands';
import { LINK_REFUSED, linkAllowed, normaliseLink } from './words';

interface SheetsProps {
  editor: TiptapEditor;
  sheet: SheetName;
  layout: 'phone' | 'laptop';
  view: DocView;
  onSheet(sheet: SheetName | null): void;
  onAddRule(): void;
  act(make: () => Op[]): void;
  say(text: string): void;
  flush(): boolean;
}

export function Sheets(props: SheetsProps) {
  const close = () => props.onSheet(null);
  if (props.sheet === 'text') return <TextSheet {...props} onClose={close} />;
  if (props.sheet === 'insert')
    return (
      <Sheet title="Insert" layout={props.layout} onClose={close} keepFocus>
        <div className="sh-grid">
          <button type="button" className="sh-choice" onClick={() => props.onSheet('table')}>
            <Icon name="table" />
            Table
          </button>
          <button type="button" className="sh-choice" onClick={() => props.onSheet('link')}>
            <Icon name="link" />
            Link
          </button>
          <button
            type="button"
            className="sh-choice"
            onClick={() => {
              close();
              props.onAddRule();
            }}
          >
            <Icon name="rule" />
            Rule
          </button>
        </div>
      </Sheet>
    );
  if (props.sheet === 'link') return <LinkSheet {...props} onClose={close} />;
  return <TableSheet {...props} onClose={close} />;
}

function TextSheet({ editor, layout, onClose }: SheetsProps & { onClose(): void }) {
  const { attrs, where } = currentBlock(editor);
  const style: TextStyle = attrs && attrs.kind !== 'li' ? attrs.kind : 'p';
  const list = attrs?.kind === 'li' ? attrs.list : null;
  const [, setTick] = useState(0);
  const after = (run: () => void) => () => {
    run();
    setTick((n) => n + 1);
  };
  const marksOk = where === 'para';
  return (
    <Sheet title="Text" layout={layout} onClose={onClose} keepFocus>
      <div className="sh-styles" role="radiogroup" aria-label="Text style">
        {(Object.keys(STYLE_NAMES) as TextStyle[]).map((s) => (
          <button
            key={s}
            type="button"
            role="radio"
            aria-checked={s === style && !list}
            className={`sh-style st-${s}${s === style && !list ? ' is-on' : ''}`}
            onClick={after(() => setStyle(editor, s))}
          >
            {STYLE_NAMES[s].long}
          </button>
        ))}
      </div>
      <div className="sh-row" role="group" aria-label="Bold, italic, underline">
        {(['bold', 'italic', 'underline'] as const).map((m) => (
          <button
            key={m}
            type="button"
            className={`ed-tool sh-tool${marksOk && editor.isActive(m) ? ' is-on' : ''}`}
            aria-label={m[0]!.toUpperCase() + m.slice(1)}
            aria-pressed={marksOk && editor.isActive(m)}
            onClick={after(() => toggleMark(editor, m))}
          >
            <Icon name={m} />
          </button>
        ))}
      </div>
      <div className="sh-row" role="group" aria-label="Lists">
        {(['bullet', 'number', 'check'] as const).map((l) => (
          <button
            key={l}
            type="button"
            className={`ed-tool sh-tool${list === l ? ' is-on' : ''}`}
            aria-label={LIST_NAMES[l].name}
            aria-pressed={list === l}
            onClick={after(() => toggleList(editor, l))}
          >
            <Icon name={l} />
          </button>
        ))}
        <button type="button" className="ed-tool sh-tool" aria-label="Indent" disabled={!list} onClick={after(() => indentBy(editor, 1))}>
          <Icon name="indent" />
        </button>
        <button type="button" className="ed-tool sh-tool" aria-label="Outdent" disabled={!list} onClick={after(() => indentBy(editor, -1))}>
          <Icon name="outdent" />
        </button>
      </div>
    </Sheet>
  );
}

function LinkSheet({ editor, layout, onClose, say }: SheetsProps & { onClose(): void }) {
  const { from, to, empty } = editor.state.selection;
  const existing = editor.getAttributes('link').href as string | undefined;
  const [href, setHref] = useState(existing ?? '');
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const inTitle = currentBlock(editor).where !== 'para';
  const apply = () => {
    const address = normaliseLink(href);
    if (!href.trim() || !linkAllowed(address)) {
      setError(LINK_REFUSED);
      return;
    }
    if (inTitle) {
      say('Links go in the page, not the title.');
      onClose();
      return;
    }
    if (empty && !existing) {
      const words = text.trim() || href.trim();
      editor.chain().focus().insertContent({ type: 'text', text: words, marks: [{ type: 'link', attrs: { href: address } }] }).run();
    } else {
      editor.chain().focus().setTextSelection({ from, to }).extendMarkRange('link').setLink({ href: address }).run();
    }
    onClose();
  };
  return (
    <Sheet
      title={existing ? 'Change link' : 'Add a link'}
      layout={layout}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="ed-btn" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="ed-btn ed-main" onClick={apply}>
            {existing ? 'Save link' : 'Add link'}
          </button>
        </>
      }
    >
      {empty && !existing && (
        <label className="sh-field">
          <span>Text to show</span>
          <input value={text} onChange={(e) => setText(e.target.value)} autoComplete="off" />
        </label>
      )}
      <label className="sh-field">
        <span>Web address</span>
        <input
          value={href}
          inputMode="url"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          placeholder="example.org, a phone number or an email"
          onChange={(e) => {
            setHref(e.target.value);
            setError(null);
          }}
          onKeyDown={(e) => e.key === 'Enter' && apply()}
          aria-invalid={error ? true : undefined}
        />
      </label>
      {error && (
        <p className="sh-error" role="alert">
          <Icon name="alert" />
          {error}
        </p>
      )}
    </Sheet>
  );
}

/** The card a tapped link opens: its address, Open, Change link, Remove link. */
export function LinkCard({
  editor,
  href,
  layout,
  onChange,
  onClose,
}: {
  editor: TiptapEditor;
  href: string;
  layout: 'phone' | 'laptop';
  onChange(): void;
  onClose(): void;
}) {
  const ok = linkAllowed(href);
  return (
    <Sheet
      title="Link"
      layout={layout}
      onClose={onClose}
      footer={
        <>
          <button
            type="button"
            className="ed-btn"
            onClick={() => {
              editor.chain().focus().extendMarkRange('link').unsetLink().run();
              onClose();
            }}
          >
            Remove link
          </button>
          <button type="button" className="ed-btn" onClick={onChange}>
            Change link
          </button>
          {ok && (
            <a className="ed-btn ed-main" href={href} target="_blank" rel="noopener noreferrer nofollow" onClick={onClose}>
              Open
            </a>
          )}
        </>
      }
    >
      <p className="lc-href">{href}</p>
      <p className="lc-note">Opens in your browser. Needs the internet.</p>
    </Sheet>
  );
}

function TableSheet({ editor, layout, view, onClose, act }: SheetsProps & { onClose(): void }) {
  const tableNames = view.blocks.filter((b) => b.table).map((b) => b.table!.name.shown?.value ?? '');
  const firstFree = () => {
    for (let n = 1; ; n++) if (!tableNames.some((t) => t.trim().toLowerCase() === `table ${n}`)) return `Table ${n}`;
  };
  const [name, setName] = useState(firstFree);
  const [cols, setCols] = useState<ColumnDef[]>([
    { name: '', kind: 'words' },
    { name: '', kind: 'words' },
  ]);
  const [error, setError] = useState<string | null>(null);
  const create = () => {
    const n = name.trim();
    if (!n) return setError('Give the table a name.');
    if (tableNames.some((t) => t.trim().toLowerCase() === n.toLowerCase())) return setError(`There's already a table called ${n}.`);
    const defs = cols.map((c) => ({ ...c, name: c.name.trim() })).filter((c) => c.name);
    if (defs.length === 0) return setError('Name at least one column.');
    const seen = new Set<string>();
    for (const c of defs) {
      if (seen.has(c.name.toLowerCase())) return setError(`Two columns are called ${c.name}.`);
      seen.add(c.name.toLowerCase());
    }
    // The table goes after the block the cursor is in.
    let after: ItemId | null = null;
    const index = editor.state.selection.$from.index(0);
    editor.state.doc.forEach((node, _pos, i) => {
      if (i <= index && i > 0 && node.attrs.id) after = String(node.attrs.id);
    });
    if (index === 0 && view.blocks.length) after = null;
    act(() => model.intents.createTable(view, after, n, defs).ops);
    onClose();
  };
  return (
    <Sheet
      title="New table"
      layout={layout}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="ed-btn" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="ed-btn ed-main" onClick={create}>
            Insert table
          </button>
        </>
      }
    >
      <label className="sh-field">
        <span>Name</span>
        <input
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setError(null);
          }}
        />
      </label>
      <p className="sh-label">Columns</p>
      {cols.map((c, i) => (
        <div className="tb-colrow" key={i}>
          <input
            className="tb-colname"
            aria-label={`Column ${i + 1} name`}
            placeholder={`Column ${i + 1}`}
            value={c.name}
            onChange={(e) => {
              setCols(cols.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)));
              setError(null);
            }}
          />
          <div className="tb-kind" role="radiogroup" aria-label={`Column ${i + 1} kind`}>
            {(['words', 'number'] as const).map((k) => (
              <button
                key={k}
                type="button"
                role="radio"
                aria-checked={c.kind === k}
                className={`tb-kindbtn${c.kind === k ? ' is-on' : ''}`}
                onClick={() => setCols(cols.map((x, j) => (j === i ? { ...x, kind: k } : x)))}
              >
                {k === 'words' ? 'Words' : 'Number'}
              </button>
            ))}
          </div>
          {cols.length > 1 && (
            <button type="button" className="ed-tool" aria-label={`Remove column ${i + 1}`} onClick={() => setCols(cols.filter((_, j) => j !== i))}>
              <Icon name="close" />
            </button>
          )}
        </div>
      ))}
      {cols.length < 8 && (
        <button type="button" className="ed-quiet sh-add" onClick={() => setCols([...cols, { name: '', kind: 'words' }])}>
          <Icon name="plus" />
          Add a column
        </button>
      )}
      {error && (
        <p className="sh-error" role="alert">
          <Icon name="alert" />
          {error}
        </p>
      )}
    </Sheet>
  );
}

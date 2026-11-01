// Find in doc (no replace), the outline and the word count.

import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Editor as TiptapEditor } from '@tiptap/react';
import type { DocView, ItemId } from '../contracts';
import { Icon } from './icons';
import { WriterMark } from './Lanes';
import { findInDoc } from './glow';
import { Sheet } from './Sheet';
import { cutName, keyKind, writerName } from './words';

/** What Find is looking for, so lanes and table cells can light up their matches too. */
export const FindQuery = createContext('');

/** Text with every match of the current Find lit up. */
export function Hl({ text }: { text: string }): ReactNode {
  const query = useContext(FindQuery).trim().toLocaleLowerCase();
  if (!query) return text;
  const lower = text.toLocaleLowerCase();
  const parts: ReactNode[] = [];
  let at = 0;
  let hit = lower.indexOf(query);
  while (hit >= 0) {
    if (hit > at) parts.push(text.slice(at, hit));
    parts.push(
      <mark className="pm-find" key={hit}>
        {text.slice(hit, hit + query.length)}
      </mark>,
    );
    at = hit + query.length;
    hit = lower.indexOf(query, at);
  }
  if (at < text.length) parts.push(text.slice(at));
  return <>{parts}</>;
}

function count(text: string, query: string): number {
  let n = 0;
  const lower = text.toLocaleLowerCase();
  let at = lower.indexOf(query);
  while (at >= 0) {
    n++;
    at = lower.indexOf(query, at + query.length);
  }
  return n;
}

type Match = { block: ItemId | null; index: number; doc: number | null; from?: number };

/** Matches the editor can't light up itself: versions in lanes and table cells, by block. */
function extraMatches(view: DocView, query: string): { block: ItemId | null; n: number }[] {
  const out: { block: ItemId | null; n: number }[] = [];
  if (view.title.state === 'clash') {
    const n = view.title.lanes.reduce((sum, l) => sum + count(l.value ?? '', query), 0);
    if (n) out.push({ block: null, n });
  }
  for (const b of view.blocks) {
    let n = 0;
    for (const s of b.sentences) if (s.field.state === 'clash') for (const l of s.field.lanes) n += count(l.value ?? '', query);
    if (b.table) {
      n += count(b.table.name.shown?.value ?? '', query);
      for (const row of b.table.rows)
        for (const cell of Object.values(row.cells)) {
          if (cell.state === 'clash') for (const l of cell.lanes) n += count(l.value ?? '', query);
          else n += count(cell.shown?.value ?? '', query);
        }
    }
    if (n) out.push({ block: b.id, n });
  }
  return out;
}

export function FindBar({
  editor,
  view,
  onChange,
  onJump,
  onClose,
}: {
  editor: TiptapEditor;
  view: DocView;
  onChange(find: { query: string; current: number } | null): void;
  onJump(block: ItemId): void;
  onClose(): void;
}) {
  const [query, setQuery] = useState('');
  const [current, setCurrent] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => input.current?.focus(), []);
  const q = query.trim().toLocaleLowerCase();

  const matches = useMemo<Match[]>(() => {
    if (!q) return [];
    const order = new Map<ItemId | null, number>([[null, -1]]);
    view.blocks.forEach((b, i) => order.set(b.id, i));
    const docHits = findInDoc(editor.state.doc, q);
    const list: (Match & { rank: number })[] = docHits.map((m, i) => ({
      block: m.block,
      index: 0,
      doc: i,
      from: m.from,
      rank: (order.get(m.block) ?? -1) * 2,
    }));
    for (const e of extraMatches(view, q))
      for (let i = 0; i < e.n; i++) list.push({ block: e.block, index: 0, doc: null, rank: (order.get(e.block) ?? -1) * 2 + 1 });
    list.sort((a, b) => a.rank - b.rank || (a.from ?? 0) - (b.from ?? 0));
    return list.map((m, i) => ({ ...m, index: i }));
  }, [q, view, editor.state.doc]);

  const at = matches.length ? Math.min(current, matches.length - 1) : 0;
  const here = matches[at];
  useEffect(() => {
    onChange(q ? { query: q, current: here?.doc ?? -1 } : null);
  }, [q, here?.doc, onChange]);

  const go = (to: number) => {
    if (!matches.length) return;
    const next = (to + matches.length) % matches.length;
    setCurrent(next);
    const m = matches[next]!;
    if (m.from !== undefined) {
      try {
        const dom = editor.view.domAtPos(m.from).node;
        (dom.nodeType === 1 ? (dom as HTMLElement) : dom.parentElement)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      } catch {
        /* nothing to scroll to */
      }
    } else if (m.block) onJump(m.block);
  };

  return (
    <FindQuery.Provider value={q}>
      <div className="ed-find" role="search">
        <Icon name="find" />
        <input
          ref={input}
          className="ed-find-box"
          type="search"
          value={query}
          placeholder="Find in doc"
          aria-label="Find in doc"
          onChange={(e) => {
            setQuery(e.target.value);
            setCurrent(0);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              go(e.shiftKey ? at - 1 : at + 1);
            }
            if (e.key === 'Escape') onClose();
          }}
        />
        <span className="ed-find-count" aria-live="polite">
          {q ? (matches.length ? `${at + 1} of ${matches.length}` : 'No matches') : ''}
        </span>
        <button type="button" className="ed-tool" aria-label="Previous match" title="Previous match (Shift+Enter)" onClick={() => go(at - 1)} disabled={!matches.length}>
          <Icon name="up" />
        </button>
        <button type="button" className="ed-tool" aria-label="Next match" title="Next match (Enter)" onClick={() => go(at + 1)} disabled={!matches.length}>
          <Icon name="down" />
        </button>
        <button type="button" className="ed-tool" aria-label="Close find" title="Close (Esc)" onClick={onClose}>
          <Icon name="close" />
        </button>
      </div>
    </FindQuery.Provider>
  );
}

/** How many things need a look in each block: open clashes and broken rules. */
function lookCounts(view: DocView): Map<ItemId, number> {
  const counts = new Map<ItemId, number>();
  const add = (b: ItemId) => counts.set(b, (counts.get(b) ?? 0) + 1);
  for (const key of view.needsLook.clashes) {
    const kind = keyKind(key);
    if (kind === 'title' || kind === 'rule' || kind === 'settle' || kind === 'other') continue;
    const block = key.split('/')[1];
    if (block) add(block);
  }
  for (const r of view.rules) if (r.result.state === 'broken') for (const b of new Set(r.result.where.map((w) => w.block))) add(b);
  return counts;
}

export function outlineItems(view: DocView): { id: ItemId; level: 1 | 2 | 3 | 4; text: string; table: boolean; look: number }[] {
  const looks = lookCounts(view);
  const items: { id: ItemId; level: 1 | 2 | 3 | 4; text: string; table: boolean; look: number }[] = [];
  let section: (typeof items)[number] | null = null;
  let lastLevel: 1 | 2 | 3 = 1;
  for (const b of view.blocks) {
    const kind = b.style.kind;
    if (kind === 'h1' || kind === 'h2' || kind === 'h3') {
      const level = Number(kind[1]) as 1 | 2 | 3;
      const text = b.sentences
        .map((s) => (s.field.state === 'clash' ? (s.field.lanes.at(-1)?.value ?? '') : (s.field.shown?.value ?? '')))
        .join('')
        .trim();
      section = { id: b.id, level, text: text || 'Untitled heading', table: false, look: looks.get(b.id) ?? 0 };
      lastLevel = level;
      items.push(section);
      continue;
    }
    const n = looks.get(b.id) ?? 0;
    if (kind === 'table' && b.table) {
      items.push({
        id: b.id,
        level: Math.min(4, (section ? lastLevel : 0) + 1) as 1 | 2 | 3 | 4,
        text: b.table.name.shown?.value ?? b.table.name.lanes.at(-1)?.value ?? 'Table',
        table: true,
        look: n,
      });
    }
    if (section && n) section.look += n;
  }
  return items;
}

export function OutlinePanel({
  view,
  layout,
  onJump,
  onClose,
}: {
  view: DocView;
  layout: 'phone' | 'laptop';
  onJump(block: ItemId): void;
  onClose(): void;
}) {
  const items = outlineItems(view);
  const list = items.length ? (
    <ul className="ol-list">
      {items.map((it) => (
        <li key={it.id} style={{ paddingLeft: (it.level - 1) * 16 }}>
          <button
            type="button"
            className={`ol-item ol-l${it.level}${it.table ? ' ol-table' : ''}`}
            onClick={() => {
              onJump(it.id);
              if (layout === 'phone') onClose();
            }}
          >
            {it.table && <Icon name="table" />}
            <span className="ol-text">{it.text}</span>
            {it.look > 0 && (
              <span className="ol-look">
                <Icon name="alert" />
                {it.look} to look at
              </span>
            )}
          </button>
        </li>
      ))}
    </ul>
  ) : (
    <p className="ol-empty">No headings yet. Use Heading 1, 2 or 3 and they'll show here.</p>
  );
  if (layout === 'laptop')
    return (
      <nav className="ol-pane" aria-label="Outline">
        <div className="ol-head">
          <span>Outline</span>
          <button type="button" className="ed-tool" aria-label="Close outline" title="Close outline" onClick={onClose}>
            <Icon name="close" />
          </button>
        </div>
        {list}
      </nav>
    );
  return (
    <Sheet title="Outline" layout={layout} onClose={onClose}>
      {list}
    </Sheet>
  );
}

function words(text: string): number {
  return text.trim() ? text.trim().split(/\s+/).length : 0;
}

export function countWords(view: DocView) {
  const byPerson = new Map<string, number>();
  let total = 0;
  let chars = 0;
  let bothVersions = 0;
  const add = (text: string, actor: string | undefined) => {
    const n = words(text);
    total += n;
    chars += text.replace(/\n/g, '').length;
    if (actor && n) byPerson.set(actor, (byPerson.get(actor) ?? 0) + n);
  };
  const title = view.title;
  if (title.state === 'clash') for (const l of title.lanes) add(l.value ?? '', l.actor);
  else add(title.shown?.value ?? '', title.shown?.actor);
  let tables = 0;
  let rows = 0;
  for (const b of view.blocks) {
    for (const s of b.sentences) {
      if (s.field.state === 'clash') {
        bothVersions++;
        for (const l of s.field.lanes) add(l.value ?? '', l.actor);
      } else add(s.field.shown?.value ?? '', s.field.shown?.actor);
    }
    if (b.table) {
      tables++;
      for (const row of b.table.rows) {
        if (row.alive.state === 'one' && row.alive.shown?.value !== true) continue;
        rows++;
        for (const cell of Object.values(row.cells)) {
          if (cell.state === 'clash') for (const l of cell.lanes) add(l.value ?? '', l.actor);
          else add(cell.shown?.value ?? '', cell.shown?.actor);
        }
      }
    }
  }
  return { total, chars, tables, rows, bothVersions, byPerson };
}

export function WordCount({
  view,
  layout,
  selected,
  onClose,
}: {
  view: DocView;
  layout: 'phone' | 'laptop';
  selected?: number;
  onClose(): void;
}) {
  const c = countWords(view);
  const people = [...c.byPerson.entries()].sort((a, b) => b[1] - a[1]);
  return (
    <Sheet title="Word count" layout={layout} onClose={onClose}>
      <p className="wc-main">
        {selected ? `${selected.toLocaleString('en-IN')} of ${c.total.toLocaleString('en-IN')} words selected` : `${c.total.toLocaleString('en-IN')} words`}
        {' · '}
        {c.chars.toLocaleString('en-IN')} characters
      </p>
      {c.tables > 0 && (
        <p className="wc-line">
          {c.tables} {c.tables === 1 ? 'table' : 'tables'}, {c.rows} {c.rows === 1 ? 'row' : 'rows'}
        </p>
      )}
      {c.bothVersions > 0 && (
        <p className="wc-line">
          Includes both versions of {c.bothVersions} {c.bothVersions === 1 ? 'sentence' : 'sentences'}.
        </p>
      )}
      {people.length > 0 && (
        <>
          <p className="wc-head">By person</p>
          <ul className="wc-people">
            {people.map(([actor, n]) => (
              <li key={actor}>
                <WriterMark view={view} actor={actor} />
                <span className="wc-name">{cutName(writerName(view, actor))}</span>
                <span className="wc-n">{n.toLocaleString('en-IN')}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </Sheet>
  );
}

// The docs home (2-user-experience.md, "Getting in", part 8): every doc on this phone.
import { useState } from 'react';
import type { DeviceRecord, DocId, TemplateInfo } from '../../contracts';
import type { HomeDocRecord } from '../../store';
import { Icon, Warn } from '../../shared/icons';
import { nameWithPlace, shortName } from '../../shared/names';
import { formatTime } from '../../shared/time';
import { WriterMark } from '../../shared/writer';
import { lastLine, writersLine } from '../summary';
import type { Notice, OfflineStatus } from '../state';
import { NoticeBar, OfflineLine } from './Parts';
import { TemplateCards } from './TemplateCards';

export interface HomeProps {
  layout: 'phone' | 'laptop';
  me: DeviceRecord;
  docs: HomeDocRecord[];
  now: number;
  offline: OfflineStatus;
  notice: Notice | null;
  storageLow: boolean;
  onOpen(docId: DocId): void;
  onNew(t: TemplateInfo): void;
  onMenu(docId: DocId): void;
  onMe(): void;
  onCatch(): void;
  onOpenFile(): void;
  onSaveBackup(): void;
}

function Writers({ doc }: { doc: HomeDocRecord }) {
  const { shown, more } = writersLine(doc.summary?.writers ?? []);
  if (!shown.length) return null;
  return (
    <span className="doc-writers">
      {shown.map((w, i) => (
        <span key={w.actor} className="doc-writer">
          <WriterMark colour={w.colour} />
          {shortName(w.name)}
          {i < shown.length - 1 || more ? ',' : ''}
        </span>
      ))}
      {more > 0 && <span className="doc-writer">+{more}</span>}
    </span>
  );
}

function NeedsLook({ doc }: { doc: HomeDocRecord }) {
  if (!doc.summary?.needsLook) return null;
  return (
    <span className="doc-needs warn-line">
      <Warn size={16} />
      <span>{doc.summary.needsLook}</span>
    </span>
  );
}

function words(doc: HomeDocRecord): string {
  return doc.summary ? doc.summary.words.map((w) => w[0]!.toUpperCase() + w.slice(1)).join(' ') : '';
}

function last(doc: HomeDocRecord, now: number): string {
  const l = doc.summary?.last ?? null;
  return l ? lastLine(l, formatTime(l.t, now, 'ago')) : '';
}

function MoreButton({ doc, onMenu }: { doc: HomeDocRecord; onMenu(docId: DocId): void }) {
  return (
    <button type="button" className="icon-btn" aria-label={`More for ${doc.title}`} title="More" onClick={() => onMenu(doc.docId)}>
      <Icon name="more" />
    </button>
  );
}

function PhoneList({ docs, now, onOpen, onMenu }: { docs: HomeDocRecord[]; now: number; onOpen(id: DocId): void; onMenu(id: DocId): void }) {
  return (
    <ul className="doc-list">
      {docs.map((d) => (
        <li key={d.docId} className="doc-row">
          <button type="button" className="doc-row-main" onClick={() => onOpen(d.docId)}>
            <span className="doc-title-text one-line">{d.title}</span>
            <span className="quiet doc-small">{last(d, now)}</span>
            <Writers doc={d} />
            {words(d) && <span className="quiet doc-small">{words(d)}</span>}
            <NeedsLook doc={d} />
          </button>
          <MoreButton doc={d} onMenu={onMenu} />
        </li>
      ))}
    </ul>
  );
}

function LaptopTable({ docs, now, onOpen, onMenu }: { docs: HomeDocRecord[]; now: number; onOpen(id: DocId): void; onMenu(id: DocId): void }) {
  return (
    <table className="doc-table">
      <thead>
        <tr>
          <th>Title</th>
          <th>Writers</th>
          <th>Last change</th>
          <th>Truck back words</th>
          <th>
            <span className="visually-hidden">More</span>
          </th>
        </tr>
      </thead>
      <tbody>
        {docs.map((d) => (
          <tr key={d.docId}>
            <td>
              <button type="button" className="doc-table-open" onClick={() => onOpen(d.docId)}>
                <span className="doc-title-text one-line">{d.title}</span>
                <NeedsLook doc={d} />
              </button>
            </td>
            <td>
              <Writers doc={d} />
            </td>
            <td className="quiet">{last(d, now)}</td>
            <td className="quiet">{words(d)}</td>
            <td className="doc-table-more">
              <MoreButton doc={d} onMenu={onMenu} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function Home(p: HomeProps) {
  const [search, setSearch] = useState('');
  const q = search.trim().toLowerCase();
  const docs = q ? p.docs.filter((d) => d.title.toLowerCase().includes(q) || words(d).toLowerCase().includes(q)) : p.docs;
  const laptop = p.layout === 'laptop';
  const chip = nameWithPlace(shortName(p.me.name), p.me.place ? shortName(p.me.place) : undefined);

  const catchOpen = (
    <>
      <button type="button" className="ui-btn ui-btn-tall" onClick={p.onCatch}>
        <Icon name="catch" />
        Catch a doc
      </button>
      <button type="button" className="ui-btn ui-btn-tall" onClick={p.onOpenFile}>
        <Icon name="file" />
        Open a file
      </button>
    </>
  );

  return (
    <div className={`home home-${p.layout}`}>
      <header className="home-top">
        <h1 className="display home-title">Phir Milenge</h1>
        <button type="button" className="name-chip one-line" onClick={p.onMe} title={nameWithPlace(p.me.name, p.me.place)}>
          {chip}
        </button>
        {laptop && <div className="home-top-buttons">{catchOpen}</div>}
      </header>

      <main className="home-body">
        {p.storageLow && (
          <div className="home-warn warn-line" role="alert">
            <Warn size={18} />
            <span>
              This phone has room for about 2 more days of writing. Save a backup file, then free up space.{' '}
              <button type="button" className="inline-link" onClick={p.onSaveBackup}>
                Save a file
              </button>
            </span>
          </div>
        )}

        <section aria-labelledby="home-new">
          <h2 id="home-new" className="home-h2">
            Start a new doc
          </h2>
          <TemplateCards onPick={p.onNew} layout={laptop ? 'grid' : 'row'} />
        </section>

        <section aria-labelledby="home-docs">
          <h2 id="home-docs" className="home-h2">
            Docs on this phone
          </h2>
          {p.docs.length > 8 && (
            <label className="home-search">
              <Icon name="search" />
              <span className="visually-hidden">Search docs</span>
              <input className="field" type="search" placeholder="Search docs" value={search} onChange={(e) => setSearch(e.target.value)} />
            </label>
          )}
          {p.docs.length === 0 ? (
            <p className="quiet home-empty">No docs on this phone. Start a new one, or catch one from a friend.</p>
          ) : laptop ? (
            <LaptopTable docs={docs} now={p.now} onOpen={p.onOpen} onMenu={p.onMenu} />
          ) : (
            <PhoneList docs={docs} now={p.now} onOpen={p.onOpen} onMenu={p.onMenu} />
          )}
        </section>

        <OfflineLine status={p.offline} showReady={false} />
      </main>

      <NoticeBar notice={p.notice} />
      {!laptop && <nav className="bottom-bar">{catchOpen}</nav>}
    </div>
  );
}

// ?play=demo: the four starting docs at a glance, worked out live from the files the setup page loads.
// Rehearsal uses this to check each device's truck back, and how long each file takes to beam.

import { useMemo } from 'react';
import type { Change, Fingerprint } from '../contracts';
import { engine } from '../model';
import { TruckArt } from '../panels/TruckBack';
import { truckWords } from '../panels/format';
import { Warn } from '../shared/icons';
import { WriterMark } from '../shared/writer';
import { BEAM_BYTES_PER_SECOND, BEAM_SECONDS_CAP } from './scenario';
import { fromBase64 } from './setup';
import { EVERYTHING_SIZE, STARTING_FILES } from './starting-files';
import { WRITERS, type DemoWriter } from './writers';
import './demo.css';

interface Card {
  key: string;
  writer: DemoWriter;
  heading: string;
  fileName: string | null;
  size: number;
  changes: number;
  clashes: number;
  broken: number;
  fingerprint: Fingerprint;
}

type Worked = { ok: true; cards: Card[] } | { ok: false; message: string };

const kb = (bytes: number) => `${(bytes / 1024).toFixed(1)} KB`;
const seconds = (bytes: number) => `${(bytes / BEAM_BYTES_PER_SECOND).toFixed(1)} s`;

function workOut(): Worked {
  const cards: Card[] = [];
  const everything = new Map<string, Change>();
  let docId = '';
  for (const who of ['base', 'rina', 'asif', 'tanmoy'] as const) {
    const file = STARTING_FILES[who];
    const read = engine.decodePhir(fromBase64(file.phir));
    if (!read.ok) return { ok: false, message: `${file.fileName} couldn't be read (${read.reason}). Run npm run demo:docs.` };
    docId = read.docId;
    for (const c of read.changes) everything.set(c.id, c);
    const doc = engine.openDoc(read.docId, WRITERS[who].actor, read.changes);
    const view = doc.view();
    cards.push({
      key: who,
      writer: WRITERS[who],
      heading: WRITERS[who].name,
      fileName: file.fileName,
      size: file.size,
      changes: read.changes.length,
      clashes: view.needsLook.clashes.length,
      broken: view.needsLook.broken.length,
      fingerprint: doc.fingerprint(),
    });
  }
  // Base camp after catching everyone. The catch notes aren't in these files, but notes are left
  // out of the truck back, so the words match what Base camp shows on stage.
  const all = engine.openDoc(docId, WRITERS.base.actor, [...everything.values()]);
  const view = all.view();
  cards.push({
    key: 'all',
    writer: WRITERS.base,
    heading: 'Base camp, after catching Rina and Tanmoy',
    fileName: null,
    size: EVERYTHING_SIZE,
    changes: everything.size,
    clashes: view.needsLook.clashes.length,
    broken: view.needsLook.broken.length,
    fingerprint: all.fingerprint(),
  });
  return { ok: true, cards };
}

function DocCard({ card, sameAs }: { card: Card; sameAs: Card | undefined }) {
  const slow = card.size / BEAM_BYTES_PER_SECOND > BEAM_SECONDS_CAP;
  return (
    <article className={`dp-doc${card.fileName ? '' : ' is-all'}`}>
      <h2 className="dp-doc-who">
        <WriterMark colour={card.writer.colour} height={18} />
        <span>{card.heading}</span>
      </h2>
      <p className="dp-file">{card.fileName ?? 'Not a starting file: this is what the stage builds up to.'}</p>
      <div className="ds-truck">
        <TruckArt hex={card.fingerprint.hex} className="ds-truck-art" />
        <div className="ds-truck-text">
          <span className="ds-truck-label">Truck back</span>
          <span className="ds-truck-words">
            {truckWords(card.fingerprint.words)} <span className="ds-truck-digits">{card.fingerprint.digits}</span>
          </span>
        </div>
      </div>
      {sameAs && <p className="dp-same quiet">Same truck back as {sameAs.heading}, so the same doc: {sameAs.heading} has already caught everything here.</p>}
      <dl className="dp-facts">
        <dt>Size</dt>
        <dd>{kb(card.size)}</dd>
        <dt>One beam</dt>
        <dd className={slow ? 'warn-word' : undefined}>
          {seconds(card.size)}
          {slow ? `, over ${BEAM_SECONDS_CAP} s` : ''}
        </dd>
        <dt>Changes</dt>
        <dd>{card.changes}</dd>
        <dt>Needs a look</dt>
        <dd>
          {card.clashes} {card.clashes === 1 ? 'clash' : 'clashes'}, {card.broken} broken {card.broken === 1 ? 'rule' : 'rules'}
        </dd>
      </dl>
    </article>
  );
}

export function Playground() {
  const worked = useMemo(workOut, []);
  return (
    <main className="ds-page dp-page">
      <header className="ds-head">
        <p className="ds-kicker">Playground · demo</p>
        <h1 className="display ds-title">The demo's starting docs</h1>
        <p className="ds-sub">
          What each device holds after the demo setup page, worked out from the same files. Beam times use {BEAM_BYTES_PER_SECOND / 1024} KB a second, the estimate until
          the beam test gives a real number.
        </p>
      </header>
      {worked.ok ? (
        <div className="dp-docs">
          {worked.cards.map((c, i) => (
            <DocCard key={c.key} card={c} sameAs={worked.cards.slice(0, i).find((o) => o.fingerprint.hex === c.fingerprint.hex)} />
          ))}
        </div>
      ) : (
        <p className="warn-line" role="alert">
          <Warn />
          <span>
            <b>Can't read the starting docs.</b> {worked.message}
          </span>
        </p>
      )}
      <p>
        <a className="ui-btn ui-btn-tall" href="?demo-setup">
          Open the demo setup page
        </a>
      </p>
    </main>
  );
}

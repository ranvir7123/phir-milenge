// Track A's practice page, opened with ?play=engine: three made-up phones share one doc through the real engine.
// Type on any phone, sync any two in any order, and watch the truck back words come together.

import { useState } from 'react';
import type { BlockView, DocView, Field, WriterColour } from '../contracts';
import { ASIF, RINA, TANMOY } from '../contracts/fixtures';
import { Engine } from './engine';
import { intents } from './intents';
import './playground.css';

const DOC = 'play0000play0000play0000play0000';

interface Phone {
  id: string;
  name: string;
  colour: WriterColour;
}

const PHONES: Phone[] = [
  { id: RINA, name: 'Rina', colour: 'yellow' },
  { id: ASIF, name: 'Asif', colour: 'orange' },
  { id: TANMOY, name: 'Tanmoy', colour: 'pink' },
];

const COLOUR_VAR: Record<WriterColour, string> = {
  yellow: 'var(--w-yellow)',
  orange: 'var(--w-orange)',
  pink: 'var(--w-pink)',
  red: 'var(--w-red)',
  plain: 'var(--quiet)',
};

/** Rina writes the doc; Asif and Tanmoy get it from her, each picks a name and colour, and all three swap names. */
function startPhones(): Engine[] {
  const t = Date.now();
  const rina = new Engine(DOC, RINA);
  const one = intents.insertBlock(rina.view(), null, { kind: 'p' }, 'Gosaba ferry runs every hour. Water tanks are half full.');
  rina.commit([...intents.setTitle(rina.view(), 'Camp log, Gosaba'), ...one.ops], { t });
  const two = intents.insertBlock(rina.view(), one.block, { kind: 'p' }, 'Medicine came on Monday. The road to Basanti is open.');
  rina.commit([...two.ops, ...intents.setWriterName(RINA, 'Rina'), ...intents.setWriterColour(RINA, 'yellow')], { t: t + 1 });
  const phones = PHONES.map((p) => {
    if (p.id === RINA) return rina;
    const e = new Engine(DOC, p.id, [...rina.changes()]);
    e.commit([...intents.setWriterName(p.id, p.name), ...intents.setWriterColour(p.id, p.colour)], { t: t + 2 });
    return e;
  });
  const names = phones.flatMap((e) => [...e.changes()]);
  return phones.map((e) => new Engine(DOC, e.me, names)); // every phone starts with every change
}

/** The words of a paragraph that can be typed over: every sentence except those with two versions. */
function typeable(b: BlockView): string {
  return b.sentences
    .filter((s) => s.field.state !== 'clash')
    .map((s) => (typeof s.field.shown?.value === 'string' ? s.field.shown.value : ''))
    .join('');
}

function writerName(view: DocView, actor: string): string {
  return view.writers[actor]?.name || PHONES.find((p) => p.id === actor)?.name || 'Someone';
}

function writerColour(view: DocView, actor: string): string {
  const c = view.writers[actor]?.colour ?? PHONES.find((p) => p.id === actor)?.colour ?? 'plain';
  return COLOUR_VAR[c];
}

export function Playground() {
  const [phones, setPhones] = useState(startPhones);
  const [, setVersion] = useState(0);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [said, setSaid] = useState<Record<string, string>>({});
  const redraw = () => setVersion((v) => v + 1);

  const draftKey = (phone: number, block: string) => `${phone}|${block}`;

  /** Saves what this phone has typed as one change. Returns how many paragraphs changed. */
  const saveDrafts = (i: number, d: Record<string, string>): number => {
    const e = phones[i]!;
    const view = e.view();
    const ops = [];
    let n = 0;
    for (const b of view.blocks) {
      const text = d[draftKey(i, b.id)];
      if (text === undefined || text === typeable(b)) continue;
      ops.push(...intents.setText(e.view(), b.id, text));
      n++;
    }
    if (ops.length > 0) e.commit(ops);
    return n;
  };

  const withoutDrafts = (d: Record<string, string>, which: number[]) =>
    Object.fromEntries(Object.entries(d).filter(([k]) => !which.includes(Number(k.split('|')[0]))));

  const save = (i: number) => {
    const n = saveDrafts(i, drafts);
    setDrafts(withoutDrafts(drafts, [i]));
    setSaid({ ...said, [i]: n === 0 ? 'Nothing new to save.' : `Saved ${n === 1 ? '1 paragraph' : `${n} paragraphs`} as 1 change.` });
    redraw();
  };

  /** Both phones save what they've typed, then each catches everything the other has. */
  const syncPair = (i: number, j: number, d: Record<string, string>, words: Record<string, string>) => {
    saveDrafts(i, d);
    saveDrafts(j, d);
    const a = phones[i]!;
    const b = phones[j]!;
    const ra = a.receive([...b.changes()], { actor: b.me, via: 'beam' });
    const rb = b.receive([...a.changes()], { actor: a.me, via: 'beam' });
    const line = (n: number, from: number) =>
      n === 0 ? `Already caught up with ${PHONES[from]!.name}.` : `Caught ${n === 1 ? '1 new change' : `${n} new changes`} from ${PHONES[from]!.name}.`;
    words[i] = line(ra.newEdits.length, j);
    words[j] = line(rb.newEdits.length, i);
  };

  const sync = (i: number, j: number) => {
    const words = { ...said };
    syncPair(i, j, drafts, words);
    setDrafts(withoutDrafts(drafts, [i, j]));
    setSaid(words);
    redraw();
  };

  const syncEveryone = () => {
    const words: Record<string, string> = {};
    syncPair(0, 1, drafts, words);
    syncPair(1, 2, {}, words);
    syncPair(0, 2, {}, words);
    for (const k of Object.keys(words)) words[k] = 'Synced with everyone.';
    setDrafts({});
    setSaid(words);
    redraw();
  };

  const undo = (i: number) => {
    const c = phones[i]!.undo();
    setDrafts(withoutDrafts(drafts, [i]));
    setSaid({ ...said, [i]: c ? 'Took back your last change.' : 'Nothing of yours left to take back.' });
    redraw();
  };

  const keep = (i: number, field: Field<unknown>, ref: string) => {
    saveDrafts(i, drafts);
    setDrafts(withoutDrafts(drafts, [i]));
    phones[i]!.commit(intents.pick(field, ref));
    setSaid({ ...said, [i]: 'Kept one version. The other is kept behind it.' });
    redraw();
  };

  const showBoth = (i: number, field: Field<unknown>) => {
    saveDrafts(i, drafts);
    setDrafts(withoutDrafts(drafts, [i]));
    phones[i]!.commit(intents.unpick(field));
    setSaid({ ...said, [i]: 'Both versions are back.' });
    redraw();
  };

  const startAgain = () => {
    setPhones(startPhones());
    setDrafts({});
    setSaid({});
  };

  const prints = phones.map((e) => e.fingerprint());
  const allSame = prints.every((p) => p.hex === prints[0]!.hex);
  // Edits any phone has, so each phone can say how many it is missing.
  const everyEdit = new Set<string>();
  for (const e of phones) for (const c of e.changes()) if (c.kind === 'edit') everyEdit.add(c.id);

  return (
    <main className="eng-page">
      <header className="eng-head">
        <h1 className="eng-title">Engine playground</h1>
        <p className="eng-lead">
          Three made-up phones share one doc. Type on any phone, then sync any two, in any order. Once every phone has every
          change, all three show the same truck back words.
        </p>
        <div className="eng-actions">
          <button type="button" className="eng-btn eng-btn-main" onClick={syncEveryone}>
            Sync everyone
          </button>
          <button type="button" className="eng-btn" onClick={startAgain}>
            Start again
          </button>
        </div>
        <p className="eng-status" aria-live="polite">
          {allSame ? (
            <>
              All three phones show the same doc: <span className="eng-status-words">{prints[0]!.words.join(' ')}</span>
            </>
          ) : (
            'The phones show different docs. Keep syncing: once each phone has every change, they match.'
          )}
        </p>
      </header>

      <div className="eng-phones">
        {phones.map((e, i) => {
          const phone = PHONES[i]!;
          const view = e.view();
          const print = prints[i]!;
          const has = new Set(e.changes().map((c) => c.id));
          const missing = [...everyEdit].filter((id) => !has.has(id)).length;
          const edits = e.changes().filter((c) => c.kind === 'edit').length; // notes of who caught what aren't counted
          const title = view.title.shown?.value ?? view.title.lanes[0]?.value ?? 'Untitled doc';
          return (
            <section key={phone.id} className="eng-phone" style={{ borderTopColor: COLOUR_VAR[phone.colour] }} aria-label={`${phone.name}'s phone`}>
              <h2 className="eng-phone-name">{phone.name}'s phone</h2>

              <div className="eng-truck">
                <span className="eng-label">Truck back</span>
                <span className="eng-words">
                  {print.words.join(' ')} <span className="eng-digits">{print.digits}</span>
                </span>
                <span className="eng-quiet">
                  {edits} changes{missing > 0 ? ` · missing ${missing} the others have` : ' · has every change'}
                </span>
              </div>

              <h3 className="eng-doc-title">{String(title)}</h3>
              {view.blocks
                .filter((b) => !b.table)
                .map((b, n) => {
                  const k = draftKey(i, b.id);
                  const clashes = b.sentences.filter((s) => s.field.state === 'clash');
                  const kept = b.sentences.filter((s) => s.field.state === 'one' && s.field.kept.length > 0 && s.field.pickedBy);
                  return (
                    <div key={b.id} className="eng-para">
                      <label className="eng-label" htmlFor={`eng-${i}-${b.id}`}>
                        Paragraph {n + 1}
                      </label>
                      <textarea
                        id={`eng-${i}-${b.id}`}
                        className="eng-box"
                        value={drafts[k] ?? typeable(b)}
                        onChange={(ev) => setDrafts({ ...drafts, [k]: ev.target.value })}
                        rows={3}
                      />
                      {clashes.map((s) => (
                        <div key={s.id} className="eng-clash">
                          <p className="eng-clash-head">Two versions of one sentence</p>
                          {s.field.lanes.map((l) => (
                            <div key={l.ref} className="eng-lane" style={{ borderLeftColor: writerColour(view, l.actor) }}>
                              <p className="eng-lane-text">
                                <span className="eng-lane-who">{writerName(view, l.actor)}:</span>{' '}
                                {l.value === null ? <em>Deleted by {writerName(view, l.actor)}</em> : String(l.value)}
                              </p>
                              <button type="button" className="eng-btn eng-btn-small" onClick={() => keep(i, s.field, l.ref)}>
                                Keep this one
                              </button>
                            </div>
                          ))}
                        </div>
                      ))}
                      {kept.map((s) => (
                        <div key={s.id} className="eng-kept">
                          <p className="eng-quiet">
                            {writerName(view, s.field.pickedBy!)} kept “{String(s.field.shown?.value ?? '').trim()}” · {s.field.kept.length}{' '}
                            other
                          </p>
                          <button type="button" className="eng-btn eng-btn-small" onClick={() => showBoth(i, s.field)}>
                            Show both again
                          </button>
                        </div>
                      ))}
                    </div>
                  );
                })}
              {view.blocks.some((b) => b.sentences.some((s) => s.field.state === 'clash')) && (
                <p className="eng-quiet eng-note">A sentence with two versions stays out of the box until someone keeps one.</p>
              )}

              <div className="eng-row">
                <button type="button" className="eng-btn eng-btn-main" onClick={() => save(i)}>
                  Save
                </button>
                <button type="button" className="eng-btn" onClick={() => undo(i)}>
                  Undo
                </button>
              </div>
              <div className="eng-row">
                {PHONES.map((other, j) =>
                  j === i ? null : (
                    <button key={other.id} type="button" className="eng-btn" onClick={() => sync(i, j)}>
                      Sync with {other.name}
                    </button>
                  ),
                )}
              </div>
              <p className="eng-said" aria-live="polite">
                {said[i] ?? ' '}
              </p>
            </section>
          );
        })}
      </div>
    </main>
  );
}

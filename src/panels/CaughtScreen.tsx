// What you read after a catch. The lorry drives across (still for reduced motion), then the summary.
// Spec: 2-user-experience.md, "What they read after the catch".

import { useMemo, useState } from 'react';
import type { CaughtScreenProps, Fingerprint } from '../contracts';
import { summarise, type CatchSummary } from './catchSummary';
import { colourOf, cutName, truckWords } from './format';
import { AlertIcon, BeamIcon, LorryArt, PairIcon } from './icons';
import { TruckArt, TruckFull } from './TruckBack';
import './panels.css';

/** How many writer rows a phone shows before "and 4 more". */
const PHONE_ROWS = 3;

function safeFingerprint(engine: CaughtScreenProps['engine']): Fingerprint | null {
  try {
    return engine.fingerprint();
  } catch {
    return null;
  }
}

export function CaughtScreen({ engine, view, result, fromName, onBeamBack, onReadNew, onDone, bigScreen, layout }: CaughtScreenProps) {
  // Worked out once, when the screen opens: the catch it describes doesn't change.
  const [now] = useState(() => Date.now());
  const summary: CatchSummary = useMemo(() => summarise(engine, view, result, fromName, now), [engine, view, result, fromName, now]);
  const fp = useMemo(() => safeFingerprint(engine), [engine, view]);
  const [allWriters, setAllWriters] = useState(false);
  const [full, setFull] = useState(false);
  const name = cutName(fromName);
  const beamLabel = `Beam back to ${name}`;

  return (
    <section className={`pn pn-caught${bigScreen ? ' pn-big' : ''}`} aria-labelledby="pn-caught-title">
      <div className="pn-road">
        <LorryArt className="pn-lorry pn-lorry-drive" />
      </div>

      {summary.kind === 'new' ? (
        <div className="pn-sum">
          <h2 id="pn-caught-title">{summary.title}</h2>
          <p className="pn-lead">{summary.lead}</p>

          {summary.writers.length > 0 && (
            <div className="pn-writers">
              {(allWriters || layout === 'laptop' ? summary.writers : summary.writers.slice(0, PHONE_ROWS)).map((w) => {
                const c = colourOf(view, w.actor);
                return (
                  <div key={w.actor} className={`pn-who${c ? '' : ' pn-plain'}`} style={c ? ({ '--c': c } as React.CSSProperties) : undefined}>
                    <span className="pn-who-name">{w.head}</span>
                    <span className="pn-who-sub">{w.sub}</span>
                  </div>
                );
              })}
              {!allWriters && layout !== 'laptop' && summary.writers.length > PHONE_ROWS && (
                <button type="button" className="pn-link pn-small" style={{ alignSelf: 'flex-start' }} onClick={() => setAllWriters(true)}>
                  and {summary.writers.length - PHONE_ROWS} more
                </button>
              )}
            </div>
          )}

          {summary.flags.map((f, i) =>
            f.kind === 'rule' ? (
              <div key={i} className="pn-flag pn-flag-bad">
                <AlertIcon />
                <div>
                  <b>Rule broken:</b> {f.text.replace(/^Rule broken: /, '')}
                </div>
              </div>
            ) : (
              <div key={i} className="pn-flag">
                <PairIcon />
                <div>
                  <b>Two versions</b> {f.text.replace(/^Two versions /, '')}
                </div>
              </div>
            ),
          )}

          {summary.decisions.length > 0 && (
            <ul className="pn-decisions">
              {summary.decisions.map((d) => (
                <li key={d}>{d}</li>
              ))}
            </ul>
          )}

          {fp && (
            <button type="button" className="pn-tbline" onClick={() => setFull(true)} aria-label={`Your doc now: ${truckWords(fp.words)}. Open the truck back full screen.`}>
              <TruckArt hex={fp.hex} />
              <span style={{ minWidth: 0 }}>
                <span className="pn-tbline-label">Your doc now</span>
                <span className="pn-tbline-words">{truckWords(fp.words)}</span>
              </span>
            </button>
          )}

          {summary.evenLine && <p className="pn-small pn-quiet">{summary.evenLine}</p>}

          <div className="pn-acts">
            {summary.beamBack && (
              <button type="button" className="pn-btn pn-btn-beam pn-btn-bar" onClick={onBeamBack}>
                <BeamIcon />
                {beamLabel}
              </button>
            )}
            <button type="button" className={`pn-btn pn-btn-bar${summary.beamBack ? '' : ' pn-btn-main'}`} onClick={onReadNew}>
              Read what's new
            </button>
            <button type="button" className="pn-btn pn-btn-bar" onClick={onDone}>
              Done
            </button>
          </div>
        </div>
      ) : (
        <div className="pn-even">
          {summary.kind === 'behind' ? (
            <>
              <h2 id="pn-caught-title">{summary.title}</h2>
              <p>{summary.body}</p>
              <div className="pn-acts" style={{ marginTop: 8 }}>
                <button type="button" className="pn-btn pn-btn-beam pn-btn-bar" onClick={onBeamBack}>
                  <BeamIcon />
                  {beamLabel}
                </button>
                <button type="button" className="pn-btn pn-btn-bar" onClick={onDone}>
                  Back to the doc
                </button>
              </div>
            </>
          ) : (
            <>
              <h2 id="pn-caught-title">Already caught up with {name}.</h2>
              <p>{summary.body}</p>
              <div className="pn-acts" style={{ marginTop: 8 }}>
                <button type="button" className="pn-btn pn-btn-main pn-btn-bar" onClick={onDone}>
                  Back to the doc
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {full && fp && <TruckFull fp={fp} big={bigScreen} onClose={() => setFull(false)} />}
    </section>
  );
}

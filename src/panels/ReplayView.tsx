// Replay: the doc played back from empty to now, one tick per change in its writer's colour.
// Every phone with the same doc plays the same replay. You can't type here; "Back to now" returns.
// Spec: 1-features.md feature 6 and 2-user-experience.md's edge-case table (ticks merge, up to 64×).

import { useEffect, useMemo, useRef, useState } from 'react';
import type { BlockView, DocView, ReplayStep, ReplayViewProps } from '../contracts';
import { clockTime, colourOf, cutName, nameOf, num } from './format';
import { shownText } from './fields';
import { LeftIcon, PairIcon, PauseIcon, PlayIcon } from './icons';
import './panels.css';

const SPEEDS = [1, 2, 4, 8, 16, 32, 64];
/** How long one change stays on screen at 1×. */
const STEP_MS = 700;
/** Ticks narrower than this merge with their neighbours. */
const MIN_TICK = 4;

type Load = { state: 'loading' } | { state: 'error' } | { state: 'ready'; steps: ReplayStep[] };

export function ReplayView({ engine, view, bigScreen, onClose }: ReplayViewProps) {
  const [load, setLoad] = useState<Load>({ state: 'loading' });
  const [at, setAt] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);

  // Worked out after the first paint, so a long doc shows "Getting the replay ready…" instead of freezing.
  useEffect(() => {
    const t = window.setTimeout(() => {
      try {
        setLoad({ state: 'ready', steps: engine.replay() });
      } catch {
        setLoad({ state: 'error' });
      }
    }, 30);
    return () => window.clearTimeout(t);
  }, [engine]);

  const steps = load.state === 'ready' ? load.steps : [];
  const last = steps.length - 1;

  useEffect(() => {
    if (!playing) return;
    if (at >= last) {
      setPlaying(false);
      return;
    }
    const t = window.setTimeout(() => setAt((i) => Math.min(i + 1, last)), STEP_MS / speed);
    return () => window.clearTimeout(t);
  }, [playing, at, last, speed]);

  const places = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of engine.changes()) if (c.place) m.set(c.id, c.place);
    return m;
  }, [engine]);

  const step = steps[Math.min(at, last)];
  const play = () => {
    if (at >= last) setAt(0);
    setPlaying((p) => !p || at >= last);
  };

  return (
    <div className={`pn pn-full pn-replay${bigScreen ? ' pn-big' : ''}`} role="dialog" aria-modal="true" aria-label="Replay">
      <div className="pn-full-top">
        <button type="button" className="pn-back" onClick={onClose}>
          <LeftIcon />
          Back to now
        </button>
        <span className="pn-replay-name">Replay</span>
      </div>

      {load.state === 'loading' && <p className="pn-replay-note pn-quiet">Getting the replay ready…</p>}
      {load.state === 'error' && (
        <div className="pn-replay-note" role="alert">
          <p>Replay couldn't open this doc. Your doc is unchanged.</p>
          <button type="button" className="pn-btn pn-btn-main pn-btn-bar" onClick={onClose}>
            Back to now
          </button>
        </div>
      )}
      {load.state === 'ready' && steps.length === 0 && (
        <div className="pn-replay-note">
          <p>Nothing to replay yet. Write something, then come back.</p>
          <button type="button" className="pn-btn pn-btn-main pn-btn-bar" onClick={onClose}>
            Back to now
          </button>
        </div>
      )}

      {step && (
        <>
          <div className="pn-replay-status" aria-live="polite">
            <p className="pn-replay-count">
              Edit {num(at + 1)} of {num(steps.length)}
            </p>
            <p className="pn-quiet">{longTime(step.t)}</p>
            <p className={`pn-who${colourOf(view, step.actor) ? '' : ' pn-plain'}`} style={{ '--c': colourOf(view, step.actor) ?? undefined } as React.CSSProperties}>
              {cutName(nameOf(view, step.actor))} is writing{places.get(step.change) ? `, at ${places.get(step.change)}` : ''}
            </p>
          </div>
          <div className="pn-replay-page">
            <DocPreview view={step.view} />
          </div>
          <div className="pn-replay-bar">
            <Ticks steps={steps} at={at} view={view} />
            <input
              className="pn-slider"
              type="range"
              min={0}
              max={last}
              value={at}
              aria-label="Edit to show"
              aria-valuetext={`Edit ${num(at + 1)} of ${num(steps.length)}`}
              onChange={(e) => {
                setPlaying(false);
                setAt(Number(e.target.value));
              }}
            />
            <div className="pn-replay-buttons">
              <button type="button" className="pn-btn pn-btn-bar" onClick={play} aria-label={playing ? 'Pause' : 'Play'}>
                {playing ? <PauseIcon /> : <PlayIcon />}
                {playing ? 'Pause' : 'Play'}
              </button>
              <button
                type="button"
                className="pn-btn pn-btn-bar"
                aria-label={`Speed ${speed} times. ${speed === SPEEDS[SPEEDS.length - 1] ? 'Tap to go back to 1 time.' : 'Tap for faster.'}`}
                onClick={() => setSpeed((s) => SPEEDS[(SPEEDS.indexOf(s) + 1) % SPEEDS.length]!)}
              >
                {speed}×
              </button>
              <button type="button" className="pn-btn pn-btn-main pn-btn-bar" onClick={onClose}>
                Back to now
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/** "Sunday, 2:14 pm" */
function longTime(t: number): string {
  return `${new Date(t).toLocaleDateString('en-IN', { weekday: 'long' })}, ${clockTime(t)}`;
}

/** One tick per change; when they'd be thinner than MIN_TICK, nearby ones merge into one wider tick. */
function Ticks({ steps, at, view }: { steps: ReplayStep[]; at: number; view: DocView }) {
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(320);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth || 320));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const groups = useMemo(() => {
    const count = Math.max(1, Math.min(steps.length, Math.floor(width / MIN_TICK)));
    const out: { from: number; to: number; colour: string | null }[] = [];
    for (let g = 0; g < count; g++) {
      const from = Math.floor((g * steps.length) / count);
      const to = Math.floor(((g + 1) * steps.length) / count) - 1;
      // The writer with the most changes in the group gives it its colour.
      const tally = new Map<string, number>();
      for (let i = from; i <= to; i++) tally.set(steps[i]!.actor, (tally.get(steps[i]!.actor) ?? 0) + 1);
      const top = [...tally.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
      out.push({ from, to, colour: colourOf(view, top) });
    }
    return out;
  }, [steps, width, view]);
  return (
    <div className="pn-ticks" ref={box} aria-hidden="true">
      {groups.map((g) => (
        <span
          key={g.from}
          className={`pn-tick${g.colour ? '' : ' pn-tick-plain'}${at >= g.from && at <= g.to ? ' pn-tick-now' : ''}${at < g.from ? ' pn-tick-later' : ''}`}
          style={g.colour ? { background: g.colour } : undefined}
        />
      ))}
    </div>
  );
}

/** The doc as it stood at this step, read-only. */
function DocPreview({ view }: { view: DocView }) {
  const title = shownText(view.title);
  return (
    <article className="pn-preview">
      <h1>{title || 'Untitled doc'}</h1>
      {view.blocks.length === 0 && <p className="pn-quiet">The doc is empty here.</p>}
      {view.blocks.map((b) => (
        <PreviewBlock key={b.id} block={b} />
      ))}
    </article>
  );
}

function PreviewBlock({ block }: { block: BlockView }) {
  if (block.table) {
    const t = block.table;
    const cols = t.columns;
    return (
      <div className="pn-preview-table">
        <p className="pn-preview-tname">{shownText(t.name) || 'Table'}</p>
        <div className="pn-preview-scroll">
          <table>
            <thead>
              <tr>
                {cols.map((c) => (
                  <th key={c.id}>{c.def.shown?.value?.name ?? c.def.lanes[0]?.value?.name ?? ''}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {t.rows.map((r) => (
                <tr key={r.id}>
                  {cols.map((c) => {
                    const f = r.cells[c.id];
                    return <td key={c.id}>{f ? (f.state === 'clash' ? <TwoVersions text={String(f.lanes[0]?.value ?? '')} /> : shownText(f)) : ''}</td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }
  const parts = block.sentences.map((s) =>
    s.field.state === 'clash' ? <TwoVersions key={s.id} text={String(s.field.lanes[0]?.value ?? '')} /> : <span key={s.id}>{shownText(s.field)} </span>,
  );
  const k = block.style.kind;
  if (k === 'h1' || k === 'h2' || k === 'h3') return <h2 className={`pn-preview-${k}`}>{parts}</h2>;
  if (k === 'li') {
    const mark = block.style.list === 'number' ? `${block.number ?? 1}.` : block.style.list === 'check' ? (block.tick?.shown?.value ? '☑' : '☐') : '•';
    return (
      <p className="pn-preview-li" style={{ marginLeft: `${(block.style.indent ?? 0) * 1.2}em` }}>
        <span className="pn-preview-mark">{mark}</span>
        <span>{parts}</span>
      </p>
    );
  }
  return <p>{parts}</p>;
}

function TwoVersions({ text }: { text: string }) {
  return (
    <span className="pn-preview-two">
      <PairIcon size={14} /> {text}{' '}
    </span>
  );
}

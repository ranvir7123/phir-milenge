// The 1,000-order self-test: the doc rebuilt from its own changes in 1,000 shuffled arrival orders, each
// compared with the real truck back. It's 1,000 tries, so the screen never says "proven".
// Spec: 1-features.md feature 14; the difference screen is in 2-user-experience.md's edge-case table.

import { useEffect, useMemo, useRef, useState } from 'react';
import type { Change, DocEngine, Fingerprint, SelfTestResult, SelfTestViewProps } from '../contracts';
import { runSelfTest } from './engineLink';
import { num, truckWords } from './format';
import { AlertIcon, LeftIcon } from './icons';
import { TruckArt } from './TruckBack';
import { truckImage } from './truckPattern';
import './panels.css';

const ORDERS = 1000;
/** A slow laptop runs this many instead, and says so. */
const SLOW_ORDERS = 100;
/** Orders per slice of work, so the screen keeps moving while the test runs. */
const CHUNK = 20;
/** If 1,000 orders look like taking longer than this, run 100. */
const SLOW_MS = 20_000;

type Differ = SelfTestResult['differing'][number];

interface Run {
  total: number;
  done: number;
  same: number;
  expected: Fingerprint | null;
  differing: Differ[];
  slow: boolean;
  stopped: boolean;
  /** The doc has no changes yet, so there's nothing to rebuild. */
  empty: boolean;
  error: string | null;
}

const fresh = (): Run => ({ total: ORDERS, done: 0, same: 0, expected: null, differing: [], slow: false, stopped: false, empty: false, error: null });

function safeChanges(engine: DocEngine): readonly Change[] {
  try {
    return engine.changes();
  } catch {
    return [];
  }
}

function safePrint(engine: DocEngine): Fingerprint | null {
  try {
    return engine.fingerprint();
  } catch {
    return null;
  }
}

export function SelfTestView({ engine, bigScreen, layout, onClose }: SelfTestViewProps) {
  const [run, setRun] = useState<Run>(fresh);
  const [attempt, setAttempt] = useState(0);
  const stop = useRef(false);
  const mine = useMemo(() => safePrint(engine), [engine]);

  useEffect(() => {
    const changes = safeChanges(engine);
    let state = fresh();
    let chunk = 0;
    let timer = 0;
    let cancelled = false;
    stop.current = false;
    setRun(state);
    if (changes.length === 0) {
      setRun({ ...state, empty: true });
      return;
    }
    const step = () => {
      if (cancelled) return;
      if (stop.current) {
        setRun((state = { ...state, stopped: true }));
        return;
      }
      const n = Math.min(CHUNK, state.total - state.done);
      const start = performance.now();
      let r: SelfTestResult;
      try {
        // A different seed per slice, so no two slices shuffle the same way.
        r = runSelfTest(changes, n, chunk + 1);
      } catch (e) {
        setRun((state = { ...state, error: e instanceof Error ? e.message : String(e) }));
        return;
      }
      const perOrder = (performance.now() - start) / n;
      state = {
        ...state,
        done: state.done + n,
        same: state.same + r.same,
        expected: state.expected ?? r.fingerprint,
        differing: [...state.differing, ...r.differing.map((d) => ({ ...d, run: d.run + state.done }))],
      };
      if (chunk === 0 && perOrder * ORDERS > SLOW_MS) state = { ...state, total: SLOW_ORDERS, slow: true };
      chunk++;
      setRun(state);
      if (state.done < state.total) timer = window.setTimeout(step, 0);
    };
    timer = window.setTimeout(step, 60);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [engine, attempt]);

  const finished = run.done >= run.total && !run.error && !run.empty;
  const running = !finished && !run.stopped && !run.error && !run.empty;
  const fp = run.expected ?? mine;
  const columns = layout === 'phone' && !bigScreen ? 25 : 40;

  const save = () => {
    const body = JSON.stringify(
      { what: 'Orders the 1,000-order test rebuilt differently', doc: engine.docId, expected: run.expected?.hex, orders: run.differing },
      null,
      2,
    );
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([body], { type: 'application/json' }));
    a.download = `relay-docs-${run.differing.length}-orders.json`;
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  return (
    <div className={`pn pn-full${bigScreen ? ' pn-big' : ''}`} role="dialog" aria-modal="true" aria-label="The 1,000-order test">
      <div className="pn-full-top">
        <button type="button" className="pn-back" onClick={onClose}>
          <LeftIcon />
          Back to the doc
        </button>
      </div>
      <div className={`pn-test${layout === 'laptop' || bigScreen ? ' pn-test-wide' : ''}`}>
        <div className="pn-test-side">
          {fp && <TruckArt hex={fp.hex} className="pn-truck-art pn-test-truck" />}
          {fp && (
            <p className="pn-test-words">
              {truckWords(fp.words)} <span className="pn-quiet">{fp.digits}</span>
            </p>
          )}
          <Headline run={run} finished={finished} running={running} />
        </div>
        <div className="pn-test-main">
          {!run.error && !run.empty && <Grid run={run} columns={columns} />}
          {run.differing.length > 0 && finished && (
            <ol className="pn-test-orders pn-small">
              {run.differing.slice(0, 6).map((d) => (
                <li key={d.run}>
                  Order {num(d.run + 1)}: ended on <strong>{truckWords(d.fingerprint.words)}</strong> after {num(d.order.length)} changes
                </li>
              ))}
              {run.differing.length > 6 && <li className="pn-more">and {num(run.differing.length - 6)} more</li>}
            </ol>
          )}
          <div className="pn-acts">
            {running && (
              <button type="button" className="pn-btn pn-btn-bar" onClick={() => (stop.current = true)}>
                Stop
              </button>
            )}
            {finished && run.differing.length > 0 && (
              <button type="button" className="pn-btn pn-btn-main pn-btn-bar" onClick={save}>
                Save the {num(run.differing.length)} {run.differing.length === 1 ? 'order' : 'orders'}
              </button>
            )}
            {(finished || run.stopped || run.error) && (
              <button type="button" className="pn-btn pn-btn-bar" onClick={() => setAttempt((a) => a + 1)}>
                Run it again
              </button>
            )}
            {!running && (
              <button type="button" className={`pn-btn pn-btn-bar${(finished && run.differing.length === 0) || run.empty ? ' pn-btn-main' : ''}`} onClick={onClose}>
                Back to the doc
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Headline({ run, finished, running }: { run: Run; finished: boolean; running: boolean }) {
  const total = num(run.total);
  const slowLine = run.slow ? <p className="pn-small pn-quiet">This laptop is slow for {num(ORDERS)} orders, so it ran {num(SLOW_ORDERS)} shuffled orders instead.</p> : null;
  if (run.empty) {
    return (
      <div className="pn-test-head">
        <h2>Nothing to test yet</h2>
        <p className="pn-quiet">This doc has no changes yet. Write something, then come back.</p>
      </div>
    );
  }
  if (run.error) {
    return (
      <div className="pn-test-head" role="alert">
        <h2>The test couldn't run</h2>
        <p className="pn-quiet">{run.error} Your doc is unchanged.</p>
      </div>
    );
  }
  if (running) {
    return (
      <div className="pn-test-head" aria-live="polite">
        <h2>
          {num(run.done)} of {total}
        </h2>
        <p className="pn-quiet">Rebuilding this doc from its changes, each time in a different shuffled order.</p>
        <div className="pn-progress" role="progressbar" aria-valuemin={0} aria-valuemax={run.total} aria-valuenow={run.done}>
          <span style={{ width: `${(run.done / run.total) * 100}%` }} />
        </div>
        {slowLine}
      </div>
    );
  }
  if (run.stopped) {
    return (
      <div className="pn-test-head">
        <h2>Stopped at {num(run.done)} of {total}</h2>
        <p className="pn-quiet">
          {num(run.same)} of {num(run.done)} came out the same. Your doc is unchanged.
        </p>
      </div>
    );
  }
  if (finished && run.differing.length === 0) {
    return (
      <div className="pn-test-head" aria-live="polite">
        <h2>
          {total} of {total} the same
        </h2>
        <p className="pn-quiet">
          {total} shuffled orders, all the same truck back. Each time every change was rebuilt, clashes, picks and rules included.
        </p>
        {slowLine}
      </div>
    );
  }
  const n = run.differing.length;
  return (
    <div className="pn-test-head" role="alert">
      <h2 className="pn-test-bad">
        <AlertIcon size={26} />
        {num(run.same)} of {total} the same.
      </h2>
      <p>
        {num(n)} {n === 1 ? 'order' : 'orders'} came out different. {n === 1 ? "It's" : "They're"} outlined and listed below. That's a bug in how Relay Docs merges. Your doc is unchanged,
        because the test only used a copy.
      </p>
      {slowLine}
    </div>
  );
}

/** One small truck back per order: the expected picture when it matched, its own picture with a warning outline when not. */
function Grid({ run, columns }: { run: Run; columns: number }) {
  const same = useMemo(() => (run.expected ? truckImage(run.expected.hex) : null), [run.expected]);
  const bad = useMemo(() => new Map(run.differing.map((d) => [d.run, truckImage(d.fingerprint.hex)])), [run.differing]);
  const cells = [];
  for (let i = 0; i < run.total; i++) {
    const img = i < run.done ? (bad.get(i) ?? same) : null;
    cells.push(<span key={i} className={`pn-cell${bad.has(i) ? ' pn-cell-bad' : ''}`} style={img ? { backgroundImage: img } : undefined} />);
  }
  return (
    <div className="pn-grid" style={{ gridTemplateColumns: `repeat(${columns}, 1fr)` }} aria-hidden="true">
      {cells}
    </div>
  );
}

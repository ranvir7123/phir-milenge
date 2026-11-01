// The beam test page, opened with ?beam-test (docs/plan/3-how-its-built.md section 6.1).
// "Send" beams a random payload with chosen settings; "Receive" catches it and measures the speed.
// The payload comes from a numbered seed, so the catcher rebuilds the same bytes and checks every one.

import { useEffect, useRef, useState } from 'react';
import { BeamCatcher } from './catcher';
import { crc32 } from './crc32';
import { BeamCode, WarnIcon, useCamera, type CameraState } from './parts';
import { BeamSender } from './sender';
import { keepAwake } from './wake';
import { cameraWords, words } from './words';

const SIZES = [5, 20, 60] as const;
const PIECES = [200, 400, 700] as const;
const RATES = [6, 8, 12] as const;
const RUNS_KEY = 'phir-beam-test-runs';

interface Run {
  at: string;
  kb: number;
  piece: number;
  fps: number | null;
  seconds: number;
  kbps: number;
  seen: number;
  used: number;
  needed: number;
  match: 'exact' | 'checksum' | 'differ';
  reader: string;
}

export function testPayload(seed: number, size: number): Uint8Array {
  const out = new Uint8Array(size);
  let a = seed >>> 0;
  for (let i = 0; i < size; i++) {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    out[i] = (t ^ (t >>> 14)) & 0xff;
  }
  return out;
}

export function checksumText(n: number): string {
  const hex = (n >>> 0).toString(16).toUpperCase().padStart(8, '0');
  return `${hex.slice(0, 4)} ${hex.slice(4)}`;
}

function Choice<T extends number>({ label, options, value, unit, onPick }: { label: string; options: readonly T[]; value: T; unit: string; onPick(v: T): void }) {
  return (
    <>
      <span className="beam-label">{label}</span>
      <div className="seg" role="group" aria-label={label}>
        {options.map((o) => (
          <button key={o} type="button" aria-pressed={o === value} onClick={() => onPick(o)}>
            {o} {unit}
          </button>
        ))}
      </div>
    </>
  );
}

function loadRuns(): Run[] {
  try {
    return JSON.parse(localStorage.getItem(RUNS_KEY) ?? '[]') as Run[];
  } catch {
    return [];
  }
}

function saveRuns(runs: Run[]): void {
  try {
    localStorage.setItem(RUNS_KEY, JSON.stringify(runs));
  } catch {
    // Storage is off (a private window, say); the runs still show on screen.
  }
}

export function BeamTestPage() {
  const [mode, setMode] = useState<'send' | 'receive'>('send');
  return (
    <main className="beam-page">
      <h1 className="beam-title">Beam test</h1>
      <p className="beam-sub">One phone sends, the other receives. Both screens at full brightness, about 20 cm apart.</p>
      <div className="seg" role="group" aria-label="This device">
        <button type="button" aria-pressed={mode === 'send'} onClick={() => setMode('send')}>
          Send
        </button>
        <button type="button" aria-pressed={mode === 'receive'} onClick={() => setMode('receive')}>
          Receive
        </button>
      </div>
      {mode === 'send' ? <SendSide /> : <ReceiveSide />}
    </main>
  );
}

function SendSide() {
  const [kb, setKb] = useState<number>(20);
  const [piece, setPiece] = useState<number>(400);
  const [fps, setFps] = useState<number>(8);
  const [beam, setBeam] = useState<{ sender: BeamSender; seed: number; kb: number; piece: number; fps: number } | null>(null);
  const [frame, setFrame] = useState(0);
  const [awake, setAwake] = useState(true);

  useEffect(() => {
    if (!beam) return;
    setAwake(true);
    return keepAwake(() => setAwake(false));
  }, [beam]);

  const start = () => {
    const seed = Math.floor(Math.random() * 90000) + 10000;
    const payload = testPayload(seed, kb * 1024);
    const hello = { format: 1, docId: `beam-test:${seed}:${fps}`, title: `Beam test ${seed}`, senderName: 'Beam test', senderActor: 'beam-test', size: payload.length };
    setFrame(0);
    setBeam({ sender: new BeamSender(payload, piece, hello), seed, kb, piece, fps });
  };

  if (beam) {
    return (
      <section>
        <p className="beam-line">Point the other camera here and hold steady.</p>
        <BeamCode sender={beam.sender} fps={beam.fps} maxSize={Math.min(window.innerHeight * 0.62, 560)} onFrame={setFrame} />
        <dl className="stats">
          <dt>Test</dt>
          <dd>{beam.seed}</dd>
          <dt>Settings</dt>
          <dd>
            {beam.kb} KB, {beam.piece}-byte pieces, {beam.fps} a second
          </dd>
          <dt>Pieces</dt>
          <dd>{beam.sender.pieces}</dd>
          <dt>Frame</dt>
          <dd>{frame + 1}</dd>
          <dt>Checksum</dt>
          <dd className="checksum">{checksumText(beam.sender.beamId)}</dd>
        </dl>
        {!awake && <p className="beam-quiet">Tap the screen now and then so it doesn't go dark.</p>}
        <div className="btn-row">
          <button type="button" className="btn btn-wide" onClick={() => setBeam(null)}>
            Stop beaming
          </button>
        </div>
      </section>
    );
  }

  return (
    <section>
      <Choice label="Size" options={SIZES} value={kb} unit="KB" onPick={setKb} />
      <Choice label="Piece size" options={PIECES} value={piece} unit="bytes" onPick={setPiece} />
      <Choice label="Frames a second" options={RATES} value={fps} unit="a second" onPick={setFps} />
      <div className="btn-row">
        <button type="button" className="btn btn-beam btn-wide" onClick={start}>
          Start beaming
        </button>
      </div>
    </section>
  );
}

function ReceiveSide() {
  const [on, setOn] = useState(false);
  const [bundledOnly, setBundledOnly] = useState(false);
  const [runs, setRuns] = useState<Run[]>(loadRuns);
  const [copied, setCopied] = useState(false);
  return (
    <section>
      {on ? (
        <Receiver bundledOnly={bundledOnly} onRun={(run) => setRuns((r) => { const next = [run, ...r]; saveRuns(next); return next; })} />
      ) : (
        <>
          <label className="check-row">
            <input type="checkbox" checked={bundledOnly} onChange={(e) => setBundledOnly(e.target.checked)} />
            Use the bundled reader even if the browser has its own
          </label>
          <div className="btn-row">
            <button type="button" className="btn btn-wide" onClick={() => setOn(true)}>
              Start the camera
            </button>
          </div>
        </>
      )}
      {runs.length > 0 && (
        <>
          <span className="beam-label">Runs on this device</span>
          <div className="runs-box">
            <table className="runs">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Size</th>
                  <th>Piece</th>
                  <th>A second</th>
                  <th>Seconds</th>
                  <th>KB/s</th>
                  <th>Seen</th>
                  <th>Used</th>
                  <th>Bytes</th>
                  <th>Reader</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((r, i) => (
                  <tr key={i}>
                    <td>{r.at}</td>
                    <td>{r.kb} KB</td>
                    <td>{r.piece}</td>
                    <td>{r.fps ?? '?'}</td>
                    <td>{r.seconds.toFixed(1)}</td>
                    <td>{r.kbps.toFixed(1)}</td>
                    <td>{r.seen}</td>
                    <td>
                      {r.used} of {r.needed}
                    </td>
                    <td className={r.match === 'differ' ? 'beam-warning' : undefined}>{r.match === 'exact' ? 'match' : r.match === 'checksum' ? 'checksum ok' : 'DIFFER'}</td>
                    <td>{r.reader}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="btn-row">
            <button
              type="button"
              className="btn"
              onClick={() => {
                const lines = runs.map((r) => `${r.at} | ${r.kb} KB | ${r.piece} | ${r.fps ?? '?'}/s | ${r.seconds.toFixed(1)} s | ${r.kbps.toFixed(1)} KB/s | seen ${r.seen} | used ${r.used} of ${r.needed} | ${r.match} | ${r.reader}`);
                void navigator.clipboard?.writeText(lines.join('\n')).then(() => setCopied(true), () => setCopied(false));
              }}
            >
              {copied ? 'Copied' : 'Copy the runs'}
            </button>
            <button type="button" className="btn" onClick={() => { setRuns([]); saveRuns([]); }}>
              Clear the runs
            </button>
          </div>
        </>
      )}
    </section>
  );
}

function Receiver({ bundledOnly, onRun }: { bundledOnly: boolean; onRun(run: Run): void }) {
  const catcher = useRef(new BeamCatcher());
  const [, redraw] = useState(0);
  const [camera, setCamera] = useState<CameraState>({ kind: 'starting' });
  const [foreign, setForeign] = useState(false);
  const [now, setNow] = useState(performance.now());
  const reads = useRef<number[]>([]);
  const result = useRef<Run | null>(null);
  const onRunRef = useRef(onRun);
  onRunRef.current = onRun;
  const readerKind = useRef('?');
  if (camera.kind === 'on') readerKind.current = camera.reader;

  useEffect(() => keepAwake(), []);
  useEffect(() => {
    const t = setInterval(() => setNow(performance.now()), 250);
    return () => clearInterval(t);
  }, []);

  const cam = useCamera({
    bundledOnly,
    onState: setCamera,
    onRead: () => {
      const t = performance.now();
      reads.current.push(t);
      while (reads.current.length && reads.current[0]! < t - 2000) reads.current.shift();
    },
    onCodes: (codes, t) => {
      const c = catcher.current;
      for (const code of codes) {
        const u = c.read(code, t);
        if (u.type === 'foreign') setForeign(true);
        else if (u.type !== 'ignored' && u.type !== 'misread') setForeign(false);
        if (u.type === 'done' || u.type === 'damaged') finish(c, readerKind.current);
      }
      redraw((n) => n + 1);
    },
  });

  function finish(c: BeamCatcher, reader: string) {
    const seconds = ((c.stats.doneAt ?? 0) - (c.stats.firstAt ?? 0)) / 1000;
    const kb = c.size / 1024;
    let match: Run['match'] = c.state === 'done' ? 'checksum' : 'differ';
    let fps: number | null = null;
    const m = /^beam-test:(\d+):(\d+)$/.exec(c.hello?.docId ?? '');
    if (m && c.payload) {
      fps = Number(m[2]);
      const expected = testPayload(Number(m[1]), c.size);
      match = expected.length === c.payload.length && expected.every((b, i) => b === c.payload![i]) ? 'exact' : 'differ';
    }
    const at = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    result.current = { at, kb: Math.round(kb), piece: c.pieceSize, fps, seconds, kbps: seconds > 0 ? kb / seconds : 0, seen: c.stats.seen, used: c.stats.used, needed: c.pieces, match, reader };
    onRunRef.current(result.current);
  }

  const c = catcher.current;
  const readsPerSecond = reads.current.filter((t) => t > now - 1000).length;
  const sinceUseful = c.stats.lastUsefulAt ?? c.stats.firstAt;
  const stuck = c.state === 'catching' && sinceUseful !== null ? (now - sinceUseful) / 1000 : 0;
  const run = result.current;

  const again = () => {
    catcher.current = new BeamCatcher();
    result.current = null;
    redraw((n) => n + 1);
  };

  return (
    <section>
      {camera.kind === 'problem' ? (
        <div className="notice">
          <h2 className={cameraWords[camera.problem].warning ? 'beam-warning' : undefined}>
            {cameraWords[camera.problem].warning && <WarnIcon />}
            {cameraWords[camera.problem].title}
          </h2>
          <p>{cameraWords[camera.problem].body}</p>
          {cameraWords[camera.problem].retry && (
            <div className="btn-row">
              <button type="button" className="btn" onClick={cam.retry}>
                {camera.problem === 'stopped' || camera.problem === 'other' ? 'Carry on' : 'Try again'}
              </button>
            </div>
          )}
        </div>
      ) : (
        cam.view
      )}

      {c.state === 'looking' && camera.kind !== 'problem' && <p className="beam-line">{camera.kind === 'starting' ? 'Starting the camera…' : 'Looking for a code. Point at the other screen.'}</p>}
      {c.state !== 'looking' && (
        <>
          <div className="progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(c.progress * 100)}>
            <span style={{ width: `${c.progress * 100}%` }} />
          </div>
          <p className="beam-line">
            {c.state === 'catching' && `Catching${c.hello ? ` test ${c.hello.title.replace('Beam test ', '')}` : ''}, ${Math.floor(c.progress * 100)}%`}
            {c.state === 'done' && run && `Caught ${run.kb} KB in ${run.seconds.toFixed(1)} seconds: ${run.kbps.toFixed(1)} KB a second.`}
            {c.state === 'damaged' && (
              <span className="beam-warning">
                <WarnIcon />
                This beam came through damaged.
              </span>
            )}
          </p>
        </>
      )}
      {foreign && <p className="beam-quiet">{words.foreignCode}</p>}
      {stuck >= 15 ? (
        <p className="beam-quiet">
          {words.stillCantReadTitle} {words.stillCantReadBody}
        </p>
      ) : stuck >= 3 ? (
        <p className="beam-quiet">{words.cantRead}</p>
      ) : null}

      {run && (
        <p className={`beam-line ${run.match === 'differ' ? 'beam-warning' : ''}`}>
          {run.match === 'exact' && 'Bytes match exactly.'}
          {run.match === 'checksum' && 'Checksum matches.'}
          {run.match === 'differ' && (
            <>
              <WarnIcon />
              The bytes don't match.
            </>
          )}
        </p>
      )}

      <dl className="stats">
        <dt>Reader</dt>
        <dd>{camera.kind === 'on' ? (camera.reader === 'built-in' ? 'built into the browser' : 'bundled (ZXing)') : '…'}</dd>
        <dt>Codes read a second</dt>
        <dd>{readsPerSecond}</dd>
        <dt>Frames seen</dt>
        <dd>{c.stats.seen}</dd>
        <dt>Frames used</dt>
        <dd>
          {c.stats.used}
          {c.pieces > 0 && ` of ${c.pieces} needed`}
        </dd>
        {c.hello && (
          <>
            <dt>Test</dt>
            <dd>{c.hello.title.replace('Beam test ', '')}</dd>
          </>
        )}
        {c.state === 'done' && c.payload && (
          <>
            <dt>Checksum</dt>
            <dd className="checksum">{checksumText(crc32(c.payload))}</dd>
          </>
        )}
      </dl>

      <div className="btn-row">
        {c.state !== 'looking' && (
          <button type="button" className="btn btn-wide" onClick={again}>
            Catch again
          </button>
        )}
        {cam.canSwitch && (
          <button type="button" className="btn btn-wide" onClick={cam.switchCamera}>
            Switch camera
          </button>
        )}
      </div>
    </section>
  );
}

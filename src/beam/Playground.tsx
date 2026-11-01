// Track B shows its piece here with made-up data (src/contracts/fixtures.ts). Open with ?play=beam
// Five views: the fountain caught with no camera (every third frame dropped), the Beam screen, the
// broadcast Beam screen, and the Catch screen fed straight from the frames or from the real camera.

import { useMemo, useRef, useState } from 'react';
import type { BeamHello } from '../contracts';
import { BeamCatcher } from './catcher';
import { BeamCode } from './parts';
import { BeamScreen } from './BeamScreen';
import { CatchScreen, type CodeFeed } from './CatchScreen';
import { BeamSender } from './sender';
import { beamSeconds, beamSettings } from './settings';
import { checksumText, testPayload } from './BeamTestPage';
import './beam.css';

const SIZE = 14 * 1024;
const payload = testPayload(4471, SIZE);
const hello: BeamHello = {
  format: 1,
  docId: 'playground',
  title: 'Camp log: Sundarbans cyclone relief',
  senderName: 'Meher',
  senderActor: 'm1',
  size: SIZE,
};

type View = 'fountain' | 'beam' | 'broadcast' | 'catch' | 'camera';
const views: [View, string][] = [
  ['fountain', 'Fountain'],
  ['beam', 'Beam'],
  ['broadcast', 'Beam to everyone'],
  ['catch', 'Catch, no camera'],
  ['camera', 'Catch, camera'],
];

export function Playground() {
  const [view, setView] = useState<View>('fountain');
  const [run, setRun] = useState(0);
  const [said, setSaid] = useState('');
  // What the stand-in camera sees on "Catch, no camera".
  const [aim, setAim] = useState<'code' | 'away' | 'payment'>('code');
  const aimRef = useRef(aim);
  aimRef.current = aim;

  const feed = useMemo<CodeFeed>(() => {
    const sender = new BeamSender(payload, beamSettings.pieceSize, hello);
    return (onCodes) => {
      let i = 0;
      const timer = setInterval(() => {
        i++;
        if (aimRef.current === 'away' || i % 3 === 2) return;
        onCodes([aimRef.current === 'payment' ? 'upi://pay?pa=shop@bank' : sender.frameText(i + 40)], performance.now());
      }, 1000 / beamSettings.framesPerSecond);
      return () => clearInterval(timer);
    };
  }, []);

  const show = (v: View) => {
    setView(v);
    setSaid('');
    setRun((n) => n + 1);
  };

  const onCaught = (bytes: Uint8Array, h: BeamHello | null) => {
    const same = bytes.length === payload.length && bytes.every((b, i) => b === payload[i]);
    setSaid(`Caught ${bytes.length} bytes from ${h?.senderName ?? 'someone'}. ${same ? 'Bytes match exactly.' : 'Bytes differ.'}`);
  };

  return (
    <div className="play-frame">
      <nav className="seg play-tabs" aria-label="Playground views">
        {views.map(([v, name]) => (
          <button key={v} type="button" aria-pressed={view === v} onClick={() => show(v)}>
            {name}
          </button>
        ))}
      </nav>
      {view === 'catch' && (
        <nav className="seg play-tabs" aria-label="What the stand-in camera sees">
          <button type="button" aria-pressed={aim === 'code'} onClick={() => setAim('code')}>
            The code
          </button>
          <button type="button" aria-pressed={aim === 'away'} onClick={() => setAim('away')}>
            Nothing
          </button>
          <button type="button" aria-pressed={aim === 'payment'} onClick={() => setAim('payment')}>
            A payment code
          </button>
        </nav>
      )}
      {said && (
        <p className="play-said" role="status">
          {said}
        </p>
      )}
      <div className="play-screen" key={run}>
        {view === 'fountain' && <Fountain />}
        {(view === 'beam' || view === 'broadcast') && (
          <BeamScreen
            payload={payload}
            hello={view === 'broadcast' ? { ...hello, senderName: 'Base camp' } : hello}
            broadcast={view === 'broadcast'}
            estimateSeconds={beamSeconds(SIZE)}
            onStop={() => setSaid('Stop beaming tapped.')}
            onCatchTheirs={() => show('catch')}
            onSaveFile={() => setSaid('Save a file tapped.')}
          />
        )}
        {(view === 'catch' || view === 'camera') && (
          <CatchScreen
            feed={view === 'catch' ? feed : undefined}
            onCaught={onCaught}
            onHello={() => 'continue'}
            onCancel={() => setSaid('Cancel tapped.')}
            onUseFile={() => setSaid('Use a file tapped.')}
          />
        )}
      </div>
    </div>
  );
}

function Fountain() {
  const sender = useMemo(() => new BeamSender(payload, 400, hello), []);
  const catcher = useRef(new BeamCatcher());
  const [, redraw] = useState(0);
  const onFrame = (i: number) => {
    if (i % 3 === 2) return;
    catcher.current.read(sender.frameText(i), performance.now());
    redraw((n) => n + 1);
  };
  const c = catcher.current;
  return (
    <main className="beam-page">
      <h1 className="beam-title">Beam playground</h1>
      <p className="beam-sub">14 KB in 400-byte pieces, 8 a second. The catch below reads the frames straight from the code, dropping every third.</p>
      <BeamCode sender={sender} fps={8} maxSize={320} onFrame={onFrame} />
      <div className="progress">
        <span style={{ width: `${c.progress * 100}%` }} />
      </div>
      <p className="beam-line">
        {c.state === 'done' ? `Caught "${c.hello?.title ?? ''}" from ${c.hello?.senderName ?? ''}.` : `Catching, ${Math.floor(c.progress * 100)}%`}
      </p>
      <dl className="stats">
        <dt>Frames seen</dt>
        <dd>{c.stats.seen}</dd>
        <dt>Frames used</dt>
        <dd>
          {c.stats.used} of {sender.pieces} needed
        </dd>
        <dt>Checksum sent</dt>
        <dd className="checksum">{checksumText(sender.beamId)}</dd>
      </dl>
      <div className="btn-row">
        <button
          type="button"
          className="btn"
          onClick={() => {
            catcher.current = new BeamCatcher();
            redraw((n) => n + 1);
          }}
        >
          Catch again
        </button>
      </div>
    </main>
  );
}

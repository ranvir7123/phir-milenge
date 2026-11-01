// Track B shows its piece here with made-up data (src/contracts/fixtures.ts). Open with ?play=beam
// A beam of a made-up payload on the left, caught with no camera on the right (every third frame dropped),
// so the fountain can be watched working: any order, any start, the exact bytes back.

import { useMemo, useRef, useState } from 'react';
import { BeamCatcher } from './catcher';
import { BeamCode } from './parts';
import { BeamSender } from './sender';
import { checksumText, testPayload } from './BeamTestPage';
import './beam.css';

export function Playground() {
  const sender = useMemo(
    () =>
      new BeamSender(testPayload(4471, 14 * 1024), 400, {
        format: 1,
        docId: 'playground',
        title: 'Camp log: Sundarbans cyclone relief',
        senderName: 'Meher',
        senderActor: 'm1',
        size: 14 * 1024,
      }),
    [],
  );
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
        <button type="button" className="btn" onClick={() => { catcher.current = new BeamCatcher(); redraw((n) => n + 1); }}>
          Catch again
        </button>
      </div>
    </main>
  );
}

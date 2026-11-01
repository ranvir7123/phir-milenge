// The Beam screen: "Horn OK Please" over the looping code, until the person taps Stop beaming.
// Words from docs/plan/2-user-experience.md, "When two devices meet", part 1.

import { useEffect, useMemo, useState } from 'react';
import type { BeamScreenProps } from '../contracts';
import { BeamCode } from './parts';
import { BeamSender } from './sender';
import { beamSettings, durationText, sizeText } from './settings';
import { keepAwake } from './wake';
import './beam.css';

export function BeamScreen({ payload, hello, broadcast, estimateSeconds, onStop, onCatchTheirs, onSaveFile }: BeamScreenProps) {
  // Keyed on the hello's words, not the object, so a parent re-render doesn't restart the code.
  const helloKey = JSON.stringify(hello);
  const sender = useMemo(
    () => new BeamSender(payload, beamSettings.pieceSize, JSON.parse(helloKey) as typeof hello),
    [payload, helloKey],
  );
  const [mayGoDark, setMayGoDark] = useState(false);

  useEffect(() => keepAwake(() => setMayGoDark(true)), []);

  const catchTheirs = broadcast ? undefined : onCatchTheirs;
  const saveFile = broadcast ? undefined : onSaveFile;
  const goDarkLine = mayGoDark && <p className="bm-beam-small">Tap the screen now and then so it doesn't go dark.</p>;

  return (
    <div className={broadcast ? 'bm-beam-screen bm-broadcast' : 'bm-beam-screen'}>
      <div className="bm-beam-stage">
        <h1 className="bm-sign">Horn OK Please</h1>
        <BeamCode sender={sender} fps={beamSettings.framesPerSecond} fill />
        {broadcast ? (
          <>
            <p className="bm-beam-small">{hello.senderName} won't know who caught this until they beam back.</p>
            <p className="bm-beam-small">Can't catch it from the big screen? Come and catch from the laptop's own screen.</p>
            {goDarkLine}
          </>
        ) : (
          <>
            <p className="bm-beam-hint">Point their camera here and hold steady until their phone honks.</p>
            <p className="bm-beam-small">
              Beaming the whole doc, {sizeText(payload.length)}, about {durationText(estimateSeconds)} once their camera has
              it. The code keeps looping, so they can start catching any time.
            </p>
            <p className="bm-beam-small">Turn your brightness up so their camera can read it.</p>
            {goDarkLine}
          </>
        )}
      </div>
      <div className="bm-beam-bar">
        {catchTheirs && (
          <button type="button" className={saveFile ? 'bm-btn' : 'bm-btn bm-span-all'} onClick={catchTheirs}>
            Catch theirs
          </button>
        )}
        {saveFile && (
          <button type="button" className={catchTheirs ? 'bm-btn' : 'bm-btn bm-span-all'} onClick={saveFile}>
            Save a file
          </button>
        )}
        <button type="button" className="bm-btn bm-btn-solid bm-span-all" onClick={onStop}>
          Stop beaming
        </button>
      </div>
    </div>
  );
}

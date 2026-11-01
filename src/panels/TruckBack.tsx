// The truck back: a painted panel, three words and two digits, all made from what the doc says.
// Same words on another phone means the same doc. Spec: 1-features.md feature 10.

import { useMemo, useState } from 'react';
import type { Fingerprint, TruckBackProps } from '../contracts';
import { truckWords } from './format';
import { LeftIcon } from './icons';
import { paintVar, truckPattern } from './truckPattern';
import './panels.css';

export const TRUCK_CAPTION = 'Every phone holding exactly this doc shows this same truck back. Change one letter and it repaints.';

/** "5f0c 1c3e 9b7a": the start of the hash, for anyone who wants to check by hand. */
function hexStart(hex: string): string {
  return (hex.slice(0, 12).match(/.{1,4}/g) ?? []).join(' ');
}

export function TruckArt({ hex, className = 'pn-truck-art' }: { hex: string; className?: string }) {
  const shapes = useMemo(() => truckPattern(hex), [hex]);
  return (
    <svg className={className} viewBox="0 0 120 120" aria-hidden="true">
      {shapes.map((s, i) =>
        s.circle ? (
          <circle key={i} cx={s.circle.cx} cy={s.circle.cy} r={s.circle.r} style={{ fill: paintVar(s.fill ?? 'ground') }} />
        ) : s.stroke ? (
          <path key={i} d={s.d} style={{ fill: 'none', stroke: paintVar(s.stroke), strokeWidth: 2.4, strokeLinecap: 'round', strokeLinejoin: 'round' }} />
        ) : (
          <path key={i} d={s.d} style={{ fill: paintVar(s.fill ?? 'ground') }} />
        ),
      )}
    </svg>
  );
}

/** The big painted panel with the sign, the words and the digits. */
export function TruckPanel({ fp, caption = TRUCK_CAPTION, sign = true }: { fp: Fingerprint; caption?: string; sign?: boolean }) {
  const words = truckWords(fp.words);
  return (
    <div className="pn-truck-large">
      {sign && <div className="pn-sign">Horn OK Please</div>}
      <TruckArt hex={fp.hex} />
      <div className="pn-slogan">{words}</div>
      <p className="pn-small pn-quiet pn-num">
        <span className="pn-plate">{fp.digits}</span> · {hexStart(fp.hex)}
      </p>
      {caption && <p className="pn-cap">{caption}</p>}
    </div>
  );
}

/** The full-screen truck back, for holding up to the room. */
export function TruckFull({ fp, onClose, big, caption }: { fp: Fingerprint; onClose(): void; big: boolean; caption?: string }) {
  return (
    <div className={`pn pn-full${big ? ' pn-big' : ''}`} role="dialog" aria-modal="true" aria-label="Truck back">
      <div className="pn-full-top">
        <button type="button" className="pn-back" onClick={onClose}>
          <LeftIcon />
          Back to the doc
        </button>
      </div>
      <div className="pn-full-body">
        <TruckPanel fp={fp} caption={caption} />
      </div>
    </div>
  );
}

function safeFingerprint(engine: TruckBackProps['engine']): Fingerprint | null {
  try {
    return engine.fingerprint();
  } catch {
    return null;
  }
}

export function TruckBack({ view, engine, size }: TruckBackProps) {
  // The fingerprint depends only on what the doc says, so it changes exactly when the view does.
  const fp = useMemo(() => safeFingerprint(engine), [engine, view]);
  const [full, setFull] = useState(false);

  if (!fp) {
    return <p className="pn pn-small pn-quiet">The truck back shows once the doc has opened.</p>;
  }

  if (size === 'large') {
    return (
      <div className="pn pn-big">
        <TruckPanel fp={fp} />
      </div>
    );
  }

  return (
    <>
      <button type="button" className="pn pn-tbline" onClick={() => setFull(true)} aria-label={`Truck back: ${truckWords(fp.words)}, ${fp.digits}. Open it full screen.`}>
        <TruckArt hex={fp.hex} />
        <span style={{ minWidth: 0 }}>
          <span className="pn-tbline-words">{truckWords(fp.words)}</span>
          <span className="pn-tbline-label pn-num">
            {fp.digits} · Same words on another phone means the same doc.
          </span>
        </span>
      </button>
      {full && <TruckFull fp={fp} onClose={() => setFull(false)} big={false} />}
    </>
  );
}

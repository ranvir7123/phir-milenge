// "Who has this": for the block the cursor is in, how many devices hold it and how its newest words travelled.
// Everything is "as far as this phone knows". Spec: 1-features.md feature 4.

import { useMemo, useState } from 'react';
import type { ActorId, DocEngine, DocView, ItemId } from '../contracts';
import { clockForm, colourOf, cutName, deviceName, nameOf } from './format';
import { devices, trailRows, type TrailRow } from './knowledge';
import './panels.css';

/** The trail lists this many rows, then "and 3 more". */
const TRAIL_ROWS = 6;

export function trailLine(row: TrailRow, view: DocView, now: number, here: 'phone' | 'laptop' = 'phone'): string {
  const who = cutName(nameOf(view, row.actor));
  const at = row.place ? ` at ${row.place}` : '';
  const device = deviceName(who);
  // A phone with these words but not the whole paragraph, which "3 of 4 have it" doesn't count.
  if (row.via === 'wrote') return `${who} wrote it${at} · ${row.t !== null ? clockForm(row.t, now) : ''}${row.partial ? ` · ${device} doesn't have all of it yet` : ''}`;
  const where = row.place ? `${device}, ${row.place}` : device;
  if (row.via === 'not-yet') return `${where} · Not yet, as far as this ${here} knows`;
  const from = row.from ? deviceName(cutName(nameOf(view, row.from))) : null;
  const how = row.via === 'file' ? (from ? `, by file from ${from}` : ', by file') : from ? `, from ${from}` : '';
  return `${where} · ${row.t !== null ? clockForm(row.t, now) : ''}${how}${row.partial ? " · Doesn't have all of it yet" : ''}`;
}

export function WhoHas({ engine, view, block, bigScreen, here }: { engine: DocEngine; view: DocView; block: ItemId; bigScreen: boolean; here: 'phone' | 'laptop' }) {
  const [open, setOpen] = useState(false);
  const changes = engine.changes();
  const data = useMemo(() => {
    let holders: ActorId[] = [];
    try {
      holders = engine.whoHas(block);
    } catch {
      holders = [];
    }
    const all = new Set<ActorId>([...devices(changes, view), ...holders, engine.me]);
    const have = new Set<ActorId>([...holders, engine.me]);
    return { total: all.size, have: [...have] };
  }, [engine, view, block, changes]);
  const trail = useMemo(() => (open ? safeTrail(engine, view, block) : []), [open, engine, view, block, changes]);
  const now = Date.now();
  const shown = trail.slice(0, TRAIL_ROWS);

  return (
    <section className={`pn-section${bigScreen ? ' pn-big' : ''}`} aria-labelledby="pn-whohas">
      <h3 id="pn-whohas">Who has this</h3>
      <p>{data.total <= 1 ? `Only you have this, as far as this ${here} knows.` : `${data.have.length} of ${data.total} have it`}</p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 14px' }}>
        {data.have.map((a) => {
          const c = colourOf(view, a);
          return (
            <span key={a} className={`pn-who${c ? '' : ' pn-plain'}`} style={c ? ({ '--c': c } as React.CSSProperties) : undefined}>
              {a === engine.me ? 'You' : cutName(nameOf(view, a))}
            </span>
          );
        })}
      </div>
      {!open ? (
        <div>
          <button type="button" className="pn-btn" onClick={() => setOpen(true)}>
            Where this has been
          </button>
        </div>
      ) : (
        <div className="pn-section" style={{ gap: 6 }}>
          <h4 style={{ fontWeight: 600 }}>Where this has been</h4>
          {shown.length === 0 && <p className="pn-small pn-quiet">This {here} hasn't seen it travel yet.</p>}
          <ol style={{ margin: 0, paddingLeft: '1.4em', display: 'flex', flexDirection: 'column', gap: 4 }} className="pn-small">
            {shown.map((r, i) => (
              <li key={`${r.actor}-${i}`} className={r.via === 'not-yet' || r.partial ? 'pn-quiet' : undefined}>
                {trailLine(r, view, now, here)}
              </li>
            ))}
          </ol>
          {trail.length > TRAIL_ROWS && <p className="pn-more">and {trail.length - TRAIL_ROWS} more</p>}
        </div>
      )}
    </section>
  );
}

function safeTrail(engine: DocEngine, view: DocView, block: ItemId): TrailRow[] {
  try {
    return trailRows(engine, view, block);
  } catch {
    return [];
  }
}

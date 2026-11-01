// Two (or more) versions of one spot, side by side on a laptop and stacked on a phone.
// Used for sentences, the title, ticks, table cells and rows. Picking always goes through the engine.

import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import type { ActorId, DocView, Field, Lane } from '../contracts';
import { Icon } from './icons';
import {
  clockLooksWrong,
  colourVar,
  decidedMark,
  laneWho,
  PICK_FIRST,
  versionsHeading,
  writerColour,
  type ClashWhat,
} from './words';

export function barStyle(view: DocView, actor: ActorId): CSSProperties {
  const c = colourVar(writerColour(view, actor));
  return { ['--c' as string]: c ?? 'var(--quiet)' };
}

/** The writer's mark: a 3px colour bar, or the plain ring for a Plain writer. */
export function WriterMark({ view, actor }: { view: DocView; actor: ActorId }) {
  const plain = writerColour(view, actor) === 'plain';
  return <span className={plain ? 'ln-ring' : 'ln-bar'} style={barStyle(view, actor)} aria-hidden="true" />;
}

function Who({ view, lane, now }: { view: DocView; lane: Lane<unknown>; now: number }) {
  return (
    <span className="ln-who">
      <WriterMark view={view} actor={lane.actor} />
      <span>{laneWho(view, lane, now)}</span>
      {clockLooksWrong(lane.t, now) && (
        <span className="ln-clock">
          <Icon name="alert" /> clock looks wrong
        </span>
      )}
    </span>
  );
}

export interface LanesProps<T> {
  view: DocView;
  field: Field<T>;
  what: ClashWhat;
  /** How one version's value reads. */
  show(value: T): ReactNode;
  /** The words a "Deleted by" lane shows struck through. */
  deletedShows?: ReactNode;
  onKeep(lane: Lane<T>): void;
  /** "Edit": only sentences and the title, where typing carries on after the pick. */
  onEdit?(lane: Lane<T>): void;
  now: number;
  /** A note to show under the lanes from outside (a refused keystroke). */
  outsideNote?: { text: string; at: number } | null;
}

/** The lanes for an open clash. */
export function Lanes<T>({ view, field, what, show, deletedShows, onKeep, onEdit, now, outsideNote }: LanesProps<T>) {
  const [note, setNote] = useState<{ text: string; at: number } | null>(null);
  useEffect(() => {
    if (outsideNote) setNote(outsideNote);
  }, [outsideNote]);
  useEffect(() => {
    if (!note) return;
    const timer = window.setTimeout(() => setNote(null), 4000);
    return () => window.clearTimeout(timer);
  }, [note]);
  const lanes = field.lanes;
  const heading = versionsHeading(lanes.length, what);
  return (
    <div className={`ln-box ln-${lanes.length > 2 ? 'many' : 'two'}`} role="group" aria-label={heading}>
      <p className="ln-label">
        <Icon name="pair" />
        <span>{heading}</span>
      </p>
      <div className="ln-lanes">
        {lanes.map((lane) => (
          <div className="ln-lane" key={lane.ref} style={barStyle(view, lane.actor)} data-plain={writerColour(view, lane.actor) === 'plain' || undefined}>
            <Who view={view} lane={lane} now={now} />
            <div
              className={lane.value === null ? 'ln-text ln-gone' : 'ln-text'}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => setNote({ text: PICK_FIRST, at: Date.now() })}
            >
              {lane.value === null ? deletedShows : show(lane.value)}
            </div>
            <div className="ln-actions">
              <button type="button" className="ed-btn ln-keep" onClick={() => onKeep(lane)}>
                {lane.value === null ? 'Keep it deleted' : 'Keep this one'}
              </button>
              {onEdit && lane.value !== null && (
                <button type="button" className="ed-quiet ln-edit" onClick={() => onEdit(lane)}>
                  Edit
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
      {note && (
        <p className="ln-note" role="status">
          {note.text}
        </p>
      )}
    </div>
  );
}

/** The quiet mark under a decided spot, "Kept by Asif · 1 other", that opens the versions that lost. */
export function Decided<T>({
  view,
  field,
  me,
  show,
  deletedShows,
  onUse,
  now,
}: {
  view: DocView;
  field: Field<T>;
  me: ActorId;
  show(value: T): ReactNode;
  deletedShows?: ReactNode;
  onUse(lane: Lane<T>): void;
  now: number;
}) {
  const [open, setOpen] = useState(false);
  const mark = decidedMark(view, field, me);
  if (!mark) return null;
  const wrongClock = field.shown ? clockLooksWrong(field.shown.t, now) : false;
  return (
    <span className="dm">
      <span className="dm-line" style={field.shown ? barStyle(view, field.shown.actor) : undefined}>
        {mark.lead} ·{' '}
        <button type="button" className="dm-other" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          {mark.rest}
        </button>
        {wrongClock && (
          <span className="ln-clock">
            <Icon name="alert" /> clock looks wrong
          </span>
        )}
      </span>
      {open && (
        <span className="dm-kept">
          {field.kept.map((lane) => (
            <span className="ln-lane" key={lane.ref} style={barStyle(view, lane.actor)}>
              <Who view={view} lane={lane} now={now} />
              <span className={lane.value === null ? 'ln-text ln-gone' : 'ln-text'}>
                {lane.value === null ? deletedShows : show(lane.value)}
              </span>
              <span className="ln-actions">
                <button
                  type="button"
                  className="ed-btn ln-keep"
                  onClick={() => {
                    setOpen(false);
                    onUse(lane);
                  }}
                >
                  Use this one instead
                </button>
              </span>
            </span>
          ))}
        </span>
      )}
    </span>
  );
}

// The Catch screen: the camera with corner marks, the progress bar, and every hint and problem on the way.
// Words from docs/plan/2-user-experience.md: "When two devices meet" part 1, and the Camera and
// "Beam and catch" error tables. Nothing reaches the doc until the whole payload has arrived and its
// checksum passes; then the phone honks and `onCaught` gets the bytes.

import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { CatchScreenProps } from '../contracts';
import { BeamCatcher } from './catcher';
import { useCamera, WarnIcon, type CameraState } from './parts';
import type { CameraProblem } from './reader';
import { honk, unlockSound } from './sound';
import { keepAwake } from './wake';
import { cameraWords, words } from './words';
import './beam.css';

/** No new piece for this long: "Can't read the code…". */
const HINT_AFTER = 3000;
/** No new piece for this long: "Still can't read the code." */
const STUCK_AFTER = 15000;
/** How long "That code isn't a doc…" stays after the camera last saw a code that isn't ours. */
const FOREIGN_SHOWS = 3000;
/** Set once this device has shown "Relay Docs needs the camera to catch." */
const ASKED_KEY = 'phir-camera-asked';

type Phase =
  /** Finding out whether this device has allowed the camera before. */
  | 'checking'
  /** First time: why the camera is needed, before the browser asks. */
  | 'intro'
  | 'catching'
  /** `onHello` said stop: the app shows its own screen. */
  | 'stopped'
  | 'newer'
  | 'damaged'
  | 'done';

/**
 * Stands in for the camera on the playground: calls `onCodes` with QR texts, returns a stop function.
 * Not part of the shared shapes; the app never passes it.
 */
export type CodeFeed = (onCodes: (codes: string[], now: number) => void) => () => void;

export function CatchScreen({ onCaught, onHello, onCancel, onUseFile, feed }: CatchScreenProps & { feed?: CodeFeed }) {
  const [phase, setPhase] = useState<Phase>('checking');
  const [camera, setCamera] = useState<CameraState>({ kind: 'starting' });
  // The catcher lives outside React's state, so a camera restart keeps what was caught.
  const catcher = useRef(new BeamCatcher());
  const [, redraw] = useState(0);
  const [now, setNow] = useState(() => performance.now());
  const [waitingSince, setWaitingSince] = useState<number | null>(null);
  const [foreignAt, setForeignAt] = useState<number | null>(null);
  const [confirmStop, setConfirmStop] = useState<null | (() => void)>(null);
  const handlers = useRef({ onCaught, onHello });
  handlers.current = { onCaught, onHello };

  useEffect(() => {
    let gone = false;
    void (feed ? Promise.resolve(false) : needsIntro()).then((intro) => {
      if (!gone) setPhase(intro ? 'intro' : 'catching');
    });
    unlockSound();
    const sleepAgain = keepAwake();
    return () => {
      gone = true;
      sleepAgain();
    };
    // Only on opening: `feed` is fixed for the screen's life.
  }, []);

  const onCodes = (codes: string[], at: number) => {
    for (const code of codes) {
      const update = catcher.current.read(code, at);
      if (update.type === 'foreign') setForeignAt(at);
      else if (update.type === 'newer') return setPhase('newer');
      else if (update.type === 'damaged') return setPhase('damaged');
      else if (update.type === 'hello' && handlers.current.onHello?.(update.hello) === 'stop') return setPhase('stopped');
      else if (update.type === 'done') {
        setPhase('done');
        honk();
        handlers.current.onCaught(update.payload, catcher.current.hello);
        return;
      }
    }
    redraw((n) => n + 1);
  };

  const onState = (state: CameraState) => {
    setCamera(state);
    if (state.kind === 'on') setWaitingSince(performance.now());
  };

  const cam = useCamera({ onCodes, onState, active: phase === 'catching' && !feed });
  const onCodesRef = useRef(onCodes);
  onCodesRef.current = onCodes;

  useEffect(() => {
    if (!feed || phase !== 'catching') return;
    onState({ kind: 'on', reader: 'bundled' });
    return feed((codes, at) => onCodesRef.current(codes, at));
  }, [feed, phase]);

  // A slow tick, so the hints appear even when the camera reads nothing at all.
  useEffect(() => {
    if (phase !== 'catching' || camera.kind !== 'on') return;
    const timer = setInterval(() => setNow(performance.now()), 500);
    return () => clearInterval(timer);
  }, [phase, camera.kind]);

  const c = catcher.current;
  const percent = Math.floor(c.progress * 100);
  const started = c.stats.firstAt !== null;
  const lastNews = Math.max(waitingSince ?? now, c.stats.lastUsefulAt ?? 0);
  const looking = phase === 'catching' && camera.kind === 'on';
  const showForeign = looking && foreignAt !== null && now - foreignAt < FOREIGN_SHOWS;
  const showHint = looking && started && now - lastNews > HINT_AFTER;
  const stuck = looking && now - lastNews > STUCK_AFTER;

  /** Leaving partway asks first, because the pieces caught so far would be lost. */
  const leave = (then: () => void) => {
    if (phase === 'catching' && c.progress > 0) setConfirmStop(() => then);
    else then();
  };

  const allowCamera = () => {
    unlockSound();
    try {
      localStorage.setItem(ASKED_KEY, '1');
    } catch {
      // Storage refused; the explainer just shows again next time.
    }
    setPhase('catching');
  };

  const catchAgain = () => {
    catcher.current = new BeamCatcher();
    setForeignAt(null);
    setWaitingSince(performance.now());
    setPhase('catching');
    cam.retry();
  };

  const label = c.hello
    ? `Catching "${c.hello.title}" from ${c.hello.senderName}, ${percent}%`
    : started
      ? `Catching, ${percent}%`
      : 'Looking for a code. Point at the screen that says Horn OK Please.';

  let notice: ReactNode = null;
  if (phase === 'intro') {
    notice = (
      <Notice title="Relay Docs needs the camera to catch." body="The camera only reads the code on the other screen. Nothing is recorded or sent anywhere.">
        <button type="button" className="bm-btn bm-btn-solid" onClick={allowCamera}>
          Allow camera
        </button>
        <button type="button" className="bm-btn" onClick={onUseFile}>
          Use a file instead
        </button>
      </Notice>
    );
  } else if (phase === 'newer') {
    notice = (
      <Notice
        warning
        title="Their phone has a newer Relay Docs."
        body="Their beam uses things this version can't read yet. Nothing in your doc was changed. They can still catch from you. Once you have internet, open the link to get the newer version, then catch again."
      >
        <button type="button" className="bm-btn bm-btn-solid" onClick={onCancel}>
          Back to the doc
        </button>
      </Notice>
    );
  } else if (phase === 'damaged') {
    notice = (
      <Notice warning title="This beam came through damaged." body="Nothing was changed. Ask them to beam again.">
        <button type="button" className="bm-btn bm-btn-solid" onClick={catchAgain}>
          Catch again
        </button>
        <button type="button" className="bm-btn" onClick={onCancel}>
          Back to the doc
        </button>
      </Notice>
    );
  } else if (phase === 'catching' && camera.kind === 'problem') {
    notice = <CameraNotice problem={camera.problem} percent={percent} onRetry={cam.retry} onCancel={onCancel} onUseFile={onUseFile} />;
  }

  return (
    <div className="bm-beam-screen" onPointerDown={unlockSound}>
      <div className="bm-catch-column">
        <button type="button" className="bm-back-link" onClick={() => leave(onCancel)}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M15 18l-6-6 6-6" />
          </svg>
          Cancel
        </button>
        <div className="bm-catch-camera">
          <div className={notice || phase === 'checking' ? 'bm-catch-view bm-hidden' : 'bm-catch-view'}>{cam.view}</div>
          {notice}
        </div>
        {!notice && phase !== 'checking' && (
          <div className="bm-catch-progress">
            <p className="bm-catch-label">{label}</p>
            <div className="bm-progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} aria-label="Caught so far">
              <span style={{ width: `${percent}%` }} />
            </div>
            <p className="bm-beam-small">Keep their screen inside the corners. Pieces can arrive in any order.</p>
            <p className="bm-beam-small bm-catch-hint" aria-live="polite">
              {showForeign ? words.foreignCode : showHint ? words.cantRead : ''}
            </p>
          </div>
        )}
      </div>
      {!notice && phase !== 'checking' && (
        <div className="bm-beam-bar">
          <button type="button" className={cam.canSwitch ? 'bm-btn' : 'bm-btn bm-span-all'} onClick={() => leave(onUseFile)}>
            Open a file
          </button>
          {cam.canSwitch && (
            <button type="button" className="bm-btn" onClick={cam.switchCamera}>
              Switch camera
            </button>
          )}
        </div>
      )}
      {stuck && !confirmStop && (
        <Sheet title={words.stillCantReadTitle} body={words.stillCantReadBody}>
          <button type="button" className="bm-btn bm-btn-solid" onClick={() => setWaitingSince(performance.now())}>
            Keep trying
          </button>
          <button type="button" className="bm-btn" onClick={() => leave(onUseFile)}>
            Use a file instead
          </button>
        </Sheet>
      )}
      {confirmStop && (
        <Sheet title="Stop catching?" body={`The ${percent}% caught so far will be lost. Your doc hasn't changed.`}>
          <button type="button" className="bm-btn bm-btn-solid" onClick={() => setConfirmStop(null)}>
            Keep catching
          </button>
          <button
            type="button"
            className="bm-btn"
            onClick={() => {
              setConfirmStop(null);
              confirmStop();
            }}
          >
            Stop
          </button>
        </Sheet>
      )}
    </div>
  );
}

function CameraNotice({
  problem,
  percent,
  onRetry,
  onCancel,
  onUseFile,
}: {
  problem: CameraProblem;
  percent: number;
  onRetry(): void;
  onCancel(): void;
  onUseFile(): void;
}) {
  const w = cameraWords[problem];
  if (problem === 'stopped' || problem === 'other') {
    const body = percent > 0 ? `The ${percent}% caught so far is kept while this screen stays open. ${w.body}` : w.body;
    return (
      <Notice warning={w.warning} title={w.title} body={body}>
        <button type="button" className="bm-btn bm-btn-solid" onClick={onRetry}>
          Carry on
        </button>
        <button type="button" className="bm-btn" onClick={onCancel}>
          Cancel
        </button>
      </Notice>
    );
  }
  return (
    <Notice warning={w.warning} title={w.title} body={w.body}>
      {w.retry ? (
        <>
          <button type="button" className="bm-btn bm-btn-solid" onClick={onRetry}>
            Try again
          </button>
          <button type="button" className="bm-btn" onClick={onUseFile}>
            Use a file instead
          </button>
        </>
      ) : (
        <>
          <button type="button" className="bm-btn bm-btn-solid" onClick={onUseFile}>
            Use a file instead
          </button>
          <button type="button" className="bm-btn" onClick={onCancel}>
            Back to the doc
          </button>
        </>
      )}
    </Notice>
  );
}

function Notice({ title, body, warning = false, children }: { title: string; body: string; warning?: boolean; children: ReactNode }) {
  return (
    <div className="bm-catch-notice" role="alert">
      <h2>
        {warning && <WarnIcon />}
        {title}
      </h2>
      <p>{body}</p>
      <div className="bm-notice-buttons">{children}</div>
    </div>
  );
}

function Sheet({ title, body, children }: { title: string; body: string; children: ReactNode }) {
  return (
    <div className="bm-sheet-cover">
      <div className="bm-sheet" role="dialog" aria-modal="true" aria-label={title}>
        <h2>{title}</h2>
        <p>{body}</p>
        <div className="bm-notice-buttons">{children}</div>
      </div>
    </div>
  );
}

/** True when the browser hasn't been asked for the camera yet, so the explainer should show first. */
async function needsIntro(): Promise<boolean> {
  // Without a secure address or a camera API, the camera's own problem notice shows instead.
  if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) return false;
  try {
    const status = await navigator.permissions.query({ name: 'camera' as PermissionName });
    return status.state === 'prompt';
  } catch {
    // Some browsers can't say (Firefox); fall back to whether this device has seen the explainer.
    try {
      return localStorage.getItem(ASKED_KEY) !== '1';
    } catch {
      return true;
    }
  }
}

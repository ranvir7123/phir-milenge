// The demo setup page, opened with ?demo-setup (never linked from the app's menus).
// Pick a role, confirm, and this device is wiped and loaded as that writer with its starting doc.
// It's the only way to reset a device between rehearsal, the video and the stage, because opening
// a file only ever adds. Plan: docs/plan/4-demo-pitch-handin.md, sections 4 and 7.

import { useCallback, useEffect, useState } from 'react';
import type { DeviceRecord } from '../contracts';
import { engine } from '../model';
import { TruckArt } from '../panels/TruckBack';
import { truckWords } from '../panels/format';
import { Icon, Warn } from '../shared/icons';
import { WriterMark } from '../shared/writer';
import { store, type HomeDocRecord } from '../store';
import { SETUP_STEPS, setUpAs, type SetupResult, type SetupStep } from './setup';
import { ROLES, type Role, type RoleInfo } from './writers';
import './demo.css';

type DeviceNow = { kind: 'checking' } | { kind: 'known'; device: DeviceRecord | null; docs: HomeDocRecord[] } | { kind: 'unreadable' };

type Phase =
  | { kind: 'pick' }
  | { kind: 'confirm' }
  | { kind: 'working'; step: SetupStep }
  | { kind: 'done'; result: SetupResult }
  | { kind: 'failed'; step: SetupStep; message: string };

const kb = (bytes: number) => `${(bytes / 1024).toFixed(1)} KB`;
const docCount = (n: number) => (n === 1 ? '1 doc' : `${n} docs`);
/** "Rina", or "the spare profile", to read well inside a sentence. */
const asWho = (role: RoleInfo) => (role.role === 'spare' ? 'the spare profile' : role.label);

/** The plain address of the app: the same page with nothing after the "?". */
const APP_ADDRESS = typeof window === 'undefined' ? './' : window.location.pathname;

function useDeviceNow(): [DeviceNow, () => void] {
  const [now, setNow] = useState<DeviceNow>({ kind: 'checking' });
  const check = useCallback(() => {
    setNow({ kind: 'checking' });
    Promise.all([store.getDevice(), store.listDocs()])
      .then(([device, docs]) => setNow({ kind: 'known', device, docs }))
      .catch((e: unknown) => {
        console.error(e);
        setNow({ kind: 'unreadable' });
      });
  }, []);
  useEffect(check, [check]);
  return [now, check];
}

function DeviceLine({ now }: { now: DeviceNow }) {
  if (now.kind === 'checking') return <p className="ds-now-value quiet">Checking this device…</p>;
  if (now.kind === 'unreadable')
    return (
      <p className="ds-now-value warn-line">
        <Warn />
        <span>
          <b>Can't read this device's storage.</b> A private window doesn't keep anything; use a normal window.
        </span>
      </p>
    );
  const { device, docs } = now;
  if (!device && docs.length === 0) return <p className="ds-now-value">Empty. Nothing is saved here yet.</p>;
  const shown = docs.slice(0, 3);
  return (
    <div className="ds-now-value">
      <p>
        <b>{device ? device.name : 'No writer yet'}</b>
        {device?.place ? `, ${device.place}` : ''}
        <span className="quiet"> · {docCount(docs.length)}</span>
      </p>
      {shown.length > 0 && (
        <ul className="ds-now-docs">
          {shown.map((d) => (
            <li key={d.docId} className="one-line">
              {d.title || 'Untitled doc'}
            </li>
          ))}
          {docs.length > shown.length && <li className="quiet">and {docCount(docs.length - shown.length)} more</li>}
        </ul>
      )}
    </div>
  );
}

function RoleList({ picked, onPick, disabled }: { picked: Role | null; onPick(role: Role): void; disabled: boolean }) {
  return (
    <div className="ds-roles" role="radiogroup" aria-label="Set this device up as">
      {ROLES.map((r) => (
        <button
          key={r.role}
          type="button"
          role="radio"
          aria-checked={picked === r.role}
          disabled={disabled}
          className={`ds-role${picked === r.role ? ' is-picked' : ''}`}
          onClick={() => onPick(r.role)}
        >
          <span className="ds-role-mark">
            <WriterMark colour={r.writer.colour} height={18} />
          </span>
          <span className="ds-role-text">
            <span className="ds-role-name">
              {r.label}
              {r.writer.place && <span className="quiet">, {r.writer.place}</span>}
            </span>
            <span className="ds-role-holds">{r.holds}</span>
          </span>
          <span className="ds-dot" aria-hidden="true" />
        </button>
      ))}
    </div>
  );
}

function ConfirmBox({ role, now, onGo, onCancel }: { role: RoleInfo; now: DeviceNow; onGo(): void; onCancel(): void }) {
  const known = now.kind === 'known' ? now : null;
  const empty = known && !known.device && known.docs.length === 0;
  return (
    <section className="ds-box ds-confirm" aria-labelledby="ds-confirm-title">
      <h2 id="ds-confirm-title" className="display">
        Wipe this device and load it as {asWho(role)}?
      </h2>
      {empty ? (
        <p>Nothing is saved on this device yet, so nothing is lost.</p>
      ) : (
        <p className="warn-line">
          <Warn />
          <span>
            <b>Warning:</b> everything saved on this device is deleted first
            {known ? ` (${docCount(known.docs.length)}${known.device ? ` and the writer ${known.device.name}` : ''})` : ''}. This can't be undone.
          </span>
        </p>
      )}
      <p className="quiet">Close the app in this browser's other tabs first, or they keep the old doc open.</p>
      <div className="ds-buttons">
        <button type="button" className="ui-btn ui-btn-main ui-btn-tall" onClick={onGo} autoFocus>
          Wipe and load
        </button>
        <button type="button" className="ui-btn ui-btn-tall" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </section>
  );
}

function Steps({ at, failed }: { at: SetupStep; failed?: boolean }) {
  const index = SETUP_STEPS.findIndex((s) => s.step === at);
  return (
    <ol className="ds-steps">
      {SETUP_STEPS.map((s, i) => {
        const state = i < index ? 'done' : i === index ? (failed ? 'failed' : 'now') : 'later';
        return (
          <li key={s.step} className={`ds-step is-${state}`}>
            <span className="ds-step-mark" aria-hidden="true">
              {state === 'done' && <Icon name="tick" size={18} />}
              {state === 'now' && <span className="ds-spinner" />}
              {state === 'failed' && <Warn size={18} />}
            </span>
            <span>
              {s.label}
              {state === 'done' && <span className="visually-hidden">, done</span>}
              {state === 'failed' && <span className="warn-word"> stopped</span>}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function DoneBox({ role, result, onAgain }: { role: RoleInfo; result: SetupResult; onAgain(): void }) {
  return (
    <section className="ds-box ds-done" aria-labelledby="ds-done-title">
      <h2 id="ds-done-title" className="display" tabIndex={-1} ref={(el) => el?.focus()}>
        {role.role === 'spare' ? 'This is the spare profile now.' : `This device is ${role.label} now.`}
      </h2>
      <p>
        It holds <b>{result.title}</b>: {result.changes} changes, {kb(result.size)}.
      </p>
      <div className="ds-truck">
        <TruckArt hex={result.fingerprint.hex} className="ds-truck-art" />
        <div className="ds-truck-text">
          <span className="ds-truck-label">Truck back to expect</span>
          <span className="ds-truck-words">
            {truckWords(result.fingerprint.words)} <span className="ds-truck-digits">{result.fingerprint.digits}</span>
          </span>
        </div>
      </div>
      <p className="quiet">The app opens straight into this doc. Its truck back should show these same words.</p>
      <div className="ds-buttons">
        <a className="ui-btn ui-btn-main ui-btn-tall" href={APP_ADDRESS}>
          Open the app
        </a>
        <button type="button" className="link-btn" onClick={onAgain}>
          Set up as someone else
        </button>
      </div>
    </section>
  );
}

export function DemoSetupPage() {
  const [now, recheck] = useDeviceNow();
  const [picked, setPicked] = useState<Role | null>(null);
  const [phase, setPhase] = useState<Phase>({ kind: 'pick' });
  const role = ROLES.find((r) => r.role === picked) ?? null;
  const busy = phase.kind === 'working';

  const go = async () => {
    if (!role) return;
    let step: SetupStep = 'read';
    const onStep = (s: SetupStep) => {
      step = s;
      setPhase({ kind: 'working', step: s });
    };
    onStep('read');
    try {
      const { STARTING_FILES } = await import('./starting-files');
      const result = await setUpAs(role, { store, engine, files: STARTING_FILES }, onStep);
      setPhase({ kind: 'done', result });
    } catch (e) {
      console.error(e);
      setPhase({ kind: 'failed', step, message: e instanceof Error ? e.message : String(e) });
    } finally {
      recheck();
    }
  };

  const back = () => {
    setPhase({ kind: 'pick' });
    recheck();
  };

  return (
    <main className="ds-page">
      <header className="ds-head">
        <p className="ds-kicker">Developer page · not in the app's menus</p>
        <h1 className="display ds-title">Demo setup</h1>
        <p className="ds-sub">
          Turns this device into one writer from the demo, holding their starting doc. Use it before rehearsal, the video and the stage.
        </p>
      </header>

      <section className="ds-now" aria-label="What this device holds now">
        <span className="ds-label">This device now</span>
        <DeviceLine now={now} />
      </section>

      {phase.kind === 'done' && role ? (
        <DoneBox role={role} result={phase.result} onAgain={back} />
      ) : (
        <>
          <section aria-labelledby="ds-roles-title">
            <h2 id="ds-roles-title" className="ds-label">
              Set this device up as
            </h2>
            <RoleList
              picked={picked}
              disabled={busy || phase.kind === 'confirm'}
              onPick={(r) => {
                setPicked(r);
                if (phase.kind === 'failed') setPhase({ kind: 'pick' });
              }}
            />
          </section>

          {phase.kind === 'pick' && (
            <div className="ds-buttons ds-go">
              <button type="button" className="ui-btn ui-btn-main ui-btn-tall ui-btn-wide" disabled={!role || now.kind === 'unreadable'} onClick={() => setPhase({ kind: 'confirm' })}>
                {role ? `Wipe and load as ${asWho(role)}` : 'Pick who this device is'}
              </button>
            </div>
          )}

          {phase.kind === 'confirm' && role && <ConfirmBox role={role} now={now} onGo={go} onCancel={() => setPhase({ kind: 'pick' })} />}

          {phase.kind === 'working' && role && (
            <section className="ds-box" aria-live="polite" aria-labelledby="ds-working-title">
              <h2 id="ds-working-title" className="display">
                Setting up as {asWho(role)}…
              </h2>
              <Steps at={phase.step} />
            </section>
          )}

          {phase.kind === 'failed' && role && (
            <section className="ds-box ds-failed" role="alert" aria-labelledby="ds-failed-title">
              <h2 id="ds-failed-title" className="display">
                Setup stopped.
              </h2>
              <Steps at={phase.step} failed />
              <p className="ds-error">{phase.message}</p>
              <p>{phase.step === 'read' ? 'Nothing on this device was changed.' : 'This device may be half set up. Try again: it starts again from the wipe.'}</p>
              <div className="ds-buttons">
                <button type="button" className="ui-btn ui-btn-main ui-btn-tall" onClick={go}>
                  Try again
                </button>
                <button type="button" className="ui-btn ui-btn-tall" onClick={back}>
                  Back
                </button>
              </div>
            </section>
          )}
        </>
      )}
    </main>
  );
}

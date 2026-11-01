// First open: your name, and where you are (2-user-experience.md, "Getting in", part 4).
import { useRef, useState } from 'react';
import { NAME_MAX } from '../../shared/names';
import type { OfflineStatus } from '../state';
import { OfflineLine } from './Parts';

export interface FirstOpenProps {
  offline: OfflineStatus;
  onGo(name: string, place: string, how: 'new' | 'catch' | 'file'): void;
}

export function FirstOpen({ offline, onGo }: FirstOpenProps) {
  const [name, setName] = useState('');
  const [place, setPlace] = useState('');
  const [needName, setNeedName] = useState(false);
  const nameBox = useRef<HTMLInputElement>(null);

  const go = (how: 'new' | 'catch' | 'file') => {
    if (!name.trim()) {
      setNeedName(true);
      nameBox.current?.focus();
      return;
    }
    onGo(name, place, how);
  };

  return (
    <main className="first-open">
      <div className="first-open-top">
        <h1 className="display first-open-title">Phir Milenge</h1>
        <p className="first-open-line">A document editor that works with no signal. Phones swap what's new whenever they meet.</p>
      </div>

      <form
        className="first-open-form"
        onSubmit={(e) => {
          e.preventDefault();
          go('new');
        }}
      >
        <div>
          <label className="field-label" htmlFor="first-name">
            Your name
          </label>
          <input
            id="first-name"
            ref={nameBox}
            className="field"
            value={name}
            maxLength={NAME_MAX}
            autoFocus
            autoComplete="given-name"
            enterKeyHint="next"
            aria-invalid={needName && !name.trim()}
            aria-describedby={needName ? 'first-name-need' : undefined}
            onChange={(e) => setName(e.target.value)}
          />
          {needName && !name.trim() && (
            <p id="first-name-need" className="field-note warn-word" role="alert">
              Type your name first, so people know who wrote what.
            </p>
          )}
        </div>
        <div>
          <label className="field-label" htmlFor="first-place">
            Where are you? <span className="quiet">(you can change it any time)</span>
          </label>
          <input
            id="first-place"
            className="field"
            value={place}
            maxLength={NAME_MAX}
            placeholder="For example, Room 12 or Gosaba camp"
            enterKeyHint="done"
            onChange={(e) => setPlace(e.target.value)}
          />
        </div>

        <div className="first-open-buttons">
          <button type="submit" className="ui-btn ui-btn-main ui-btn-tall ui-btn-wide">
            Start a new doc
          </button>
          <button type="button" className="ui-btn ui-btn-tall ui-btn-wide" onClick={() => go('catch')}>
            Catch a doc from a friend
          </button>
          <button type="button" className="link-btn" onClick={() => go('file')}>
            or open a file
          </button>
        </div>
      </form>

      <footer className="first-open-foot">
        <OfflineLine status={offline} showReady />
      </footer>
    </main>
  );
}

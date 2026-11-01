// Small pieces the app shell's screens share.
import type { ReactNode } from 'react';
import { Icon, Warn } from '../../shared/icons';
import type { Action, Message, Notice, OfflineStatus } from '../state';

export function ActionButton({ action, tall = true }: { action: Action; tall?: boolean }) {
  const style = action.style === 'main' ? 'ui-btn-main' : action.style === 'beam' ? 'ui-btn-beam' : '';
  return (
    <button type="button" className={`ui-btn ${style} ${tall ? 'ui-btn-tall' : ''}`} onClick={action.run}>
      {action.style === 'beam' && <Icon name="beam" />}
      {action.label}
    </button>
  );
}

/** The warning icon, a bold first sentence, then the rest of the message. */
export function MessageText({ message }: { message: Pick<Message, 'warn' | 'title' | 'body'> }) {
  return (
    <div className="message-text">
      {message.warn && <Warn size={22} />}
      <p>
        <b>{message.title}</b> {message.body}
      </p>
    </div>
  );
}

const OFFLINE_LINES: Record<OfflineStatus, string> = {
  unknown: '',
  'getting-ready': 'Getting ready for no signal. Keep the internet on for a moment.',
  slow: 'Still getting ready. Keep the internet on, or move somewhere with a better signal.',
  'not-ready-offline': '',
  ready: 'Ready to work with no signal.',
};

/** The getting-ready line at the bottom of first open (and the docs home until the app is saved). */
export function OfflineLine({ status, showReady }: { status: OfflineStatus; showReady: boolean }) {
  if (status === 'not-ready-offline') {
    return (
      <div className="offline-line warn-line" role="status">
        <Warn size={18} />
        <span>
          <b>Not ready for no signal yet.</b> Turn the internet back on for a moment before you go offline. It carries on
          by itself once the internet is back.
        </span>
      </div>
    );
  }
  if (status === 'ready' && !showReady) return null;
  const text = OFFLINE_LINES[status];
  if (!text) return null;
  return (
    <p className="offline-line quiet" role="status">
      {status === 'ready' && <Icon name="tick" size={16} />}
      {text}
    </p>
  );
}

/** A line at the bottom of the screen with one button, like "Removed from this phone. Undo". */
export function NoticeBar({ notice }: { notice: Notice | null }) {
  if (!notice) return null;
  return (
    <div className="notice" role="status">
      <span>{notice.text}</span>
      {notice.action && (
        <button type="button" className="notice-btn" onClick={notice.action.run}>
          {notice.action.label}
        </button>
      )}
    </div>
  );
}

/** "A newer Phir Milenge is ready." Never reloads by itself. */
export function UpdateBar({ onReload, onLater }: { onReload(): void; onLater(): void }) {
  return (
    <div className="notice notice-update" role="status">
      <span>
        <b>A newer Phir Milenge is ready.</b> It opens next time you reload. Your docs stay as they are.
      </span>
      <span className="notice-buttons">
        <button type="button" className="ui-btn ui-btn-main" onClick={onReload}>
          Reload now
        </button>
        <button type="button" className="ui-btn" onClick={onLater}>
          Later
        </button>
      </span>
    </div>
  );
}

/** A bottom sheet on phones, a centred box on the laptop. Tapping outside closes it. */
export function Sheet({ label, onClose, children }: { label: string; onClose(): void; children: ReactNode }) {
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={label} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-grab" />
        {children}
      </div>
    </div>
  );
}

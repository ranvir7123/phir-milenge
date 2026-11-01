// Every full-screen message: errors, "That's a different doc", the other tab, and so on.
import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Icon } from '../../shared/icons';
import { layoutNow } from '../layout';
import type { Message } from '../state';
import { ActionButton, MessageText } from './Parts';

export function MessageScreen({ message, onBack }: { message: Message; onBack?(): void }) {
  return (
    <main className="message-screen">
      {message.back && onBack && (
        <button type="button" className="back-btn" onClick={onBack}>
          <Icon name="left" size={18} />
          Docs
        </button>
      )}
      <div className="message-middle">
        <MessageText message={message} />
        <div className="message-buttons">
          {message.actions.map((a) => (
            <ActionButton key={a.label} action={a} />
          ))}
        </div>
      </div>
    </main>
  );
}

/** "Phir Milenge stopped." when a screen hits a bug. Every change is already stored, so a reload is safe. */
export class Crash extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    console.error(error, info.componentStack);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <MessageScreen
        message={{
          warn: true,
          title: 'Phir Milenge stopped.',
          body: `Your doc is saved on this ${layoutNow()} up to your last change. Reload to carry on.`,
          actions: [{ label: 'Reload', style: 'main', run: () => location.reload() }],
        }}
      />
    );
  }
}

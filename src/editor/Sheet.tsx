// A sheet that slides up from the bottom on a phone, and a small box over the page on a laptop.

import { useEffect, useRef, type ReactNode } from 'react';
import { Icon } from './icons';

export function Sheet({
  title,
  layout,
  onClose,
  children,
  footer,
  keepFocus,
}: {
  title: string;
  layout: 'phone' | 'laptop';
  onClose(): void;
  children: ReactNode;
  footer?: ReactNode;
  /** Toolbar-like sheets (Text, Insert) must not take the cursor out of the doc. */
  keepFocus?: boolean;
}) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    if (!keepFocus) box.current?.querySelector<HTMLElement>('input, textarea, select')?.focus();
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, keepFocus]);
  return (
    <div className={`sh-wrap sh-${layout}`}>
      <div className="sh-back" onClick={onClose} onMouseDown={(e) => keepFocus && e.preventDefault()} />
      <div
        ref={box}
        className="sh-box"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onMouseDown={(e) => {
          if (!keepFocus) return;
          const t = e.target as HTMLElement;
          if (!t.closest('input, textarea, select')) e.preventDefault();
        }}
      >
        <div className="sh-head">
          <h2 className="sh-title">{title}</h2>
          <button type="button" className="ed-tool" aria-label="Close" title="Close (Esc)" onClick={onClose}>
            <Icon name="close" />
          </button>
        </div>
        <div className="sh-body">{children}</div>
        {footer && <div className="sh-foot">{footer}</div>}
      </div>
    </div>
  );
}

// Phone or laptop layout: the laptop layout (side panel beside the page) from 900px wide.
import { useSyncExternalStore } from 'react';

const QUERY = '(min-width: 900px)';

function subscribe(onChange: () => void): () => void {
  const mq = matchMedia(QUERY);
  mq.addEventListener('change', onChange);
  return () => mq.removeEventListener('change', onChange);
}

/**
 * The layout, which is also this device's word on screen: "Saved on this laptop", "Docs on this laptop".
 * For words made outside a screen (messages, the line at the bottom); screens use useLayout.
 */
export function layoutNow(): 'phone' | 'laptop' {
  return matchMedia(QUERY).matches ? 'laptop' : 'phone';
}

export function useLayout(): 'phone' | 'laptop' {
  return useSyncExternalStore(subscribe, layoutNow, () => 'phone');
}

/** A clock that ticks once a minute, for "2 min ago". */
let now = Date.now();
const listeners = new Set<() => void>();
setInterval(() => {
  now = Date.now();
  listeners.forEach((l) => l());
}, 30_000);

export function useNow(): number {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => now,
  );
}

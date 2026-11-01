// Phone or laptop layout: the laptop layout (side panel beside the page) from 900px wide.
import { useSyncExternalStore } from 'react';

const QUERY = '(min-width: 900px)';

function subscribe(onChange: () => void): () => void {
  const mq = matchMedia(QUERY);
  mq.addEventListener('change', onChange);
  return () => mq.removeEventListener('change', onChange);
}

export function useLayout(): 'phone' | 'laptop' {
  return useSyncExternalStore(
    subscribe,
    () => (matchMedia(QUERY).matches ? 'laptop' : 'phone'),
    () => 'phone',
  );
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

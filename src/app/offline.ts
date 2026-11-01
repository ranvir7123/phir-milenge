/// <reference types="vite-plugin-pwa/client" />
// Saving the app onto the phone for no signal, and the "newer version" message.
// The service worker never reloads the page by itself: only "Reload now" does.
import { registerSW } from 'virtual:pwa-register';
import { useApp, type OfflineStatus } from './state';

let applyUpdate: ((reload?: boolean) => Promise<void>) | null = null;

export function startOffline(): void {
  if (import.meta.env.DEV || typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  let slow = false;
  const set = (offline: OfflineStatus) => useApp.setState({ offline });
  const ready = () => set('ready');
  const settle = () => {
    if (useApp.getState().offline === 'ready') return;
    if (!navigator.onLine) set('not-ready-offline');
    else set(slow ? 'slow' : 'getting-ready');
  };

  if (navigator.serviceWorker.controller) ready();
  else settle();
  applyUpdate = registerSW({
    immediate: true,
    onOfflineReady: ready,
    onNeedRefresh: () => useApp.setState({ updateReady: true }),
  });
  void navigator.serviceWorker.ready.then(ready);
  setTimeout(() => {
    slow = true;
    settle();
  }, 30_000);
  addEventListener('online', settle);
  addEventListener('offline', settle);
}

export function reloadForUpdate(): void {
  if (applyUpdate) void applyUpdate(true);
  else location.reload();
}

// Keeps the screen awake while beaming or catching, where the browser allows it (Screen Wake Lock).

interface WakeLockSentinelLike {
  release(): Promise<void>;
}

/** Returns a function that lets the screen sleep again. `onUnavailable` runs if the browser says no. */
export function keepAwake(onUnavailable?: () => void): () => void {
  const wakeLock = (navigator as { wakeLock?: { request(type: 'screen'): Promise<WakeLockSentinelLike> } }).wakeLock;
  if (!wakeLock) {
    onUnavailable?.();
    return () => {};
  }
  let sentinel: WakeLockSentinelLike | null = null;
  let stopped = false;
  const request = () => {
    wakeLock
      .request('screen')
      .then((s) => {
        if (stopped) void s.release();
        else sentinel = s;
      })
      .catch(() => onUnavailable?.());
  };
  // The browser drops the lock when the page is hidden; ask again when it comes back.
  const onVisible = () => {
    if (document.visibilityState === 'visible' && !stopped) request();
  };
  request();
  document.addEventListener('visibilitychange', onVisible);
  return () => {
    stopped = true;
    document.removeEventListener('visibilitychange', onVisible);
    void sentinel?.release().catch(() => {});
  };
}

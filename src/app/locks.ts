// One tab at a time can change a doc, so two tabs never write the same doc as the same writer
// (2-user-experience.md, "Two tabs of the app on one laptop"). Uses the browser's Web Locks.
import type { DocId } from '../contracts';

export interface DocLock {
  release(): void;
}

const NO_LOCKS: DocLock = { release() {} };

/**
 * Takes the doc's lock. Resolves null when another tab holds it (unless `steal`: "Use this tab").
 * `onLost` runs if another tab later takes it with "Use this tab".
 */
export function holdDocLock(docId: DocId, steal: boolean, onLost: () => void): Promise<DocLock | null> {
  if (typeof navigator === 'undefined' || !navigator.locks) return Promise.resolve(NO_LOCKS);
  return new Promise((resolve) => {
    let release: () => void = () => {};
    const held = new Promise<void>((r) => (release = r));
    navigator.locks
      .request(`phir-doc:${docId}`, steal ? { steal: true } : { ifAvailable: true }, async (lock) => {
        if (!lock) {
          resolve(null);
          return;
        }
        resolve({ release });
        await held;
      })
      .catch((e: unknown) => {
        // A stolen lock ends the old request with AbortError.
        if (e instanceof DOMException && e.name === 'AbortError') onLost();
        else resolve(NO_LOCKS);
      });
  });
}

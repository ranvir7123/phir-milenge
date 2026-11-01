// Saving docs on the device (IndexedDB). Owned by track E. Shapes: src/contracts/store.ts.
import type { Store } from '../contracts';

function notBuilt(): never {
  throw new Error('Store is not built yet (track E)');
}

export const store: Store = new Proxy({} as Store, {
  get: () => () => notBuilt(),
});

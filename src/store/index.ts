// Saving docs on the device (IndexedDB). Owned by track E. Shapes: src/contracts/store.ts.
// One database, `phir-milenge`, with three stores (docs/plan/3-how-its-built.md, section 3.2):
//   device   this phone's writer, plus a few small remembered values (last doc open, one-time cards)
//   docs     one row per doc, with a summary for the docs home
//   changes  every change of every doc, keyed by [docId, change id], with the order it first arrived
import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { ActorId, Change, ChangeId, DeviceRecord, DocId, DocRecord, Store, StoredChange, WriterColour } from '../contracts';

/** What a docs-home row shows without opening the doc. Saved whenever the app has the doc open. */
export interface DocSummary {
  /** The truck-back words and digits. */
  words: [string, string, string];
  digits: string;
  /** Everyone who wrote in the doc, in the order they first wrote. */
  writers: { actor: ActorId; name: string; colour: WriterColour | null }[];
  /** Who made the last change and how it got here. */
  last: { kind: 'you' | 'beam' | 'file'; name: string; t: number } | null;
  /** "1 rule broken · 1 sentence with two versions", or '' when nothing needs a look. */
  needsLook: string;
}

export interface HomeDocRecord extends DocRecord {
  summary?: DocSummary;
}

/** The shared Store, plus what only the app shell needs. */
export interface AppStore extends Store {
  listDocs(): Promise<HomeDocRecord[]>;
  putDoc(doc: HomeDocRecord): Promise<void>;
  getDoc(docId: DocId): Promise<HomeDocRecord | null>;
  /** The doc the app opens in next time. */
  getLastDoc(): Promise<DocId | null>;
  setLastDoc(docId: DocId | null): Promise<void>;
  /** Small yes/no values, such as "the home-screen card was shown". */
  getFlag(name: string): Promise<boolean>;
  setFlag(name: string, on: boolean): Promise<void>;
}

interface PhirDB extends DBSchema {
  device: { key: string; value: unknown };
  docs: { key: DocId; value: HomeDocRecord };
  changes: { key: [DocId, ChangeId]; value: StoredChange; indexes: { byDoc: DocId } };
}

const DEVICE = 'me';
const LAST_DOC = 'last-doc';
const KEPT = 'asked-to-keep';
const flagKey = (name: string) => `flag:${name}`;

export function createStore(name = 'phir-milenge'): AppStore {
  let opening: Promise<IDBPDatabase<PhirDB>> | null = null;

  // Opened on first use, so importing this file never touches storage.
  function db(): Promise<IDBPDatabase<PhirDB>> {
    if (!opening) {
      opening = openDB<PhirDB>(name, 1, {
        upgrade(d) {
          d.createObjectStore('device');
          d.createObjectStore('docs', { keyPath: 'docId' });
          const changes = d.createObjectStore('changes', { keyPath: ['docId', 'change.id'] });
          changes.createIndex('byDoc', 'docId');
        },
        // A newer version of the app opened in another tab: let it upgrade, and reopen next time.
        blocking() {
          void opening?.then((d) => d.close());
          opening = null;
        },
      });
      // A failed open is tried again next time, rather than remembered.
      opening.catch(() => {
        opening = null;
      });
    }
    return opening;
  }

  async function getValue<T>(key: string): Promise<T | undefined> {
    return (await (await db()).get('device', key)) as T | undefined;
  }

  async function setValue(key: string, value: unknown): Promise<void> {
    await (await db()).put('device', value, key);
  }

  return {
    async getDevice() {
      return (await getValue<DeviceRecord>(DEVICE)) ?? null;
    },

    async setDevice(device) {
      await setValue(DEVICE, device);
    },

    async listDocs() {
      const docs = await (await db()).getAll('docs');
      return docs.sort((a, b) => b.updatedAt - a.updatedAt);
    },

    async getDoc(docId) {
      return (await (await db()).get('docs', docId)) ?? null;
    },

    async putDoc(doc) {
      await (await db()).put('docs', doc);
    },

    async removeDoc(docId) {
      const tx = (await db()).transaction(['docs', 'changes'], 'readwrite');
      const changes = tx.objectStore('changes');
      const keys = await changes.index('byDoc').getAllKeys(docId);
      await Promise.all([tx.objectStore('docs').delete(docId), ...keys.map((k) => changes.delete(k))]);
      await tx.done;
    },

    async addChanges(docId, list: Change[]) {
      if (list.length === 0) return 0;
      const tx = (await db()).transaction('changes', 'readwrite');
      // Changes are only ever removed with their whole doc, so the count is also the next arrival number.
      let next = await tx.store.index('byDoc').count(docId);
      const seen = new Set<ChangeId>();
      let added = 0;
      for (const change of list) {
        if (seen.has(change.id)) continue;
        seen.add(change.id);
        // Never overwrite: a change id is stored once, with whatever arrived first.
        if ((await tx.store.getKey([docId, change.id])) !== undefined) continue;
        await tx.store.add({ docId, change, arrival: next++ });
        added++;
      }
      await tx.done;
      return added;
    },

    async loadChanges(docId) {
      const stored = await (await db()).getAllFromIndex('changes', 'byDoc', docId);
      return stored.sort((a, b) => a.arrival - b.arrival);
    },

    async arrivalOrder(docId) {
      const stored = await this.loadChanges(docId);
      return new Map(stored.map((s) => [s.change.id, s.arrival]));
    },

    async wipeAll() {
      const tx = (await db()).transaction(['device', 'docs', 'changes'], 'readwrite');
      await Promise.all([tx.objectStore('device').clear(), tx.objectStore('docs').clear(), tx.objectStore('changes').clear()]);
      await tx.done;
    },

    async askToKeep() {
      const asked = await getValue<boolean>(KEPT);
      if (asked !== undefined) return asked;
      let kept = false;
      try {
        kept = (await globalThis.navigator?.storage?.persist?.()) ?? false;
      } catch {
        kept = false;
      }
      await setValue(KEPT, kept);
      return kept;
    },

    async space() {
      try {
        const estimate = await globalThis.navigator?.storage?.estimate?.();
        if (!estimate) return null;
        const used = estimate.usage ?? 0;
        return { used, available: Math.max(0, (estimate.quota ?? 0) - used) };
      } catch {
        return null;
      }
    },

    async getLastDoc() {
      return (await getValue<DocId | null>(LAST_DOC)) ?? null;
    },

    async setLastDoc(docId) {
      await setValue(LAST_DOC, docId);
    },

    async getFlag(flag) {
      return (await getValue<boolean>(flagKey(flag))) ?? false;
    },

    async setFlag(flag, on) {
      await setValue(flagKey(flag), on);
    },
  };
}

/** The device's store. Every track uses this one. */
export const store: AppStore = createStore();

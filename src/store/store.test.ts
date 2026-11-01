import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { Change, DocRecord } from '../contracts';
import { createStore, type AppStore } from './index';

const DOC_A = 'a'.repeat(32);
const DOC_B = 'b'.repeat(32);

function change(actor: string, seq: number, text = `hello ${seq}`): Change {
  return {
    id: `${actor}:${seq}`,
    actor,
    seq,
    deps: seq > 1 ? [`${actor}:${seq - 1}`] : [],
    t: 1_000 + seq,
    kind: 'edit',
    ops: [{ o: 'set', k: 'title', v: text }],
  };
}

function doc(docId: string, updatedAt: number, title = 'Untitled doc'): DocRecord {
  return { docId, title, template: 'blank', updatedAt, size: 100 };
}

let store: AppStore;

beforeEach(() => {
  // A fresh, empty IndexedDB for every test.
  globalThis.indexedDB = new IDBFactory();
  store = createStore();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('device', () => {
  test('has no device before first open, then keeps the one set', async () => {
    expect(await store.getDevice()).toBeNull();
    await store.setDevice({ actor: '0123456789abcdef', name: 'Rina', place: 'Gosaba camp', createdAt: 5 });
    expect(await store.getDevice()).toEqual({ actor: '0123456789abcdef', name: 'Rina', place: 'Gosaba camp', createdAt: 5 });
  });

  test('a changed name replaces the old one', async () => {
    await store.setDevice({ actor: '0123456789abcdef', name: 'Rina', createdAt: 5 });
    await store.setDevice({ actor: '0123456789abcdef', name: 'Rina M', place: 'Basanti', createdAt: 5 });
    expect(await store.getDevice()).toMatchObject({ name: 'Rina M', place: 'Basanti' });
  });
});

describe('docs', () => {
  test('lists docs newest change first', async () => {
    await store.putDoc(doc(DOC_A, 10));
    await store.putDoc(doc(DOC_B, 20));
    expect((await store.listDocs()).map((d) => d.docId)).toEqual([DOC_B, DOC_A]);
  });

  test('putting the same doc again updates its row', async () => {
    await store.putDoc(doc(DOC_A, 10, 'Old'));
    await store.putDoc(doc(DOC_A, 30, 'New'));
    const docs = await store.listDocs();
    expect(docs).toHaveLength(1);
    expect(docs[0]).toMatchObject({ title: 'New', updatedAt: 30 });
  });

  test('keeps the home-screen summary stored with a doc', async () => {
    const summary = { words: ['chai', 'jetty', 'mango'] as [string, string, string], digits: '42', writers: [], last: null, needsLook: '' };
    await store.putDoc({ ...doc(DOC_A, 10), summary });
    expect((await store.listDocs())[0]).toMatchObject({ summary });
  });
});

describe('changes', () => {
  test('saves new changes and says how many were new', async () => {
    expect(await store.addChanges(DOC_A, [change('r', 1), change('r', 2)])).toBe(2);
    expect((await store.loadChanges(DOC_A)).map((s) => s.change.id)).toEqual(['r:1', 'r:2']);
  });

  test('never stores a change twice and never overwrites one', async () => {
    await store.addChanges(DOC_A, [change('r', 1, 'first')]);
    expect(await store.addChanges(DOC_A, [change('r', 1, 'imposter'), change('r', 2)])).toBe(1);
    const stored = await store.loadChanges(DOC_A);
    expect(stored).toHaveLength(2);
    expect(stored[0]!.change.ops).toEqual([{ o: 'set', k: 'title', v: 'first' }]);
  });

  test('a change repeated inside one batch is saved once', async () => {
    expect(await store.addChanges(DOC_A, [change('r', 1), change('r', 1)])).toBe(1);
    expect(await store.loadChanges(DOC_A)).toHaveLength(1);
  });

  test('remembers the order changes first arrived on this phone', async () => {
    await store.addChanges(DOC_A, [change('r', 2), change('a', 1)]);
    await store.addChanges(DOC_A, [change('r', 1), change('a', 1)]);
    const stored = await store.loadChanges(DOC_A);
    expect(stored.map((s) => [s.change.id, s.arrival])).toEqual([
      ['r:2', 0],
      ['a:1', 1],
      ['r:1', 2],
    ]);
    const order = await store.arrivalOrder(DOC_A);
    expect([...order.entries()]).toEqual([
      ['r:2', 0],
      ['a:1', 1],
      ['r:1', 2],
    ]);
  });

  test('each doc keeps its own changes and its own arrival count', async () => {
    await store.addChanges(DOC_A, [change('r', 1)]);
    await store.addChanges(DOC_B, [change('r', 1), change('r', 2)]);
    expect(await store.loadChanges(DOC_A)).toEqual([{ docId: DOC_A, change: change('r', 1), arrival: 0 }]);
    expect((await store.loadChanges(DOC_B)).map((s) => s.arrival)).toEqual([0, 1]);
  });

  test('an empty batch adds nothing', async () => {
    expect(await store.addChanges(DOC_A, [])).toBe(0);
  });

  test('a doc with no changes loads as empty', async () => {
    expect(await store.loadChanges(DOC_A)).toEqual([]);
    expect((await store.arrivalOrder(DOC_A)).size).toBe(0);
  });
});

describe('removing and wiping', () => {
  test('removing a doc takes its row and its changes, and nothing else', async () => {
    await store.putDoc(doc(DOC_A, 10));
    await store.putDoc(doc(DOC_B, 20));
    await store.addChanges(DOC_A, [change('r', 1), change('r', 2)]);
    await store.addChanges(DOC_B, [change('r', 1)]);
    await store.removeDoc(DOC_A);
    expect((await store.listDocs()).map((d) => d.docId)).toEqual([DOC_B]);
    expect(await store.loadChanges(DOC_A)).toEqual([]);
    expect(await store.loadChanges(DOC_B)).toHaveLength(1);
  });

  test('a removed doc caught again starts its arrival count fresh', async () => {
    await store.addChanges(DOC_A, [change('r', 1), change('r', 2)]);
    await store.removeDoc(DOC_A);
    await store.addChanges(DOC_A, [change('r', 2)]);
    expect((await store.loadChanges(DOC_A)).map((s) => s.arrival)).toEqual([0]);
  });

  test('wipeAll empties the device', async () => {
    await store.setDevice({ actor: '0123456789abcdef', name: 'Rina', createdAt: 5 });
    await store.putDoc(doc(DOC_A, 10));
    await store.addChanges(DOC_A, [change('r', 1)]);
    await store.setLastDoc(DOC_A);
    await store.wipeAll();
    expect(await store.getDevice()).toBeNull();
    expect(await store.listDocs()).toEqual([]);
    expect(await store.loadChanges(DOC_A)).toEqual([]);
    expect(await store.getLastDoc()).toBeNull();
  });
});

describe('saved across reloads', () => {
  test('a second store on the same database sees everything', async () => {
    await store.setDevice({ actor: '0123456789abcdef', name: 'Rina', createdAt: 5 });
    await store.addChanges(DOC_A, [change('r', 1)]);
    await store.setLastDoc(DOC_A);
    const reopened = createStore();
    expect(await reopened.getDevice()).toMatchObject({ name: 'Rina' });
    expect(await reopened.loadChanges(DOC_A)).toHaveLength(1);
    expect(await reopened.getLastDoc()).toBe(DOC_A);
  });
});

describe('last doc open', () => {
  test('is null until set, then remembered', async () => {
    expect(await store.getLastDoc()).toBeNull();
    await store.setLastDoc(DOC_B);
    expect(await store.getLastDoc()).toBe(DOC_B);
    await store.setLastDoc(null);
    expect(await store.getLastDoc()).toBeNull();
  });
});

describe('flags', () => {
  test('one-time cards are remembered', async () => {
    expect(await store.getFlag('home-screen-card')).toBe(false);
    await store.setFlag('home-screen-card', true);
    expect(await store.getFlag('home-screen-card')).toBe(true);
  });
});

describe('asking the browser to keep the docs', () => {
  test('asks once and remembers the answer', async () => {
    const persist = vi.fn(async () => true);
    vi.stubGlobal('navigator', { storage: { persist } });
    expect(await store.askToKeep()).toBe(true);
    expect(await store.askToKeep()).toBe(true);
    expect(persist).toHaveBeenCalledTimes(1);
  });

  test('says no when the browser has no way to ask', async () => {
    vi.stubGlobal('navigator', {});
    expect(await store.askToKeep()).toBe(false);
  });

  test('says no when asking throws', async () => {
    vi.stubGlobal('navigator', { storage: { persist: async () => Promise.reject(new Error('no')) } });
    expect(await store.askToKeep()).toBe(false);
  });
});

describe('space', () => {
  test('reports bytes used and still available', async () => {
    vi.stubGlobal('navigator', { storage: { estimate: async () => ({ usage: 300, quota: 1000 }) } });
    expect(await store.space()).toEqual({ used: 300, available: 700 });
  });

  test('is null when the browser cannot tell', async () => {
    vi.stubGlobal('navigator', {});
    expect(await store.space()).toBeNull();
  });
});

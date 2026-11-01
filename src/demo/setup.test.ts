// The demo setup page's load, on a real (in-memory) store and the real engine.

import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { engine } from '../model';
import { createStore } from '../store';
import { setUpAs, type SetupStep } from './setup';
import { STARTING_FILES } from './starting-files';
import { ROLES, WRITERS, type Role } from './writers';

let n = 0;
const freshStore = () => createStore(`demo-setup-test-${++n}`);
const role = (r: Role) => ROLES.find((x) => x.role === r)!;
const NOW = Date.UTC(2026, 10, 1, 4, 0);

describe('the demo setup page', () => {
  it('wipes the device and loads it as Rina, opening straight into her doc', async () => {
    const store = freshStore();
    await store.setDevice({ actor: '0000000000000000', name: 'Someone else', createdAt: 1 });
    await store.putDoc({ docId: 'old-doc', title: 'An old doc', template: null, updatedAt: 1, size: 10 });

    const steps: SetupStep[] = [];
    const done = await setUpAs(role('rina'), { store, engine, files: STARTING_FILES, now: NOW }, (s) => steps.push(s));

    expect(steps).toEqual(['read', 'wipe', 'writer', 'doc', 'check']);
    expect(await store.getDevice()).toEqual({ actor: WRITERS.rina.actor, name: 'Rina', place: 'Gosaba camp', createdAt: NOW });
    const docs = await store.listDocs();
    expect(docs.map((d) => [d.docId, d.title, d.template, d.size])).toEqual([[done.docId, done.title, 'camp-log', STARTING_FILES.rina.size]]);
    expect(await store.getLastDoc()).toBe(done.docId);
    expect((await store.loadChanges(done.docId)).length).toBe(done.changes);

    const file = engine.decodePhir(Uint8Array.from(Buffer.from(STARTING_FILES.rina.phir, 'base64')));
    if (!file.ok) throw new Error('starting file');
    expect(done.fingerprint).toEqual(engine.openDoc(file.docId, WRITERS.rina.actor, file.changes).fingerprint());
  });

  it('keeps the starting doc in its file order, so "arrived last" starts the same on every setup', async () => {
    const store = freshStore();
    const done = await setUpAs(role('base'), { store, engine, files: STARTING_FILES, now: NOW });
    const file = engine.decodePhir(Uint8Array.from(Buffer.from(STARTING_FILES.base.phir, 'base64')));
    if (!file.ok) throw new Error('starting file');
    const order = await store.arrivalOrder(done.docId);
    expect([...order.entries()].sort((a, b) => a[1] - b[1]).map(([id]) => id)).toEqual(file.changes.map((c) => c.id));
    expect((await store.getDevice())?.place).toBeUndefined();
  });

  it('makes the spare profile its own Base camp writer, named and plain, with the same doc as Base camp', async () => {
    const store = freshStore();
    const base = await setUpAs(role('base'), { store: freshStore(), engine, files: STARTING_FILES, now: NOW });
    const spare = await setUpAs(role('spare'), { store, engine, files: STARTING_FILES, now: NOW });

    expect((await store.getDevice())?.actor).toBe(WRITERS.spare.actor);
    expect(spare.docId).toBe(base.docId);
    expect(spare.changes).toBe(base.changes + 1);
    const doc = engine.openDoc(spare.docId, WRITERS.spare.actor, (await store.loadChanges(spare.docId)).map((c) => c.change));
    expect(doc.view().writers[WRITERS.spare.actor]).toMatchObject({ name: 'Base camp', colour: 'plain' });
    expect(spare.fingerprint.words).toEqual(base.fingerprint.words);
  });

  it('leaves the device alone when the starting file is damaged', async () => {
    const store = freshStore();
    await store.setDevice({ actor: '0000000000000000', name: 'Keep me', createdAt: 1 });
    const files = { ...STARTING_FILES, tanmoy: { ...STARTING_FILES.tanmoy, phir: btoa('not a phir file') } };
    await expect(setUpAs(role('tanmoy'), { store, engine, files, now: NOW })).rejects.toThrow("couldn't be read");
    expect((await store.getDevice())?.name).toBe('Keep me');
  });

  it('sets up every role', async () => {
    for (const r of ROLES) {
      const store = freshStore();
      const done = await setUpAs(r, { store, engine, files: STARTING_FILES, now: NOW });
      expect((await store.getDevice())?.actor).toBe(r.writer.actor);
      expect(done.title).toBe('Camp log: Sundarbans cyclone relief');
    }
  });
});

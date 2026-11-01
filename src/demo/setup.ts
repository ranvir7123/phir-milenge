// What the demo setup page does: turns this device into one demo writer holding its starting doc.
// The file is read before anything is wiped, so a bad file never leaves a device empty.
// Store order from track E: wipeAll, setDevice, addChanges, putDoc, then setLastDoc so the app
// opens straight into the doc. The app works out the docs-home row (summary) itself on first open.

import type { Change, DocId, EngineModule, Fingerprint } from '../contracts';
import type { AppStore } from '../store';
import type { RoleInfo } from './writers';

export interface StartingFileData {
  fileName: string;
  size: number;
  /** The .phir file, base64. */
  phir: string;
}

export type StartingFileSet = Record<RoleInfo['doc'], StartingFileData>;

export type SetupStep = 'read' | 'wipe' | 'writer' | 'doc' | 'check';

export const SETUP_STEPS: { step: SetupStep; label: string }[] = [
  { step: 'read', label: 'Reading the starting doc' },
  { step: 'wipe', label: 'Wiping this device' },
  { step: 'writer', label: 'Setting up the writer' },
  { step: 'doc', label: 'Saving the starting doc' },
  { step: 'check', label: 'Opening it again to check' },
];

export interface SetupResult {
  docId: DocId;
  title: string;
  changes: number;
  size: number;
  fingerprint: Fingerprint;
}

export function fromBase64(text: string): Uint8Array {
  const raw = atob(text);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

const WHY_UNREADABLE = {
  'not-phir': "it isn't a Phir Milenge file",
  newer: 'it was made by a newer version of the app',
  damaged: 'it is damaged',
} as const;

const sameFingerprint = (a: Fingerprint, b: Fingerprint) => a.hex === b.hex;

export async function setUpAs(
  role: RoleInfo,
  deps: { store: AppStore; engine: EngineModule; files: StartingFileSet; now?: number },
  onStep: (step: SetupStep) => void = () => {},
): Promise<SetupResult> {
  const { store, engine, files } = deps;
  const now = deps.now ?? Date.now();
  const me = role.writer;

  onStep('read');
  const file = engine.decodePhir(fromBase64(files[role.doc].phir));
  if (!file.ok) throw new Error(`The starting doc for ${role.label} couldn't be read: ${WHY_UNREADABLE[file.reason]}. Run npm run demo:docs and build again.`);
  const opened = engine.openDoc(file.docId, me.actor, file.changes);
  let changes: Change[] = file.changes;
  // A writer the doc has never seen (the spare profile) gets its name and colour now, as the app would.
  if (!opened.view().writers[me.actor]) {
    const ops = [...engine.intents.setWriterName(me.actor, me.name), ...engine.intents.setWriterColour(me.actor, me.colour)];
    changes = [...changes, opened.commit(ops, { t: now })];
  }
  const view = opened.view();
  const expected = opened.fingerprint();
  const size = engine.encodePhir({ docId: file.docId, title: file.title, changes }).length;

  onStep('wipe');
  await store.wipeAll();

  onStep('writer');
  await store.setDevice({ actor: me.actor, name: me.name, ...(me.place ? { place: me.place } : {}), createdAt: now });

  onStep('doc');
  // Arrival order is this array's order, so "arrived last" in the normal-sync view starts from here.
  await store.addChanges(file.docId, changes);
  await store.putDoc({
    docId: file.docId,
    title: file.title,
    template: view.template,
    updatedAt: Math.max(...changes.map((c) => c.t)),
    size,
  });
  await store.setLastDoc(file.docId);

  onStep('check');
  const device = await store.getDevice();
  const stored = (await store.loadChanges(file.docId)).map((c) => c.change);
  const again = engine.openDoc(file.docId, me.actor, stored);
  if (device?.actor !== me.actor) throw new Error('The writer was not saved on this device.');
  if (stored.length !== changes.length) throw new Error(`Only ${stored.length} of ${changes.length} changes were saved.`);
  if (!sameFingerprint(again.fingerprint(), expected)) throw new Error("The saved doc doesn't match the starting doc.");

  return { docId: file.docId, title: file.title, changes: stored.length, size, fingerprint: expected };
}

// What every button in the app shell does: the steps between the screen, the engine and the store.
import { engine } from '../model';
import { store, type HomeDocRecord } from '../store';
import type { BeamHello, Change, DeviceRecord, DocEngine, DocId, Op, ReceiveResult, TemplateInfo, WriterColour } from '../contracts';
import { useApp, type Message, type Session } from './state';
import { holdDocLock } from './locks';
import { makeSummary, titleOf } from './summary';
import { onlyOnThisPhone } from './caughtUp';
import { docFileName, downloadFile, pickFiles, readFile, shareFile } from './files';
import { BIG_BEAM_SECONDS, beamSeconds, durationText, honk, unlockSound } from '../beam';
import { clockAhead, clockAheadText, daysLeft, showHomeScreenCard } from './warnings';
import { layoutNow } from './layout';

const get = useApp.getState;
const set = useApp.setState;

/** The newest .phir format this version reads. */
export const PHIR_FORMAT = 1;

// ---------------------------------------------------------------------------
// Messages with fixed wording (2-user-experience.md, "Every error and edge state")
// ---------------------------------------------------------------------------

const NO_STORAGE: Message = {
  warn: true,
  title: "This browser can't save docs.",
  body: "Relay Docs keeps everything on the phone, and this browser can't do that. Open the link in an up-to-date Chrome, Safari, Firefox or Edge.",
  actions: [],
};

export function stoppedMessage(): Message {
  return {
    warn: true,
    title: 'Relay Docs stopped.',
    body: `Your doc is saved on this ${layoutNow()} up to your last change. Reload to carry on.`,
    actions: [{ label: 'Reload', style: 'main', run: () => location.reload() }],
  };
}

function stopped(e: unknown): void {
  console.error(e);
  releaseSession();
  set({ screen: { kind: 'message', message: stoppedMessage() }, sheet: null });
}

function show(message: Message): void {
  set({ screen: { kind: 'message', message }, sheet: null });
}

function backToDocOrHome(): void {
  set({ screen: get().session ? { kind: 'doc' } : { kind: 'home' }, sheet: null });
}

const backLabel = () => (get().session ? 'Back to the doc' : 'Back to docs');

// ---------------------------------------------------------------------------
// Starting up, your name
// ---------------------------------------------------------------------------

export async function start(): Promise<void> {
  let me: DeviceRecord | null;
  let docs: HomeDocRecord[];
  let last: DocId | null;
  try {
    if (typeof indexedDB === 'undefined') throw new Error('No IndexedDB');
    [me, docs, last] = await Promise.all([store.getDevice(), store.listDocs(), store.getLastDoc()]);
  } catch (e) {
    console.error(e);
    show(NO_STORAGE);
    return;
  }
  set({ me, docs });
  if (!me) {
    set({ screen: { kind: 'first-open' } });
    return;
  }
  void store.askToKeep();
  void fillSummaries(docs);
  void checkSpace();
  set({ homeCard: showHomeScreenCard() });
  if (last && docs.some((d) => d.docId === last)) await openDoc(last);
  else set({ screen: { kind: 'home' } });
}

export async function loadDocs(): Promise<HomeDocRecord[]> {
  const docs = await store.listDocs();
  set({ docs });
  return docs;
}

export async function saveMe(name: string, place: string): Promise<DeviceRecord> {
  const old = get().me;
  const me: DeviceRecord = { actor: old?.actor ?? engine.newActorId(), name: name.trim(), createdAt: old?.createdAt ?? Date.now() };
  if (place.trim()) me.place = place.trim();
  set({ me });
  await store.setDevice(me);
  return me;
}

/** The first-open buttons. "or open a file" opens the picker straight from the tap. */
export function firstOpen(name: string, place: string, how: 'new' | 'catch' | 'file'): void {
  if (how === 'file') openFilePicker();
  // Inside the tap, so the honk is allowed later on iPhone.
  if (how === 'catch') unlockSound();
  saveMe(name, place)
    .then(() => {
      void store.askToKeep();
      if (how === 'new') set({ screen: { kind: 'home' }, sheet: { kind: 'new-doc' } });
      if (how === 'catch') startCatch();
      if (how === 'file' && get().screen.kind === 'first-open') set({ screen: { kind: 'home' } });
    })
    .catch(stopped);
}

/** "Your name" sheet: a new name shows next to all your words, in every doc on this phone. */
export async function changeMe(name: string, place: string): Promise<void> {
  try {
    const me = await saveMe(name, place);
    set({ sheet: null });
    const s = get().session;
    if (s && s.view.writers[me.actor] && s.view.writers[me.actor]?.name !== me.name) {
      commit(engine.intents.setWriterName(me.actor, me.name));
    }
    for (const row of get().docs) {
      if (row.docId === s?.docId || !row.summary?.writers.some((w) => w.actor === me.actor)) continue;
      const stored = await store.loadChanges(row.docId);
      const doc = engine.openDoc(row.docId, me.actor, stored.map((c) => c.change));
      const change = doc.commit(engine.intents.setWriterName(me.actor, me.name), placeOf(me));
      await store.addChanges(row.docId, [change]);
      await saveRow(doc, false);
    }
    await loadDocs();
  } catch (e) {
    stopped(e);
  }
}

function placeOf(me: DeviceRecord): { place?: string } {
  return me.place ? { place: me.place } : {};
}

// ---------------------------------------------------------------------------
// Opening, making and closing docs
// ---------------------------------------------------------------------------

function releaseSession(): void {
  get().session?.lock.release();
  set({ session: null });
}

function lostToOtherTab(docId: DocId): void {
  if (get().session?.docId !== docId) return;
  set({ session: null, screen: { kind: 'other-tab', docId }, sheet: null });
}

async function takeLock(docId: DocId, steal = false) {
  return holdDocLock(docId, steal, () => lostToOtherTab(docId));
}

function begin(doc: DocEngine, lock: Session['lock']): Session {
  const session: Session = {
    docId: doc.docId,
    engine: doc,
    view: doc.view(),
    lock,
    notSaved: false,
    savedAt: null,
    glow: null,
    normalSync: false,
  };
  set({ session });
  void store.setLastDoc(doc.docId);
  return session;
}

export async function openDoc(docId: DocId, steal = false): Promise<void> {
  const me = get().me;
  if (!me) return;
  if (get().session?.docId === docId) {
    set({ screen: { kind: 'doc' }, sheet: null });
    return;
  }
  releaseSession();
  set({ screen: { kind: 'opening', docId }, sheet: null });
  const lock = await takeLock(docId, steal);
  if (!lock) {
    set({ screen: { kind: 'other-tab', docId } });
    return;
  }
  let stored: Change[];
  try {
    stored = (await store.loadChanges(docId)).map((c) => c.change);
  } catch (e) {
    lock.release();
    stopped(e);
    return;
  }
  try {
    const doc = engine.openDoc(docId, me.actor, stored);
    begin(doc, lock);
    set({ screen: { kind: 'doc' } });
    warnClock();
  } catch (e) {
    console.error(e);
    lock.release();
    show(damagedMessage(docId, stored));
  }
}

function damagedMessage(docId: DocId, changes: Change[]): Message {
  const title = get().docs.find((d) => d.docId === docId)?.title ?? 'Untitled doc';
  return {
    warn: true,
    back: true,
    title: "This doc can't be opened.",
    body: `The copy saved on this ${layoutNow()} is damaged. Catch it again from anyone who has it, or open a backup file.`,
    actions: [
      { label: 'Catch', style: 'main', run: () => startCatch() },
      { label: 'Open a file', run: () => openFilePicker() },
      {
        label: 'Save the damaged copy',
        run: () => {
          const bytes = new TextEncoder().encode(JSON.stringify({ docId, title, changes }));
          downloadFile(bytes, docFileName(`${title} damaged copy`, get().me?.name ?? '', Date.now(), '.json'));
        },
      },
    ],
  };
}

export async function useThisTab(docId: DocId): Promise<void> {
  await openDoc(docId, true);
}

export function closeThisTab(): void {
  window.close();
  // Tabs the app didn't open itself can't be closed by the page: show the docs instead.
  setTimeout(() => void goHome(), 300);
}

export async function goHome(): Promise<void> {
  const s = get().session;
  if (s) await saveRow(s.engine, true).catch(() => {});
  releaseSession();
  set({ screen: { kind: 'home' }, sheet: null });
  await loadDocs().catch(() => {});
  await checkSpace();
}

/** "Storage almost full": the space left, divided by how fast this phone has been writing. */
async function checkSpace(): Promise<void> {
  const me = get().me;
  const space = await store.space();
  if (me && space) set({ storageDays: daysLeft(space, me.createdAt, Date.now()) });
}

const clockWarned = new Set<DocId>();

/** "This phone's clock may be wrong", once per doc each time the app runs. */
function warnClock(): void {
  const s = get().session;
  const me = get().me;
  if (!s || !me || clockWarned.has(s.docId)) return;
  const ahead = clockAhead(s.engine.changes(), me.actor, Date.now());
  if (!ahead) return;
  clockWarned.add(s.docId);
  set({
    sheet: {
      kind: 'message',
      message: {
        warn: true,
        title: `This ${layoutNow()}'s clock may be wrong.`,
        body: clockAheadText(ahead, layoutNow()),
        actions: [{ label: 'OK', style: 'main', run: () => set({ sheet: null }) }],
      },
    },
  });
}

export async function newDoc(template: TemplateInfo): Promise<void> {
  const me = get().me;
  if (!me) return;
  try {
    const ops = [...template.ops(me.actor, engine.intents, engine.newItemId), ...engine.intents.setWriterName(me.actor, me.name)];
    const { engine: doc, first } = engine.createDoc(me.actor, ops, placeOf(me));
    const lock = await takeLock(doc.docId);
    releaseSession();
    await store.addChanges(doc.docId, [first]);
    begin(doc, lock ?? { release() {} });
    await saveRow(doc, true);
    set({ sheet: null, screen: freeColours(doc.view(), me.actor).length ? { kind: 'colour', changing: false } : { kind: 'doc' } });
  } catch (e) {
    stopped(e);
  }
}

/** Colours nobody else in this doc has. Plain is always offered on top of these. */
export function freeColours(view: Session['view'], me: string): WriterColour[] {
  const taken = new Set(Object.values(view.writers).filter((w) => w.actor !== me).map((w) => w.colour));
  return (['yellow', 'orange', 'pink', 'red'] as const).filter((c) => !taken.has(c));
}

export function chooseColour(colour: WriterColour): void {
  const me = get().me;
  if (!me) return;
  const s = get().session;
  if (s && s.view.writers[me.actor]?.colour !== colour) commit(engine.intents.setWriterColour(me.actor, colour));
  set({ screen: { kind: 'doc' } });
}

export function changeColour(): void {
  set({ screen: { kind: 'colour', changing: true }, sheet: null });
}

// ---------------------------------------------------------------------------
// Writing: every change is stored the moment it's made
// ---------------------------------------------------------------------------

let rowTimer: ReturnType<typeof setTimeout> | undefined;

function refresh(patch: Partial<Session> = {}): void {
  const s = get().session;
  if (!s) return;
  set({ session: { ...s, ...patch, view: viewOf(s.engine, patch.normalSync ?? s.normalSync) } });
}

let arrival: Map<string, number> = new Map();

function viewOf(doc: DocEngine, normalSync: boolean) {
  return normalSync ? doc.view({ mode: 'normal-sync', arrival }) : doc.view();
}

export async function setNormalSync(on: boolean): Promise<void> {
  const s = get().session;
  if (!s) return;
  if (on) arrival = await store.arrivalOrder(s.docId);
  refresh({ normalSync: on });
}

async function persist(docId: DocId, changes: Change[]): Promise<void> {
  try {
    await store.addChanges(docId, changes);
    const s = get().session;
    if (s?.docId === docId) set({ session: { ...s, notSaved: false, savedAt: Date.now() } });
    clearTimeout(rowTimer);
    rowTimer = setTimeout(() => {
      const now = get().session;
      if (now?.docId === docId) void saveRow(now.engine, false).catch(() => {});
    }, 1500);
  } catch (e) {
    console.error(e);
    const s = get().session;
    if (s?.docId === docId) set({ session: { ...s, notSaved: true } });
  }
}

export function commit(ops: Op[]): void {
  const s = get().session;
  const me = get().me;
  if (!s || !me || ops.length === 0) return;
  // Your name goes into the doc with your first change in it.
  const named = s.view.writers[me.actor]?.name === me.name ? ops : [...engine.intents.setWriterName(me.actor, me.name), ...ops];
  const change = s.engine.commit(named, placeOf(me));
  refresh();
  void persist(s.docId, [change]);
}

export function undo(): void {
  const s = get().session;
  const me = get().me;
  if (!s || !me) return;
  const change = s.engine.undo(placeOf(me));
  if (!change) return;
  refresh();
  void persist(s.docId, [change]);
}

export function redo(): void {
  const s = get().session;
  const me = get().me;
  if (!s || !me) return;
  const change = s.engine.redo(placeOf(me));
  if (!change) return;
  refresh();
  void persist(s.docId, [change]);
}

export function glowDone(): void {
  refresh({ glow: null });
}

export function openReplay(): void {
  set({ screen: { kind: 'replay' }, sheet: null });
}

export function openSelfTest(): void {
  set({ screen: { kind: 'self-test' }, sheet: null });
}

export function openAddRule(): void {
  set({ screen: { kind: 'add-rule' }, sheet: null });
}

export function backToDoc(): void {
  set({ screen: get().session ? { kind: 'doc' } : { kind: 'home' }, sheet: null });
  warnClock();
}

/** Writes the doc's row on the docs home: title, size, writers, truck back words, last change. */
async function saveRow(doc: DocEngine, now: boolean): Promise<void> {
  const me = get().me;
  if (!me) return;
  const view = doc.view();
  const changes = doc.changes();
  const title = titleOf(view);
  const size = engine.encodePhir({ docId: doc.docId, title, changes }).length;
  const summary = makeSummary(changes, view, doc.fingerprint(), me.actor);
  await store.putDoc({
    docId: doc.docId,
    title,
    template: view.template,
    updatedAt: now ? Date.now() : (summary.last?.t ?? Date.now()),
    size,
    summary,
  });
}

/** Docs put on this phone without a home row (the demo setup page): work their rows out once. */
async function fillSummaries(docs: HomeDocRecord[]): Promise<void> {
  const me = get().me;
  if (!me) return;
  let changed = false;
  for (const row of docs) {
    if (row.summary) continue;
    try {
      const stored = await store.loadChanges(row.docId);
      await saveRow(engine.openDoc(row.docId, me.actor, stored.map((c) => c.change)), false);
      changed = true;
    } catch (e) {
      console.error(e);
    }
  }
  if (changed) await loadDocs();
}

// ---------------------------------------------------------------------------
// Files
// ---------------------------------------------------------------------------

export function saveFile(): void {
  const s = get().session;
  const me = get().me;
  if (!s || !me) return;
  const title = titleOf(s.view);
  const bytes = engine.encodePhir({ docId: s.docId, title, changes: s.engine.changes() });
  saved(bytes, docFileName(title, me.name, Date.now()));
}

export async function saveFileOf(docId: DocId): Promise<void> {
  const me = get().me;
  const row = get().docs.find((d) => d.docId === docId);
  if (!me || !row) return;
  try {
    const changes = (await store.loadChanges(docId)).map((c) => c.change);
    saved(engine.encodePhir({ docId, title: row.title, changes }), docFileName(row.title, me.name, Date.now()));
  } catch (e) {
    stopped(e);
  }
}

function saved(bytes: Uint8Array, name: string): void {
  downloadFile(bytes, name);
  set({ sheet: { kind: 'saved-file', name, size: bytes.length, bytes } });
}

export async function shareSaved(bytes: Uint8Array, name: string): Promise<void> {
  const r = await shareFile(bytes, name);
  if (r === 'failed') {
    set({
      sheet: {
        kind: 'message',
        message: {
          warn: true,
          title: "The file wasn't saved.",
          body: 'This browser stopped the download. Check its download settings, or tap Share it.',
          actions: [
            { label: 'Try again', style: 'main', run: () => saved(bytes, name) },
            { label: 'Share it', run: () => void shareSaved(bytes, name) },
          ],
        },
      },
    });
  } else set({ sheet: null });
}

export function openFilePicker(): void {
  unlockSound();
  pickFiles((files) => void openFiles(files));
}

async function openFiles(files: File[]): Promise<void> {
  const decoded = [];
  for (const file of files) {
    let bytes: Uint8Array;
    try {
      bytes = await readFile(file);
    } catch {
      return fileProblem('damaged');
    }
    const r = safeDecode(bytes);
    if (!r.ok) return fileProblem(r.reason);
    decoded.push(r);
  }
  if (!decoded.length) return;
  honk();
  await takeIn(decoded, { actor: null, via: 'file' }, null, files.length);
}

function safeDecode(bytes: Uint8Array): ReturnType<typeof engine.decodePhir> {
  try {
    const r = engine.decodePhir(bytes);
    if (r.ok && r.format > PHIR_FORMAT) return { ok: false, reason: 'newer', format: r.format };
    return r;
  } catch (e) {
    console.error(e);
    return { ok: false, reason: 'damaged' };
  }
}

function fileProblem(reason: 'not-phir' | 'newer' | 'damaged'): void {
  const pickAgain = { label: 'Pick another file', style: 'main' as const, run: openFilePicker };
  const back = { label: backLabel(), run: backToDocOrHome };
  if (reason === 'not-phir')
    show({ warn: true, title: "That isn't a Relay Docs file.", body: 'Pick a file whose name ends in .relay or .phir. Nothing was changed.', actions: [pickAgain, back] });
  if (reason === 'damaged')
    show({ warn: true, title: 'This file is damaged.', body: 'Nothing was changed. Ask for a fresh copy.', actions: [pickAgain, back] });
  if (reason === 'newer')
    show({
      warn: true,
      title: 'This file is from a newer version of Relay Docs.',
      body: "This version can't read it yet. Nothing was changed. Get the newer version once you have internet, then open it again.",
      actions: [back],
    });
}

// ---------------------------------------------------------------------------
// Beam and catch
// ---------------------------------------------------------------------------

export function startBeam(broadcast = false, anyway = false): void {
  const s = get().session;
  const me = get().me;
  if (!s || !me) return;
  const title = titleOf(s.view);
  const payload = engine.encodePhir({ docId: s.docId, title, changes: s.engine.changes() });
  const estimate = beamSeconds(payload.length);
  const hello: BeamHello = { format: PHIR_FORMAT, docId: s.docId, title, senderName: me.name, senderActor: me.actor, size: payload.length };
  if (estimate > BIG_BEAM_SECONDS && !anyway) {
    show({
      warn: false,
      title: 'This doc is big for beaming.',
      body: `It takes about ${durationText(estimate)} to beam. Saving a file and sending it by Quick Share, AirDrop or a cable is faster.`,
      actions: [
        { label: 'Beam anyway', style: 'beam', run: () => startBeam(broadcast, true) },
        { label: 'Save a file', run: () => (backToDocOrHome(), saveFile()) },
      ],
    });
    return;
  }
  set({ screen: { kind: 'beam', payload, hello, estimate, broadcast }, sheet: null });
}

export function startCatch(): void {
  unlockSound();
  set({ screen: { kind: 'catch', from: get().session ? 'doc' : 'home' }, sheet: null });
}

export function stopBeamOrCatch(): void {
  backToDocOrHome();
}

/** The first hello frame: stop early for a newer version of Relay Docs. */
export function onHello(hello: BeamHello): 'continue' | 'stop' {
  if (hello.format <= PHIR_FORMAT) return 'continue';
  const name = hello.senderName;
  const whose = name ? `${name}'s` : 'Their';
  const s = get().session;
  show({
    warn: true,
    title: `${whose} phone has a newer version of Relay Docs.`,
    body: `${whose} doc uses things this version can't read yet. Nothing in your doc was changed. ${name || 'They'} can still catch from you. Once you have internet, open the link to get the newer version, then catch again.`,
    actions: [
      ...(s ? [{ label: `Beam to ${name || 'them'}`, style: 'beam' as const, run: () => startBeam() }] : []),
      { label: backLabel(), run: backToDocOrHome },
    ],
  });
  return 'stop';
}

export async function onCaught(payload: Uint8Array, hello: BeamHello | null): Promise<void> {
  const r = safeDecode(payload);
  if (!r.ok) {
    if (r.reason === 'newer') {
      onHello({ format: r.format ?? PHIR_FORMAT + 1, docId: '', title: '', senderName: hello?.senderName ?? '', senderActor: '', size: 0 });
      return;
    }
    show({
      warn: true,
      title: 'This beam came through damaged.',
      body: 'Nothing was changed. Ask them to beam again.',
      actions: [
        { label: 'Catch again', style: 'main', run: startCatch },
        { label: backLabel(), run: backToDocOrHome },
      ],
    });
    return;
  }
  await takeIn([r], { actor: hello?.senderActor ?? null, via: 'beam' }, hello?.senderName ?? null, 1);
}

interface Incoming {
  docId: DocId;
  title: string;
  changes: Change[];
}

/** A catch or opened files: into the open doc, into another doc on this phone, or a new doc. */
async function takeIn(items: Incoming[], from: { actor: string | null; via: 'beam' | 'file' }, senderName: string | null, fileCount: number): Promise<void> {
  const me = get().me;
  if (!me) return;
  const byDoc = new Map<DocId, Incoming>();
  for (const it of items) {
    const prev = byDoc.get(it.docId);
    byDoc.set(it.docId, prev ? { ...prev, changes: [...prev.changes, ...it.changes] } : it);
  }
  const open = get().session;
  const main = (open && byDoc.get(open.docId)) || [...byDoc.values()][0]!;
  try {
    for (const other of byDoc.values()) if (other !== main) await storeElsewhere(other, from);

    // A different doc caught from inside a doc: keep it on this phone, change nothing here.
    if (open && main.docId !== open.docId) {
      await storeElsewhere(main, from);
      await loadDocs();
      const opened = from.via === 'file' ? 'opened' : 'caught';
      show({
        warn: false,
        title: "That's a different doc.",
        body: `You ${opened} "${main.title}". Nothing in your doc was changed.${from.via === 'beam' ? ` It's saved in Docs on this ${layoutNow()}.` : ''}`,
        actions: [
          { label: 'Open it as a second doc', style: 'main', run: () => void openDoc(main.docId) },
          { label: 'Back to my doc', run: backToDocOrHome },
        ],
      });
      return;
    }

    const known = get().docs.some((d) => d.docId === main.docId);
    if (!open && known) await openDoc(main.docId);
    const session = get().session;
    if (session && session.docId === main.docId) {
      const result = session.engine.receive(main.changes, from);
      await store.addChanges(main.docId, result.note ? [...main.changes, result.note] : main.changes);
      await saveRow(session.engine, true);
      const fromName = nameFrom(session.view, from, senderName, fileCount, result);
      refresh({ savedAt: Date.now(), notSaved: false });
      // A beam with nothing new goes to the Caught screen: "Already caught up with Rina. Phir milenge.", or
      // "Nothing new from Rina" with Beam back when Rina is behind.
      if (result.newEdits.length === 0 && from.via === 'file') {
        set({
          screen: { kind: 'doc' },
          sheet: {
            kind: 'message',
            message: {
              warn: false,
              title: 'Already caught up with this file.',
              body: 'Everything in it is already in your doc.',
              actions: [{ label: 'Back to the doc', style: 'main', run: () => set({ sheet: null }) }],
            },
          },
        });
        return;
      }
      set({ screen: { kind: 'caught', result, fromName, via: from.via }, sheet: null });
      return;
    }

    // A doc new to this phone: "You have the doc".
    const doc = engine.openDoc(main.docId, me.actor, []);
    const result = doc.receive(main.changes, from);
    const lock = await takeLock(main.docId);
    await store.addChanges(main.docId, result.note ? [...main.changes, result.note] : main.changes);
    begin(doc, lock ?? { release() {} });
    await saveRow(doc, true);
    await loadDocs();
    const view = doc.view();
    const writers = new Set(doc.changes().filter((c) => c.kind === 'edit').map((c) => c.actor)).size;
    set({ screen: { kind: 'first-catch', fromName: nameFrom(view, from, senderName, fileCount, result), via: from.via, writers }, sheet: null });
  } catch (e) {
    stopped(e);
  }
}

/** Stores a caught doc that isn't the one on screen: merged into its row, or a new row. */
async function storeElsewhere(it: Incoming, from: { actor: string | null; via: 'beam' | 'file' }): Promise<void> {
  const me = get().me!;
  const stored = (await store.loadChanges(it.docId)).map((c) => c.change);
  const doc = engine.openDoc(it.docId, me.actor, stored);
  const result = doc.receive(it.changes, from);
  await store.addChanges(it.docId, result.note ? [...it.changes, result.note] : it.changes);
  await saveRow(doc, true);
}

function nameFrom(view: Session['view'], from: { actor: string | null; via: 'beam' | 'file' }, senderName: string | null, fileCount: number, result: ReceiveResult): string {
  if (from.via === 'beam') return senderName || (from.actor ? (view.writers[from.actor]?.name ?? '') : '');
  if (fileCount > 1) return `${fileCount} files`;
  // A file: named after the writer of its newest edit.
  const newest = result.newEdits.at(-1)?.split(':')[0];
  return (newest && view.writers[newest]?.name) || '';
}

export function readNew(typeIn: boolean): void {
  const screen = get().screen;
  if (screen.kind !== 'caught') return;
  refresh({ glow: { changes: screen.result.newEdits, typeIn } });
  set({ screen: { kind: 'doc' } });
  warnClock();
}

export function caughtDone(): void {
  readNew(false);
}

// ---------------------------------------------------------------------------
// Removing a doc from this phone, with Undo
// ---------------------------------------------------------------------------

let noticeId = 0;

export function showNotice(text: string, action?: { label: string; run(): void }, ms = 10_000): void {
  const id = ++noticeId;
  set({ notice: { id, text, action } });
  setTimeout(() => {
    if (get().notice?.id === id) set({ notice: null });
  }, ms);
}

export async function askRemove(docId: DocId): Promise<void> {
  const me = get().me;
  const row = get().docs.find((d) => d.docId === docId);
  if (!me || !row) return;
  let onlyHere = 0;
  try {
    const changes = (await store.loadChanges(docId)).map((c) => c.change);
    onlyHere = onlyOnThisPhone(changes, me.actor);
  } catch (e) {
    console.error(e);
  }
  set({ sheet: { kind: 'remove', docId, title: row.title, onlyHere } });
}

export async function removeDoc(docId: DocId): Promise<void> {
  const row = get().docs.find((d) => d.docId === docId);
  try {
    const changes = (await store.loadChanges(docId)).map((c) => c.change);
    if (get().session?.docId === docId) releaseSession();
    await store.removeDoc(docId);
    if ((await store.getLastDoc()) === docId) await store.setLastDoc(null);
    set({ sheet: null });
    await loadDocs();
    showNotice(`Removed from this ${layoutNow()}.`, {
      label: 'Undo',
      run: () => {
        set({ notice: null });
        void (async () => {
          await store.addChanges(docId, changes);
          if (row) await store.putDoc(row);
          await loadDocs();
        })();
      },
    });
  } catch (e) {
    stopped(e);
  }
}

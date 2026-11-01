// What this phone knows about who holds what, worked out from the changes and the catch notes.
// Everything here is "as far as this phone knows". Spec: 1-features.md features 3 and 4.

import type { ActorId, Change, ChangeId, DocEngine, DocView } from '../contracts';

/** Every change this phone holds, by id. */
export function byId(changes: readonly Change[]): Map<ChangeId, Change> {
  const m = new Map<ChangeId, Change>();
  for (const c of changes) m.set(c.id, c);
  return m;
}

/** The change ids `from` and everything they depend on (what a phone had seen when it wrote them). */
export function closure(starts: readonly ChangeId[], index: ReadonlyMap<ChangeId, Change>, seen = new Set<ChangeId>()): Set<ChangeId> {
  const stack = [...starts];
  while (stack.length > 0) {
    const id = stack.pop()!;
    if (seen.has(id)) continue;
    const c = index.get(id);
    if (!c) continue;
    seen.add(id);
    for (const d of c.deps) if (!seen.has(d)) stack.push(d);
  }
  return seen;
}

/** Each device that this phone knows holds the doc: anyone who wrote a change or a catch note, plus every named writer. */
export function devices(changes: readonly Change[], view: DocView): ActorId[] {
  const set = new Set<ActorId>();
  for (const c of changes) set.add(c.actor);
  for (const a of Object.keys(view.writers)) set.add(a);
  return [...set];
}

/** Each device's newest change or note (highest seq), which says everything it had seen at the time. */
export function latestByActor(changes: readonly Change[]): Map<ActorId, Change> {
  const m = new Map<ActorId, Change>();
  for (const c of changes) {
    const prev = m.get(c.actor);
    if (!prev || c.seq > prev.seq) m.set(c.actor, c);
  }
  return m;
}

/** What a device holds, as far as this phone knows: its newest change and everything that change had seen. */
export function holdings(actor: ActorId, changes: readonly Change[], index = byId(changes)): Set<ChangeId> {
  const latest = latestByActor(changes).get(actor);
  return latest ? closure([latest.id], index) : new Set();
}

export interface CaughtUp {
  /** Devices this phone knows hold the doc, this phone included. */
  total: number;
  /** Of those, how many hold every edit this phone has (this phone always does). */
  have: number;
  /** The devices that hold everything this phone has, this phone excluded. */
  haveAll: Set<ActorId>;
}

/** "3 of 4": devices that hold every edit this phone has, as far as it knows. */
export function caughtUp(engine: DocEngine, view: DocView): CaughtUp {
  const changes = engine.changes();
  const index = byId(changes);
  const edits = changes.filter((c) => c.kind === 'edit');
  const all = devices(changes, view);
  const haveAll = new Set<ActorId>();
  for (const a of all) {
    if (a === engine.me) continue;
    const held = holdings(a, changes, index);
    if (held.size > 0 && edits.every((c) => held.has(c.id))) haveAll.add(a);
  }
  return { total: Math.max(1, all.length + (all.includes(engine.me) ? 0 : 1)), have: haveAll.size + 1, haveAll };
}

/** How a change first reached this phone: from whom and how. Missing means this phone wrote it, or it came with the doc's start. */
export interface Arrival {
  from: ActorId | null;
  via: 'beam' | 'file';
  t: number;
}

/**
 * For every change, the catch that first brought it to this phone. Each of this phone's notes says
 * "I now hold everything up to these changes, caught from X", so the first note that covers a change brought it.
 */
export function arrivals(engine: DocEngine): Map<ChangeId, Arrival> {
  const changes = engine.changes();
  const index = byId(changes);
  const myNotes = changes.filter((c) => c.actor === engine.me && c.kind === 'note').sort((a, b) => a.seq - b.seq);
  const seen = new Set<ChangeId>();
  // What this phone held before any catch: its own changes and what they had seen when it had written nothing caught yet.
  const out = new Map<ChangeId, Arrival>();
  for (const note of myNotes) {
    const before = new Set(seen);
    closure(note.deps, index, seen);
    const arrival: Arrival = { from: note.from?.actor ?? null, via: note.from?.via ?? 'beam', t: note.t };
    for (const id of seen) {
      if (before.has(id)) continue;
      const c = index.get(id);
      if (c && c.actor !== engine.me) out.set(id, arrival);
    }
  }
  return out;
}

export interface WriterRow {
  actor: ActorId;
  /** The writer's newest edit on this phone, by their own clock. Null: this phone knows them but has none of their work. */
  latest: Change | null;
  /** Who brought that newest edit: null when it came direct from the writer, or this phone can't tell. */
  via: ActorId | null;
  direct: boolean;
}

/** "Who's caught up" rows: for each writer, when their newest change here was written and which phone brought it. */
export function writerRows(engine: DocEngine, view: DocView): WriterRow[] {
  const changes = engine.changes();
  const arrived = arrivals(engine);
  const newest = new Map<ActorId, Change>();
  for (const c of changes) {
    if (c.kind !== 'edit') continue;
    const prev = newest.get(c.actor);
    if (!prev || c.t > prev.t || (c.t === prev.t && c.seq > prev.seq)) newest.set(c.actor, c);
  }
  const rows: WriterRow[] = [];
  for (const actor of devices(changes, view)) {
    if (actor === engine.me) continue;
    const latest = newest.get(actor) ?? null;
    const a = latest ? arrived.get(latest.id) : undefined;
    const via = a?.from ?? null;
    rows.push({ actor, latest, via: via === actor ? null : via, direct: via === actor });
  }
  rows.sort((x, y) => (y.latest?.t ?? -1) - (x.latest?.t ?? -1) || x.actor.localeCompare(y.actor));
  return rows;
}

/** How many of this phone's edits a device is missing, as far as this phone knows. */
export function missingCount(actor: ActorId, engine: DocEngine): number {
  const changes = engine.changes();
  const held = holdings(actor, changes);
  return changes.filter((c) => c.kind === 'edit' && !held.has(c.id)).length;
}

export interface TrailRow {
  actor: ActorId;
  t: number | null;
  via: 'wrote' | 'beam' | 'file' | 'not-yet';
  /** Who it came from, for beam and file steps. */
  from: ActorId | null;
  place?: string;
}

/** Each device's place, from its newest change or note that has one. */
export function places(changes: readonly Change[]): Map<ActorId, string> {
  const best = new Map<ActorId, Change>();
  for (const c of changes) {
    if (!c.place) continue;
    const prev = best.get(c.actor);
    if (!prev || c.seq > prev.seq) best.set(c.actor, c);
  }
  return new Map([...best].map(([a, c]) => [a, c.place!]));
}

/**
 * "Where this has been": the engine's trail for a block, with where each phone caught it from, then every device
 * that doesn't hold it yet, as far as this phone knows.
 */
export function trailRows(engine: DocEngine, view: DocView, block: string): TrailRow[] {
  const changes = engine.changes();
  const placeOf = places(changes);
  const notes = changes.filter((c) => c.kind === 'note');
  const rows: TrailRow[] = engine.trail(block).map((s) => {
    let from: ActorId | null = null;
    if (s.via !== 'wrote') {
      const note = notes.find((n) => n.actor === s.actor && n.t === s.t) ?? notes.find((n) => n.actor === s.actor);
      from = note?.from?.actor ?? null;
    }
    return { actor: s.actor, t: s.t, via: s.via, from, place: placeOf.get(s.actor) };
  });
  const listed = new Set(rows.map((r) => r.actor));
  for (const a of engine.whoHas(block)) listed.add(a);
  for (const a of devices(changes, view)) {
    if (listed.has(a)) continue;
    rows.push({ actor: a, t: null, via: 'not-yet', from: null, place: placeOf.get(a) });
  }
  return rows;
}

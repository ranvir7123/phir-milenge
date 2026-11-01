// The "3 of 4" button: how many devices this phone knows hold the doc, and how many of them
// hold everything this phone has, as far as this phone knows (2-user-experience.md, "Words used").
import type { ActorId, Change, ChangeId } from '../contracts';

export interface CaughtUp {
  /** Devices known to hold the doc (every writer of an edit or a note), this one included. */
  devices: number;
  /** Of those, how many hold every change this phone has. This phone always counts. */
  caughtUp: number;
  /** The actors that are behind, for "Beam back" and the side panel. */
  behind: ActorId[];
}

export function caughtUp(changes: readonly Change[], me: ActorId): CaughtUp {
  const byId = new Map<ChangeId, Change>();
  const latest = new Map<ActorId, Change>();
  const dependedOn = new Set<ChangeId>();
  for (const c of changes) {
    byId.set(c.id, c);
    const prev = latest.get(c.actor);
    if (!prev || c.seq > prev.seq) latest.set(c.actor, c);
    for (const d of c.deps) dependedOn.add(d);
  }
  const heads = changes.filter((c) => !dependedOn.has(c.id)).map((c) => c.id);
  latest.delete(me);

  const behind: ActorId[] = [];
  for (const [actor, last] of latest) {
    // Everything that actor's phone had when it wrote its latest change.
    const seen = new Set<ChangeId>([last.id]);
    const stack = [...last.deps];
    while (stack.length) {
      const id = stack.pop()!;
      if (seen.has(id)) continue;
      seen.add(id);
      const c = byId.get(id);
      if (c) stack.push(...c.deps);
    }
    if (!heads.every((h) => seen.has(h))) behind.push(actor);
  }
  const devices = latest.size + 1;
  return { devices, caughtUp: devices - behind.length, behind };
}

/** The button's words: "Only you" in a doc only this phone has, else "3 of 4". */
export function caughtUpLabel({ devices, caughtUp: n }: CaughtUp): string {
  return devices <= 1 ? 'Only you' : `${n} of ${devices}`;
}

/** How many of your edits no other writer's phone is known to have, as far as this phone knows. */
export function onlyOnThisPhone(changes: readonly Change[], me: ActorId): number {
  const byId = new Map(changes.map((c) => [c.id, c]));
  const seenElsewhere = new Set<string>();
  const latest = new Map<string, Change>();
  for (const c of changes) {
    if (c.actor === me) continue;
    const prev = latest.get(c.actor);
    if (!prev || c.seq > prev.seq) latest.set(c.actor, c);
  }
  for (const last of latest.values()) {
    const stack = [last.id];
    while (stack.length) {
      const id = stack.pop()!;
      if (seenElsewhere.has(id)) continue;
      seenElsewhere.add(id);
      stack.push(...(byId.get(id)?.deps ?? []));
    }
  }
  return changes.filter((c) => c.actor === me && c.kind === 'edit' && !seenElsewhere.has(c.id)).length;
}

/** "2 of your changes are" / "1 of your changes is" */
export function yourChanges(n: number): string {
  return `${n} of your changes ${n === 1 ? 'is' : 'are'}`;
}

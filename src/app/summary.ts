// What a docs-home row shows: worked out from the doc, saved with its row so the home opens fast.
import type { ActorId, Change, DocView, Fingerprint } from '../contracts';
import type { DocSummary } from '../store';

/** The doc's title as shown: the version on screen, or the first of two versions. */
export function titleOf(view: DocView): string {
  const text = view.title.shown?.value ?? view.title.lanes[0]?.value ?? '';
  return text.trim() || 'Untitled doc';
}

/** Who made the last change this phone knows of, and how it got here. */
export function lastEvent(changes: readonly Change[], view: DocView, me: ActorId): DocSummary['last'] {
  let best: DocSummary['last'] = null;
  const nameOf = (a: ActorId | null | undefined) => (a ? view.writers[a]?.name : undefined);
  for (const c of changes) {
    let event: DocSummary['last'] = null;
    if (c.actor === me && c.kind === 'edit') event = { kind: 'you', name: '', t: c.t };
    else if (c.actor === me && c.kind === 'note' && c.from) {
      event = { kind: c.from.via, name: nameOf(c.from.actor) ?? '', t: c.t };
    }
    if (event && (!best || event.t >= best.t)) best = event;
  }
  if (best) return best;
  // Nothing written or caught on this phone itself (a doc set up for this device): the latest edit.
  for (const c of changes) {
    if (c.kind !== 'edit') continue;
    if (!best || c.t >= best.t) best = { kind: 'beam', name: nameOf(c.actor) ?? '', t: c.t };
  }
  return best;
}

/** "You, 2 min ago", "Caught from Meher, Today 10:14 am". `when` is already formatted. */
export function lastLine(last: DocSummary['last'], when: string): string {
  if (!last) return '';
  if (last.kind === 'you') return `You, ${when}`;
  if (last.kind === 'file') return last.name ? `Opened ${last.name}'s file, ${when}` : `Opened a file, ${when}`;
  return last.name ? `Caught from ${last.name}, ${when}` : `Caught, ${when}`;
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** "1 rule broken · 1 sentence with two versions", or '' when nothing needs a look. */
export function needsLookLine(view: DocView): string {
  const parts: string[] = [];
  const broken = view.needsLook.broken.length;
  if (broken) parts.push(plural(broken, 'rule broken', 'rules broken'));
  let sentences = 0;
  let cells = 0;
  let others = 0;
  for (const key of view.needsLook.clashes) {
    if (/^b\/[^/]+\/s\//.test(key)) sentences++;
    else if (/^b\/[^/]+\/cell\//.test(key)) cells++;
    else others++;
  }
  if (sentences) parts.push(plural(sentences, 'sentence with two versions', 'sentences with two versions'));
  if (cells) parts.push(plural(cells, 'cell with two values', 'cells with two values'));
  if (others) parts.push(plural(others, 'other spot with two versions', 'other spots with two versions'));
  return parts.join(' · ');
}

/** Writers in the order they first wrote an edit. */
export function writersInOrder(changes: readonly Change[], view: DocView): DocSummary['writers'] {
  const seen = new Set<ActorId>();
  const out: DocSummary['writers'] = [];
  for (const c of changes) {
    if (c.kind !== 'edit' || seen.has(c.actor)) continue;
    seen.add(c.actor);
    const w = view.writers[c.actor];
    out.push({ actor: c.actor, name: w?.name ?? '', colour: w?.colour ?? null });
  }
  return out;
}

export function makeSummary(changes: readonly Change[], view: DocView, fingerprint: Fingerprint, me: ActorId): DocSummary {
  return {
    words: fingerprint.words,
    digits: fingerprint.digits,
    writers: writersInOrder(changes, view),
    last: lastEvent(changes, view, me),
    needsLook: needsLookLine(view),
  };
}

/** "Rina, Tanmoy, Asif +1": up to four writers by name. */
export function writersLine(writers: DocSummary['writers'], max = 4): { shown: DocSummary['writers']; more: number } {
  const named = writers.filter((w) => w.name);
  return { shown: named.slice(0, max), more: Math.max(0, named.length - max) };
}

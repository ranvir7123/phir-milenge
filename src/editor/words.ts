// Every word the editor puts on screen, built in one place so it matches docs/plan/2-user-experience.md.

import type { ActorId, DocView, Field, Lane, WriterColour } from '../contracts';

const DAY = 86_400_000;
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function clock(d: Date): string {
  const h = d.getHours();
  const m = String(d.getMinutes()).padStart(2, '0');
  return `${h % 12 === 0 ? 12 : h % 12}:${m} ${h < 12 ? 'am' : 'pm'}`;
}

function startOfDay(t: number): number {
  const d = new Date(t);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** The clock form lanes always use: "Today 10:14 am", "Yesterday 4:30 pm", "Mon 6:05 am", "24 Oct, 6:05 am". */
export function formatWhen(t: number, now = Date.now()): string {
  const d = new Date(t);
  const days = Math.round((startOfDay(now) - startOfDay(t)) / DAY);
  if (days === 0) return `Today ${clock(d)}`;
  if (days === 1) return `Yesterday ${clock(d)}`;
  if (days >= 2 && days <= 6) return `${WEEKDAYS[d.getDay()]} ${clock(d)}`;
  return `${d.getDate()} ${MONTHS[d.getMonth()]}, ${clock(d)}`;
}

/** A writer time later than this phone's clock (with a minute of slack) gets "clock looks wrong". */
export function clockLooksWrong(t: number, now = Date.now()): boolean {
  return t > now + 60_000;
}

/** Names over 16 letters are cut with "…" ("Meherunnisa Khatu…"). */
export function cutName(name: string): string {
  let letters = 0;
  for (let i = 0; i < name.length; i++) {
    if (/\p{L}/u.test(name[i]!)) letters++;
    if (letters > 16) return `${name.slice(0, i).trimEnd()}…`;
  }
  return name;
}

export function writerName(view: DocView, actor: ActorId): string {
  return view.writers[actor]?.name || 'Unnamed writer';
}

const COLOURS: readonly WriterColour[] = ['yellow', 'orange', 'pink', 'red', 'plain'];

/** The writer's colour. Anything this app doesn't know (say, from a newer or broken phone) counts as Plain. */
export function writerColour(view: DocView, actor: ActorId): WriterColour {
  const colour = view.writers[actor]?.colour;
  return colour && COLOURS.includes(colour) ? colour : 'plain';
}

/** The CSS colour for a writer's bar, or null for Plain writers (they get a plain ring instead). */
export function colourVar(colour: WriterColour): string | null {
  return colour === 'plain' ? null : `var(--w-${colour})`;
}

/** "Rina, Gosaba camp · Mon 6:05 am", or "Deleted by Tanmoy, Basanti · Mon 5:00 pm". */
export function laneWho(view: DocView, lane: Lane<unknown>, now = Date.now()): string {
  const name = cutName(writerName(view, lane.actor));
  const who = lane.place ? `${name}, ${lane.place}` : name;
  const when = formatWhen(lane.t, now);
  return lane.value === null ? `Deleted by ${who} · ${when}` : `${who} · ${when}`;
}

export type ClashWhat = 'sentence' | 'title' | 'tick' | 'cell' | 'row';

/** "Two versions of this sentence. Both are kept until someone picks." */
export function versionsHeading(count: number, what: ClashWhat): string {
  const thing = what === 'tick' ? 'tick' : what === 'cell' ? 'cell' : what;
  return count === 2
    ? `Two versions of this ${thing}. Both are kept until someone picks.`
    : `${count} versions of this ${thing}. All are kept until someone picks.`;
}

export const PICK_FIRST = 'Pick a version to change it: Keep this one, or Edit.';
export const NOT_DELETED = "Two versions weren't deleted. Pick one first.";
export const LINK_REFUSED = 'Only web addresses, phone numbers and email addresses.';
export const NOTHING_TO_UNDO = 'Nothing of yours to undo yet.';
export const NOTHING_TO_REDO = 'Nothing to redo.';
export const EMPTY_DOC = 'Nothing here yet. Start writing.';
export const EMPTY_TIP = 'Tip: give it a title first, so others can tell your doc apart.';
export const UNTITLED = 'Untitled doc';
export const NORMAL_SYNC_LABEL =
  'Showing what a normal sync would keep: whichever change arrived last. Your doc is unchanged.';
export const NORMAL_SYNC_BLOCKED = "Switch off 'What a normal sync would keep' to write.";

function others(n: number): string {
  return n === 1 ? '1 other' : `${n} others`;
}

function settleWord(view: DocView, field: Field<unknown>): string {
  const how = field.how;
  if (!how) return 'by rule';
  if (how.kind === 'newest') return 'newest';
  if (how.kind === 'smaller') return 'smaller number';
  if (how.kind === 'person') return `${cutName(writerName(view, how.actor))} first`;
  return 'by rule';
}

/**
 * The quiet mark under a decided spot: "Kept by Asif · 1 other", "Kept by you · 1 other",
 * "Settled: newest · 1 other". Null when nothing was decided here.
 */
export function decidedMark(view: DocView, field: Field<unknown>, me: ActorId): { lead: string; rest: string } | null {
  const n = field.kept.length;
  if (n === 0) return null;
  if (field.state === 'settled') return { lead: `Settled: ${settleWord(view, field)}`, rest: others(n) };
  const by = field.pickedBy ?? field.shown?.actor;
  if (!by) return null;
  return { lead: `Kept by ${by === me ? 'you' : cutName(writerName(view, by))}`, rest: others(n) };
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** What kind of spot a register key is, for the "needs a look" line. */
export function keyKind(key: string): ClashWhat | 'rule' | 'settle' | 'table' | 'other' {
  if (key === 'title') return 'title';
  if (key === 'settle') return 'settle';
  if (key.startsWith('rule/')) return 'rule';
  if (/^b\/[^/]+\/s\/[^/]+$/.test(key)) return 'sentence';
  if (/^b\/[^/]+\/tick$/.test(key)) return 'tick';
  if (/^b\/[^/]+\/cell\//.test(key)) return 'cell';
  if (/^b\/[^/]+\/row\//.test(key)) return 'row';
  if (/^b\/[^/]+\/(name|col\/)/.test(key)) return 'table';
  return 'other';
}

/** "1 rule broken · 1 sentence with two versions". Null when nothing needs a look. */
export function needsLookLine(view: DocView): string | null {
  const parts: string[] = [];
  const broken = view.needsLook.broken.length;
  if (broken > 0) parts.push(`${plural(broken, 'rule', 'rules')} broken`);
  const counts = new Map<string, number>();
  for (const key of view.needsLook.clashes) {
    const kind = keyKind(key);
    counts.set(kind, (counts.get(kind) ?? 0) + 1);
  }
  const say: [string, string, string][] = [
    ['sentence', 'sentence with two versions', 'sentences with two versions'],
    ['cell', 'cell with two values', 'cells with two values'],
    ['row', 'row with two versions', 'rows with two versions'],
    ['title', 'title with two versions', 'titles with two versions'],
    ['tick', 'tick with two versions', 'ticks with two versions'],
    ['table', 'table name with two versions', 'table names with two versions'],
    ['rule', 'rule with two versions', 'rules with two versions'],
    ['settle', 'settle rule with two versions', 'settle rules with two versions'],
    ['other', 'other spot with two versions', 'other spots with two versions'],
  ];
  for (const [kind, one, many] of say) {
    const n = counts.get(kind);
    if (n) parts.push(plural(n, one, many));
  }
  return parts.length ? parts.join(' · ') : null;
}

/** Links can only be web addresses, phone numbers or email addresses. */
export function linkAllowed(href: string): boolean {
  return /^(https?:\/\/|tel:|mailto:)\S/i.test(href.trim());
}

/** "example.org" typed without a scheme becomes "https://example.org"; anything with another scheme is left as typed. */
export function normaliseLink(href: string): string {
  const h = href.trim();
  if (/^[a-z][a-z0-9+.-]*:/i.test(h)) return h;
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(h)) return `mailto:${h}`;
  if (/^\+?[0-9][0-9 -]{5,}$/.test(h)) return `tel:${h.replace(/[ -]/g, '')}`;
  return `https://${h}`;
}

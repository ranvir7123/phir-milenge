// Words and times as the panels write them. Rules: docs/plan/2-user-experience.md, "Words used in this file".

import type { ActorId, DocView, WriterColour } from '../contracts';

const DAY = 86_400_000;
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "6:05 am", "4:30 pm", "12:00 pm". */
export function clockTime(t: number): string {
  const d = new Date(t);
  const h = d.getHours();
  const m = d.getMinutes();
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`;
}

function startOfDay(t: number): number {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/**
 * The clock form: "Today 10:14 am", "Yesterday 4:30 pm", "Mon 6:05 am" (last 6 days), "24 Oct, 6:05 am" (older).
 * A time later than today (a wrong clock) is written with its date.
 */
export function clockForm(t: number, now: number): string {
  const days = Math.round((startOfDay(now) - startOfDay(t)) / DAY);
  const d = new Date(t);
  if (days === 0) return `Today ${clockTime(t)}`;
  if (days === 1) return `Yesterday ${clockTime(t)}`;
  if (days > 1 && days <= 6) return `${WEEKDAYS[d.getDay()]} ${clockTime(t)}`;
  return `${d.getDate()} ${MONTHS[d.getMonth()]}, ${clockTime(t)}`;
}

/** The "ago" form for anything under an hour ("Just now", "12 min ago"), then the clock form. */
export function agoForm(t: number, now: number): string {
  const diff = now - t;
  if (diff >= 0 && diff < 60_000) return 'Just now';
  if (diff >= 60_000 && diff < 3_600_000) return `${Math.floor(diff / 60_000)} min ago`;
  return clockForm(t, now);
}

/** True when a writer's time is later than this phone's clock (a minute of slack for clocks a little apart). */
export function clockLooksWrong(t: number, now: number): boolean {
  return t > now + 60_000;
}

/** Names over 16 letters are cut with "…": "Meherunnisa Khatun" → "Meherunnisa Khatu…". Spaces don't count as letters. */
export function cutName(name: string, max = 16): string {
  let letters = 0;
  for (let i = 0; i < name.length; i++) {
    if (name[i] !== ' ') letters++;
    if (letters > max) return `${name.slice(0, i).trimEnd()}…`;
  }
  return name;
}

/** "1 word", "58 words". */
export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n.toLocaleString('en-IN')} ${n === 1 ? one : many}`;
}

/** "1,000" style numbers. */
export function num(n: number): string {
  return n.toLocaleString('en-IN');
}

/** Joins names the way the screens do: "Rina", "Rina and Tanmoy", "Rina, Asif and Tanmoy". */
export function joinNames(names: string[]): string {
  if (names.length <= 1) return names.join('');
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/** The first few words of a sentence, for quoting it: "Gosaba ferry runs…". */
export function quoteStart(text: string, words = 3): string {
  const parts = text.trim().split(/\s+/).filter(Boolean);
  if (parts.length <= words) return parts.join(' ').replace(/[.!?,;:]$/, '');
  return `${parts.slice(0, words).join(' ').replace(/[.!?,;:]$/, '')}…`;
}

export function countWords(text: string): number {
  const m = text.trim().match(/\S+/g);
  return m ? m.length : 0;
}

/** "One kit per ration card" → "one kit per ration card", for lines like "Rule broken: one kit per ration card." */
export function lowerFirst(text: string): string {
  return text.charAt(0).toLowerCase() + text.slice(1);
}

export function upperFirst(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** A writer's name as this phone knows it. */
export function nameOf(view: DocView, actor: ActorId | null | undefined): string {
  if (!actor) return 'Someone';
  return view.writers[actor]?.name || 'Someone';
}

/** The CSS colour for a writer, or null for Plain and for writers who haven't picked (they get the plain ring). */
export function colourOf(view: DocView, actor: ActorId | null | undefined): string | null {
  if (!actor) return null;
  return colourVar(view.writers[actor]?.colour ?? null);
}

export function colourVar(colour: WriterColour | null): string | null {
  switch (colour) {
    case 'yellow':
      return 'var(--w-yellow)';
    case 'orange':
      return 'var(--w-orange)';
    case 'pink':
      return 'var(--w-pink)';
    case 'red':
      return 'var(--w-red)';
    default:
      return null;
  }
}

export function colourName(colour: WriterColour | null): string {
  switch (colour) {
    case 'yellow':
      return 'Yellow';
    case 'orange':
      return 'Orange';
    case 'pink':
      return 'Pink';
    case 'red':
      return 'Red';
    case 'plain':
      return 'Plain';
    default:
      return 'Not picked yet';
  }
}

/**
 * How a device is named in "Where this has been": "Rina's phone", but "Base camp" stays as it is,
 * because Base camp is the laptop, not a phone.
 */
export function deviceName(name: string): string {
  if (name === 'Someone') return 'A phone';
  if (/^base camp$/i.test(name.trim())) return name;
  return `${name}'s phone`;
}

/** "Mango Tiger Dipper" from ['mango', 'tiger', 'dipper']. */
export function truckWords(words: readonly string[]): string {
  return words.map(upperFirst).join(' ');
}

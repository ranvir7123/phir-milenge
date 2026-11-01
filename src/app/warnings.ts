// The app shell's own warnings: "Storage almost full", "This phone's clock may be wrong" and the iPhone
// "Keep it on your home screen" card (2-user-experience.md, errors: Storage and Clocks; Getting in, part 3).
import type { ActorId, Change } from '../contracts';

const DAY = 86_400_000;
/** Clocks a little apart are normal; the same minute of slack the lanes use. */
const SLACK = 60_000;

/**
 * Days of writing left: the space left divided by how fast this phone has filled it so far (counting at
 * least one day, so a new phone isn't alarmed). Null while more than a week is left.
 */
export function daysLeft(space: { used: number; available: number }, since: number, now: number): number | null {
  if (space.used <= 0) return null;
  const perDay = space.used / Math.max(1, (now - since) / DAY);
  const days = Math.floor(space.available / perDay);
  return days <= 7 ? days : null;
}

/** `device` is the word for this device: "phone", or "laptop" on Base camp. */
export function roomText(days: number, device: 'phone' | 'laptop'): string {
  if (days < 1) return `This ${device} has room for less than a day of writing.`;
  return `This ${device} has room for about ${days} more ${days === 1 ? 'day' : 'days'} of writing.`;
}

/**
 * How many other phones' newest times are later than this phone's clock, when that is more than half of
 * them; otherwise 0.
 */
export function clockAhead(changes: readonly Change[], me: ActorId, now: number): number {
  const newest = new Map<ActorId, number>();
  for (const c of changes) if (c.actor !== me) newest.set(c.actor, Math.max(newest.get(c.actor) ?? 0, c.t));
  let ahead = 0;
  for (const t of newest.values()) if (t > now + SLACK) ahead++;
  return ahead * 2 > newest.size ? ahead : 0;
}

export function clockAheadText(ahead: number, device: 'phone' | 'laptop'): string {
  return `Times from ${ahead} other ${ahead === 1 ? 'phone are' : 'phones are'} later than this ${device}'s clock. Check the date and time in this ${device}'s settings.`;
}

const HOME_CARD = 'phir-home-card-seen';

/** iPhone Safari, not opened from the home screen, and the card not yet answered. */
export function showHomeScreenCard(): boolean {
  if (typeof navigator === 'undefined' || !/iPhone|iPad|iPod/.test(navigator.userAgent)) return false;
  const fromHomeScreen = (navigator as { standalone?: boolean }).standalone === true || matchMedia('(display-mode: standalone)').matches;
  if (fromHomeScreen) return false;
  try {
    return localStorage.getItem(HOME_CARD) === null;
  } catch {
    return true;
  }
}

/** The card is one-time: "Show me how" or "Not now" puts it away for good. */
export function homeScreenCardSeen(): void {
  try {
    localStorage.setItem(HOME_CARD, '1');
  } catch {
    // Private windows can refuse; the card then shows again next time, which is harmless.
  }
}

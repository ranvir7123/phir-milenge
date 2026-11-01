// How times are written on screen (docs/plan/2-user-experience.md, "Words used in this file").
// 'ago': under an hour "N min ago", then the clock form. Caught-screen rows and the docs home.
// 'clock': "Today 10:14 am", "Yesterday 4:30 pm", "Mon 6:05 am" (last 6 days), "24 Oct, 6:05 am". Lanes and trails.

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MINUTE = 60_000;

function clock(d: Date, sep = ':'): string {
  const h = d.getHours();
  const m = String(d.getMinutes()).padStart(2, '0');
  return `${h % 12 === 0 ? 12 : h % 12}${sep}${m} ${h < 12 ? 'am' : 'pm'}`;
}

function startOfDay(t: number): number {
  const d = new Date(t);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** Whole calendar days from `t` to `now` (0 = same day). Negative when `t` is in the future. */
function daysBefore(t: number, now: number): number {
  return Math.round((startOfDay(now) - startOfDay(t)) / 86_400_000);
}

export function formatTime(t: number, now: number, form: 'ago' | 'clock'): string {
  if (form === 'ago' && t <= now && now - t < 60 * MINUTE) {
    const min = Math.floor((now - t) / MINUTE);
    return min < 1 ? 'Just now' : `${min} min ago`;
  }
  const d = new Date(t);
  const days = daysBefore(t, now);
  if (days === 0) return `Today ${clock(d)}`;
  if (days === 1) return `Yesterday ${clock(d)}`;
  if (days > 1 && days <= 6) return `${DAYS[d.getDay()]} ${clock(d)}`;
  return `${d.getDate()} ${MONTHS[d.getMonth()]}, ${clock(d)}`;
}

/** The time part of a saved file's name, for example "Mon 4.30 pm". */
export function fileTime(t: number): string {
  const d = new Date(t);
  return `${DAYS[d.getDay()]} ${clock(d, '.')}`;
}

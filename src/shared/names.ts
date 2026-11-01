// Names over 16 letters are cut with "…" wherever space is short (2-user-experience.md, "Small phones").

export const NAME_SHOWN = 16;
/** The name box takes up to 40 letters. */
export const NAME_MAX = 40;

export function shortName(name: string, max = NAME_SHOWN): string {
  const letters = [...name.trim()];
  return letters.length > max ? `${letters.slice(0, max).join('')}…` : letters.join('');
}

/** "Rina · Gosaba camp", or just "Rina" with no place. */
export function nameWithPlace(name: string, place?: string): string {
  return place?.trim() ? `${name} · ${place.trim()}` : name;
}

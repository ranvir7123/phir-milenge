// Doc files: the name they're saved under, saving (a download, then the phone's share menu
// where it accepts files) and picking one (2-user-experience.md, "The file backup").
// New files end in .relay. Older ones end in .phir and open the same: the app checks what's inside, not the name.
import { fileTime } from '../shared/time';

/** "Camp log - Sundarbans cyclone relief - Rina - Mon 4.30 pm.relay". `ending` swaps ".relay" for another. */
export function docFileName(title: string, writer: string, t: number, ending = '.relay'): string {
  const clean = (s: string) =>
    s
      .replace(/\s*:\s*/g, ' - ')
      // eslint-disable-next-line no-control-regex
      .replace(/[\\/*?"<>|\u0000-\u001f]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  const title80 = [...clean(title)].slice(0, 80).join('').trim();
  return [title80 || 'Untitled doc', clean(writer), fileTime(t)].filter(Boolean).join(' - ') + ending;
}

/** "14 KB": whole kilobytes, at least 1. */
export function sizeText(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function asFile(bytes: Uint8Array, name: string): File {
  return new File([bytes.slice()], name, { type: 'application/octet-stream' });
}

export function downloadFile(bytes: Uint8Array, name: string): void {
  const url = URL.createObjectURL(new Blob([bytes.slice()], { type: 'application/octet-stream' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.rel = 'noopener';
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** Whether "Share it" can open the phone's share menu with this file. */
export function canShareFile(bytes: Uint8Array, name: string): boolean {
  try {
    return typeof navigator.canShare === 'function' && navigator.canShare({ files: [asFile(bytes, name)] });
  } catch {
    return false;
  }
}

export async function shareFile(bytes: Uint8Array, name: string): Promise<'shared' | 'cancelled' | 'failed'> {
  try {
    await navigator.share({ files: [asFile(bytes, name)], title: name });
    return 'shared';
  } catch (e) {
    return e instanceof DOMException && e.name === 'AbortError' ? 'cancelled' : 'failed';
  }
}

/** Opens the phone's file picker. Call it straight from a tap. Any file is accepted; the app checks inside. */
export function pickFiles(onFiles: (files: File[]) => void): void {
  const input = document.createElement('input');
  input.type = 'file';
  input.multiple = true;
  input.style.display = 'none';
  input.addEventListener('change', () => {
    const files = [...(input.files ?? [])];
    input.remove();
    if (files.length) onFiles(files);
  });
  input.addEventListener('cancel', () => input.remove());
  document.body.appendChild(input);
  input.click();
}

export async function readFile(file: File): Promise<Uint8Array> {
  return new Uint8Array(await file.arrayBuffer());
}

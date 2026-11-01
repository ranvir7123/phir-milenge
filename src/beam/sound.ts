// The honk: two short truck-horn notes made by the browser's sound engine (Web Audio), about 1 second,
// with two short buzzes where the phone can vibrate. Phones only allow sound after a tap, so the sound
// engine is switched on inside the tap on Catch (`unlockSound`), and the honk plays when a catch finishes.

let audio: AudioContext | null = null;

function context(): AudioContext | null {
  if (audio) return audio;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  try {
    audio = new Ctor();
  } catch {
    return null;
  }
  return audio;
}

/** Call inside a tap (the tap on Catch, or Open a file) so the honk is allowed to play later. */
export function unlockSound(): void {
  const ctx = context();
  if (!ctx) return;
  if (ctx.state === 'suspended') void ctx.resume().catch(() => {});
  // A silent blip: iPhones only switch sound on once something has played inside a tap.
  try {
    const buffer = ctx.createBuffer(1, 1, 22050);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    source.start(0);
  } catch {
    // Nothing to do; the honk just won't play.
  }
}

function hornNote(ctx: AudioContext, start: number, length: number): void {
  const out = ctx.createGain();
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 1600;
  filter.connect(out);
  out.connect(ctx.destination);
  out.gain.setValueAtTime(0, start);
  out.gain.linearRampToValueAtTime(0.22, start + 0.03);
  out.gain.setValueAtTime(0.22, start + length - 0.07);
  out.gain.linearRampToValueAtTime(0, start + length);
  // Two pitches together give the slightly sour sound of a real truck horn.
  for (const freq of [311, 392]) {
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = freq;
    osc.connect(filter);
    osc.start(start);
    osc.stop(start + length);
  }
}

/** Plays the honk and buzzes twice. Silent phones just stay silent. */
export function honk(): void {
  try {
    navigator.vibrate?.([120, 90, 120]);
  } catch {
    // Not every phone can vibrate.
  }
  const ctx = context();
  if (!ctx) return;
  const play = () => {
    const t = ctx.currentTime + 0.02;
    hornNote(ctx, t, 0.38);
    hornNote(ctx, t + 0.5, 0.5);
  };
  if (ctx.state === 'suspended') void ctx.resume().then(play, () => {});
  else play();
}

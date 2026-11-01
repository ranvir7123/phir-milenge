// Runs a function with a made-up clock and seeded random numbers, so the demo script gives the
// same bytes every run. Only the script and its tests use this; the app never does.

export interface FakeClock {
  set(t: number): void;
  now(): number;
}

/** A small seeded random generator (mulberry32). */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function deterministic<T>(seed: number, start: number, fn: (clock: FakeClock) => T): T {
  const random = seeded(seed);
  let now = start;
  const clock: FakeClock = {
    set: (t) => {
      now = t;
    },
    now: () => now,
  };

  const RealDate = Date;
  class FakeDate extends RealDate {
    constructor(...args: unknown[]) {
      if (args.length === 0) super(now);
      else super(...(args as [number]));
    }
    static override now() {
      return now;
    }
  }

  const realRandom = Math.random;
  const crypto = globalThis.crypto;
  const ownGetRandom = Object.getOwnPropertyDescriptor(crypto, 'getRandomValues');
  const ownUUID = Object.getOwnPropertyDescriptor(crypto, 'randomUUID');
  const fill = <A extends ArrayBufferView | null>(array: A): A => {
    if (array) {
      const bytes = new Uint8Array(array.buffer, array.byteOffset, array.byteLength);
      for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(random() * 256);
    }
    return array;
  };
  const uuid = () => {
    const b = fill(new Uint8Array(16));
    b[6] = ((b[6] as number) & 0x0f) | 0x40;
    b[8] = ((b[8] as number) & 0x3f) | 0x80;
    const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
  };

  globalThis.Date = FakeDate as DateConstructor;
  Math.random = random;
  Object.defineProperty(crypto, 'getRandomValues', { value: fill, configurable: true, writable: true });
  Object.defineProperty(crypto, 'randomUUID', { value: uuid, configurable: true, writable: true });
  try {
    return fn(clock);
  } finally {
    globalThis.Date = RealDate;
    Math.random = realRandom;
    restore(crypto, 'getRandomValues', ownGetRandom);
    restore(crypto, 'randomUUID', ownUUID);
  }
}

function restore(target: object, name: string, own: PropertyDescriptor | undefined) {
  if (own) Object.defineProperty(target, name, own);
  else delete (target as Record<string, unknown>)[name];
}

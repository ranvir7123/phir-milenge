// Ids for writers, docs, list items and changes. Explanation: src/contracts/doc.ts.

import type { ActorId, ChangeId, DocId, ItemId } from '../contracts';

function randomBytes(n: number): Uint8Array {
  const out = new Uint8Array(n);
  crypto.getRandomValues(out);
  return out;
}

function hex(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += b.toString(16).padStart(2, '0');
  return s;
}

/** 16 lowercase hex characters, made once per browser profile. */
export function newActorId(): ActorId {
  return hex(randomBytes(8));
}

/** 32 lowercase hex characters. */
export function newDocId(): DocId {
  return hex(randomBytes(16));
}

const BASE36 = '0123456789abcdefghijklmnopqrstuvwxyz';

/** 12 random base36 characters. */
export function newItemId(): ItemId {
  // 252 is the largest multiple of 36 below 256, so every character is equally likely.
  let s = '';
  while (s.length < 12) {
    for (const b of randomBytes(16)) {
      if (b < 252 && s.length < 12) s += BASE36[b % 36];
    }
  }
  return s;
}

export function changeId(actor: ActorId, seq: number): ChangeId {
  return `${actor}:${seq}`;
}

/** Splits `${actor}:${seq}`. */
export function parseChangeId(id: ChangeId): { actor: ActorId; seq: number } {
  const at = id.lastIndexOf(':');
  return { actor: id.slice(0, at), seq: Number(id.slice(at + 1)) };
}

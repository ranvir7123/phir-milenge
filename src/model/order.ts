// The fixed sort: a change always comes after everything in its deps; when several are free to go next,
// the smaller writer time goes first, then the smaller writer id, then the smaller counter.
// The order depends only on the set of changes, never on when they arrived (section 1.2).

import type { Change } from '../contracts';

export function compareFree(a: Change, b: Change): number {
  if (a.t !== b.t) return a.t < b.t ? -1 : 1;
  if (a.actor !== b.actor) return a.actor < b.actor ? -1 : 1;
  return a.seq - b.seq;
}

/** A small binary heap, so 20,000 changes sort quickly. */
class Heap {
  private items: Change[] = [];
  get size(): number {
    return this.items.length;
  }
  push(c: Change): void {
    const a = this.items;
    a.push(c);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (compareFree(a[i]!, a[p]!) >= 0) break;
      [a[i], a[p]] = [a[p]!, a[i]!];
      i = p;
    }
  }
  pop(): Change {
    const a = this.items;
    const top = a[0]!;
    const last = a.pop()!;
    if (a.length > 0) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < a.length && compareFree(a[l]!, a[m]!) < 0) m = l;
        if (r < a.length && compareFree(a[r]!, a[m]!) < 0) m = r;
        if (m === i) break;
        [a[i], a[m]] = [a[m]!, a[i]!];
        i = m;
      }
    }
    return top;
  }
}

/** Every change's deps must be in `changes` (the engine holds back the ones that aren't). */
export function sortChanges(changes: readonly Change[]): Change[] {
  const byId = new Map<string, Change>();
  for (const c of changes) byId.set(c.id, c);
  const waitingOn = new Map<string, number>();
  const after = new Map<string, Change[]>();
  const heap = new Heap();
  for (const c of byId.values()) {
    const deps = new Set(c.deps.filter((d) => byId.has(d)));
    waitingOn.set(c.id, deps.size);
    for (const d of deps) {
      const list = after.get(d);
      if (list) list.push(c);
      else after.set(d, [c]);
    }
    if (deps.size === 0) heap.push(c);
  }
  const out: Change[] = [];
  while (heap.size > 0) {
    const c = heap.pop();
    out.push(c);
    for (const next of after.get(c.id) ?? []) {
      const left = waitingOn.get(next.id)! - 1;
      waitingOn.set(next.id, left);
      if (left === 0) heap.push(next);
    }
  }
  if (out.length !== byId.size) throw new Error('Engine: the changes depend on each other in a loop');
  return out;
}

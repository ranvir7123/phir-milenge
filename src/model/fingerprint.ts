// The truck back: made from what the doc says, never its history (section 1.10).
// What the doc says is written out one fixed way, hashed with SHA-256, and the first bytes pick the words.

import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js';
import type { DocView, Field, Fingerprint } from '../contracts';
import { canonical } from './fold';
import { WORDS } from './words';

/** A field as the doc says it: its value, or every version (with its writer) while in clash or settled. */
function said(f: Field<unknown> | undefined): unknown {
  if (!f) return null;
  if (f.state === 'one') return f.shown?.value ?? null;
  const lanes = f.lanes.map((l) => [l.actor, l.value ?? null]);
  if (f.state === 'clash') return { clash: lanes };
  return { settled: f.shown?.value ?? null, by: f.shown?.actor ?? null, lanes, how: f.how ?? null };
}

/** Everything the doc says, without ids, times or who has what. */
export function docContent(view: DocView): unknown {
  return {
    title: said(view.title),
    settle: said(view.settle),
    blocks: view.blocks.map((b) => ({
      style: b.style,
      text: b.sentences.map((s) => said(s.field)),
      marks: b.marks,
      tick: said(b.tick),
      table: b.table
        ? {
            name: said(b.table.name),
            columns: b.table.columns.map((c) => said(c.def)),
            rows: b.table.rows.map((r) => ({
              alive: said(r.alive),
              cells: b.table!.columns.map((c) => said(r.cells[c.id])),
            })),
          }
        : null,
    })),
    rules: view.rules.map((r) => ({
      def: said(r.field),
      result: r.result.state === 'broken' ? { state: 'broken', message: r.result.message } : r.result,
    })),
  };
}

export function fingerprintOf(view: DocView): Fingerprint {
  const hash = sha256(utf8ToBytes(canonical(docContent(view))));
  return {
    words: [WORDS[hash[0]!]!, WORDS[hash[1]!]!, WORDS[hash[2]!]!],
    digits: String(hash[3]! % 100).padStart(2, '0'),
    hex: bytesToHex(hash),
  };
}

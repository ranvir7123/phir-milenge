// Everything the Caught screen says, worked out from the catch result. No drawing here, so it can be tested.
// Spec: 2-user-experience.md, "What they read after the catch".

import type { ActorId, Change, DocEngine, DocView, Json, ReceiveResult, SettleRule } from '../contracts';
import { fieldIndex, kindOfKey } from './fields';
import {
  agoForm,
  colourName,
  countWords,
  cutName,
  joinNames,
  lowerFirst,
  nameOf as nameOfWriter,
  plural,
  quoteStart,
  upperFirst,
} from './format';
import { missingCount } from './knowledge';
import { ruleDef, ruleName } from './rules';

export interface WriterLine {
  actor: ActorId;
  /** "Rina, 41 words" */
  head: string;
  /** "Last written Mon 6:05 am, came via Meher" */
  sub: string;
}

export interface Flag {
  kind: 'two-versions' | 'rule';
  text: string;
  /** Where to jump, if anywhere. */
  block: string | null;
}

export type CatchSummary =
  | {
      kind: 'new';
      title: string;
      lead: string;
      writers: WriterLine[];
      flags: Flag[];
      /** Lines about what arrived because someone decided something. */
      decisions: string[];
      beamBack: boolean;
      /** "Meher already has everything you have." when there's no Beam back. */
      evenLine: string | null;
    }
  | { kind: 'behind'; title: string; body: string; missing: number; beamBack: true }
  | { kind: 'even'; title: string; body: string; beamBack: false };

interface Tally {
  words: number;
  rows: number;
  cells: number;
  ticks: number;
  picks: number;
  rules: number;
  other: number;
  latest: number;
}

function emptyTally(): Tally {
  return { words: 0, rows: 0, cells: 0, ticks: 0, picks: 0, rules: 0, other: 0, latest: 0 };
}

/** "58 new words and 3 new rows": the two biggest kinds of work, in a fixed order. Picks and rules get their own lines. */
function tallyParts(t: Tally, lead: boolean): string[] {
  const parts: string[] = [];
  if (t.words > 0) parts.push(plural(t.words, lead ? 'new word' : 'word'));
  if (t.rows > 0) parts.push(plural(t.rows, lead ? 'new row' : 'row'));
  if (t.cells > 0) parts.push(plural(t.cells, lead ? 'changed cell' : 'cell'));
  if (t.ticks > 0) parts.push(plural(t.ticks, 'tick'));
  if (t.rules > 0) parts.push(plural(t.rules, lead ? 'new rule' : 'rule'));
  if (t.picks > 0) parts.push(plural(t.picks, 'pick'));
  if (parts.length === 0) parts.push(plural(Math.max(1, t.other), lead ? 'new change' : 'change'));
  return parts.slice(0, 2);
}

function tallyChange(c: Change, t: Tally) {
  t.latest = Math.max(t.latest, c.t);
  for (const op of c.ops) {
    if (op.o === 'ins') {
      if (/^b\/[^/]+\/rows$/.test(op.list)) t.rows++;
      else if (op.list === 'rules') t.rules++;
      continue;
    }
    const kind = kindOfKey(op.k);
    if (op.others && op.others.length > 0) {
      t.picks++;
      continue;
    }
    if ((kind === 'sentence' || kind === 'title') && typeof op.v === 'string') t.words += countWords(op.v);
    else if (kind === 'cell') t.cells++;
    else if (kind === 'tick') t.ticks++;
    else if (kind !== 'row' && kind !== 'rule') t.other++;
  }
}

/** "Rina's and Tanmoy's" */
function possessives(names: string[]): string {
  return joinNames(names.map((n) => `${n}'s`));
}

function settleWords(rule: SettleRule | null): string {
  switch (rule?.kind) {
    case 'newest':
      return 'keep the newest one';
    case 'person':
      return "one person's version wins";
    case 'smaller':
      return 'for numbers, keep the smaller one';
    default:
      return 'always ask';
  }
}

function quoteValue(v: Json): string | null {
  return typeof v === 'string' && v.trim() ? `"${quoteStart(v, 5)}"` : null;
}

/** Who sent this catch: the note's sender, or the writer whose name matches. */
export function senderOf(view: DocView, result: ReceiveResult, fromName: string): ActorId | null {
  if (result.note?.from?.actor) return result.note.from.actor;
  const match = Object.values(view.writers).find((w) => w.name === fromName);
  return match?.actor ?? null;
}

export function summarise(engine: DocEngine, view: DocView, result: ReceiveResult, senderName: string, now: number): CatchSummary {
  const sender = senderOf(view, result, senderName);
  // Names over 16 letters are cut with "…" everywhere on this screen.
  const fromName = cutName(senderName);
  const nameOf = (v: DocView, a: ActorId | null | undefined) => cutName(nameOfWriter(v, a));
  const viaFile = result.note?.from?.via === 'file';

  if (result.onlyNotes || result.newEdits.length === 0) {
    if (result.senderMissing && !viaFile) {
      const missing = sender ? missingCount(sender, engine) : 0;
      const missingText = missing > 0 ? `${fromName} is missing ${missing.toLocaleString('en-IN')} of your changes.` : `${fromName} is missing some of your changes.`;
      return {
        kind: 'behind',
        title: `Nothing new from ${fromName}`,
        body: `You already had everything ${fromName} beamed. ${missingText}`,
        missing,
        beamBack: true,
      };
    }
    return { kind: 'even', title: `Already caught up with ${fromName}`, body: 'Phir milenge.', beamBack: false };
  }

  const index = new Map(engine.changes().map((c) => [c.id, c]));
  const edits = result.newEdits.map((id) => index.get(id)).filter((c): c is Change => !!c && c.kind === 'edit');

  // Tally per writer, in the order their newest change was written (newest first).
  const perWriter = new Map<ActorId, Tally>();
  const total = emptyTally();
  for (const c of edits) {
    const t = perWriter.get(c.actor) ?? emptyTally();
    tallyChange(c, t);
    tallyChange(c, total);
    perWriter.set(c.actor, t);
  }
  const writers = [...perWriter.entries()].sort((a, b) => b[1].latest - a[1].latest);

  const came = viaFile ? 'came in the file' : `came with ${fromName}'s beam`;
  const others = writers.map(([a]) => a).filter((a) => a !== sender && a !== engine.me);
  const leadParts = tallyParts(total, true);
  let lead = `${upperFirst(joinNames(leadParts))}.`;
  if (others.length > 0) lead += ` ${possessives(others.map((a) => nameOf(view, a)))} work ${came}.`;

  const writerLines: WriterLine[] = writers.map(([actor, t]) => {
    const when = agoForm(t.latest, now);
    const route = actor === sender ? 'came direct' : viaFile ? 'came in the file' : `came via ${fromName}`;
    return {
      actor,
      head: `${nameOf(view, actor)}, ${joinNames(tallyParts(t, false))}`,
      sub: `Last written ${when === 'Just now' ? 'just now' : when}, ${route}`,
    };
  });

  // Flags: open clashes touched by this catch, then every broken rule.
  const fields = fieldIndex(view);
  const open = new Set(view.needsLook.clashes);
  const touched = new Set<string>();
  for (const c of edits) for (const op of c.ops) if (op.o === 'set' && open.has(op.k)) touched.add(op.k);
  const flags: Flag[] = [];
  const byKind = new Map<string, string[]>();
  for (const k of touched) {
    const kind = kindOfKey(k);
    const list = byKind.get(kind) ?? [];
    list.push(k);
    byKind.set(kind, list);
  }
  for (const [kind, keys] of byKind) {
    const first = keys[0] ? fields.get(keys[0]) : undefined;
    const block = first?.block ?? null;
    if (kind === 'sentence') {
      const q = first?.field.lanes.find((l) => typeof l.value === 'string')?.value as string | undefined;
      const quote = q ? `: "${quoteStart(q)}"` : '';
      flags.push({ kind: 'two-versions', text: `Two versions of ${plural(keys.length, 'sentence')}${quote}. Pick one, or leave both.`, block });
    } else {
      const word = kind === 'cell' ? 'cell' : kind === 'row' ? 'row' : kind === 'tick' ? 'tick' : kind === 'title' ? 'title' : kind === 'rule' ? 'rule' : kind === 'settle' ? 'settle rule' : 'spot';
      const where = first?.table && (kind === 'cell' || kind === 'row') ? ` in ${first.table}` : '';
      flags.push({ kind: 'two-versions', text: `Two versions of ${plural(keys.length, word)}${where}. Pick one, or leave both.`, block });
    }
  }
  for (const r of view.rules) {
    if (r.result.state !== 'broken') continue;
    flags.push({ kind: 'rule', text: `Rule broken: ${lowerFirst(r.result.message)}`, block: r.result.where[0]?.block ?? null });
  }

  // Decisions that arrived: picks, settle rules, new rules, a shared colour.
  const decisions: string[] = [];
  const settledCount = [...fields.values()].filter((f) => f.field.state === 'settled').length;
  const myColour = view.writers[engine.me]?.colour ?? null;
  for (const c of edits) {
    const who = nameOf(view, c.actor);
    for (const op of c.ops) {
      if (op.o === 'ins') {
        if (op.list === 'rules') {
          const rv = view.rules.find((r) => r.id === op.id);
          if (rv) {
            const broken = rv.result.state === 'broken' ? " It's already broken here." : '';
            decisions.push(`${who} added a rule: ${lowerFirst(ruleName(ruleDef(rv), view))}.${broken}`);
          }
        }
        continue;
      }
      if (op.others && op.others.length > 0) {
        const q = quoteValue(op.v);
        const what = q ?? (op.v === null ? 'it deleted' : 'one version');
        decisions.push(`${who} kept ${what} over ${plural(op.others.length, 'other')}.`);
      } else if (op.k === 'settle') {
        const rule = op.v as unknown as SettleRule | null;
        const settled = rule && rule.kind !== 'ask' ? ` ${plural(settledCount, 'clash', 'clashes')} settled here too.` : '';
        decisions.push(`${who} set a settle rule: ${settleWords(rule)}.${settled}`);
      } else if (myColour && myColour !== 'plain' && c.actor !== engine.me && op.k === `w/${c.actor}/colour` && op.v === myColour) {
        decisions.push(`${who} also writes in ${colourName(myColour)} in this doc. Your names next to the colour tell you apart.`);
      }
    }
  }

  const beamBack = result.senderMissing && !viaFile;
  return {
    kind: 'new',
    title: `Caught from ${fromName}`,
    lead,
    writers: writerLines,
    flags,
    decisions: [...new Set(decisions)],
    beamBack,
    evenLine: beamBack || viaFile ? null : `${fromName} already has everything you have.`,
  };
}

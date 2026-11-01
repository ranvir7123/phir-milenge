// The shapes every track shares. Owned by the integrator: change only by agreement.
// Full explanation: docs/plan/3-how-its-built.md, section 1.

/** A device's writer id: 16 lowercase hex characters, made once per browser profile. */
export type ActorId = string;
/** A doc's id: 32 lowercase hex characters, made when the doc is created. */
export type DocId = string;
/** `${actor}:${seq}`. seq starts at 1 and goes up by one per change this actor makes in this doc. */
export type ChangeId = string;
/** An item id in a list (block, sentence slot, table row or column, rule): 12 random base36 characters. */
export type ItemId = string;

export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

/**
 * Only two kinds of op exist, so older apps always replay newer changes the same way.
 * New features add new register keys and value shapes, never new op kinds.
 */
export type Op =
  /** Write a register. v === null means deleted. `others` lists the changes whose values a pick replaced. */
  | { o: 'set'; k: string; v: Json; others?: ChangeId[] }
  /** Put a new item into a list, right after `after` (null = at the start). */
  | { o: 'ins'; list: string; id: ItemId; after: ItemId | null };

/** Written as a register value by an undone pick: show these changes' values as lanes again. */
export interface LanesAgain {
  $lanes: ChangeId[];
}

export interface Change {
  id: ChangeId;
  actor: ActorId;
  seq: number;
  /** The heads this phone had when the change was made: everything the writer had seen. */
  deps: ChangeId[];
  /** The writer's clock, ms since 1970. Only for "Keep the newest one", formatting fights and showing times. */
  t: number;
  /** "Where are you?" at the time of writing. */
  place?: string;
  /** 'note' changes only say "this phone has everything up to deps". They have no ops. */
  kind: 'edit' | 'note';
  ops: Op[];
  /** Notes only: who this phone caught from, and how. */
  from?: { actor: ActorId | null; via: 'beam' | 'file' };
}

// ---------------------------------------------------------------------------
// Register and list keys. Every key is built by these helpers, never by hand.
// ---------------------------------------------------------------------------

export const keys = {
  title: 'title',
  template: 'template',
  settle: 'settle',
  blocks: 'blocks',
  rules: 'rules',
  writerName: (a: ActorId) => `w/${a}/name`,
  writerColour: (a: ActorId) => `w/${a}/colour`,
  blockStyle: (b: ItemId) => `b/${b}/style`,
  sentences: (b: ItemId) => `b/${b}/s`,
  sentence: (b: ItemId, s: ItemId) => `b/${b}/s/${s}`,
  tick: (b: ItemId) => `b/${b}/tick`,
  mark: (b: ItemId, markKey: string) => `b/${b}/m/${markKey}`,
  tableName: (b: ItemId) => `b/${b}/name`,
  columns: (b: ItemId) => `b/${b}/cols`,
  column: (b: ItemId, c: ItemId) => `b/${b}/col/${c}`,
  rows: (b: ItemId) => `b/${b}/rows`,
  row: (b: ItemId, r: ItemId) => `b/${b}/row/${r}`,
  cell: (b: ItemId, r: ItemId, c: ItemId) => `b/${b}/cell/${r}/${c}`,
  rule: (r: ItemId) => `rule/${r}`,
} as const;

/**
 * How a register behaves when two phones wrote it while apart.
 * 'clash': keep every version (lanes). 'later': the later writer time wins, then the larger actor id.
 * 'own': only its writer writes it; that writer's latest wins.
 * Unknown keys are 'clash', so nothing is ever silently lost.
 */
export type MergePolicy = 'clash' | 'later' | 'own';

// ---------------------------------------------------------------------------
// What the doc shows: the engine's output, the editor's and panels' input.
// ---------------------------------------------------------------------------

export type WriterColour = 'yellow' | 'orange' | 'pink' | 'red' | 'plain';

export interface WriterView {
  actor: ActorId;
  name: string;
  /** This writer's colour in this doc; null until they pick (Plain is a pick too). */
  colour: WriterColour | null;
}

/** One version of a register's value. value === null means "deleted by this writer". */
export interface Lane<T> {
  value: T | null;
  ref: ChangeId;
  actor: ActorId;
  t: number;
  place?: string;
}

export type SettleRule =
  | { kind: 'ask' }
  | { kind: 'newest' }
  | { kind: 'person'; actor: ActorId }
  | { kind: 'smaller' };

/** A register as shown. */
export interface Field<T> {
  /** The register key; picks and settles refer to it. */
  key: string;
  /** 'one': a single version. 'clash': two or more versions, shown as lanes. 'settled': a settle rule picked one. */
  state: 'one' | 'clash' | 'settled';
  /** The version shown. null when state is 'clash'. */
  shown: Lane<T> | null;
  /** Every current version, in a fixed order (oldest writer time first). Length 1 when state is 'one'. */
  lanes: Lane<T>[];
  /** Versions kept behind "1 other": beaten by a pick ("Keep this one") or by the settle rule. */
  kept: Lane<T>[];
  /** Set when state is 'settled'. */
  how?: SettleRule;
  /** Set when a "Keep this one" made `shown` the version shown: who picked it ("Kept by Asif · 1 other"). */
  pickedBy?: ActorId;
}

export type BlockKind = 'p' | 'h1' | 'h2' | 'h3' | 'li' | 'table';
export type ListKind = 'bullet' | 'number' | 'check';

export interface BlockStyle {
  kind: BlockKind;
  /** Only for kind 'li'. */
  list?: ListKind;
  /** 0 to 2. Only for kind 'li'. */
  indent?: 0 | 1 | 2;
}

export type MarkType = 'bold' | 'italic' | 'underline' | 'link';

/** Formatting is anchored to the words it covers: the `occurrence`-th time `quote` appears in the block (1-based). */
export interface MarkView {
  type: MarkType;
  quote: string;
  occurrence: number;
  /** Links only: http, https, tel or mailto. */
  href?: string;
}

export interface SentenceView {
  id: ItemId;
  field: Field<string>;
}

export interface ColumnDef {
  name: string;
  kind: 'words' | 'number';
}

export interface ColumnView {
  id: ItemId;
  def: Field<ColumnDef>;
}

export interface RowView {
  id: ItemId;
  /** A clash here means: deleted by someone, changed by someone else while apart. */
  alive: Field<true>;
  cells: Record<ItemId, Field<string>>;
}

export interface TableView {
  name: Field<string>;
  columns: ColumnView[];
  rows: RowView[];
}

export interface BlockView {
  id: ItemId;
  style: BlockStyle;
  /** Text blocks: the sentences, in order. Joining the shown values gives the block's text. Empty for tables. */
  sentences: SentenceView[];
  marks: MarkView[];
  /** Checklist items only. */
  tick?: Field<boolean>;
  /** Numbered list items only: worked out from the list's order, never stored. */
  number?: number;
  table?: TableView;
  /** Writers whose changes made this block's shown content, for colour bars. */
  writtenBy: ActorId[];
}

export type RuleDef =
  /** name: the rule's short name ("One kit per ration card"), used in every message and the Rules panel. */
  | {
      /** "In [table], each [column] can have [of] = [value] only [times] time." */
      kind: 'unique';
      table: ItemId;
      column: ItemId;
      name?: string;
      /** The column whose value is counted, for example Kit. Absent: count the rows themselves. */
      of?: ItemId;
      /** Count only rows where `of` is this value. Absent: any value. */
      value?: string;
      /** How many times each value of `column` may appear. Absent: 1. */
      times?: number;
    }
  | {
      kind: 'limit';
      /** The rule's short name ("Tarpaulins stay within 500"). */
      name?: string;
      table: ItemId;
      where?: { column: ItemId; equals: string };
      /** A Number column to total. Absent: count rows. */
      total?: ItemId;
      max: number;
    }
  /** A rule kind made by a newer app: kept, travels, shown as "Can't check this rule". */
  | { kind: string; [key: string]: Json };

export type RuleResult =
  | { state: 'ok' }
  | { state: 'broken'; message: string; where: { block: ItemId; row?: ItemId }[] }
  | { state: 'unknown' };

export interface RuleView {
  id: ItemId;
  field: Field<RuleDef>;
  result: RuleResult;
}

export interface DocView {
  docId: DocId;
  title: Field<string>;
  /** 'blank', 'camp-log', … */
  template: string | null;
  blocks: BlockView[];
  rules: RuleView[];
  settle: Field<SettleRule>;
  writers: Record<ActorId, WriterView>;
  /** For the "needs a look" line: every field key in clash, and every broken rule. */
  needsLook: { clashes: string[]; broken: ItemId[] };
}

/** The truck back: made from what the doc says, never its history. */
export interface Fingerprint {
  /** Three words from the fixed 256-word list. */
  words: [string, string, string];
  /** Two digits, "00" to "99". */
  digits: string;
  /** The full SHA-256, hex, for the picture and for tests. */
  hex: string;
}

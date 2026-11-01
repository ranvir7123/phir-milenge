// What track A (src/model) gives every other track. Owned by the integrator.
// Full explanation: docs/plan/3-how-its-built.md, sections 1 and 3.

import type {
  ActorId,
  BlockStyle,
  Change,
  ChangeId,
  ColumnDef,
  DocId,
  DocView,
  Field,
  Fingerprint,
  ItemId,
  MarkType,
  Op,
  RuleDef,
  SettleRule,
  WriterColour,
} from './doc';

export interface ViewOptions {
  /**
   * 'merged': the real doc. 'normal-sync': each clash shows only the version whose change
   * first reached this phone last (needs `arrival`). Never changes the doc.
   */
  mode?: 'merged' | 'normal-sync';
  /** Change id → the order it first arrived on this phone (0, 1, 2…). */
  arrival?: ReadonlyMap<ChangeId, number>;
}

export interface ReceiveResult {
  /** Changes new to this phone, in the fixed order. */
  added: ChangeId[];
  /** The subset of `added` that are edits (not notes). Drives the glow and type-in. */
  newEdits: ChangeId[];
  /** True when everything new was notes: show "Already caught up with …". */
  onlyNotes: boolean;
  /** Already had these. */
  duplicates: number;
  /** Stored, but waiting for changes they depend on. */
  waiting: number;
  /** The note this phone wrote about the catch (null when nothing new was an edit). Store it like any change. */
  note: Change | null;
  /** True when the sender is missing some of this phone's changes: show "Beam back". */
  senderMissing: boolean;
}

export interface TrailStep {
  actor: ActorId;
  /** When this phone first had it (its note's or change's writer time). */
  t: number;
  via: 'wrote' | 'beam' | 'file';
}

export interface ReplayStep {
  change: ChangeId;
  actor: ActorId;
  t: number;
  view: DocView;
}

export interface SelfTestResult {
  runs: number;
  same: number;
  fingerprint: Fingerprint;
  /** Indexes of runs that came out different, with their shuffled orders, to save and replay. */
  differing: { run: number; order: ChangeId[]; fingerprint: Fingerprint }[];
}

export interface DocEngine {
  readonly docId: DocId;
  readonly me: ActorId;
  /** Every change, in the fixed order (waiting ones excluded). */
  changes(): readonly Change[];
  heads(): ChangeId[];
  view(opts?: ViewOptions): DocView;
  /** The receive path for a catch or a file. Duplicates are skipped; nothing is ever removed. */
  receive(changes: Change[], from: { actor: ActorId | null; via: 'beam' | 'file' }): ReceiveResult;
  /** A local edit. Returns the new change, already applied; the caller stores it. */
  commit(ops: Op[], opts?: { place?: string; t?: number }): Change;
  /** Takes back this phone's own last change (skipping anything caught). Null when nothing to undo. */
  undo(opts?: { place?: string; t?: number }): Change | null;
  redo(opts?: { place?: string; t?: number }): Change | null;
  fingerprint(): Fingerprint;
  /** Writers whose phones have every change that made this block. */
  whoHas(block: ItemId): ActorId[];
  /** How this block's newest words travelled, phone to phone, in order. */
  trail(block: ItemId): TrailStep[];
  /** Every edit, one step at a time, in the fixed order (notes skipped). */
  replay(): ReplayStep[];
}

/** Build-a-doc and read-a-file functions exported by src/model/index.ts. */
export interface EngineModule {
  /** A random 16-hex writer id for a new device. */
  newActorId(): ActorId;
  newDocId(): DocId;
  newItemId(): ItemId;
  /** Open a doc from its stored changes (any order). */
  openDoc(docId: DocId, me: ActorId, changes: Change[]): DocEngine;
  /** A brand-new doc. `ops` comes from a template; the first change is made by `me`. */
  createDoc(me: ActorId, ops: Op[], opts?: { place?: string; t?: number }): { engine: DocEngine; first: Change };
  encodePhir(doc: { docId: DocId; title: string; changes: readonly Change[] }): Uint8Array;
  decodePhir(bytes: Uint8Array): PhirDecodeResult;
  /** Shuffles `changes` into `orders` arrival orders (seeded) and checks every result is the same doc. */
  runSelfTest(changes: readonly Change[], orders: number, seed?: number): SelfTestResult;
  splitSentences(text: string): string[];
  intents: Intents;
}

export type PhirDecodeResult =
  | { ok: true; format: number; docId: DocId; title: string; changes: Change[] }
  | { ok: false; reason: 'not-phir' | 'newer' | 'damaged'; format?: number };

/**
 * Turn what someone did into ops. Every function is pure: it reads the current view and returns ops
 * (plus any new item id) for DocEngine.commit. The editor and panels never write ops by hand.
 */
export interface Intents {
  setTitle(view: DocView, text: string): Op[];
  /** The block's whole new text; the engine works out which sentences changed. */
  setText(view: DocView, block: ItemId, text: string): Op[];
  insertBlock(view: DocView, after: ItemId | null, style: BlockStyle, text: string): { ops: Op[]; block: ItemId };
  deleteBlock(view: DocView, block: ItemId): Op[];
  setStyle(block: ItemId, style: BlockStyle): Op[];
  setTick(block: ItemId, ticked: boolean): Op[];
  /** Turn formatting on or off for the `occurrence`-th time `quote` appears in the block. */
  setMark(block: ItemId, type: MarkType, quote: string, occurrence: number, on: boolean, href?: string): Op[];
  /** "Keep this one" on any field (sentence, cell, tick, title, rule…). */
  pick(field: Field<unknown>, lane: ChangeId): Op[];
  /** Undo of a pick: the lanes come back. */
  unpick(field: Field<unknown>): Op[];
  setSettle(rule: SettleRule): Op[];
  createTable(view: DocView, after: ItemId | null, name: string, columns: ColumnDef[]): { ops: Op[]; block: ItemId };
  addColumn(view: DocView, table: ItemId, def: ColumnDef): { ops: Op[]; column: ItemId };
  setColumn(table: ItemId, column: ItemId, def: ColumnDef): Op[];
  /** values: column id → text. */
  addRow(view: DocView, table: ItemId, values: Record<ItemId, string>): { ops: Op[]; row: ItemId };
  setCell(table: ItemId, row: ItemId, column: ItemId, text: string): Op[];
  deleteRow(table: ItemId, row: ItemId): Op[];
  setTableName(table: ItemId, name: string): Op[];
  addRule(view: DocView, def: RuleDef): { ops: Op[]; rule: ItemId };
  deleteRule(rule: ItemId): Op[];
  setWriterName(me: ActorId, name: string): Op[];
  setWriterColour(me: ActorId, colour: WriterColour): Op[];
  setTemplate(template: string): Op[];
}

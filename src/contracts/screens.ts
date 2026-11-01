// The props of the components the app shell (track E) puts on screen.
// Tracks C and D build these components; E wires them together.

import type { ActorId, ChangeId, DocView, ItemId, Op } from './doc';
import type { DocEngine, ReceiveResult } from './engine';

/** Shared by every component that shows the doc. */
export interface DocProps {
  engine: DocEngine;
  view: DocView;
  me: ActorId;
  /** Make a change from ops (from the Intents), store it and refresh the view. */
  commit(ops: Op[]): void;
  /** Base camp on the projector: bigger text, side panel grows. */
  bigScreen: boolean;
  /** The laptop layout (side panel beside the page) or the phone layout. */
  layout: 'phone' | 'laptop';
}

/** New words to glow and type in after a catch. */
export interface Glow {
  changes: ChangeId[];
  /** Type the new words in (phones after "Read what's new"; Base camp straight away). */
  typeIn: boolean;
}

export interface EditorProps extends DocProps {
  mode: 'edit' | 'normal-sync';
  glow: Glow | null;
  onGlowDone(): void;
  undo(): void;
  redo(): void;
  /** Toolbar buttons that open panels or screens owned by others. */
  onOpen(what: 'replay' | 'find' | 'outline' | 'add-rule' | 'needs-look' | 'beam' | 'catch' | 'menu'): void;
  /** Scroll to and briefly highlight a block (from the side panel, find, outline). */
  focusBlock: ItemId | null;
}

export interface SidePanelProps extends DocProps {
  normalSync: boolean;
  setNormalSync(on: boolean): void;
  onJump(block: ItemId): void;
  onOpen(what: 'replay' | 'self-test' | 'add-rule' | 'beam' | 'catch'): void;
  /** The block the cursor is in, for "3 of 4 have it". */
  cursorBlock: ItemId | null;
}

export interface CaughtScreenProps extends DocProps {
  result: ReceiveResult;
  fromName: string;
  onBeamBack(): void;
  onReadNew(): void;
  onDone(): void;
}

export interface TruckBackProps {
  view: DocView;
  engine: DocEngine;
  size: 'small' | 'large';
}

export interface ReplayViewProps extends DocProps {
  onClose(): void;
}

export interface SelfTestViewProps extends DocProps {
  onClose(): void;
}

export interface AddRuleProps extends DocProps {
  onClose(): void;
}

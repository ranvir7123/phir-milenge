// What the app is showing, kept in one place. Screens change here, never in the address bar
// (iPhone asks for the camera again after every address change).
import { create } from 'zustand';
import type { BeamHello, DeviceRecord, DocEngine, DocId, DocView, Glow, ReceiveResult } from '../contracts';
import type { HomeDocRecord } from '../store';
import type { DocLock } from './locks';

/** The getting-ready line (2-user-experience.md, "Getting the app"). 'unknown': no service worker here. */
export type OfflineStatus = 'unknown' | 'getting-ready' | 'slow' | 'not-ready-offline' | 'ready';

export interface Action {
  label: string;
  /** main: filled in the text colour. beam: blue, only for a button that starts a beam. */
  style?: 'main' | 'beam' | 'plain';
  run(): void;
}

/** A full-screen or sheet message: the warning icon, a bold first sentence, the rest, and buttons. */
export interface Message {
  warn: boolean;
  title: string;
  body: string;
  actions: Action[];
  /** Show "‹ Docs" above the message. */
  back?: boolean;
}

/** The doc open in this tab. The engine is changed in place; `view` is replaced after each change. */
export interface Session {
  docId: DocId;
  engine: DocEngine;
  view: DocView;
  lock: DocLock;
  /** The last change couldn't be stored: the saved line says "Not saved". */
  notSaved: boolean;
  /** When the last change was stored, for "Saved on this phone". */
  savedAt: number | null;
  glow: Glow | null;
  /** Normal sync: what the doc would look like if the newest arrival simply won (side panel switch). */
  normalSync: boolean;
}

export type Screen =
  | { kind: 'starting' }
  | { kind: 'first-open' }
  | { kind: 'home' }
  | { kind: 'opening'; docId: DocId }
  | { kind: 'doc' }
  | { kind: 'colour'; changing: boolean }
  | { kind: 'other-tab'; docId: DocId }
  | { kind: 'message'; message: Message }
  | { kind: 'catch'; from: 'home' | 'doc' }
  | { kind: 'beam'; payload: Uint8Array; hello: BeamHello; estimate: number; broadcast: boolean }
  | { kind: 'caught'; result: ReceiveResult; fromName: string; via: 'beam' | 'file' }
  | { kind: 'first-catch'; fromName: string; via: 'beam' | 'file'; writers: number }
  | { kind: 'replay' }
  | { kind: 'self-test' };

export type Sheet =
  | { kind: 'new-doc' }
  | { kind: 'me' }
  | { kind: 'row-menu'; docId: DocId }
  | { kind: 'remove'; docId: DocId; title: string; onlyHere: number }
  | { kind: 'saved-file'; name: string; size: number; bytes: Uint8Array }
  | { kind: 'message'; message: Message };

/** A line at the bottom, such as "Removed from this phone. Undo". */
export interface Notice {
  id: number;
  text: string;
  action?: Action;
}

export interface AppState {
  screen: Screen;
  sheet: Sheet | null;
  me: DeviceRecord | null;
  docs: HomeDocRecord[];
  session: Session | null;
  offline: OfflineStatus;
  /** A newer version is downloaded and waits for "Reload now". */
  updateReady: boolean;
  notice: Notice | null;
  bigScreen: boolean;
  /** Bytes left on this phone, and how fast it has been writing, for "Storage almost full". */
  storageLow: boolean;
}

export const useApp = create<AppState>(() => ({
  screen: { kind: 'starting' },
  sheet: null,
  me: null,
  docs: [],
  session: null,
  offline: 'unknown',
  updateReady: false,
  notice: null,
  bigScreen: false,
  storageLow: false,
}));

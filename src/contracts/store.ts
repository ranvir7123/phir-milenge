// What track E's storage (src/store) gives the others (the demo setup page uses it too).
// Full explanation: docs/plan/3-how-its-built.md, section 3.2.

import type { ActorId, Change, ChangeId, DocId } from './doc';

export interface DeviceRecord {
  actor: ActorId;
  name: string;
  place?: string;
  createdAt: number;
}

export interface DocRecord {
  docId: DocId;
  title: string;
  template: string | null;
  updatedAt: number;
  /** Size of the doc as a .phir file, in bytes. */
  size: number;
}

export interface StoredChange {
  docId: DocId;
  change: Change;
  /** The order this change first arrived on this phone. */
  arrival: number;
}

export interface Store {
  getDevice(): Promise<DeviceRecord | null>;
  setDevice(device: DeviceRecord): Promise<void>;
  listDocs(): Promise<DocRecord[]>;
  putDoc(doc: DocRecord): Promise<void>;
  /** Removes the doc and its changes from this phone only. */
  removeDoc(docId: DocId): Promise<void>;
  /** Saves changes not already stored; returns how many were new. Never overwrites. */
  addChanges(docId: DocId, changes: Change[]): Promise<number>;
  loadChanges(docId: DocId): Promise<StoredChange[]>;
  arrivalOrder(docId: DocId): Promise<Map<ChangeId, number>>;
  /** Wipes everything on this device. Only the demo setup page calls this. */
  wipeAll(): Promise<void>;
  /** navigator.storage.persist(), asked once. */
  askToKeep(): Promise<boolean>;
  /** Bytes used and available, from navigator.storage.estimate(). */
  space(): Promise<{ used: number; available: number } | null>;
}

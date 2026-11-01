// What track B (src/beam) gives the app shell. The beam moves bytes; it knows nothing about docs.
// Full explanation: docs/plan/3-how-its-built.md, section 2.

/** Carried by every 10th frame, so the catcher knows whose doc it is before the end. */
export interface BeamHello {
  /** The .phir file format version inside the beam. */
  format: number;
  docId: string;
  title: string;
  senderName: string;
  senderActor: string;
  /** Payload size in bytes. */
  size: number;
}

export interface BeamSettings {
  /** Bytes per piece. Default 400 until the beam test sets it. */
  pieceSize: number;
  framesPerSecond: number;
}

export interface BeamScreenProps {
  /** The .phir bytes to beam. */
  payload: Uint8Array;
  hello: BeamHello;
  /** Big screen on Base camp: "Beam to everyone", the code fills the screen. */
  broadcast: boolean;
  /** Estimated seconds, shown as "about N seconds once their camera has it". */
  estimateSeconds: number;
  onStop(): void;
  /** "Catch theirs" (hidden when broadcasting). */
  onCatchTheirs?(): void;
}

export interface CatchScreenProps {
  /** Called once the whole payload is rebuilt and its checksum passes. */
  onCaught(payload: Uint8Array, hello: BeamHello | null): void;
  /** Called on the first hello frame, so the app can stop early ("newer Phir Milenge", "different doc"). */
  onHello?(hello: BeamHello): 'continue' | 'stop';
  onCancel(): void;
  onUseFile(): void;
}

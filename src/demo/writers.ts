// The people in the demo story, each with a fixed writer id, so a phone set up as Rina
// writes as the same Rina who wrote last week's lines in her starting doc.
// Story and roles: docs/plan/4-demo-pitch-handin.md, section 2.
import type { ActorId, WriterColour } from '../contracts';

export interface DemoWriter {
  actor: ActorId;
  name: string;
  /** "Where are you?" Base camp leaves it empty. */
  place?: string;
  colour: WriterColour;
}

/** The roles the demo setup page can turn a device into. */
export type Role = 'base' | 'rina' | 'asif' | 'tanmoy' | 'spare';

export const WRITERS = {
  base: { actor: 'd4d4d4d4d4d4d4d4', name: 'Base camp', colour: 'plain' },
  rina: { actor: 'a1a1a1a1a1a1a1a1', name: 'Rina', place: 'Gosaba camp', colour: 'yellow' },
  asif: { actor: 'b2b2b2b2b2b2b2b2', name: 'Asif', place: 'Patharpratima camp', colour: 'pink' },
  tanmoy: { actor: 'c3c3c3c3c3c3c3c3', name: 'Tanmoy', place: 'Basanti camp', colour: 'orange' },
  /** Carries docs between camps by boat. In the story only: she has no device on stage. */
  meher: { actor: 'e5e5e5e5e5e5e5e5', name: 'Meher', place: 'Relief boat', colour: 'red' },
  /**
   * The laptop's spare browser profile. It holds Base camp's starting doc but is its own writer,
   * so its changes can never share a name with the main Base camp's.
   */
  spare: { actor: 'f6f6f6f6f6f6f6f6', name: 'Base camp', colour: 'plain' },
} as const satisfies Record<string, DemoWriter>;

export interface RoleInfo {
  role: Role;
  label: string;
  /** What the device holds after setup, in one line. */
  holds: string;
  writer: DemoWriter;
  /** Which starting doc it loads (the spare profile loads Base camp's). */
  doc: 'base' | 'rina' | 'asif' | 'tanmoy';
}

export const ROLES: RoleInfo[] = [
  {
    role: 'base',
    label: 'Base camp',
    holds: "The laptop on the projector. The doc from before the camps split up, plus Asif's week.",
    writer: WRITERS.base,
    doc: 'base',
  },
  {
    role: 'rina',
    label: 'Rina',
    holds: "Rina's phone. The doc from before the split, plus Rina's week.",
    writer: WRITERS.rina,
    doc: 'rina',
  },
  {
    role: 'asif',
    label: 'Asif',
    holds: "Asif's phone. The doc from before the split, plus Asif's week.",
    writer: WRITERS.asif,
    doc: 'asif',
  },
  {
    role: 'tanmoy',
    label: 'Tanmoy',
    holds: "Tanmoy's phone. The doc from before the split, plus Tanmoy's week. The pen drive has the same file.",
    writer: WRITERS.tanmoy,
    doc: 'tanmoy',
  },
  {
    role: 'spare',
    label: 'Spare profile',
    holds: "The laptop's spare browser profile. The same doc as Base camp, as a second Base camp writer.",
    writer: WRITERS.spare,
    doc: 'base',
  },
];

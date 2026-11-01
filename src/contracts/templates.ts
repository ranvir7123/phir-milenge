// What track F's templates (src/templates) give the app shell's "Start a new doc" screen.

import type { ActorId, Op } from './doc';
import type { Intents } from './engine';

export interface TemplateInfo {
  /** 'blank', 'camp-log', 'trip-notes', 'meeting-notes' */
  id: string;
  name: string;
  /** One line under the name on the template picker. */
  description: string;
  /** The ops of the new doc's first change: title, blocks, tables, rules, settle rule, template id. */
  ops(me: ActorId, intents: Intents, newItemId: () => string): Op[];
}

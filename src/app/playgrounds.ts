// Each track shows its piece with made-up data at ?play=<name>, from the first hour.
import { Playground as EnginePlayground } from '../model/Playground';
import { Playground as BeamPlayground } from '../beam/Playground';
import { Playground as EditorPlayground } from '../editor/Playground';
import { Playground as PanelsPlayground } from '../panels/Playground';
import { Playground as DemoPlayground } from '../demo/Playground';

export const playgrounds = {
  engine: EnginePlayground,
  beam: BeamPlayground,
  editor: EditorPlayground,
  panels: PanelsPlayground,
  demo: DemoPlayground,
};

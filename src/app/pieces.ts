// The other tracks' screens, each reached through the props its contract promises.
// While a track still ships a stub that takes no props, the cast keeps the join type-checked.
import type { ComponentType } from 'react';
import * as beam from '../beam';
import * as editor from '../editor';
import * as panels from '../panels';
import type {
  BeamScreenProps,
  CatchScreenProps,
  CaughtScreenProps,
  EditorProps,
  ReplayViewProps,
  SelfTestViewProps,
  SidePanelProps,
  TruckBackProps,
} from '../contracts';

export const Editor = editor.Editor as unknown as ComponentType<EditorProps>;
export const SidePanel = panels.SidePanel as unknown as ComponentType<SidePanelProps>;
export const CaughtScreen = panels.CaughtScreen as unknown as ComponentType<CaughtScreenProps>;
export const TruckBack = panels.TruckBack as unknown as ComponentType<TruckBackProps>;
export const ReplayView = panels.ReplayView as unknown as ComponentType<ReplayViewProps>;
export const SelfTestView = panels.SelfTestView as unknown as ComponentType<SelfTestViewProps>;
export const BeamScreen = beam.BeamScreen as unknown as ComponentType<BeamScreenProps>;
export const CatchScreen = beam.CatchScreen as unknown as ComponentType<CatchScreenProps>;

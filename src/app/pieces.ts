// The other tracks' screens, each reached through the props its contract promises.
// While a track still ships a stub that takes no props, the cast keeps the join type-checked.
import type { ComponentType } from 'react';
import * as editor from '../editor';
import * as panels from '../panels';
import type { EditorProps, ReplayViewProps, SelfTestViewProps } from '../contracts';

export { BeamScreen, CatchScreen } from '../beam';
export { CaughtScreen, SidePanel, TruckBack } from '../panels';

export const Editor = editor.Editor as unknown as ComponentType<EditorProps>;
export const ReplayView = panels.ReplayView as unknown as ComponentType<ReplayViewProps>;
export const SelfTestView = panels.SelfTestView as unknown as ComponentType<SelfTestViewProps>;

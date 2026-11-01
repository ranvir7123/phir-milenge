// Track D shows its screens here with made-up data. Open with ?play=panels. The address never changes:
// the buttons at the top switch screens in place.

import { useMemo, useState } from 'react';
import type { DocView, Op } from '../contracts';
import { ASIF, BASE, RINA, TANMOY, sampleView } from '../contracts/fixtures';
import { CaughtScreen } from './CaughtScreen';
import { usePlayEngine } from './engineLink';
import { MEHER, catchResult, playChanges, playEngine, playIntents, playSelfTest, playView } from './playData';
import { SidePanel } from './SidePanel';
import { TruckBack } from './TruckBack';
import './panels.css';

usePlayEngine(playIntents, playSelfTest(2));

/** A doc only this laptop has: no rules, no clashes, no one else. */
const emptyView: DocView = {
  ...sampleView,
  title: { ...sampleView.title, shown: { ...sampleView.title.shown!, value: 'Untitled doc' } },
  writers: { [BASE]: { actor: BASE, name: 'Base camp', colour: 'plain' } },
  blocks: [],
  rules: [],
  needsLook: { clashes: [], broken: [] },
};

/** The odd cases: a rule from a newer version, two settle rules, two versions of a rule, a very long name. */
const oddView: DocView = {
  ...playView,
  writers: {
    ...playView.writers,
    [MEHER]: { actor: MEHER, name: 'Meherunnisa Khatun Chowdhury', colour: 'red' },
  },
  settle: {
    key: 'settle',
    state: 'clash',
    shown: null,
    lanes: [
      { value: { kind: 'newest' }, ref: `${ASIF}:20`, actor: ASIF, t: Date.now() - 3_600_000 },
      { value: { kind: 'person', actor: BASE }, ref: `${MEHER}:20`, actor: MEHER, t: Date.now() - 7_200_000 },
    ],
    kept: [],
  },
  rules: [
    ...sampleView.rules,
    {
      id: 'rule00000003',
      field: { key: 'rule/rule00000003', state: 'one', shown: { value: { kind: 'distance', max: 5 }, ref: `${TANMOY}:30`, actor: TANMOY, t: 0 }, lanes: [], kept: [] },
      result: { state: 'unknown' },
    },
    {
      id: 'rule00000004',
      field: {
        key: 'rule/rule00000004',
        state: 'clash',
        shown: null,
        lanes: [
          { value: { kind: 'limit', name: 'Tarpaulins stay within 500', table: 'blkkits00001', max: 500 }, ref: `${RINA}:31`, actor: RINA, t: 0 },
          { value: { kind: 'limit', name: 'Tarpaulins stay within 450', table: 'blkkits00001', max: 450 }, ref: `${MEHER}:31`, actor: MEHER, t: 0 },
        ],
        kept: [],
      },
      result: { state: 'ok' },
    },
  ],
};

type Screen =
  | 'caught-beam'
  | 'caught-file'
  | 'caught-even-after'
  | 'caught-behind'
  | 'caught-even'
  | 'caught-long'
  | 'side-phone'
  | 'side-laptop'
  | 'side-big'
  | 'side-empty'
  | 'side-odd'
  | 'truck-small'
  | 'truck-large';

const SCREENS: { id: Screen; label: string }[] = [
  { id: 'caught-beam', label: 'Caught (beam)' },
  { id: 'caught-file', label: 'Caught (file)' },
  { id: 'caught-even-after', label: 'Caught, they have all' },
  { id: 'caught-behind', label: 'Nothing new, behind' },
  { id: 'caught-even', label: 'Already caught up' },
  { id: 'caught-long', label: 'Caught, long name' },
  { id: 'side-phone', label: 'Panel (phone)' },
  { id: 'side-laptop', label: 'Side panel (laptop)' },
  { id: 'side-big', label: 'Side panel (big screen)' },
  { id: 'side-empty', label: 'Panel, empty doc' },
  { id: 'side-odd', label: 'Panel, odd cases' },
  { id: 'truck-small', label: 'Truck back (small)' },
  { id: 'truck-large', label: 'Truck back (large)' },
];

export function Playground() {
  const [screen, setScreen] = useState<Screen>('caught-beam');
  const [normalSync, setNormalSync] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const [cursor, setCursor] = useState(true);
  // A new key each time the screen changes, so the lorry drives again and panels start fresh.
  const [runs, setRuns] = useState(0);

  const changes = useMemo(() => playChanges(Date.now()), []);
  const say = (line: string) => setLog((l) => [line, ...l].slice(0, 4));
  const commit = (ops: Op[]) => say(`commit: ${ops.map((o) => (o.o === 'set' ? o.k : o.list)).join(', ')}`);

  const view = screen === 'side-empty' ? emptyView : screen === 'side-odd' || screen === 'caught-long' ? oddView : playView;
  const engine = useMemo(
    () =>
      screen === 'side-empty'
        ? playEngine({ view, changes: changes.filter((c) => c.actor === BASE && c.kind === 'edit'), holders: [BASE] })
        : playEngine({ view, changes, onCommit: commit }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [screen, changes],
  );
  const base = { engine, view, me: BASE, commit, bigScreen: false, layout: 'phone' as const };
  const cb = {
    onBeamBack: () => say('Beam back'),
    onReadNew: () => say("Read what's new"),
    onDone: () => say('Done'),
  };
  const side = {
    normalSync,
    setNormalSync,
    onJump: (b: string) => say(`jump to ${b}`),
    onOpen: (w: string) => say(`open ${w}`),
    cursorBlock: cursor ? 'blkferry0001' : null,
  };

  let stage: React.ReactNode;
  let frame = 'pn-play-phone';
  switch (screen) {
    case 'caught-beam':
      stage = <CaughtScreen {...base} {...cb} result={catchResult('beam', MEHER, changes)} fromName="Meher" />;
      break;
    case 'caught-file':
      stage = <CaughtScreen {...base} {...cb} result={catchResult('file', MEHER, changes)} fromName="Meher" />;
      break;
    case 'caught-even-after':
      stage = <CaughtScreen {...base} {...cb} result={catchResult('even-after', MEHER, changes)} fromName="Meher" />;
      break;
    case 'caught-behind':
      stage = <CaughtScreen {...base} {...cb} result={catchResult('behind', RINA, changes)} fromName="Rina" />;
      break;
    case 'caught-even':
      stage = <CaughtScreen {...base} {...cb} result={catchResult('even', RINA, changes)} fromName="Rina" />;
      break;
    case 'caught-long':
      stage = <CaughtScreen {...base} {...cb} result={catchResult('beam', MEHER, changes)} fromName="Meherunnisa Khatun Chowdhury" />;
      break;
    case 'side-phone':
    case 'side-empty':
    case 'side-odd':
      stage = <SidePanel {...base} {...side} />;
      break;
    case 'side-laptop':
      frame = 'pn-play-laptop';
      stage = <SidePanel {...base} {...side} layout="laptop" />;
      break;
    case 'side-big':
      frame = 'pn-play-big';
      stage = <SidePanel {...base} {...side} layout="laptop" bigScreen />;
      break;
    case 'truck-small':
      stage = (
        <div style={{ padding: 16 }}>
          <TruckBack view={view} engine={engine} size="small" />
        </div>
      );
      break;
    case 'truck-large':
      frame = '';
      stage = <TruckBack view={view} engine={engine} size="large" />;
      break;
  }

  return (
    <div className="pn pn-play">
      <nav className="pn-play-bar" aria-label="Playground screens">
        {SCREENS.map((s) => (
          <button
            key={s.id}
            type="button"
            className="pn-btn"
            aria-pressed={screen === s.id}
            onClick={() => {
              setScreen(s.id);
              setRuns((r) => r + 1);
            }}
          >
            {s.label}
          </button>
        ))}
        <button type="button" className="pn-btn" aria-pressed={cursor} onClick={() => setCursor((c) => !c)}>
          Cursor in a paragraph
        </button>
        {log.length > 0 && <span className="pn-tiny" style={{ whiteSpace: 'nowrap' }}>{log[0]}</span>}
      </nav>
      <div className="pn-play-stage">
        <div className={frame} key={`${screen}-${runs}`} style={frame ? undefined : { width: '100%' }}>
          {stage}
        </div>
      </div>
    </div>
  );
}

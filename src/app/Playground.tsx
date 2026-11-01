// ?play=app: the app shell's own screens with made-up data. Nothing here touches the phone's saved docs.
import { useState } from 'react';
import { ASIF, BASE, fakeEngine, RINA, sampleView, TANMOY } from '../contracts/fixtures';
import type { DeviceRecord } from '../contracts';
import type { HomeDocRecord } from '../store';
import { useLayout, useNow } from './layout';
import type { Message, OfflineStatus } from './state';
import { ColourScreen } from './screens/ColourScreen';
import { FirstCatch } from './screens/FirstCatch';
import { FirstOpen } from './screens/FirstOpen';
import { Home } from './screens/Home';
import { MessageScreen } from './screens/MessageScreen';
import { NoticeBar, UpdateBar } from './screens/Parts';
import { Sheets } from './screens/Sheets';
import type { Sheet } from './state';
import { clockAheadText } from './warnings';

const me: DeviceRecord = { actor: RINA, name: 'Rina', place: 'Gosaba camp', createdAt: 0 };
const now = Date.now();

const docs: HomeDocRecord[] = [
  {
    docId: 'd1',
    title: 'Camp log: Sundarbans cyclone relief',
    template: 'camp-log',
    updatedAt: now - 120_000,
    size: 14_000,
    summary: {
      words: ['mango', 'tiger', 'dipper'],
      digits: '42',
      writers: [
        { actor: BASE, name: 'Base camp', colour: 'plain' },
        { actor: RINA, name: 'Rina', colour: 'yellow' },
        { actor: TANMOY, name: 'Tanmoy', colour: 'orange' },
        { actor: ASIF, name: 'Asif', colour: 'pink' },
        { actor: 'e5', name: 'Meher', colour: 'red' },
      ],
      last: { kind: 'you', name: '', t: now - 120_000 },
      needsLook: '1 rule broken · 1 sentence with two versions',
    },
  },
  {
    docId: 'd2',
    title: 'Trip notes for the Wayanad camp register and the very long name that goes on and on',
    template: 'trip-notes',
    updatedAt: now - 3 * 3_600_000,
    size: 3_000,
    summary: {
      words: ['river', 'lamp', 'otter'],
      digits: '07',
      writers: [{ actor: 'e5', name: 'Meher Venkataraman-Bhattacharya', colour: null }],
      last: { kind: 'beam', name: 'Meher', t: now - 3 * 3_600_000 },
      needsLook: '',
    },
  },
  { docId: 'd3', title: 'Untitled doc', template: 'blank', updatedAt: now - 86_400_000 * 3, size: 900 },
];

const messages: Record<string, Message> = {
  stopped: {
    warn: true,
    title: 'Phir Milenge stopped.',
    body: 'Your doc is saved on this phone up to your last change. Reload to carry on.',
    actions: [{ label: 'Reload', style: 'main', run() {} }],
  },
  'other-tab': {
    warn: false,
    back: true,
    title: 'This doc is open in another tab.',
    body: 'One tab at a time can change it, so nothing gets mixed up.',
    actions: [
      { label: 'Use this tab', style: 'main', run() {} },
      { label: 'Close this tab', run() {} },
    ],
  },
  'different-doc': {
    warn: false,
    title: "That's a different doc.",
    body: 'You caught "Wayanad camp register". Nothing in your doc was changed. It\'s saved in Docs on this phone.',
    actions: [
      { label: 'Open it as a second doc', style: 'main', run() {} },
      { label: 'Back to my doc', run() {} },
    ],
  },
  newer: {
    warn: true,
    title: "Rina's phone has a newer Phir Milenge.",
    body: "Rina's doc uses things this version can't read yet. Nothing in your doc was changed. Rina can still catch from you. Once you have internet, open the link to get the newer version, then catch again.",
    actions: [
      { label: 'Beam to Rina', style: 'beam', run() {} },
      { label: 'Back to the doc', run() {} },
    ],
  },
  damaged: {
    warn: true,
    back: true,
    title: "This doc can't be opened.",
    body: 'The copy saved on this phone is damaged. Catch it again from anyone who has it, or open a backup file.',
    actions: [
      { label: 'Catch', style: 'main', run() {} },
      { label: 'Open a file', run() {} },
      { label: 'Save the damaged copy', run() {} },
    ],
  },
};

const SCREENS = [
  'first-open',
  'first-open: ready',
  'first-open: slow',
  'first-open: offline',
  'home',
  'home: empty',
  'home: storage low',
  'home: iPhone card',
  'sheet: add to home screen',
  'sheet: clock wrong',
  'colour',
  'colour: none free',
  'first-catch',
  ...Object.keys(messages).map((m) => `message: ${m}`),
  'sheet: new doc',
  'sheet: your name',
  'sheet: remove',
  'sheet: saved file',
  'notice + update',
] as const;

export function Playground() {
  const [screen, setScreen] = useState<string>('first-open');
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const layout = useLayout();
  const clock = useNow();
  const offline: OfflineStatus = screen.endsWith('ready') ? 'ready' : screen.endsWith('slow') ? 'slow' : screen.endsWith('offline') ? 'not-ready-offline' : 'getting-ready';
  const engine = fakeEngine();
  const fullView = {
    ...sampleView,
    writers: { ...sampleView.writers, e5: { actor: 'e5', name: 'Meher', colour: 'red' as const } },
  };

  const pick = (name: string) => {
    setScreen(name);
    setSheet(
      name === 'sheet: new doc'
        ? { kind: 'new-doc' }
        : name === 'sheet: your name'
          ? { kind: 'me' }
          : name === 'sheet: remove'
            ? { kind: 'remove', docId: 'd1', title: docs[0]!.title, onlyHere: 2 }
            : name === 'sheet: saved file'
              ? { kind: 'saved-file', name: 'Camp log - Sundarbans cyclone relief - Rina - Mon 4.30 pm.phir', size: 14_300, bytes: new Uint8Array(14_300) }
              : name === 'sheet: add to home screen'
                ? { kind: 'home-screen-how' }
                : name === 'sheet: clock wrong'
                  ? {
                      kind: 'message',
                      message: {
                        warn: true,
                        title: "This phone's clock may be wrong.",
                        body: clockAheadText(3),
                        actions: [{ label: 'OK', style: 'main', run() {} }],
                      },
                    }
                  : null,
    );
  };

  let body: React.ReactNode;
  if (screen.startsWith('first-open')) body = <FirstOpen offline={offline} onGo={() => {}} />;
  else if (screen.startsWith('home') || screen.startsWith('sheet') || screen.startsWith('notice')) {
    body = (
      <Home
        layout={layout}
        me={me}
        docs={screen === 'home: empty' ? [] : docs}
        now={clock}
        offline="ready"
        notice={screen.startsWith('notice') ? { id: 1, text: 'Removed from this phone.', action: { label: 'Undo', run() {} } } : null}
        storageDays={screen === 'home: storage low' ? 2 : null}
        homeCard={screen === 'home: iPhone card'}
        onOpen={() => {}}
        onNew={() => {}}
        onMenu={() => {}}
        onMe={() => {}}
        onCatch={() => {}}
        onOpenFile={() => {}}
        onSaveBackup={() => {}}
        onStorageNotNow={() => {}}
        onHomeCard={() => {}}
      />
    );
  } else if (screen === 'colour') body = <ColourScreen view={sampleView} me={RINA} onDone={() => {}} />;
  else if (screen === 'colour: none free') body = <ColourScreen view={fullView} me="zz" onDone={() => {}} />;
  else if (screen === 'first-catch')
    body = <FirstCatch view={sampleView} engine={engine} fromName="Base camp" via="beam" writers={4} colourFree onPickColour={() => {}} onOpen={() => {}} />;
  else if (screen.startsWith('message: ')) body = <MessageScreen message={messages[screen.slice(9)]!} onBack={() => {}} />;

  return (
    <>
      <div className="play-picker">
        <select aria-label="Screen" value={screen} onChange={(e) => pick(e.target.value)}>
          {SCREENS.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
      </div>
      {body}
      {screen === 'notice + update' && <UpdateBar onReload={() => {}} onLater={() => {}} />}
      {screen === 'notice + update' && <NoticeBar notice={null} />}
      <Sheets
        sheet={sheet}
        me={me}
        titleOf={() => docs[0]!.title}
        onClose={() => setSheet(null)}
        onNew={() => setSheet(null)}
        onSaveMe={() => setSheet(null)}
        onSaveFileOf={() => {}}
        onAskRemove={() => {}}
        onRemove={() => setSheet(null)}
        onShare={() => {}}
      />
    </>
  );
}

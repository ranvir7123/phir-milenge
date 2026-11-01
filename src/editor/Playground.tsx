// Track C's piece on its own. Open with ?play=editor
// "Made-up data" uses src/contracts/fixtures.ts (nothing you type is kept). "Real engine" opens Rina's copy of
// the demo camp log on the real engine, so typing, tables and "Keep this one" all go through it,
// and "Catch Asif's file" brings in his edits so lanes and the glow happen for real.

import { useMemo, useState } from 'react';
import type { DocEngine, DocView, EditorProps, Glow, Op } from '../contracts';
import { fakeEngine, RINA, sampleView } from '../contracts/fixtures';
import { engine as model } from '../model';
import { buildScenario } from '../demo/scenario';
import { Editor } from './Editor';

type Width = 320 | 390 | 'laptop';

function useRealDoc() {
  return useMemo(() => {
    const scenario = buildScenario(model);
    const me = scenario.docs.rina.writer.actor;
    const eng = model.openDoc(scenario.docId, me, scenario.docs.rina.changes);
    return { scenario, me, eng };
  }, []);
}

export function Playground() {
  const [data, setData] = useState<'fake' | 'real'>('fake');
  const [width, setWidth] = useState<Width>(390);
  const [big, setBig] = useState(false);
  const [normalSync, setNormalSync] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const say = (line: string) => setLog((l) => [line, ...l].slice(0, 6));

  const real = useRealDoc();
  const fake = useMemo(() => fakeEngine(sampleView), []);
  const [, setTick] = useState(0);
  const [glow, setGlow] = useState<Glow | null>(null);
  const [focusBlock, setFocusBlock] = useState<string | null>(null);

  const eng: DocEngine = data === 'real' ? real.eng : fake;
  const me = data === 'real' ? real.me : RINA;
  const view: DocView =
    data === 'real'
      ? real.eng.view(normalSync ? { mode: 'normal-sync', arrival: new Map(real.eng.changes().map((c, i) => [c.id, i])) } : undefined)
      : sampleView;

  const commit = (ops: Op[]) => {
    if (ops.length === 0) return;
    if (data === 'real') {
      real.eng.commit(ops, { place: 'Gosaba camp' });
      setTick((t) => t + 1);
    }
    say(`${ops.length} op${ops.length === 1 ? '' : 's'}: ${ops.map((o) => `${o.o} ${"k" in o ? o.k : o.list}`).join(', ')}`.slice(0, 140));
  };

  const catchAsif = () => {
    const result = real.eng.receive([...real.scenario.docs.asif.changes], { actor: real.scenario.docs.asif.writer.actor, via: 'beam' });
    setTick((t) => t + 1);
    setGlow({ changes: result.newEdits, typeIn: true });
    say(`Caught Asif: ${result.added.length} new changes, ${result.newEdits.length} with new words`);
  };

  const props: EditorProps = {
    engine: eng,
    view,
    me,
    commit,
    bigScreen: big,
    layout: width === 'laptop' ? 'laptop' : 'phone',
    mode: normalSync ? 'normal-sync' : 'edit',
    glow,
    onGlowDone: () => {
      setGlow(null);
      say('Glow done');
    },
    undo: () => {
      if (data === 'real' && real.eng.undo({ place: 'Gosaba camp' })) setTick((t) => t + 1);
    },
    redo: () => {
      if (data === 'real' && real.eng.redo({ place: 'Gosaba camp' })) setTick((t) => t + 1);
    },
    onOpen: (what) => say(`Asked to open: ${what}`),
    focusBlock,
  };

  const chip = (on: boolean) => ({
    minHeight: 36,
    padding: '0 12px',
    border: '1px solid var(--hairline)',
    borderRadius: 6,
    background: on ? 'var(--text)' : 'transparent',
    color: on ? 'var(--page)' : 'var(--text)',
    fontSize: 14,
    cursor: 'pointer',
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--page)' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: 8, borderBottom: '1px solid var(--hairline)', fontSize: 14 }}>
        <button type="button" style={chip(data === 'fake')} onClick={() => setData('fake')}>
          Made-up data
        </button>
        <button type="button" style={chip(data === 'real')} onClick={() => setData('real')}>
          Real engine
        </button>
        <span style={{ width: 8 }} />
        {([320, 390, 'laptop'] as Width[]).map((w) => (
          <button key={w} type="button" style={chip(width === w)} onClick={() => setWidth(w)}>
            {w === 'laptop' ? 'Laptop' : `${w}px`}
          </button>
        ))}
        <span style={{ width: 8 }} />
        <button type="button" style={chip(big)} onClick={() => setBig(!big)}>
          Big screen
        </button>
        <button type="button" style={chip(normalSync)} onClick={() => setNormalSync(!normalSync)}>
          Normal sync
        </button>
        {data === 'real' ? (
          <button type="button" style={chip(false)} onClick={catchAsif}>
            Catch Asif's file
          </button>
        ) : (
          <button type="button" style={chip(false)} onClick={() => setGlow({ changes: sampleView.blocks.flatMap((b) => b.sentences.map((s) => s.field.shown?.ref ?? '')).filter(Boolean).slice(0, 3), typeIn: true })}>
            Glow
          </button>
        )}
        <button type="button" style={chip(false)} onClick={() => setFocusBlock(view.blocks[3]?.id ?? null)}>
          Jump to block 4
        </button>
        <span style={{ flexBasis: '100%', color: 'var(--quiet)', fontSize: 13, minHeight: 18 }}>{log[0] ?? ' '}</span>
      </div>
      <div style={{ flex: 1, minHeight: 0, display: 'flex', justifyContent: 'center', padding: width === 'laptop' ? 0 : 12 }}>
        <div
          style={{
            width: width === 'laptop' ? '100%' : width,
            height: '100%',
            border: width === 'laptop' ? 0 : '1px solid var(--hairline)',
            overflow: 'hidden',
          }}
        >
          <Editor key={`${data}-${width}`} {...props} />
        </div>
      </div>
    </div>
  );
}

// The "3 of 4" panel on a phone, the side panel on the laptop. Also called the Rules panel.
// Order: needs a look, this paragraph, rules, settle rule, normal sync, who's caught up, truck back, your colour.
// Spec: 2-user-experience.md, "Phone toolbar and laptop toolbar" and "When two versions clash".

import { useMemo, useState } from 'react';
import type { ActorId, DocView, Field, SettleRule, SidePanelProps } from '../contracts';
import { blockOfKey, clashParts, fieldIndex, settleName } from './fields';
import { agoForm, colourName, colourOf, cutName, nameOf, plural } from './format';
import { intents } from './engineLink';
import { caughtUp, writerRows } from './knowledge';
import { messageWithoutName, ruleDef, ruleName, sortedRules } from './rules';
import { AlertIcon, LeftIcon, PairIcon, RightIcon, ShieldIcon } from './icons';
import { TruckBack } from './TruckBack';
import { WhoHas } from './WhoHas';
import './panels.css';

type SettleKind = SettleRule['kind'];

const SETTLE_CHOICES: { kind: SettleKind; title: string; sub: string }[] = [
  { kind: 'newest', title: 'Keep the newest one', sub: `Written latest, by the writer's own phone. Not "arrived last".` },
  { kind: 'person', title: `One person's version wins`, sub: 'For example Base camp first, then the person who started the doc.' },
  { kind: 'smaller', title: 'For numbers, keep the smaller one', sub: `Safer for stock left: never count what you don't have.` },
  { kind: 'ask', title: 'Always ask', sub: 'The way every doc starts: both stay until someone picks.' },
];

/** A clash counts as "numbers" when every version is a number. */
function isNumberClash(f: Field<unknown>): boolean {
  return f.lanes.length > 0 && f.lanes.every((l) => l.value !== null && (typeof l.value === 'number' || (typeof l.value === 'string' && l.value.trim() !== '' && !Number.isNaN(Number(l.value.trim().replace(/,/g, ''))))));
}

/** The writer a "one person wins" rule starts on: Base camp, else whoever started the doc. */
function defaultPerson(view: DocView, firstActor: ActorId | null, me: ActorId): ActorId {
  const base = Object.values(view.writers).find((w) => /^base camp$/i.test(w.name.trim()));
  return base?.actor ?? firstActor ?? me;
}

function settleBanner(rule: SettleRule, count: number, numbers: number, nameFor: (a: ActorId) => string): string {
  if (rule.kind === 'ask') return 'Back to "Always ask". New clashes stay as two versions until someone picks.';
  if (rule.kind === 'smaller' && numbers === 0) {
    return `None of the ${plural(count, 'clash', 'clashes')} ${count === 1 ? 'is a number, so it still needs' : 'are numbers, so they still need'} a pick. New number clashes will settle by keeping the smaller one.`;
  }
  if (rule.kind === 'smaller' && numbers < count) {
    const left = count - numbers;
    return `${plural(numbers, 'clash', 'clashes')} settled. ${left} ${left === 1 ? "isn't a number, so it still needs" : "aren't numbers, so they still need"} a pick.`;
  }
  return `${plural(count, 'clash', 'clashes')} settled by "${settleName(rule, nameFor)}". New clashes will settle the same way. Change this in Rules.`;
}

export function SidePanel(props: SidePanelProps) {
  const { engine, view, me, commit, bigScreen, normalSync, setNormalSync, onJump, onOpen, cursorBlock } = props;
  const [page, setPage] = useState<'main' | 'settle'>('main');
  const [banner, setBanner] = useState<string | null>(null);
  const nameFor = (a: ActorId) => cutName(nameOf(view, a));

  const changes = engine.changes();
  const fields = useMemo(() => fieldIndex(view), [view]);
  const clashes = view.needsLook.clashes;
  const broken = view.rules.filter((r) => r.result.state === 'broken');
  const rules = sortedRules(view);
  const rows = useMemo(() => writerRows(engine, view), [engine, view, changes]);
  const counts = useMemo(() => caughtUp(engine, view), [engine, view, changes]);
  const currentRule: SettleRule = view.settle.state === 'clash' ? { kind: 'ask' } : (view.settle.shown?.value ?? { kind: 'ask' });
  const firstActor = changes.find((c) => c.deps.length === 0)?.actor ?? null;
  const myColour = view.writers[me]?.colour ?? null;

  const keep = (f: Field<unknown>, ref: string) => commit(intents().pick(f, ref));

  if (page === 'settle') {
    return (
      <SettlePage
        {...props}
        current={currentRule}
        defaultActor={defaultPerson(view, firstActor, me)}
        onBack={() => setPage('main')}
        onSettle={(rule) => {
          const numbers = clashes.filter((k) => {
            const f = fields.get(k);
            return f ? isNumberClash(f.field) : false;
          }).length;
          commit(intents().setSettle(rule));
          setBanner(settleBanner(rule, clashes.length, numbers, nameFor));
          setPage('main');
        }}
      />
    );
  }

  const needsLook = broken.length > 0 || clashes.length > 0;
  const firstClashBlock = clashes.map(blockOfKey).find((b): b is string => !!b) ?? null;

  return (
    <aside className={`pn pn-side${bigScreen ? ' pn-big' : ''}`} aria-label="Rules and who's caught up">
      {banner && (
        <div className="pn-banner" role="status">
          {banner}
        </div>
      )}

      {needsLook && (
        <section className="pn-section" aria-labelledby="pn-needs">
          <h3 id="pn-needs">Needs a look</h3>
          {broken.map((r) => {
            const name = ruleName(ruleDef(r), view);
            const msg = r.result.state === 'broken' ? r.result : null;
            const block = msg?.where[0]?.block ?? null;
            return (
              <button key={r.id} type="button" className="pn-flag pn-flag-bad" onClick={() => block && onJump(block)} disabled={!block}>
                <AlertIcon />
                <div>
                  <b>Rule broken: {name.toLowerCase()}.</b> {msg ? messageWithoutName(msg.message, name) : ''}
                </div>
              </button>
            );
          })}
          {clashes.length > 0 && (
            <>
              <button type="button" className="pn-flag" onClick={() => firstClashBlock && onJump(firstClashBlock)}>
                <PairIcon />
                <div>
                  <b>Two versions:</b> {joinParts(clashParts(clashes))}
                </div>
              </button>
              <button type="button" className="pn-row" onClick={() => setPage('settle')}>
                <span className="pn-row-main">
                  <span style={{ fontWeight: 600 }}>{plural(clashes.length, 'clash', 'clashes')}</span>
                  <span className="pn-who-sub">{plural(clashes.length, 'sentence or cell', 'sentences or cells')} with two versions</span>
                </span>
                <RightIcon />
              </button>
            </>
          )}
        </section>
      )}

      {cursorBlock && <WhoHas engine={engine} view={view} block={cursorBlock} bigScreen={bigScreen} />}

      <section className="pn-section" aria-labelledby="pn-rules">
        <h3 id="pn-rules">Rules</h3>
        {rules.length === 0 && <p className="pn-quiet">No rules yet.</p>}
        {rules.map((r) => {
          if (r.field.state === 'clash') {
            return (
              <div key={r.id} className="pn-rule">
                <PairIcon />
                <div className="pn-rule-body">
                  <span className="pn-rule-name">Two versions of this rule</span>
                  {r.field.lanes.map((l) => (
                    <div key={l.ref} className={`pn-who pn-lane${colourOf(view, l.actor) ? '' : ' pn-plain'}`} style={{ '--c': colourOf(view, l.actor) ?? undefined, margin: '8px 0' } as React.CSSProperties}>
                      <span className="pn-who-sub">{nameFor(l.actor)}</span>
                      <span>{l.value ? ruleName(l.value, view) : 'Deleted the rule'}</span>
                      <button type="button" className="pn-btn" onClick={() => keep(r.field as Field<unknown>, l.ref)}>
                        Keep this one
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            );
          }
          const name = ruleName(ruleDef(r), view);
          if (r.result.state === 'broken') {
            return (
              <div key={r.id} className="pn-rule pn-rule-bad">
                <AlertIcon />
                <div className="pn-rule-body">
                  <span className="pn-rule-name">{name}</span>
                  <span className="pn-rule-sub">{messageWithoutName(r.result.message, name)}</span>
                </div>
              </div>
            );
          }
          if (r.result.state === 'unknown') {
            return (
              <div key={r.id} className="pn-rule">
                <span className="pn-warn">
                  <AlertIcon />
                </span>
                <div className="pn-rule-body">
                  <span className="pn-rule-name">Can't check this rule.</span>
                  <span className="pn-rule-sub">It was made in a newer Phir Milenge. It's kept in the doc and travels on, but this phone can't check it.</span>
                </div>
              </div>
            );
          }
          return (
            <div key={r.id} className="pn-rule">
              <span className="pn-ok">
                <ShieldIcon />
              </span>
              <div className="pn-rule-body">
                <span className="pn-rule-name">{name}</span>
                <span className="pn-rule-sub">Kept right now.</span>
              </div>
            </div>
          );
        })}
        <div>
          <button type="button" className="pn-btn" onClick={() => onOpen('add-rule')}>
            Add a rule
          </button>
        </div>
      </section>

      <section className="pn-section" aria-labelledby="pn-settle">
        <h3 id="pn-settle">Settle rule</h3>
        {view.settle.state === 'clash' ? (
          <div className="pn-rule">
            <PairIcon />
            <div className="pn-rule-body">
              <span className="pn-rule-name">Two settle rules. Until someone picks, this doc is back to "Always ask".</span>
              {view.settle.lanes.map((l) => (
                <div key={l.ref} className={`pn-who pn-lane${colourOf(view, l.actor) ? '' : ' pn-plain'}`} style={{ '--c': colourOf(view, l.actor) ?? undefined, margin: '8px 0' } as React.CSSProperties}>
                  <span className="pn-who-sub">{nameFor(l.actor)}</span>
                  <span>{settleName(l.value, nameFor)}</span>
                  <button type="button" className="pn-btn" onClick={() => keep(view.settle as Field<unknown>, l.ref)}>
                    Keep this one
                  </button>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <button type="button" className="pn-row" onClick={() => setPage('settle')}>
            <span className="pn-row-main">
              <span>{settleName(currentRule, nameFor)}</span>
              <span className="pn-who-sub">Change how this doc settles clashes</span>
            </span>
            <RightIcon />
          </button>
        )}
      </section>

      <section className="pn-section" aria-labelledby="pn-normal">
        <div className="pn-switch-row">
          <h3 id="pn-normal" style={{ fontWeight: 600 }}>
            What a normal sync would keep
          </h3>
          <button type="button" role="switch" aria-checked={normalSync} aria-labelledby="pn-normal" className="pn-switch" onClick={() => setNormalSync(!normalSync)} />
        </div>
        {normalSync && <p className="pn-small">Showing what a normal sync would keep: whichever change arrived last. Your doc is unchanged.</p>}
        <div className="pn-normal">
          A normal sync would say: <b>Synced. No conflicts.</b>
        </div>
      </section>

      <section className="pn-section" aria-labelledby="pn-caught">
        <h3 id="pn-caught">Who's caught up</h3>
        <p className="pn-small pn-quiet">
          {counts.total <= 1
            ? 'Only you have this doc, as far as this phone knows.'
            : counts.have <= 1
              ? `No one else has everything you have yet, as far as this phone knows. ${counts.total - 1} others have the doc.`
              : `${counts.have} of ${counts.total} have everything you have, as far as this phone knows.`}
        </p>
        {rows.map((r) => {
          const c = colourOf(view, r.actor);
          const sub = r.latest ? `${agoForm(r.latest.t, Date.now())}, ${r.direct ? 'direct' : r.via ? `via ${nameFor(r.via)}` : 'came with the doc'}` : 'Not yet';
          return (
            <div key={r.actor} className={`pn-who${c ? '' : ' pn-plain'}`} style={c ? ({ '--c': c } as React.CSSProperties) : undefined}>
              <span className="pn-who-name">
                {nameFor(r.actor)}
                {counts.haveAll.has(r.actor) && <span className="pn-quiet"> · has everything</span>}
              </span>
              <span className="pn-who-sub">{sub}</span>
            </div>
          );
        })}
      </section>

      <section className="pn-section" aria-labelledby="pn-truck">
        <h3 id="pn-truck">Truck back</h3>
        <TruckBack view={view} engine={engine} size="small" />
      </section>

      <p className="pn-small pn-quiet">Your colour: {colourName(myColour)}</p>
    </aside>
  );
}

function joinParts(parts: string[]): string {
  if (parts.length <= 1) return parts.join('');
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

function SettlePage({
  view,
  bigScreen,
  current,
  defaultActor,
  onBack,
  onSettle,
}: SidePanelProps & { current: SettleRule; defaultActor: ActorId; onBack(): void; onSettle(rule: SettleRule): void }) {
  const [kind, setKind] = useState<SettleKind>(current.kind === 'ask' ? 'newest' : current.kind);
  const [person, setPerson] = useState<ActorId>(current.kind === 'person' ? current.actor : defaultActor);
  const n = view.needsLook.clashes.length;
  const writers = Object.values(view.writers);
  const title = n === 0 ? 'Settle rule' : `Settle ${plural(n, 'clash', 'clashes')}`;
  const button = n === 0 ? 'Use this rule' : n === 1 ? 'Settle it' : `Settle all ${n.toLocaleString('en-IN')}`;
  const rule: SettleRule = kind === 'person' ? { kind, actor: person } : { kind } as SettleRule;

  return (
    <aside className={`pn pn-side${bigScreen ? ' pn-big' : ''}`} aria-label={title}>
      <div>
        <button type="button" className="pn-back" style={{ marginLeft: -8 }} onClick={onBack}>
          <LeftIcon />
          Back
        </button>
      </div>
      <div className="pn-subpage">
        <h3>{title}</h3>
        <p>Pick how this doc settles clashes, now and later. Every phone that gets this rule settles them the same way.</p>
        <fieldset className="pn-choices">
          <legend className="pn-tiny" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>
            How to settle
          </legend>
          {SETTLE_CHOICES.map((c) => (
            <label key={c.kind} className="pn-choice">
              <input type="radio" name="pn-settle" checked={kind === c.kind} onChange={() => setKind(c.kind)} />
              <span style={{ minWidth: 0, flex: 1 }}>
                <span className="pn-choice-title">{c.title}</span>
                <span className="pn-choice-sub">{c.sub}</span>
                {c.kind === 'person' && kind === 'person' && writers.length > 0 && (
                  <select className="pn-select" style={{ marginTop: 8 }} value={person} onChange={(e) => setPerson(e.target.value)} aria-label="Whose version wins">
                    {writers.map((w) => (
                      <option key={w.actor} value={w.actor}>
                        {cutName(w.name || 'Someone')}
                      </option>
                    ))}
                  </select>
                )}
              </span>
            </label>
          ))}
        </fieldset>
        <button type="button" className="pn-btn pn-btn-main pn-btn-bar pn-btn-wide" onClick={() => onSettle(rule)}>
          {button}
        </button>
      </div>
    </aside>
  );
}

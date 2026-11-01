// The frame around an open doc: the title row, "Saved on this phone", "3 of 4", "⋯", the Catch and
// Beam bar, and where the side panel sits. The page and its toolbar are track C's Editor.
import { useEffect, useMemo, useState } from 'react';
import type { DeviceRecord, ItemId } from '../../contracts';
import { Icon, Warn } from '../../shared/icons';
import * as act from '../actions';
import { caughtUp, caughtUpLabel, onlyOnThisPhone, yourChanges } from '../caughtUp';
import { Editor, SidePanel } from '../pieces';
import type { Notice, Session } from '../state';
import { titleOf } from '../summary';
import { NoticeBar, Sheet } from './Parts';

export interface DocScreenProps {
  layout: 'phone' | 'laptop';
  session: Session;
  me: DeviceRecord;
  bigScreen: boolean;
  notice: Notice | null;
  onBigScreen(on: boolean): void;
}

type Local = null | 'menu' | 'panel' | 'saved';
type Request = { what: 'find' | 'outline' | 'word-count'; at: number } | null;

/** A text box or the page has the cursor, so a phone keyboard can be up. */
function typing(): boolean {
  return document.activeElement?.matches('input, textarea, [contenteditable="true"]') ?? false;
}

/**
 * True while the phone's keyboard is up: the Catch and Beam bar hides. The same rule as the editor's
 * toolbar, so the toolbar lands right on top of the keyboard: something has the cursor, and the screen is
 * over 150px shorter than the tallest it has been at this width (Android shrinks the whole page for the
 * keyboard, iPhone only the visible part; both show here).
 */
function useKeyboardOpen(): boolean {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    let tallest = vv.height;
    let wide = vv.width;
    const check = () => {
      if (vv.width !== wide) {
        // Turned sideways: start measuring again.
        wide = vv.width;
        tallest = vv.height;
      }
      tallest = Math.max(tallest, vv.height);
      setOpen(typing() && tallest - vv.height > 150);
    };
    vv.addEventListener('resize', check);
    document.addEventListener('focusin', check);
    document.addEventListener('focusout', check);
    return () => {
      vv.removeEventListener('resize', check);
      document.removeEventListener('focusin', check);
      document.removeEventListener('focusout', check);
    };
  }, []);
  return open;
}

export function DocScreen({ layout, session, me, bigScreen, notice, onBigScreen }: DocScreenProps) {
  const [local, setLocal] = useState<Local>(null);
  const [request, setRequest] = useState<Request>(null);
  const [focusBlock, setFocusBlock] = useState<ItemId | null>(null);
  const keyboard = useKeyboardOpen();
  const { view, engine } = session;
  const laptop = layout === 'laptop';
  const title = titleOf(view);
  const count = useMemo(() => caughtUp(engine.changes(), me.actor), [engine, view, me.actor]);
  const here = laptop ? 'laptop' : 'phone';

  const ask = (what: 'find' | 'outline' | 'word-count') => {
    setLocal(null);
    setRequest({ what, at: Date.now() });
  };
  const jump = (block: ItemId) => {
    if (!laptop) setLocal(null);
    setFocusBlock(block);
  };
  const openPanel = () => (laptop ? undefined : setLocal('panel'));

  const docProps = { engine, view, me: me.actor, commit: act.commit, bigScreen, layout };

  const onEditorOpen = (what: 'replay' | 'find' | 'outline' | 'add-rule' | 'needs-look' | 'beam' | 'catch' | 'menu') => {
    if (what === 'find' || what === 'outline') ask(what);
    else if (what === 'replay') act.openReplay();
    else if (what === 'beam') act.startBeam(bigScreen && laptop);
    else if (what === 'catch') act.startCatch();
    else if (what === 'menu') setLocal('menu');
    else if (what === 'add-rule') act.openAddRule();
    else openPanel();
  };

  const onPanelOpen = (what: 'replay' | 'self-test' | 'add-rule' | 'beam' | 'catch') => {
    setLocal(null);
    if (what === 'replay') act.openReplay();
    else if (what === 'self-test') act.openSelfTest();
    else if (what === 'add-rule') act.openAddRule();
    else if (what === 'beam') act.startBeam(bigScreen && laptop);
    else if (what === 'catch') act.startCatch();
  };

  const saved = (
    <button type="button" className={`saved-line${session.notSaved ? ' is-not-saved' : ''}`} onClick={() => setLocal('saved')}>
      {session.notSaved ? (
        <>
          <Warn size={14} />
          Not saved
        </>
      ) : (
        `Saved on this ${here}`
      )}
    </button>
  );

  const countButton = (
    <button type="button" className="count-btn" onClick={() => (laptop ? undefined : setLocal('panel'))} title="Who's caught up">
      {caughtUpLabel(count)}
    </button>
  );

  const menuItems = laptop ? (
    <>
      <MenuItem icon="save" label="Save a file" run={() => (setLocal(null), act.saveFile())} />
      <MenuItem icon="file" label="Open a file" run={() => (setLocal(null), act.openFilePicker())} />
      <button type="button" role="switch" aria-checked={bigScreen} className="menu-item" onClick={() => onBigScreen(!bigScreen)}>
        <Icon name="screen" />
        <span className="menu-grow">Big screen</span>
        <span className={`switch${bigScreen ? ' is-on' : ''}`} aria-hidden="true" />
      </button>
      <MenuItem icon="test" label="Run the 1,000-order test" run={() => (setLocal(null), act.openSelfTest())} />
    </>
  ) : (
    <>
      <MenuItem icon="find" label="Find in doc" run={() => ask('find')} />
      <MenuItem icon="outline" label="Outline" run={() => ask('outline')} />
      <MenuItem icon="count" label="Word count" run={() => ask('word-count')} />
      <MenuItem icon="save" label="Save a file" run={() => (setLocal(null), act.saveFile())} />
      <MenuItem icon="file" label="Open a file" run={() => (setLocal(null), act.openFilePicker())} />
      <MenuItem icon="docs" label="Docs on this phone" run={() => void act.goHome()} />
    </>
  );

  const panel = (
    <SidePanel
      {...docProps}
      normalSync={session.normalSync}
      setNormalSync={(on) => void act.setNormalSync(on)}
      onJump={jump}
      onOpen={onPanelOpen}
      cursorBlock={null}
    />
  );

  const onlyHere = local === 'saved' ? onlyOnThisPhone(engine.changes(), me.actor) : 0;

  return (
    <div className={`doc-screen doc-${layout}${bigScreen && laptop ? ' is-big' : ''}`}>
      <header className="doc-top">
        <button type="button" className="back-btn" onClick={() => void act.goHome()}>
          <Icon name="left" size={18} />
          Docs
        </button>
        <div className="doc-title-wrap">
          <h1 className="doc-title one-line" title={title}>
            {title}
          </h1>
          {saved}
        </div>
        {countButton}
        {laptop && (
          <>
            <button type="button" className="ui-btn" onClick={act.startCatch}>
              <Icon name="catch" />
              Catch
            </button>
            <button type="button" className="ui-btn ui-btn-beam" onClick={() => act.startBeam(bigScreen)}>
              <Icon name="beam" />
              {bigScreen ? 'Beam to everyone' : 'Beam'}
            </button>
          </>
        )}
        <div className="menu-anchor">
          <button type="button" className="icon-btn" aria-label="More" aria-expanded={local === 'menu'} onClick={() => setLocal(local === 'menu' ? null : 'menu')}>
            <Icon name="more" />
          </button>
          {laptop && local === 'menu' && (
            <>
              <div className="menu-scrim" onClick={() => setLocal(null)} />
              <div className="menu-pop" role="menu">
                {menuItems}
              </div>
            </>
          )}
        </div>
      </header>

      <div className="doc-main">
        <div className="doc-page">
          <Editor
            {...docProps}
            mode={session.normalSync ? 'normal-sync' : 'edit'}
            glow={session.glow}
            onGlowDone={act.glowDone}
            undo={act.undo}
            redo={act.redo}
            onOpen={onEditorOpen}
            focusBlock={focusBlock}
            request={request}
          />
        </div>
        {laptop && <aside className="side-col">{panel}</aside>}
      </div>

      <NoticeBar notice={notice} />
      {!laptop && !keyboard && (
        <nav className="bottom-bar">
          <button type="button" className="ui-btn ui-btn-tall" onClick={act.startCatch}>
            <Icon name="catch" />
            Catch
          </button>
          <button type="button" className="ui-btn ui-btn-beam ui-btn-tall" onClick={() => act.startBeam()}>
            <Icon name="beam" />
            Beam
          </button>
        </nav>
      )}

      {!laptop && local === 'menu' && (
        <Sheet label="More" onClose={() => setLocal(null)}>
          <div className="menu-list">{menuItems}</div>
        </Sheet>
      )}
      {!laptop && local === 'panel' && (
        <Sheet label="Who's caught up" onClose={() => setLocal(null)}>
          {panel}
        </Sheet>
      )}
      {local === 'saved' && (
        <Sheet label={session.notSaved ? 'Not saved' : `Saved on this ${here}`} onClose={() => setLocal(null)}>
          {session.notSaved ? (
            <p className="warn-line">
              <Warn size={20} />
              <span>
                <b>Your last changes aren't saved on this {here}.</b> This {here}'s storage refused them. Save a file now so you keep them,
                then free up space.
              </span>
            </p>
          ) : (
            <>
              <p>Everything you write stays on this {here} with no signal, even if the battery dies.</p>
              <p>
                {onlyHere > 0
                  ? `${yourChanges(onlyHere)} only on this ${here} so far. Beam them to someone so there's a second copy.`
                  : `Everything you've written is also on at least one other phone, as far as this ${here} knows.`}
              </p>
              <p className="quiet">Your browser can sometimes clear a site's storage. A second copy on another phone, or a file, keeps your words safe.</p>
            </>
          )}
          <div className="sheet-buttons">
            <button type="button" className="ui-btn ui-btn-tall" onClick={() => (setLocal(null), act.saveFile())}>
              <Icon name="save" />
              Save a file
            </button>
            <button type="button" className="ui-btn ui-btn-beam ui-btn-tall" onClick={() => (setLocal(null), act.startBeam())}>
              <Icon name="beam" />
              Beam
            </button>
          </div>
        </Sheet>
      )}
    </div>
  );
}

function MenuItem({ icon, label, run }: { icon: Parameters<typeof Icon>[0]['name']; label: string; run(): void }) {
  return (
    <button type="button" className="menu-item" role="menuitem" onClick={run}>
      <Icon name={icon} />
      {label}
    </button>
  );
}

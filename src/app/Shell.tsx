// The app people open: picks the screen from the app state and joins every track's piece.
import { useEffect } from 'react';
import * as act from './actions';
import { freeColours } from './actions';
import { useLayout, useNow } from './layout';
import { reloadForUpdate, startOffline } from './offline';
import { AddRule, BeamScreen, CatchScreen, CaughtScreen, ReplayView, SelfTestView } from './pieces';
import { useApp } from './state';
import { homeScreenCardSeen } from './warnings';
import { ColourScreen } from './screens/ColourScreen';
import { DocScreen } from './screens/DocScreen';
import { FirstCatch } from './screens/FirstCatch';
import { FirstOpen } from './screens/FirstOpen';
import { Home } from './screens/Home';
import { MessageScreen } from './screens/MessageScreen';
import { UpdateBar } from './screens/Parts';
import { Sheets } from './screens/Sheets';

let started = false;

export function Shell() {
  const s = useApp();
  const layout = useLayout();
  const now = useNow();

  useEffect(() => {
    if (started) return;
    started = true;
    startOffline();
    void act.start();
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle('big-screen', s.bigScreen && layout === 'laptop');
  }, [s.bigScreen, layout]);

  const close = () => useApp.setState({ sheet: null });
  const { screen, session, me } = s;
  const docProps = session && me ? { engine: session.engine, view: session.view, me: me.actor, commit: act.commit, bigScreen: s.bigScreen, layout } : null;

  let body: React.ReactNode = null;
  switch (screen.kind) {
    case 'starting':
      body = <div className="blank-screen" />;
      break;
    case 'first-open':
      body = <FirstOpen offline={s.offline} onGo={act.firstOpen} />;
      break;
    case 'home':
      body = me && (
        <Home
          layout={layout}
          me={me}
          docs={s.docs}
          now={now}
          offline={s.offline}
          notice={s.notice}
          storageDays={s.storageDays}
          homeCard={s.homeCard}
          onOpen={(id) => void act.openDoc(id)}
          onNew={(t) => void act.newDoc(t)}
          onMenu={(docId) => useApp.setState({ sheet: { kind: 'row-menu', docId } })}
          onMe={() => useApp.setState({ sheet: { kind: 'me' } })}
          onCatch={act.startCatch}
          onOpenFile={act.openFilePicker}
          onSaveBackup={() => void (s.docs[0] && act.saveFileOf(s.docs[0].docId))}
          onStorageNotNow={() => useApp.setState({ storageDays: null })}
          onHomeCard={(showHow) => {
            homeScreenCardSeen();
            useApp.setState({ homeCard: false, sheet: showHow ? { kind: 'home-screen-how' } : null });
          }}
        />
      );
      break;
    case 'opening':
      body = (
        <main className="opening-screen">
          <p className="quiet">Opening…</p>
        </main>
      );
      break;
    case 'doc':
      body = session && me && (
        <DocScreen
          layout={layout}
          session={session}
          me={me}
          bigScreen={s.bigScreen}
          notice={s.notice}
          onBigScreen={(on) => useApp.setState({ bigScreen: on })}
        />
      );
      break;
    case 'colour':
      body = session && me && <ColourScreen view={session.view} me={me.actor} onDone={act.chooseColour} />;
      break;
    case 'other-tab':
      body = (
        <MessageScreen
          message={{
            warn: false,
            back: true,
            title: 'This doc is open in another tab.',
            body: 'One tab at a time can change it, so nothing gets mixed up.',
            actions: [
              { label: 'Use this tab', style: 'main', run: () => void act.useThisTab(screen.docId) },
              { label: 'Close this tab', run: act.closeThisTab },
            ],
          }}
          onBack={() => void act.goHome()}
        />
      );
      break;
    case 'message':
      body = <MessageScreen message={screen.message} onBack={() => void act.goHome()} />;
      break;
    case 'catch':
      body = (
        <div className="piece-screen">
          <CatchScreen onCaught={(payload, hello) => void act.onCaught(payload, hello)} onHello={act.onHello} onCancel={act.stopBeamOrCatch} onUseFile={act.openFilePicker} />
        </div>
      );
      break;
    case 'beam':
      body = (
        <div className="piece-screen">
          <BeamScreen
          payload={screen.payload}
          hello={screen.hello}
          broadcast={screen.broadcast}
          estimateSeconds={screen.estimate}
          onStop={act.stopBeamOrCatch}
          onCatchTheirs={screen.broadcast ? undefined : act.startCatch}
          onSaveFile={act.saveFile}
          />
        </div>
      );
      break;
    case 'caught':
      body = docProps && (
        <div className="piece-screen">
          <CaughtScreen
            {...docProps}
            result={screen.result}
            fromName={screen.fromName}
            onBeamBack={() => act.startBeam()}
            onReadNew={() => act.readNew(layout === 'phone')}
            onDone={act.caughtDone}
          />
        </div>
      );
      break;
    case 'first-catch':
      body = session && me && (
        <FirstCatch
          view={session.view}
          engine={session.engine}
          fromName={screen.fromName}
          via={screen.via}
          writers={screen.writers}
          colourFree={freeColours(session.view, me.actor).length > 0}
          onPickColour={act.changeColour}
          onOpen={act.backToDoc}
        />
      );
      break;
    case 'replay':
      body = docProps && (
        <div className="piece-screen">
          <ReplayView {...docProps} onClose={act.backToDoc} />
        </div>
      );
      break;
    case 'self-test':
      body = docProps && (
        <div className="piece-screen">
          <SelfTestView {...docProps} onClose={act.backToDoc} />
        </div>
      );
      break;
    case 'add-rule':
      body = docProps && (
        <div className="piece-screen">
          <AddRule {...docProps} onClose={act.backToDoc} />
        </div>
      );
      break;
  }

  return (
    <>
      {body ?? <div className="blank-screen" />}
      {s.updateReady && <UpdateBar onReload={reloadForUpdate} onLater={() => useApp.setState({ updateReady: false })} />}
      <Sheets
        sheet={s.sheet}
        me={me}
        titleOf={(docId) => s.docs.find((d) => d.docId === docId)?.title ?? ''}
        onClose={close}
        onNew={(t) => void act.newDoc(t)}
        onSaveMe={(name, place) => void act.changeMe(name, place)}
        onSaveFileOf={(docId) => void act.saveFileOf(docId)}
        onAskRemove={(docId) => void act.askRemove(docId)}
        onRemove={(docId) => void act.removeDoc(docId)}
        onShare={(bytes, name) => void act.shareSaved(bytes, name)}
      />
    </>
  );
}

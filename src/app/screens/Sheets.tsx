// The sheets the app shell raises over any screen: new doc, your name, a doc's "⋯", remove, saved file, messages.
import { useState } from 'react';
import type { DeviceRecord, TemplateInfo } from '../../contracts';
import { Icon, Warn } from '../../shared/icons';
import { NAME_MAX } from '../../shared/names';
import { canShareFile, sizeText } from '../files';
import { yourChanges } from '../caughtUp';
import type { Sheet as SheetState } from '../state';
import { ActionButton, MessageText, Sheet } from './Parts';
import { TemplateCards } from './TemplateCards';

export interface SheetsProps {
  sheet: SheetState | null;
  me: DeviceRecord | null;
  titleOf(docId: string): string;
  onClose(): void;
  onNew(t: TemplateInfo): void;
  onSaveMe(name: string, place: string): void;
  onSaveFileOf(docId: string): void;
  onAskRemove(docId: string): void;
  onRemove(docId: string): void;
  onShare(bytes: Uint8Array, name: string): void;
}

function MeSheet({ me, onSave, onClose }: { me: DeviceRecord; onSave(name: string, place: string): void; onClose(): void }) {
  const [name, setName] = useState(me.name);
  const [place, setPlace] = useState(me.place ?? '');
  const renamed = name.trim() !== me.name && name.trim() !== '';
  return (
    <Sheet label="Your name" onClose={onClose}>
      <form
        className="sheet-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim()) onSave(name, place);
        }}
      >
        <div>
          <label className="field-label" htmlFor="me-name">
            Your name
          </label>
          <input id="me-name" className="field" value={name} maxLength={NAME_MAX} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <label className="field-label" htmlFor="me-place">
            Where are you? <span className="quiet">(you can change it any time)</span>
          </label>
          <input
            id="me-place"
            className="field"
            value={place}
            maxLength={NAME_MAX}
            placeholder="For example, Room 12 or Gosaba camp"
            onChange={(e) => setPlace(e.target.value)}
          />
        </div>
        {renamed && <p className="quiet sheet-note">Phones that haven't caught your docs since will still show '{me.name}' for now.</p>}
        <div className="sheet-buttons">
          <button type="submit" className="ui-btn ui-btn-main ui-btn-tall" disabled={!name.trim()}>
            Save
          </button>
          <button type="button" className="ui-btn ui-btn-tall" onClick={onClose}>
            Cancel
          </button>
        </div>
      </form>
    </Sheet>
  );
}

export function Sheets(p: SheetsProps) {
  const { sheet } = p;
  if (!sheet) return null;

  switch (sheet.kind) {
    case 'new-doc':
      return (
        <Sheet label="Start a new doc" onClose={p.onClose}>
          <h2>Start a new doc</h2>
          <TemplateCards onPick={p.onNew} layout="grid" />
          <button type="button" className="ui-btn ui-btn-tall" onClick={p.onClose}>
            Cancel
          </button>
        </Sheet>
      );

    case 'me':
      return p.me ? <MeSheet me={p.me} onSave={p.onSaveMe} onClose={p.onClose} /> : null;

    case 'row-menu':
      return (
        <Sheet label={p.titleOf(sheet.docId)} onClose={p.onClose}>
          <p className="quiet one-line sheet-caption">{p.titleOf(sheet.docId)}</p>
          <div className="menu-list">
            <button type="button" className="menu-item" onClick={() => p.onSaveFileOf(sheet.docId)}>
              <Icon name="save" />
              Save a file
            </button>
            <button type="button" className="menu-item" onClick={() => p.onAskRemove(sheet.docId)}>
              <Icon name="trash" />
              Remove from this phone
            </button>
          </div>
          <button type="button" className="ui-btn ui-btn-tall" onClick={p.onClose}>
            Cancel
          </button>
        </Sheet>
      );

    case 'remove':
      return (
        <Sheet label="Remove from this phone" onClose={p.onClose}>
          <p>
            <b>Remove '{sheet.title}' from this phone?</b> Phones that already have it keep it. To get it back, catch it from one of them.
          </p>
          {sheet.onlyHere > 0 && (
            <p className="warn-line">
              <Warn size={18} />
              <span>
                {yourChanges(sheet.onlyHere)} only on this phone. Removing the doc loses {sheet.onlyHere === 1 ? 'it' : 'them'}.
              </span>
            </p>
          )}
          <div className="sheet-buttons">
            {sheet.onlyHere > 0 ? (
              <>
                <button type="button" className="ui-btn ui-btn-main ui-btn-tall" onClick={() => p.onSaveFileOf(sheet.docId)}>
                  Save a file first
                </button>
                <button type="button" className="ui-btn ui-btn-tall" onClick={() => p.onRemove(sheet.docId)}>
                  Remove anyway
                </button>
              </>
            ) : (
              <button type="button" className="ui-btn ui-btn-main ui-btn-tall" onClick={() => p.onRemove(sheet.docId)}>
                Remove
              </button>
            )}
            <button type="button" className="ui-btn ui-btn-tall" onClick={p.onClose}>
              Cancel
            </button>
          </div>
        </Sheet>
      );

    case 'saved-file':
      return (
        <Sheet label="Saved" onClose={p.onClose}>
          <p className="saved-text">
            Saved "{sheet.name}", {sizeText(sheet.size)}. Send it by Quick Share, AirDrop, a cable or a pen drive. It can be opened in any
            order.
          </p>
          <div className="sheet-buttons">
            {canShareFile(sheet.bytes, sheet.name) && (
              <button type="button" className="ui-btn ui-btn-tall" onClick={() => p.onShare(sheet.bytes, sheet.name)}>
                <Icon name="share" />
                Share it
              </button>
            )}
            <button type="button" className="ui-btn ui-btn-main ui-btn-tall" onClick={p.onClose}>
              Done
            </button>
          </div>
        </Sheet>
      );

    case 'home-screen-how':
      return (
        <Sheet label="Add to your home screen" onClose={p.onClose}>
          <h2>Add to your home screen</h2>
          <ol className="how-steps">
            <li>
              <span className="how-pic" aria-hidden="true">
                <span className="how-key">
                  <Icon name="share" size={22} />
                </span>
              </span>
              <span>
                In Safari, tap <b>Share</b>. On newer iPhones, tap <b>⋯</b> first.
              </span>
            </li>
            <li>
              <span className="how-pic" aria-hidden="true">
                <span className="how-row">
                  Add to Home Screen
                  <span className="how-plus">
                    <Icon name="plus" size={14} />
                  </span>
                </span>
              </span>
              <span>
                Scroll down and tap <b>Add to Home Screen</b>.
              </span>
            </li>
            <li>
              <span className="how-pic" aria-hidden="true">
                <span className="how-key how-add">Add</span>
              </span>
              <span>
                Tap <b>Add</b>. From now on, open Phir Milenge from its icon.
              </span>
            </li>
          </ol>
          <button type="button" className="ui-btn ui-btn-main ui-btn-tall" onClick={p.onClose}>
            Done
          </button>
        </Sheet>
      );

    case 'message':
      return (
        <Sheet label={sheet.message.title} onClose={p.onClose}>
          <MessageText message={sheet.message} />
          <div className="sheet-buttons">
            {sheet.message.actions.map((a) => (
              <ActionButton key={a.label} action={a} />
            ))}
          </div>
        </Sheet>
      );
  }
}

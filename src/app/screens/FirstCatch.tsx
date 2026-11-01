// "You have the doc": the first catch of a doc (2-user-experience.md, "Getting in", part 6).
import type { DocEngine, DocView } from '../../contracts';
import { templateById } from '../../templates';
import { TruckBack } from '../pieces';
import { titleOf } from '../summary';

export interface FirstCatchProps {
  view: DocView;
  engine: DocEngine;
  fromName: string;
  via: 'beam' | 'file';
  writers: number;
  colourFree: boolean;
  onPickColour(): void;
  onOpen(): void;
}

export function FirstCatch(p: FirstCatchProps) {
  const fp = p.engine.fingerprint();
  const words = fp.words.map((w) => w[0]!.toUpperCase() + w.slice(1)).join(' ');
  const template = p.view.template && p.view.template !== 'blank' ? templateById(p.view.template) : undefined;
  const from =
    p.via === 'beam' ? (p.fromName ? `caught from ${p.fromName}` : 'caught') : p.fromName ? `opened from ${p.fromName}'s file` : 'opened from a file';
  const people = p.writers === 1 ? '1 person has' : `${p.writers} people have`;

  return (
    <main className="first-catch">
      <h1 className="display screen-title">You have the doc</h1>
      <p>
        '{titleOf(p.view)}', {from}. {people} written in it.{template ? ` Made from the ${template.name} template.` : ''}
      </p>
      <div className="first-catch-truck">
        <p className="first-catch-words">
          Your doc now: <b>{words}</b>
        </p>
        <TruckBack view={p.view} engine={p.engine} size="small" />
        <p className="quiet">Same words on another phone means the same doc.</p>
      </div>
      {p.colourFree ? (
        <>
          <p>Next: pick your colour.</p>
          <button type="button" className="ui-btn ui-btn-main ui-btn-tall ui-btn-wide" onClick={p.onPickColour}>
            Pick your colour
          </button>
        </>
      ) : (
        <>
          <p>
            All four colours are in use, so you'll write in <b>plain text</b>, next to your name.
          </p>
          <button type="button" className="ui-btn ui-btn-main ui-btn-tall ui-btn-wide" onClick={p.onOpen}>
            Open the doc
          </button>
        </>
      )}
    </main>
  );
}

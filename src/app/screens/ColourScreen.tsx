// "Your colour in this doc" (2-user-experience.md, "Getting in", part 7).
import { useState } from 'react';
import type { ActorId, DocView, WriterColour } from '../../contracts';
import { shortName } from '../../shared/names';
import { COLOURS, WriterMark } from '../../shared/writer';

export interface ColourScreenProps {
  view: DocView;
  me: ActorId;
  onDone(colour: WriterColour): void;
}

export function ColourScreen({ view, me, onDone }: ColourScreenProps) {
  const others = Object.values(view.writers).filter((w) => w.actor !== me && w.colour);
  const mine = view.writers[me]?.colour ?? null;
  const takenBy = (c: WriterColour) => others.filter((w) => w.colour === c).map((w) => shortName(w.name) || 'Someone');
  const free = COLOURS.filter((c) => c.colour !== 'plain' && (c.colour === mine || takenBy(c.colour).length === 0));
  const [picked, setPicked] = useState<WriterColour>(mine ?? free[0]?.colour ?? 'plain');

  return (
    <main className="colour-screen">
      <h1 className="display screen-title">Your colour in this doc</h1>
      <p>Your colour sits next to your name, so people can tell your words apart.</p>
      <div className="colour-rows" role="radiogroup" aria-label="Your colour">
        {COLOURS.map(({ colour, name }) => {
          const names = colour === 'plain' ? [] : takenBy(colour);
          const isMine = colour === mine;
          const taken = colour !== 'plain' && !isMine && names.length > 0;
          const who = colour === 'plain' ? (isMine ? 'You' : 'Anyone') : isMine ? ['You', ...names].join(', ') : names.length ? names.join(', ') : 'Free';
          return (
            <button
              key={colour}
              type="button"
              role="radio"
              aria-checked={picked === colour}
              aria-disabled={taken}
              className={`colour-row${picked === colour ? ' is-picked' : ''}${taken ? ' is-taken' : ''}`}
              onClick={() => !taken && setPicked(colour)}
            >
              <WriterMark colour={colour} height={24} />
              <span className="colour-name">{name}</span>
              <span className="colour-who one-line">{who}</span>
              <span className="colour-dot" aria-hidden="true" />
            </button>
          );
        })}
      </div>
      <button type="button" className="ui-btn ui-btn-main ui-btn-tall ui-btn-wide" onClick={() => onDone(picked)}>
        Done
      </button>
    </main>
  );
}

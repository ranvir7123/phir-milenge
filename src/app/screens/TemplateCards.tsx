// "Start a new doc": one card per template, with a small drawing of its first page.
import type { TemplateInfo } from '../../contracts';
import { templates } from '../../templates';

/** A page in miniature: a title bar, lines of text, and a small table where the template has one. */
function PagePreview({ id }: { id: string }) {
  const lines = id === 'blank' ? 0 : 3;
  const table = id === 'camp-log' || id === 'trip-notes';
  return (
    <span className="tpl-page" aria-hidden="true">
      <span className="tpl-line tpl-line-title" />
      {Array.from({ length: lines }, (_, i) => (
        <span key={i} className="tpl-line" style={{ width: `${[78, 62, 70][i]}%` }} />
      ))}
      {table && (
        <span className="tpl-table">
          {Array.from({ length: 9 }, (_, i) => (
            <span key={i} />
          ))}
        </span>
      )}
    </span>
  );
}

export function TemplateCards({ onPick, list = templates, layout }: { onPick(t: TemplateInfo): void; list?: TemplateInfo[]; layout: 'row' | 'grid' }) {
  return (
    <ul className={`tpl-cards tpl-${layout}`}>
      {list.map((t) => (
        <li key={t.id}>
          <button type="button" className="tpl-card" onClick={() => onPick(t)}>
            <PagePreview id={t.id} />
            <span className="tpl-name">{t.name}</span>
            <span className="tpl-desc">{t.description}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

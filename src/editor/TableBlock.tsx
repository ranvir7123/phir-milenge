// A table: header, rows, cells with two values, rows deleted on one phone and changed on another,
// and the fill-in sheet for adding or changing a row. A cell is always kept whole.

import { useMemo, useState, type CSSProperties } from 'react';
import type { ActorId, BlockView, DocView, Field, ItemId, Lane, Op, RowView } from '../contracts';
import { engine as model } from '../model';
import type { GlowState } from './glow';
import { Icon } from './icons';
import { barStyle, Lanes, WriterMark } from './Lanes';
import { Hl } from './Panels';
import { ruleWarning } from './rules';
import { Sheet } from './Sheet';
import { colourVar, cutName, NORMAL_SYNC_BLOCKED, writerColour, writerName } from './words';

type Keep = <T>(field: Field<T>, lane: Lane<T>) => void;

interface TableProps {
  view: DocView;
  block: BlockView;
  me: ActorId;
  layout: 'phone' | 'laptop';
  readOnly: boolean;
  now: number;
  act(make: () => Op[]): void;
  say(text: string, action?: { label: string; run(): void }): void;
  onKeep: Keep;
  undo(): void;
  glow: GlowState | null;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function cellText(field: Field<string> | undefined): string {
  if (!field) return '';
  if (field.state === 'clash') return field.lanes.map((l) => l.value ?? '').join(' / ');
  return field.shown?.value ?? '';
}

function rowSummary(block: BlockView, row: RowView): string {
  return (block.table?.columns ?? [])
    .map((c) => cellText(row.cells[c.id]))
    .filter(Boolean)
    .join(' · ');
}

function shownRow(row: RowView): boolean {
  if (row.alive.state === 'clash') return true;
  return row.alive.shown?.value === true;
}

export function TableBlock(props: TableProps) {
  const { view, block, layout, readOnly } = props;
  const table = block.table!;
  const [sheet, setSheet] = useState<{ row: ItemId | null } | null>(null);
  const brokenRows = useMemo(() => {
    const set = new Set<ItemId>();
    for (const r of view.rules)
      if (r.result.state === 'broken') for (const w of r.result.where) if (w.block === block.id && w.row) set.add(w.row);
    return set;
  }, [view.rules, block.id]);
  const rows = table.rows.filter(shownRow);
  const rowClashes = table.rows.filter((r) => r.alive.state === 'clash');
  const name = table.name.state === 'clash' ? (table.name.lanes.at(-1)?.value ?? '') : (table.name.shown?.value ?? '');
  const fresh = props.glow?.refs;

  const open = (row: ItemId | null) => (readOnly ? props.say(NORMAL_SYNC_BLOCKED) : setSheet({ row }));

  return (
    <div className="tb" onMouseDown={(e) => e.stopPropagation()}>
      <p className="tb-name">
        <Icon name="table" />
        <span>
          <Hl text={name} />
        </span>
      </p>
      {table.name.state === 'clash' && (
        <Lanes
          view={view}
          field={table.name}
          what="sentence"
          show={(v) => v}
          now={props.now}
          onKeep={(lane) => props.onKeep(table.name, lane)}
        />
      )}
      <div className="tb-scroll" tabIndex={0} role="region" aria-label={`Table ${name}`}>
        <table className="tb-table">
          <thead>
            <tr>
              {table.columns.map((c) => (
                <th key={c.id} scope="col" className={c.def.shown?.value?.kind === 'number' ? 'tb-num' : undefined}>
                  {c.def.shown?.value?.name ?? c.def.lanes.at(-1)?.value?.name ?? ''}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td className="tb-empty" colSpan={Math.max(1, table.columns.length)}>
                  No rows yet.
                </td>
              </tr>
            )}
            {rows.map((row) => (
              <tr
                key={row.id}
                className={`${brokenRows.has(row.id) ? 'is-broken' : ''}${row.alive.state === 'clash' ? ' is-clash' : ''}`}
                onClick={() => open(row.id)}
              >
                {table.columns.map((c, i) => {
                  const cell = row.cells[c.id];
                  const isNew = cell?.shown && fresh?.has(cell.shown.ref);
                  const style = isNew && cell?.shown ? ({ ['--c' as string]: colourVar(writerColour(view, cell.shown.actor)) ?? 'var(--raised)' } as CSSProperties) : undefined;
                  return (
                    <td key={c.id} className={c.def.shown?.value?.kind === 'number' ? 'tb-num' : undefined}>
                      {i === 0 && brokenRows.has(row.id) && (
                        <span className="tb-flag" aria-label="Breaks a rule">
                          <Icon name="alert" />
                        </span>
                      )}
                      {cell?.state === 'clash' ? (
                        <span className="tb-two">
                          {cell.lanes.map((l) => (
                            <span key={l.ref} className="tb-two-v" style={barStyle(view, l.actor)}>
                              <WriterMark view={view} actor={l.actor} />
                              <span className="tb-two-who">{cutName(writerName(view, l.actor))}</span>
                              <span className={fresh?.has(l.ref) ? 'pm-new' : undefined} style={fresh?.has(l.ref) ? barStyle(view, l.actor) : undefined}>
                                <Hl text={l.value ?? ''} />
                              </span>
                            </span>
                          ))}
                        </span>
                      ) : (
                        <span className={`tb-cell${isNew ? ' pm-new' : ''}`} style={style}>
                          <Hl text={cell?.shown?.value ?? ''} />
                        </span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rowClashes.map((row) => (
        <Lanes
          key={row.id}
          view={view}
          field={row.alive}
          what="row"
          show={() => rowSummary(block, row)}
          deletedShows={<s>{rowSummary(block, row)}</s>}
          now={props.now}
          onKeep={(lane) => props.onKeep(row.alive, lane)}
        />
      ))}
      {!readOnly && (
        <button type="button" className="ed-btn tb-add" onClick={() => open(null)}>
          <Icon name="plus" />
          Add a row
        </button>
      )}
      {sheet && <RowSheet {...props} row={sheet.row} layout={layout} onClose={() => setSheet(null)} />}
    </div>
  );
}

/** Pre-filled values for a new row: the last row you added, and today's Day or Date. */
function prefill(view: DocView, block: BlockView, me: ActorId): Record<ItemId, string> {
  const table = block.table!;
  const out: Record<ItemId, string> = {};
  const mine = [...table.rows].reverse().find((r) => shownRow(r) && (r.alive.shown?.actor ?? r.alive.lanes[0]?.actor) === me);
  for (const c of table.columns) {
    const name = (c.def.shown?.value?.name ?? '').trim().toLowerCase();
    const today = new Date();
    if (name === 'day') out[c.id] = WEEKDAYS[today.getDay()]!;
    else if (name === 'date') out[c.id] = `${today.getDate()} ${MONTHS[today.getMonth()]} ${today.getFullYear()}`;
    else if (mine) {
      const cell = mine.cells[c.id];
      out[c.id] = cell?.state === 'clash' ? '' : (cell?.shown?.value ?? '');
    }
  }
  void view;
  return out;
}

function RowSheet({
  view,
  block,
  me,
  row,
  layout,
  act,
  say,
  undo,
  onKeep,
  onClose,
}: TableProps & { row: ItemId | null; onClose(): void }) {
  const table = block.table!;
  const existing = row ? table.rows.find((r) => r.id === row) : undefined;
  const start = useMemo<Record<ItemId, string>>(() => {
    if (!existing) return prefill(view, block, me);
    const out: Record<ItemId, string> = {};
    for (const c of table.columns) out[c.id] = existing.cells[c.id]?.state === 'clash' ? '' : (existing.cells[c.id]?.shown?.value ?? '');
    return out;
    // The sheet keeps what it opened with while it's open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [values, setValues] = useState(start);
  const [touched, setTouched] = useState<Set<ItemId>>(new Set());
  const changed = touched.size > 0;
  const name = table.name.shown?.value ?? '';
  const empty = table.columns.every((c) => !(values[c.id] ?? '').trim());
  const warning = changed ? ruleWarning(view, block, values, existing?.id ?? null) : null;
  const title = existing ? 'Change this row' : `Add a row to ${name}`;

  const save = () => {
    if (empty) return;
    if (existing) {
      act(() =>
        table.columns.flatMap((c) => {
          const cell = existing.cells[c.id];
          if (cell?.state === 'clash') return [];
          const v = values[c.id] ?? '';
          return v === (cell?.shown?.value ?? '') ? [] : model.intents.setCell(block.id, existing.id, c.id, v);
        }),
      );
    } else {
      const vals: Record<ItemId, string> = {};
      for (const c of table.columns) vals[c.id] = values[c.id] ?? '';
      act(() => model.intents.addRow(view, block.id, vals).ops);
    }
    onClose();
  };

  const main = existing ? (warning ? 'Save anyway' : 'Save changes') : warning ? 'Add anyway' : 'Add row';
  return (
    <Sheet
      title={title}
      layout={layout}
      onClose={onClose}
      footer={
        <>
          {warning && (
            <p className="sh-warn" role="status">
              <Icon name="alert" />
              {warning}
            </p>
          )}
          <div className="sh-buttons">
            <button type="button" className="ed-btn" onClick={onClose}>
              Cancel
            </button>
            <button type="button" className="ed-btn ed-main" disabled={empty} onClick={save}>
              {warning && <Icon name="alert" />}
              {main}
            </button>
          </div>
          {existing && (
            <button
              type="button"
              className="ed-quiet sh-delete"
              onClick={() => {
                act(() => model.intents.deleteRow(block.id, existing.id));
                onClose();
                say('Row deleted.', { label: 'Undo', run: undo });
              }}
            >
              <Icon name="trash" />
              Delete row
            </button>
          )}
        </>
      }
    >
      {table.columns.map((c, i) => {
        const def = c.def.shown?.value;
        const cell = existing?.cells[c.id];
        if (cell?.state === 'clash') {
          return (
            <div className="sh-field" key={c.id}>
              <span>{def?.name}</span>
              <div className="sh-two">
                {cell.lanes.map((l) => (
                  <div key={l.ref} className="sh-two-v" style={barStyle(view, l.actor)}>
                    <span>
                      {cutName(writerName(view, l.actor))}: {l.value}
                    </span>
                    <button
                      type="button"
                      className="ed-btn ln-keep"
                      onClick={() => {
                        onKeep(cell, l);
                        onClose();
                      }}
                    >
                      Keep this one
                    </button>
                  </div>
                ))}
              </div>
            </div>
          );
        }
        const number = def?.kind === 'number';
        const prefilled = !existing && !touched.has(c.id) && Boolean(values[c.id]);
        return (
          <label className="sh-field" key={c.id}>
            <span>{def?.name}</span>
            <input
              className={prefilled ? 'is-prefill' : undefined}
              value={values[c.id] ?? ''}
              inputMode={number ? 'decimal' : 'text'}
              autoComplete="off"
              autoFocus={i === 0}
              onFocus={(e) => i === 0 && e.currentTarget.select()}
              onChange={(e) => {
                setValues({ ...values, [c.id]: e.target.value });
                setTouched(new Set(touched).add(c.id));
              }}
              onKeyDown={(e) => e.key === 'Enter' && i === table.columns.length - 1 && save()}
            />
          </label>
        );
      })}
    </Sheet>
  );
}

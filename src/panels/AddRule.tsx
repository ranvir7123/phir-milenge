// Add a rule: build a sentence from the doc's own tables and columns, no formulas. Two kinds:
// "In [table], each [column] can have [of] = [value] only [times] time." and
// "In [table], rows where [column] is [value] stay within [max]." It says "Already broken" before you add one.
// Opened from the shield (laptop), Insert then Rule (phone) and the Rules panel. Spec: 2-user-experience.md, "Adding a rule".

import { useMemo, useState } from 'react';
import type { AddRuleProps, ItemId, RuleDef, TableView } from '../contracts';
import { checkRule } from '../model/rules';
import { intents } from './engineLink';
import { shownText } from './fields';
import { AlertIcon, LeftIcon } from './icons';
import { columnName, messageWithoutName, ruleName, tablesOf } from './rules';
import './panels.css';

const ANY = '';

/** Distinct values already in a column, as shown, in the order they first appear (capitals and spaces ignored). */
function valuesOf(table: TableView | undefined, column: ItemId): string[] {
  if (!table) return [];
  const seen = new Map<string, string>();
  for (const row of table.rows) {
    const v = row.cells[column] ? shownText(row.cells[column]!).trim() : '';
    if (v && !seen.has(v.toLowerCase())) seen.set(v.toLowerCase(), v);
  }
  return [...seen.values()];
}

export function AddRule({ view, commit, bigScreen, onClose }: AddRuleProps) {
  const tables = tablesOf(view);
  return (
    <div className={`pn pn-full${bigScreen ? ' pn-big' : ''}`} role="dialog" aria-modal="true" aria-labelledby="pn-addrule">
      <div className="pn-full-top">
        <button type="button" className="pn-back" onClick={onClose}>
          <LeftIcon />
          Back to the doc
        </button>
      </div>
      <div className="pn-rulebuilder">
        <h2 id="pn-addrule">Add a rule</h2>
        {tables.length === 0 ? <NoTables view={view} commit={commit} /> : <Builder view={view} commit={commit} onClose={onClose} />}
      </div>
    </div>
  );
}

function NoTables({ view, commit }: Pick<AddRuleProps, 'view' | 'commit'>) {
  const insert = () => {
    const after = view.blocks[view.blocks.length - 1]?.id ?? null;
    commit(
      intents().createTable(view, after, 'Table', [
        { name: 'Name', kind: 'words' },
        { name: 'Notes', kind: 'words' },
      ]).ops,
    );
  };
  return (
    <>
      <p>Rules check a table. Add a table first.</p>
      <div className="pn-acts">
        <button type="button" className="pn-btn pn-btn-main pn-btn-bar" onClick={insert}>
          Insert a table
        </button>
      </div>
    </>
  );
}

function Builder({ view, commit, onClose }: Pick<AddRuleProps, 'view' | 'commit' | 'onClose'>) {
  const tables = tablesOf(view);
  const [kind, setKind] = useState<'unique' | 'limit'>('unique');
  const [tableId, setTableId] = useState(tables[0]!.block);
  const table = (tables.find((t) => t.block === tableId) ?? tables[0]!).table;
  const cols = table.columns;
  const numberCols = cols.filter((c) => c.def.shown?.value?.kind === 'number');

  const [column, setColumn] = useState(cols[0]?.id ?? '');
  const [of, setOf] = useState(cols[1]?.id ?? ANY);
  const [value, setValue] = useState(ANY);
  const [times, setTimes] = useState('1');
  const [whereCol, setWhereCol] = useState(cols[1]?.id ?? cols[0]?.id ?? ANY);
  const [equals, setEquals] = useState('');
  const [total, setTotal] = useState(ANY);
  const [max, setMax] = useState('');
  const [name, setName] = useState('');
  const [nameTouched, setNameTouched] = useState(false);

  // Switching tables starts the brackets again from that table's columns.
  const pickTable = (id: ItemId) => {
    const t = tables.find((x) => x.block === id)!.table;
    setTableId(id);
    setColumn(t.columns[0]?.id ?? '');
    setOf(t.columns[1]?.id ?? ANY);
    setValue(ANY);
    setWhereCol(t.columns[1]?.id ?? t.columns[0]?.id ?? ANY);
    setEquals('');
    setTotal(ANY);
  };

  const timesN = Number(times);
  const maxN = Number(max);
  const problem =
    cols.length === 0
      ? 'This table has no columns yet.'
      : kind === 'unique'
        ? !Number.isInteger(timesN) || timesN < 1
          ? 'Write a whole number of times, like 1.'
          : null
        : max.trim() === '' || !Number.isFinite(maxN) || maxN < 0
          ? 'Write the limit as a number, like 500.'
          : whereCol !== ANY && equals.trim() === ''
            ? 'Pick which value to count.'
            : null;

  const draft: RuleDef | null = useMemo(() => {
    if (cols.length === 0) return null;
    if (kind === 'unique') {
      return {
        kind: 'unique',
        table: tableId,
        column,
        ...(of !== ANY ? { of } : {}),
        ...(of !== ANY && value !== ANY ? { value } : {}),
        ...(Number.isInteger(timesN) && timesN > 1 ? { times: timesN } : {}),
      };
    }
    return {
      kind: 'limit',
      table: tableId,
      ...(whereCol !== ANY && equals.trim() ? { where: { column: whereCol, equals: equals.trim() } } : {}),
      ...(total !== ANY ? { total } : {}),
      max: Number.isFinite(maxN) ? maxN : 0,
    };
  }, [cols.length, kind, tableId, column, of, value, timesN, whereCol, equals, total, maxN]);

  const autoName = draft ? ruleName(draft, view) : '';
  const shownName = nameTouched ? name : autoName;
  const finalName = shownName.trim() || autoName;
  const result = draft && !problem ? checkRule({ ...draft, name: finalName } as RuleDef, view.blocks, view.writers) : null;

  const add = () => {
    if (!draft || problem) return;
    commit(intents().addRule(view, { ...draft, name: finalName } as RuleDef).ops);
    onClose();
  };

  const colOptions = (allowAny: string | null) => (
    <>
      {allowAny !== null && <option value={ANY}>{allowAny}</option>}
      {cols.map((c) => (
        <option key={c.id} value={c.id}>
          {columnName(c)}
        </option>
      ))}
    </>
  );

  return (
    <>
      <fieldset className="pn-choices">
        <legend className="pn-small pn-quiet">What should the rule check?</legend>
        <label className="pn-choice">
          <input type="radio" name="pn-rulekind" checked={kind === 'unique'} onChange={() => setKind('unique')} />
          <span>
            <span className="pn-choice-title">Something can appear only once</span>
            <span className="pn-choice-sub">Like one kit per ration card</span>
          </span>
        </label>
        <label className="pn-choice">
          <input type="radio" name="pn-rulekind" checked={kind === 'limit'} onChange={() => setKind('limit')} />
          <span>
            <span className="pn-choice-title">A count or total stays within a limit</span>
            <span className="pn-choice-sub">Like tarpaulins stay within 500</span>
          </span>
        </label>
      </fieldset>

      <div className="pn-sentence">
        <span>In</span>
        <select className="pn-select" aria-label="Table" value={tableId} onChange={(e) => pickTable(e.target.value)}>
          {tables.map((t) => (
            <option key={t.block} value={t.block}>
              {t.name}
            </option>
          ))}
        </select>
        {kind === 'unique' ? (
          <>
            <span>, each</span>
            <select className="pn-select" aria-label="Column that can't repeat" value={column} onChange={(e) => setColumn(e.target.value)}>
              {colOptions(null)}
            </select>
            <span>can have</span>
            <select
              className="pn-select"
              aria-label="Column to count"
              value={of}
              onChange={(e) => {
                setOf(e.target.value);
                setValue(ANY);
              }}
            >
              {colOptions('a row')}
            </select>
            {of !== ANY && (
              <>
                <span>=</span>
                <select className="pn-select" aria-label="Value to count" value={value} onChange={(e) => setValue(e.target.value)}>
                  <option value={ANY}>any value</option>
                  {valuesOf(table, of).map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
              </>
            )}
            <span>only</span>
            <input className="pn-select pn-number" aria-label="Times" inputMode="numeric" value={times} onChange={(e) => setTimes(e.target.value)} />
            <span>{timesN === 1 ? 'time.' : 'times.'}</span>
          </>
        ) : (
          <>
            <span>,</span>
            <select className="pn-select" aria-label="What to count" value={total} onChange={(e) => setTotal(e.target.value)}>
              <option value={ANY}>the number of rows</option>
              {numberCols.map((c) => (
                <option key={c.id} value={c.id}>
                  the total of {columnName(c)}
                </option>
              ))}
            </select>
            <span>where</span>
            <select
              className="pn-select"
              aria-label="Column to match"
              value={whereCol}
              onChange={(e) => {
                setWhereCol(e.target.value);
                setEquals('');
              }}
            >
              {colOptions('any row')}
            </select>
            {whereCol !== ANY && (
              <>
                <span>is</span>
                <select className="pn-select" aria-label="Value to match" value={equals} onChange={(e) => setEquals(e.target.value)}>
                  <option value="">Pick a value</option>
                  {valuesOf(table, whereCol).map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
              </>
            )}
            <span>stays within</span>
            <input className="pn-select pn-number" aria-label="Limit" inputMode="decimal" placeholder="500" value={max} onChange={(e) => setMax(e.target.value)} />
            <span>.</span>
          </>
        )}
      </div>

      <label className="pn-field">
        <span className="pn-small pn-quiet">Short name, used in every message</span>
        <input
          className="pn-select pn-text"
          value={shownName}
          maxLength={60}
          onChange={(e) => {
            setNameTouched(true);
            setName(e.target.value);
          }}
        />
      </label>

      {problem && <p className="pn-small pn-quiet">{problem}</p>}
      {result?.state === 'broken' && (
        <div className="pn-flag pn-flag-bad" role="status">
          <AlertIcon />
          <p>
            <strong>Already broken.</strong> {messageWithoutName(result.message, finalName)} The rule will flag it on every phone that has this doc.
          </p>
        </div>
      )}
      {result?.state === 'ok' && <p className="pn-small pn-quiet">Kept right now. Every phone checks it after every change.</p>}

      <div className="pn-acts pn-acts-row">
        <button type="button" className="pn-btn pn-btn-bar" onClick={onClose}>
          Cancel
        </button>
        <button type="button" className="pn-btn pn-btn-main pn-btn-bar" disabled={!!problem} onClick={add}>
          Add rule
        </button>
      </div>
    </>
  );
}


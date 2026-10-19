import { memo, useEffect, useState, type CSSProperties, type Dispatch, type KeyboardEvent } from 'react';
import {
  elementLabel,
  formatEighths,
  parseEighths,
  stripKind,
  type BreakdownElement,
  type Category,
  type Sheet,
} from '../model';
import type { Action } from '../store';

export interface FieldCol {
  key: keyof Sheet;
  label: string;
  width: number;
  sticky?: boolean;
  list?: string;
  upper?: boolean;
}

export const SCENE_COLS: FieldCol[] = [
  { key: 'sheetNumber', label: 'Sheet', width: 54, sticky: true },
  { key: 'scenes', label: 'Scene', width: 60, sticky: true },
  { key: 'intExt', label: 'I/E', width: 74, sticky: true, list: 'dl-intext', upper: true },
  { key: 'set', label: 'Set', width: 190, sticky: true, upper: true },
  { key: 'dayNight', label: 'D/N', width: 86, list: 'dl-daynight', upper: true },
  { key: 'pages', label: 'Pages', width: 62 },
  { key: 'synopsis', label: 'Synopsis', width: 240 },
  { key: 'scriptDay', label: 'Script Day', width: 70 },
  { key: 'location', label: 'Location', width: 160 },
  { key: 'scriptPage', label: 'Pg', width: 46 },
  { key: 'timing', label: 'Est. Time', width: 70 },
];

export const EXTRA_COLS: FieldCol[] = [
  { key: 'sequence', label: 'Sequence', width: 80 },
  { key: 'episode', label: 'Episode', width: 70 },
  { key: 'misc1', label: 'Misc 1', width: 110 },
  { key: 'misc2', label: 'Misc 2', width: 110 },
  { key: 'misc3', label: 'Misc 3', width: 110 },
  { key: 'misc4', label: 'Misc 4', width: 110 },
];

const STATUS_W = 34;

const SOURCE_LABEL = { user: 'Tagged by you', import: 'From the script import', rules: 'Suggested by rules', ai: 'Suggested by AI' };

/** Tooltip saying where a tag came from and the script text behind it. */
function tagTitle(t: Sheet['tags'][number]): string {
  const origin = t.source === 'ai' && t.by ? `Suggested by ${t.by}` : SOURCE_LABEL[t.source];
  const rule = t.source === 'rules' && t.by ? ` (${t.by})` : '';
  return `${origin}${rule}${t.quote ? `
“${t.quote}”` : ''}`;
}
const CAT_W = 190;

export function focusCell(r: number, c: number) {
  document.querySelector<HTMLInputElement>(`[data-r="${r}"][data-c="${c}"]`)?.focus();
}

function TextCell(props: {
  value: string;
  onCommit: (v: string) => void;
  validate?: (v: string) => boolean;
  r: number;
  c: number;
  list?: string;
  upper?: boolean;
}) {
  const { value, onCommit, validate, r, c, list, upper } = props;
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const commit = () => {
    const v = upper ? draft.trim().toUpperCase() : draft;
    if (v === value || (validate && !validate(v))) setDraft(value);
    else onCommit(v);
  };
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === 'ArrowDown') {
      e.preventDefault();
      focusCell(r + 1, c);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      focusCell(r - 1, c);
    } else if (e.key === 'Escape') {
      setDraft(value);
      requestAnimationFrame(() => e.currentTarget?.blur());
    }
  };
  return (
    <input
      className="cell-input"
      data-r={r}
      data-c={c}
      value={draft}
      list={list}
      spellCheck={false}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={onKeyDown}
    />
  );
}

function ChipCell(props: {
  sheet: Sheet;
  category: Category;
  elMap: Map<string, BreakdownElement>;
  dispatch: Dispatch<Action>;
  r: number;
  c: number;
}) {
  const { sheet, category, elMap, dispatch, r, c } = props;
  const [draft, setDraft] = useState('');
  const tags = sheet.tags.filter((t) => elMap.get(t.elementId)?.categoryId === category.id);
  const add = () => {
    if (!draft.trim()) return false;
    dispatch({ type: 'addTag', sheetId: sheet.id, categoryId: category.id, name: draft });
    setDraft('');
    return true;
  };
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      if (!add() && e.key === 'Enter') focusCell(r + 1, c);
    } else if (e.key === 'ArrowDown' && !draft) {
      e.preventDefault();
      focusCell(r + 1, c);
    } else if (e.key === 'ArrowUp' && !draft) {
      e.preventDefault();
      focusCell(r - 1, c);
    } else if (e.key === 'Escape') setDraft('');
  };
  return (
    <div className="chips">
      {tags.map((t) => {
        const el = elMap.get(t.elementId)!;
        const ids = { sheetId: sheet.id, elementId: el.id };
        return (
          <span
            key={el.id}
            className={`chip ${t.state}`}
            style={{ '--c': category.color } as CSSProperties}
            title={tagTitle(t)}
          >
            {t.source === 'ai' && t.state === 'suggested' && <span className="chip-src">AI</span>}
            <span className="chip-label">{elementLabel(el)}</span>
            {t.state === 'suggested' ? (
              <>
                <button className="chip-btn ok" title="Accept" onClick={() => dispatch({ type: 'acceptTag', ...ids })}>
                  ✓
                </button>
                <button className="chip-btn no" title="Reject" onClick={() => dispatch({ type: 'rejectTag', ...ids })}>
                  ✕
                </button>
              </>
            ) : (
              <button className="chip-btn" title="Remove" onClick={() => dispatch({ type: 'removeTag', ...ids })}>
                ×
              </button>
            )}
          </span>
        );
      })}
      <input
        className="chip-input"
        data-r={r}
        data-c={c}
        list={`dl-${category.id}`}
        value={draft}
        placeholder="+"
        spellCheck={false}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={add}
        onKeyDown={onKeyDown}
      />
    </div>
  );
}

interface RowProps {
  sheet: Sheet;
  r: number;
  selected: boolean;
  fieldCols: FieldCol[];
  stickyLeft: number[];
  categories: Category[];
  elMap: Map<string, BreakdownElement>;
  dispatch: Dispatch<Action>;
  onSelect: (id: string) => void;
}

const Row = memo(function Row(props: RowProps) {
  const { sheet, r, selected, fieldCols, stickyLeft, categories, elMap, dispatch, onSelect } = props;
  const kind = stripKind(sheet);
  const tint = { background: kind.bg, color: kind.ink };
  const pending = sheet.tags.some((t) => t.state === 'suggested');
  const update = (patch: Partial<Sheet>) => dispatch({ type: 'updateSheet', id: sheet.id, patch });
  return (
    <tr className={selected ? 'selected' : undefined} onMouseDown={() => onSelect(sheet.id)} onFocus={() => onSelect(sheet.id)}>
      <td className="sticky status-cell" style={{ left: 0, ...tint }}>
        <button
          className={`status ${sheet.reviewed ? 'reviewed' : pending ? 'pending' : ''}`}
          title={sheet.reviewed ? 'Reviewed (click to reopen)' : pending ? 'Has suggestions to review' : 'Mark as reviewed'}
          onClick={() => update({ reviewed: !sheet.reviewed })}
        >
          {sheet.reviewed ? '✓' : pending ? '●' : ''}
        </button>
      </td>
      {fieldCols.map((col, c) => (
        <td
          key={col.key}
          className={col.sticky ? `sticky${fieldCols[c + 1]?.sticky ? '' : ' sticky-edge'}` : undefined}
          style={col.sticky ? { left: stickyLeft[c], ...tint } : undefined}
        >
          {col.key === 'pages' ? (
            <TextCell
              value={formatEighths(sheet.pages)}
              validate={(v) => parseEighths(v) !== null}
              onCommit={(v) => update({ pages: parseEighths(v) ?? 0 })}
              r={r}
              c={c}
            />
          ) : (
            <TextCell
              value={String(sheet[col.key] ?? '')}
              onCommit={(v) => update({ [col.key]: v })}
              r={r}
              c={c}
              list={col.list}
              upper={col.upper}
            />
          )}
        </td>
      ))}
      {categories.map((cat, i) => (
        <td key={cat.id} className="cat-cell">
          <ChipCell sheet={sheet} category={cat} elMap={elMap} dispatch={dispatch} r={r} c={fieldCols.length + i} />
        </td>
      ))}
    </tr>
  );
});

export default function BreakdownTable(props: {
  sheets: Sheet[];
  fieldCols: FieldCol[];
  categories: Category[];
  elMap: Map<string, BreakdownElement>;
  selectedId: string | null;
  dispatch: Dispatch<Action>;
  onSelect: (id: string) => void;
}) {
  const { sheets, fieldCols, categories, elMap, selectedId, dispatch, onSelect } = props;
  const stickyLeft: number[] = [];
  let left = STATUS_W;
  for (const col of fieldCols) {
    stickyLeft.push(left);
    if (col.sticky) left += col.width;
  }
  const lastSticky = fieldCols.reduce((last, col, i) => (col.sticky ? i : last), -1);
  return (
    <div className="table-wrap">
      <table className="grid">
        <colgroup>
          <col style={{ width: STATUS_W }} />
          {fieldCols.map((col) => (
            <col key={col.key} style={{ width: col.width }} />
          ))}
          {categories.map((cat) => (
            <col key={cat.id} style={{ width: CAT_W }} />
          ))}
        </colgroup>
        <thead>
          <tr>
            <th className="sticky" style={{ left: 0 }} />
            {fieldCols.map((col, c) => (
              <th
                key={col.key}
                className={`${col.sticky ? 'sticky' : ''} ${c === lastSticky ? 'sticky-edge' : ''}`}
                style={col.sticky ? { left: stickyLeft[c] } : undefined}
              >
                {col.label}
              </th>
            ))}
            {categories.map((cat) => (
              <th key={cat.id} className="cat-th">
                <span className="dot" style={{ background: cat.color }} />
                {cat.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sheets.map((s, r) => (
            <Row
              key={s.id}
              sheet={s}
              r={r}
              selected={s.id === selectedId}
              fieldCols={fieldCols}
              stickyLeft={stickyLeft}
              categories={categories}
              elMap={elMap}
              dispatch={dispatch}
              onSelect={onSelect}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

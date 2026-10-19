import { useEffect, useMemo, useState, type Dispatch, type ReactNode } from 'react';
import { elementLabel, formatEighths, type BreakdownElement, type Category, type Project, type Sheet } from '../model';
import type { Action } from '../store';

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Underlines tagged elements in the script text using their category colour. */
function highlight(text: string, matcher: RegExp | null, colorOf: (name: string) => string | undefined): ReactNode {
  if (!matcher) return text;
  return text.split(matcher).map((part, i) =>
    i % 2 === 1 ? (
      <mark key={i} style={{ borderColor: colorOf(part.toLowerCase()) }}>
        {part}
      </mark>
    ) : (
      part
    ),
  );
}

function ScriptView(props: {
  sheet: Sheet;
  categories: Category[];
  elMap: Map<string, BreakdownElement>;
  dispatch: Dispatch<Action>;
}) {
  const { sheet, categories, elMap, dispatch } = props;
  const [selection, setSelection] = useState('');
  const [categoryId, setCategoryId] = useState('props');
  useEffect(() => setSelection(''), [sheet.id]);

  const { matcher, colorOf } = useMemo(() => {
    const colors = new Map<string, string>();
    for (const t of sheet.tags) {
      const el = elMap.get(t.elementId);
      if (el && el.name.length > 1)
        colors.set(el.name.toLowerCase(), categories.find((c) => c.id === el.categoryId)?.color ?? '#999');
    }
    const names = [...colors.keys()].sort((a, b) => b.length - a.length).map(escapeRe);
    return {
      matcher: names.length ? new RegExp(`\\b(${names.join('|')})\\b`, 'gi') : null,
      colorOf: (n: string) => colors.get(n),
    };
  }, [sheet.tags, elMap, categories]);

  const captureSelection = () => {
    const text = window.getSelection()?.toString().replace(/\s+/g, ' ').trim() ?? '';
    setSelection(text.length > 0 && text.length <= 60 ? text : '');
  };
  const tag = () => {
    dispatch({ type: 'addTag', sheetId: sheet.id, categoryId, name: selection, quote: selection });
    setSelection('');
    window.getSelection()?.removeAllRanges();
  };

  return (
    <>
      {selection && (
        <div className="tag-bar">
          <span className="tag-bar-text">Tag “{selection}” as</span>
          <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <button className="primary" onClick={tag}>
            Add
          </button>
          <button className="ghost" onClick={() => setSelection('')} title="Cancel">
            ✕
          </button>
        </div>
      )}
      <div className="script" onMouseUp={captureSelection}>
        <div className="sc-heading">
          {sheet.scenes && <span className="sc-num">{sheet.scenes}</span>}
          {sheet.heading || [sheet.intExt, sheet.set, sheet.dayNight].filter(Boolean).join(' ') || 'New scene'}
        </div>
        {sheet.script.length === 0 && <p className="muted">No script text for this scene. Break it down directly in the table.</p>}
        {sheet.script.map((p, i) => (
          <div key={i} className={`sc-${p.t.replace(/\s+/g, '-').toLowerCase()}`}>
            {highlight(p.x, matcher, colorOf)}
          </div>
        ))}
      </div>
      <p className="hint">Select words in the script to tag them as an element.</p>
    </>
  );
}

function ElementsView(props: { project: Project; dispatch: Dispatch<Action> }) {
  const { project, dispatch } = props;
  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of project.sheets) for (const t of s.tags) m.set(t.elementId, (m.get(t.elementId) ?? 0) + 1);
    return m;
  }, [project.sheets]);
  const groups = project.categories
    .map((c) => ({
      category: c,
      elements: project.elements
        .filter((e) => e.categoryId === c.id)
        .sort((a, b) => (a.castId ?? 0) - (b.castId ?? 0) || a.name.localeCompare(b.name)),
    }))
    .filter((g) => g.elements.length);
  if (!groups.length) return <p className="muted pad">No elements yet. Tag something in the table or the script.</p>;
  return (
    <div className="elements">
      <p className="hint">Rename an element to an existing name to merge duplicates.</p>
      {groups.map(({ category, elements }) => (
        <section key={category.id}>
          <h4>
            <span className="dot" style={{ background: category.color }} />
            {category.name} <span className="muted">{elements.length}</span>
          </h4>
          {elements.map((el) => (
            <div key={el.id} className={`el-row ${counts.get(el.id) ? '' : 'unused'}`}>
              {el.castId && <span className="cast-id">{el.castId}</span>}
              <input
                key={el.name}
                defaultValue={el.name}
                spellCheck={false}
                onBlur={(e) => dispatch({ type: 'renameElement', elementId: el.id, name: e.target.value })}
                onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
              />
              <span className="muted" title="Scenes">
                {counts.get(el.id) ?? 0}
              </span>
              <button
                className="ghost"
                title="Delete element from every scene"
                onClick={() =>
                  (counts.get(el.id) ?? 0) === 0 || confirm(`Remove “${elementLabel(el)}” from every scene?`)
                    ? dispatch({ type: 'deleteElement', elementId: el.id })
                    : undefined
                }
              >
                ✕
              </button>
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}

export default function SidePanel(props: {
  project: Project;
  sheet: Sheet | null;
  elMap: Map<string, BreakdownElement>;
  dispatch: Dispatch<Action>;
  onSelect: (id: string | null) => void;
}) {
  const { project, sheet, elMap, dispatch, onSelect } = props;
  const [tab, setTab] = useState<'script' | 'elements'>('script');
  const pending = sheet?.tags.filter((t) => t.state === 'suggested').length ?? 0;
  return (
    <aside className="side">
      <div className="tabs">
        <button className={tab === 'script' ? 'active' : ''} onClick={() => setTab('script')}>
          Scene
        </button>
        <button className={tab === 'elements' ? 'active' : ''} onClick={() => setTab('elements')}>
          Elements <span className="muted">{project.elements.length}</span>
        </button>
      </div>
      {tab === 'elements' ? (
        <ElementsView project={project} dispatch={dispatch} />
      ) : !sheet ? (
        <p className="muted pad">Select a scene row to see its script.</p>
      ) : (
        <>
          <div className="scene-actions">
            <span className="muted">
              Sheet {sheet.sheetNumber || '–'} · {formatEighths(sheet.pages) || '0'} pgs
            </span>
            <span className="spacer" />
            {pending > 0 && (
              <button className="primary" onClick={() => dispatch({ type: 'acceptAll', sheetId: sheet.id })}>
                Accept {pending} suggestion{pending > 1 ? 's' : ''}
              </button>
            )}
            <button onClick={() => dispatch({ type: 'updateSheet', id: sheet.id, patch: { reviewed: !sheet.reviewed } })}>
              {sheet.reviewed ? 'Reopen' : 'Mark reviewed'}
            </button>
          </div>
          <ScriptView sheet={sheet} categories={project.categories} elMap={elMap} dispatch={dispatch} />
          <div className="scene-actions bottom">
            <button onClick={() => dispatch({ type: 'addSheet', afterId: sheet.id })}>Insert scene below</button>
            <span className="spacer" />
            <button
              className="danger"
              onClick={() => {
                if (confirm(`Delete sheet ${sheet.sheetNumber || ''}?`)) {
                  dispatch({ type: 'deleteSheet', id: sheet.id });
                  onSelect(null);
                }
              }}
            >
              Delete scene
            </button>
          </div>
        </>
      )}
    </aside>
  );
}

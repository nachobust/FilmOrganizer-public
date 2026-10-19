import { useEffect, useRef, useState } from 'react';
import {
  aiUnavailable,
  BRIEF_MAX_CHARS,
  breakdownBrief,
  estimateBrief,
  estimateRun,
  listModels,
  PROVIDERS,
  providerSettings,
  runAIBreakdown,
  type AISettings,
  type BriefScene,
  type ProviderId,
  type ProviderSettings,
} from '../ai';
import type { Project } from '../model';
import type { Suggestion } from '../rules';

const IDS = Object.keys(PROVIDERS) as ProviderId[];

export function AISettingsModal(props: { settings: AISettings; onSave: (s: AISettings) => void; onClose: () => void }) {
  const [provider, setProvider] = useState<ProviderId | null>(props.settings.provider);
  const [drafts, setDrafts] = useState<Partial<Record<ProviderId, ProviderSettings>>>(() =>
    Object.fromEntries(IDS.map((id) => [id, providerSettings(props.settings, id)])),
  );
  const [models, setModels] = useState<string[]>([]);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [testing, setTesting] = useState(false);
  useEffect(() => {
    setModels([]);
    setStatus(null);
  }, [provider]);

  const info = provider ? PROVIDERS[provider] : null;
  const cfg = provider ? drafts[provider]! : null;
  const set = (patch: Partial<ProviderSettings>) =>
    provider && setDrafts({ ...drafts, [provider]: { ...cfg!, ...patch } });

  const test = async () => {
    if (!provider || !cfg) return;
    setTesting(true);
    setStatus(null);
    try {
      const ids = await listModels(provider, cfg);
      setModels(ids);
      if (!cfg.model && ids.length) set({ model: ids[0] });
      setStatus({ ok: true, text: `Connected · ${ids.length} model${ids.length === 1 ? '' : 's'} available` });
    } catch (e) {
      setStatus({ ok: false, text: e instanceof Error ? e.message : String(e) });
    } finally {
      setTesting(false);
    }
  };

  const save = () => {
    props.onSave({ provider, providers: { ...props.settings.providers, ...drafts } });
    props.onClose();
  };

  return (
    <div className="modal-overlay" onMouseDown={(e) => e.target === e.currentTarget && props.onClose()}>
      <form
        className="modal wide"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <h3>AI assistant</h3>
        <p className="modal-text">
          Optional. The rule-based breakdown always works offline; an AI adds what the rules can't infer, such as
          implied props. Its results arrive as suggestions you accept or reject.
        </p>
        <label>
          Provider
          <select value={provider ?? ''} onChange={(e) => setProvider((e.target.value || null) as ProviderId | null)}>
            <option value="">Off — rules only</option>
            {IDS.map((id) => (
              <option key={id} value={id}>
                {PROVIDERS[id].label}
              </option>
            ))}
          </select>
        </label>
        {info && cfg && (
          <>
            <p className="modal-text">
              {info.help}{' '}
              {info.keyUrl && (
                <a href={info.keyUrl} target="_blank" rel="noreferrer">
                  Get a key
                </a>
              )}
            </p>
            {info.kind === 'openai' && (info.local || provider === 'custom') && (
              <label>
                Server URL
                <input
                  value={cfg.baseUrl}
                  onChange={(e) => set({ baseUrl: e.target.value })}
                  placeholder="https://…/v1"
                  spellCheck={false}
                />
              </label>
            )}
            {(info.needsKey || provider === 'custom') && (
              <label>
                API key {provider === 'custom' && '(if the service needs one)'}
                <input
                  type="password"
                  value={cfg.apiKey}
                  onChange={(e) => set({ apiKey: e.target.value })}
                  autoComplete="off"
                  spellCheck={false}
                />
              </label>
            )}
            <div className="field-row end">
              <label>
                Model
                <input
                  value={cfg.model}
                  list="dl-ai-models"
                  onChange={(e) => set({ model: e.target.value })}
                  spellCheck={false}
                />
                <datalist id="dl-ai-models">
                  {models.map((m) => (
                    <option key={m} value={m} />
                  ))}
                </datalist>
              </label>
              <button type="button" onClick={test} disabled={testing}>
                {testing ? 'Connecting…' : 'Test & load models'}
              </button>
            </div>
            {status && <div className={status.ok ? 'form-ok' : 'form-error'}>{status.text}</div>}
            <p className="modal-text small">
              {info.local
                ? 'Everything stays on this computer.'
                : `Your key is saved only in this browser and sent only to ${info.label}. Scene text is sent to ${info.label} when you run an AI breakdown.`}
            </p>
          </>
        )}
        <div className="modal-actions">
          <span className="spacer" />
          <button type="button" onClick={props.onClose}>
            Cancel
          </button>
          <button type="submit" className="primary">
            Save
          </button>
        </div>
      </form>
    </div>
  );
}

type RunState =
  | { phase: 'ready' }
  | { phase: 'running'; done: number; total: number; received: number }
  | { phase: 'finished'; received: number; stopped: boolean }
  | { phase: 'failed'; received: number; message: string };

export function AIRunModal(props: {
  project: Project;
  sheetIds: string[];
  settings: AISettings;
  onSuggestions: (s: Suggestion[]) => void;
  onOpenSettings: () => void;
  onClose: () => void;
}) {
  const { project, sheetIds, settings } = props;
  const [state, setState] = useState<RunState>({ phase: 'ready' });
  const abort = useRef<AbortController | null>(null);
  const problem = aiUnavailable(settings);
  const cfg = settings.provider ? providerSettings(settings, settings.provider) : null;
  const info = settings.provider ? PROVIDERS[settings.provider] : null;
  const [estimate] = useState(() => estimateRun(project, sheetIds));
  useEffect(() => () => abort.current?.abort(), []);

  const start = async () => {
    const ctrl = new AbortController();
    abort.current = ctrl;
    let received = 0;
    setState({ phase: 'running', done: 0, total: estimate.requests, received });
    try {
      await runAIBreakdown(
        project,
        sheetIds,
        settings,
        ({ done, total, suggestions }) => {
          received += suggestions.length;
          props.onSuggestions(suggestions);
          setState({ phase: 'running', done, total, received });
        },
        ctrl.signal,
      );
      setState({ phase: 'finished', received, stopped: ctrl.signal.aborted });
    } catch (e) {
      if (ctrl.signal.aborted) setState({ phase: 'finished', received, stopped: true });
      else setState({ phase: 'failed', received, message: e instanceof Error ? e.message : String(e) });
    }
  };

  const scenes = sheetIds.length === 1 ? '1 scene' : `${sheetIds.length} scenes`;
  return (
    <div className="modal-overlay">
      <div className="modal wide">
        <h3>AI breakdown</h3>
        {problem ? (
          <>
            <p className="modal-text">{problem}</p>
            <div className="modal-actions">
              <span className="spacer" />
              <button onClick={props.onClose}>Close</button>
              <button className="primary" onClick={props.onOpenSettings}>
                AI settings…
              </button>
            </div>
          </>
        ) : (
          <>
            <dl className="facts">
              <dt>Provider</dt>
              <dd>
                {info!.label} · {cfg!.model}
              </dd>
              <dt>Scenes</dt>
              <dd>
                {scenes} in {estimate.requests} request{estimate.requests === 1 ? '' : 's'}
              </dd>
              <dt>Size</dt>
              <dd>≈ {estimate.inputTokens.toLocaleString('en-US')} input tokens, plus the answers</dd>
              <dt>Cost</dt>
              <dd>
                {info!.local
                  ? 'Free — runs on this computer'
                  : settings.provider === 'custom'
                    ? 'Billed by the service, if it charges'
                    : `Billed to your ${info!.label} account`}
              </dd>
            </dl>
            {state.phase === 'running' && (
              <div className="progress">
                <div className="progress-bar" style={{ width: `${(state.done / Math.max(1, state.total)) * 100}%` }} />
                <span>
                  Request {Math.min(state.done + 1, state.total)} of {state.total} · {state.received} suggestions so far
                </span>
              </div>
            )}
            {state.phase === 'finished' && (
              <p className="form-ok">
                {state.stopped ? 'Stopped. ' : 'Done. '}
                {state.received} suggestions received; new ones are in the table as chips to accept or reject.
              </p>
            )}
            {state.phase === 'failed' && (
              <p className="form-error">
                {state.message}
                {state.received > 0 && ` (${state.received} suggestions from earlier requests were kept.)`}
              </p>
            )}
            <div className="modal-actions">
              <button onClick={props.onOpenSettings} disabled={state.phase === 'running'}>
                AI settings…
              </button>
              <span className="spacer" />
              {state.phase === 'running' ? (
                <button className="danger" onClick={() => abort.current?.abort()}>
                  Stop
                </button>
              ) : (
                <button onClick={props.onClose}>{state.phase === 'ready' ? 'Cancel' : 'Close'}</button>
              )}
              {(state.phase === 'ready' || state.phase === 'failed') && (
                <button className="primary" onClick={start}>
                  {state.phase === 'failed' ? 'Try again' : `Break down ${scenes}`}
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

const costLine = (settings: AISettings) => {
  const info = PROVIDERS[settings.provider!];
  if (info.local) return 'Free — runs on this computer';
  if (settings.provider === 'custom') return 'Billed by the service, if it charges';
  return `Billed to your ${info.label} account`;
};

/**
 * Shown when an imported file has no scene headings. Offers to have the AI read it as a
 * creative brief or treatment and propose the scenes to shoot.
 */
export function BriefModal(props: {
  title: string;
  text: string;
  settings: AISettings;
  onDone: (scenes: BriefScene[], by: string) => void;
  onOpenSettings: () => void;
  onClose: () => void;
}) {
  const { title, text, settings } = props;
  const [state, setState] = useState<{ phase: 'ready' | 'running' } | { phase: 'failed'; message: string }>({
    phase: 'ready',
  });
  const abort = useRef<AbortController | null>(null);
  useEffect(() => () => abort.current?.abort(), []);
  const problem = aiUnavailable(settings);
  const tooLong = text.length > BRIEF_MAX_CHARS;
  const cfg = settings.provider ? providerSettings(settings, settings.provider) : null;
  const words = text.split(/\s+/).filter(Boolean).length;

  const start = async () => {
    const ctrl = new AbortController();
    abort.current = ctrl;
    setState({ phase: 'running' });
    try {
      const { scenes, by } = await breakdownBrief(text, settings, ctrl.signal);
      if (!ctrl.signal.aborted) props.onDone(scenes, by);
    } catch (e) {
      if (ctrl.signal.aborted) setState({ phase: 'ready' });
      else setState({ phase: 'failed', message: e instanceof Error ? e.message : String(e) });
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal wide">
        <h3>Break down as a brief?</h3>
        <p className="modal-text">
          “{title}” has no scene headings (INT. / EXT.), so it reads like a creative brief, treatment or script without
          headings. The AI can read it the way a director-producer would and propose the scenes to shoot: locations,
          Int/Ext, Day/Night, characters, key shots and production risks. Each proposed scene becomes a row you review.
        </p>
        <blockquote className="brief-excerpt">
          {text.slice(0, 280)}
          {text.length > 280 ? '…' : ''}
        </blockquote>
        {problem ? (
          <>
            <p className="modal-text">
              Breaking down a brief needs an AI; the rule-based breakdown only works on scenes that already exist.{' '}
              {problem}
            </p>
            <div className="modal-actions">
              <span className="spacer" />
              <button onClick={props.onClose}>Close</button>
              <button className="primary" onClick={props.onOpenSettings}>
                AI settings…
              </button>
            </div>
          </>
        ) : (
          <>
            <dl className="facts">
              <dt>Provider</dt>
              <dd>
                {PROVIDERS[settings.provider!].label} · {cfg!.model}
              </dd>
              <dt>Text</dt>
              <dd>{words.toLocaleString('en-US')} words in 1 request</dd>
              <dt>Size</dt>
              <dd>≈ {estimateBrief(text).inputTokens.toLocaleString('en-US')} input tokens, plus the answer</dd>
              <dt>Cost</dt>
              <dd>{costLine(settings)}</dd>
            </dl>
            {state.phase === 'running' && (
              <div className="progress">
                <div className="progress-bar indeterminate" />
                <span>Reading the brief and proposing scenes…</span>
              </div>
            )}
            {tooLong && (
              <p className="form-error">
                This text is too long for one request ({Math.round(text.length / 1000)}k characters, limit{' '}
                {BRIEF_MAX_CHARS / 1000}k). Split it into parts.
              </p>
            )}
            {state.phase === 'failed' && <p className="form-error">{state.message}</p>}
            <div className="modal-actions">
              <button onClick={props.onOpenSettings} disabled={state.phase === 'running'}>
                AI settings…
              </button>
              <span className="spacer" />
              {state.phase === 'running' ? (
                <button className="danger" onClick={() => abort.current?.abort()}>
                  Stop
                </button>
              ) : (
                <button onClick={props.onClose}>Cancel</button>
              )}
              {state.phase !== 'running' && (
                <button className="primary" onClick={start} disabled={tooLong}>
                  {state.phase === 'failed' ? 'Try again' : 'Break down brief'}
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// Optional AI breakdown. The user plugs in a provider of their choice with their own key;
// results come back as suggestions, exactly like the rule-based breakdown.
// Claude goes through the official Anthropic SDK; every other provider speaks the
// OpenAI-style chat completions API (ChatGPT, Gemini, Ollama, LM Studio, custom servers).

import type { Project, Sheet } from './model';
import type { Suggestion } from './rules';

export type ProviderId = 'anthropic' | 'openai' | 'gemini' | 'ollama' | 'lmstudio' | 'custom';

export interface ProviderInfo {
  label: string;
  kind: 'anthropic' | 'openai';
  baseUrl: string;
  needsKey: boolean;
  /** Runs on this computer, so it works offline. */
  local: boolean;
  defaultModel: string;
  keyUrl?: string;
  help: string;
}

export const PROVIDERS: Record<ProviderId, ProviderInfo> = {
  anthropic: {
    label: 'Claude (Anthropic)',
    kind: 'anthropic',
    baseUrl: '',
    needsKey: true,
    local: false,
    defaultModel: 'claude-opus-5-5',
    keyUrl: 'https://platform.claude.com/settings/keys',
    help: 'Needs an Anthropic API key (separate from a Claude Pro/Max subscription). Billed per use.',
  },
  openai: {
    label: 'ChatGPT (OpenAI)',
    kind: 'openai',
    baseUrl: 'https://api.openai.com/v1',
    needsKey: true,
    local: false,
    defaultModel: '',
    keyUrl: 'https://platform.openai.com/api-keys',
    help: 'Needs an OpenAI API key (separate from a ChatGPT Plus subscription). Billed per use.',
  },
  gemini: {
    label: 'Gemini (Google)',
    kind: 'openai',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    needsKey: true,
    local: false,
    defaultModel: '',
    keyUrl: 'https://aistudio.google.com/apikey',
    help: 'Needs a Google AI Studio API key.',
  },
  ollama: {
    label: 'Ollama (local)',
    kind: 'openai',
    baseUrl: 'http://localhost:11434/v1',
    needsKey: false,
    local: true,
    defaultModel: '',
    help: 'Runs a model on this computer — works offline, free. Install Ollama and pull a model first.',
  },
  lmstudio: {
    label: 'LM Studio (local)',
    kind: 'openai',
    baseUrl: 'http://localhost:1234/v1',
    needsKey: false,
    local: true,
    defaultModel: '',
    help: 'Runs a model on this computer — works offline, free. Start the LM Studio server first.',
  },
  custom: {
    label: 'Other (OpenAI-compatible)',
    kind: 'openai',
    baseUrl: '',
    needsKey: false,
    local: false,
    defaultModel: '',
    help: 'Any service with an OpenAI-compatible API (Mistral, DeepSeek, OpenRouter, Groq…). Enter its URL.',
  },
};

export interface ProviderSettings {
  apiKey: string;
  model: string;
  baseUrl: string;
  /** false = the key is kept only while the app is open, never written to storage. */
  rememberKey?: boolean;
}

export interface AISettings {
  /** null = AI is off; only the rule-based breakdown runs. */
  provider: ProviderId | null;
  providers: Partial<Record<ProviderId, ProviderSettings>>;
}

const STORAGE_KEY = 'filmorganizer.ai';

/**
 * Keys live only in this browser, apart from the project, so they never end up in an exported file.
 * They are stored unencrypted (encrypting them here would not help: the key to decrypt would sit in
 * the same app), so the settings warn about it and offer not to remember a key at all.
 */
export function loadAISettings(): AISettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as AISettings;
  } catch {
    // Unreadable or blocked storage: start with AI off.
  }
  return { provider: null, providers: {} };
}

/** What is written to storage: keys the user chose not to remember are left out. */
export function storedAISettings(s: AISettings): AISettings {
  const providers = Object.fromEntries(
    Object.entries(s.providers).map(([id, cfg]) => [id, cfg && cfg.rememberKey === false ? { ...cfg, apiKey: '' } : cfg]),
  );
  return { ...s, providers };
}

export function saveAISettings(s: AISettings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(storedAISettings(s)));
  } catch {
    // Storage blocked: the settings last until the page is closed.
  }
}

export function providerSettings(s: AISettings, id: ProviderId): ProviderSettings {
  const info = PROVIDERS[id];
  const saved = s.providers[id];
  return {
    apiKey: saved?.apiKey ?? '',
    model: saved?.model || info.defaultModel,
    baseUrl: saved?.baseUrl || info.baseUrl,
    rememberKey: saved?.rememberKey !== false,
  };
}

// ---------------------------------------------------------------- Limits

/** Longest wait for one answer. A model on this computer can be slow, so it gets longer. */
const timeoutMs = (id: ProviderId) => (PROVIDERS[id].local ? 10 : 5) * 60_000;

/**
 * How much text goes in one request. Local models are often run with a small context window
 * (Ollama's default is a few thousand tokens) and silently drop what doesn't fit, so they get
 * small batches. About 4 characters per token.
 */
const batchLimits = (id: ProviderId | null) =>
  id && PROVIDERS[id].local ? { chars: 6000, scenes: 4 } : { chars: 24000, scenes: 12 };

/** Briefs are sent in one request; this keeps it inside the provider's limits. */
export const BRIEF_MAX_CHARS = 120000;
const BRIEF_MAX_CHARS_LOCAL = 12000;

export const briefMaxChars = (s: AISettings) =>
  s.provider && PROVIDERS[s.provider].local ? BRIEF_MAX_CHARS_LOCAL : BRIEF_MAX_CHARS;

/**
 * The user's stop signal plus a time limit. `timedOut()` tells the two apart, so a hung
 * server gets a clear message instead of waiting forever.
 */
function withTimeout(signal: AbortSignal | undefined, ms: number) {
  const ctrl = new AbortController();
  let timedOut = false;
  const stop = () => ctrl.abort();
  if (signal?.aborted) ctrl.abort();
  else signal?.addEventListener('abort', stop, { once: true });
  const timer = setTimeout(() => {
    timedOut = true;
    ctrl.abort();
  }, ms);
  return {
    signal: ctrl.signal,
    timedOut: () => timedOut,
    done: () => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', stop);
    },
  };
}

const minutes = (ms: number) => `${Math.round(ms / 60_000)} minute${ms === 60_000 ? '' : 's'}`;

function timeoutError(id: ProviderId, ms: number) {
  const info = PROVIDERS[id];
  return new Error(
    `No answer from ${info.label} after ${minutes(ms)}.` +
      (info.local
        ? ' The model may be too slow on this computer for this much text: try a smaller model or fewer scenes at a time.'
        : ' The service may be busy: try again, or with fewer scenes at a time.'),
  );
}

const CUT_OFF = 'The answer was cut off. Try a shorter text or fewer scenes at a time.';

/** Why the AI can't run right now, or null when it can. */
export function aiUnavailable(s: AISettings): string | null {
  if (!s.provider) return 'AI is off. Choose a provider in AI settings.';
  const info = PROVIDERS[s.provider];
  const cfg = providerSettings(s, s.provider);
  if (info.needsKey && !cfg.apiKey.trim()) return `Add your ${info.label} API key in AI settings.`;
  if (!cfg.baseUrl.trim() && info.kind === 'openai') return 'Enter the server URL in AI settings.';
  if (!cfg.model.trim()) return 'Choose a model in AI settings.';
  if (!info.local && typeof navigator !== 'undefined' && !navigator.onLine)
    return `You're offline. ${info.label} needs internet; the rule-based breakdown still works, and local models (Ollama, LM Studio) work offline.`;
  return null;
}

// ---------------------------------------------------------------- Transport

async function anthropicClient(cfg: ProviderSettings) {
  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  // The key is the user's own, typed into their own browser, so calling the API directly is intended here.
  return {
    Anthropic,
    client: new Anthropic({
      apiKey: cfg.apiKey.trim(),
      dangerouslyAllowBrowser: true,
      maxRetries: 2,
      timeout: timeoutMs('anthropic'),
    }),
  };
}

const trimSlash = (u: string) => u.trim().replace(/\/+$/, '');

/** Keys may only travel over HTTPS, or plain HTTP to a server on this computer. */
function assertSafeUrl(baseUrl: string, sendsKey: boolean) {
  let url: URL;
  try {
    url = new URL(baseUrl.trim());
  } catch {
    throw new Error(`“${baseUrl}” is not a valid server URL.`);
  }
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) || url.hostname.endsWith('.localhost');
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && local))
    throw new Error(
      sendsKey
        ? 'For safety, an API key is only sent over https:// (or http:// to this computer). Use the https address.'
        : 'Use an https:// address, or http:// only for a server on this computer.',
    );
}

async function openaiFetch(
  id: ProviderId,
  cfg: ProviderSettings,
  path: string,
  init: RequestInit = {},
  ms = timeoutMs(id),
) {
  assertSafeUrl(cfg.baseUrl, !!cfg.apiKey.trim());
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (cfg.apiKey.trim()) headers.Authorization = `Bearer ${cfg.apiKey.trim()}`;
  const limit = withTimeout(init.signal ?? undefined, ms);
  try {
    let res: Response;
    try {
      res = await fetch(`${trimSlash(cfg.baseUrl)}${path}`, { ...init, headers, signal: limit.signal });
    } catch (e) {
      if (limit.timedOut()) throw timeoutError(id, ms);
      if ((e as Error).name === 'AbortError') throw e;
      throw new Error(
        `Couldn't reach ${cfg.baseUrl}. Check the URL and your connection. For Ollama, allow this page with OLLAMA_ORIGINS; for LM Studio, enable CORS in its server settings.`,
      );
    }
    if (!res.ok) {
      let detail = '';
      try {
        const body = await res.json();
        detail = body?.error?.message ?? body?.message ?? JSON.stringify(body);
      } catch {
        detail = res.statusText;
      }
      const err = new Error(
        `${res.status === 401 ? 'The API key was rejected' : `Request failed (${res.status})`}: ${detail}`,
      );
      (err as Error & { status?: number }).status = res.status;
      throw err;
    }
    try {
      return await res.json();
    } catch (e) {
      if (limit.timedOut()) throw timeoutError(id, ms);
      throw e;
    }
  } finally {
    limit.done();
  }
}

/** Lists the models the provider offers to this key, for the settings dropdown and as a connection test. */
export async function listModels(id: ProviderId, cfg: ProviderSettings): Promise<string[]> {
  if (PROVIDERS[id].kind === 'anthropic') {
    const { Anthropic, client } = await anthropicClient(cfg);
    try {
      const ids: string[] = [];
      for await (const m of client.models.list()) ids.push(m.id);
      return ids;
    } catch (e) {
      if (e instanceof Anthropic.AuthenticationError) throw new Error('The API key was rejected by Anthropic.');
      if (e instanceof Anthropic.APIConnectionError)
        throw new Error("Couldn't reach Anthropic. Check your connection.");
      throw e;
    }
  }
  // Listing models is quick; a server that doesn't answer in 20 seconds isn't running.
  const body = await openaiFetch(id, cfg, '/models', {}, 20_000);
  const list: { id?: string; name?: string }[] = body?.data ?? body?.models ?? [];
  return list
    .map((m) => (m.id ?? m.name ?? '').replace(/^models\//, ''))
    .filter(Boolean)
    .sort();
}

// ---------------------------------------------------------------- Prompt

/** Models that accept the server-side refusal fallback. */
const FALLBACK_MODELS = new Set(['claude-fable-5-1', 'claude-opus-5-5', 'claude-opus-5', 'claude-sonnet-5-5']);

function systemPrompt(p: Project): string {
  const cats = p.categories.map((c) => `- ${c.id}: ${c.name}`).join('\n');
  return `You are a first assistant director doing a script breakdown for production planning.

For each scene, list every element that has to be cast, built, bought, rented, prepared or scheduled for the shoot:
characters and talent, background actors, stunts, animals, vehicles, props, set dressing, wardrobe, makeup and hair,
special and visual effects, special equipment, sound, music, and production notes.

Read like a producer: include what the action implies even when it is not named (someone "pours a drink" needs a
bottle and glasses; a character "arrives soaked" needs wet wardrobe and maybe rain). Flag in the "notes" category
anything that puts the schedule or budget at risk: dependence on natural light (dawn, dusk, magic hour), night
exteriors, children, animals, water, crowds, stunts, weapons, slow motion or technically complex shots, and the
key shot of the scene if there is one.

Rules:
- Use only these category ids:
${cats}
- Name elements briefly, in the language of the script. Write character names in capitals exactly as the script does.
- "quote" is a short exact phrase from the scene that justifies the element.
- Skip anything listed as already tagged or rejected for that scene.
- Only list what the scene needs; do not invent story.
- Answer only with JSON: {"scenes":[{"scene":"<key>","elements":[{"category":"<id>","name":"...","quote":"..."}]}]}`;
}

function sceneText(s: Sheet, key: string, p: Project): string {
  const els = new Map(p.elements.map((e) => [e.id, e]));
  const tagged = s.tags
    .map((t) => els.get(t.elementId))
    .filter(Boolean)
    .map((e) => `${e!.categoryId}: ${e!.name}`);
  const rejected = s.rejected
    .map((id) => els.get(id))
    .filter(Boolean)
    .map((e) => `${e!.categoryId}: ${e!.name}`);
  const body = s.script
    .map((x) =>
      x.t === 'Character' ? `\n${x.x.toUpperCase()}` : x.t === 'Dialogue' || x.t === 'Parenthetical' ? `  ${x.x}` : x.x,
    )
    .join('\n')
    .trim();
  return [
    `### SCENE key=${key} (scene ${s.scenes || '?'}, ${s.pages ? `${s.pages}/8 pages` : 'length unknown'})`,
    s.heading || [s.intExt, s.set, s.dayNight].filter(Boolean).join(' '),
    s.synopsis && `Synopsis: ${s.synopsis}`,
    body || '(no script text)',
    tagged.length ? `Already tagged: ${tagged.join('; ')}` : '',
    rejected.length ? `Rejected, do not suggest: ${rejected.join('; ')}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

interface Batch {
  keys: Map<string, string>;
  text: string;
}

function makeBatches(p: Project, sheetIds: string[], provider: ProviderId | null): Batch[] {
  const limit = batchLimits(provider);
  const batches: Batch[] = [];
  let cur: Batch = { keys: new Map(), text: '' };
  p.sheets
    .filter((s) => sheetIds.includes(s.id))
    .forEach((s, i) => {
      const key = `s${i + 1}`;
      const text = sceneText(s, key, p);
      if (cur.keys.size && (cur.keys.size >= limit.scenes || cur.text.length + text.length > limit.chars)) {
        batches.push(cur);
        cur = { keys: new Map(), text: '' };
      }
      cur.keys.set(key, s.id);
      cur.text += `${text}\n\n`;
    });
  if (cur.keys.size) batches.push(cur);
  return batches;
}

/** Rough size of a run, shown before the user starts it (about 4 characters per token). */
export function estimateRun(p: Project, sheetIds: string[], provider: ProviderId | null) {
  const batches = makeBatches(p, sheetIds, provider);
  const chars = batches.reduce((n, b) => n + b.text.length + systemPrompt(p).length, 0);
  return { requests: batches.length, inputTokens: Math.round(chars / 4) };
}

function outputSchema(p: Project) {
  return {
    type: 'object',
    properties: {
      scenes: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            scene: { type: 'string' },
            elements: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  category: { type: 'string', enum: p.categories.map((c) => c.id) },
                  name: { type: 'string' },
                  quote: { type: 'string' },
                },
                required: ['category', 'name', 'quote'],
                additionalProperties: false,
              },
            },
          },
          required: ['scene', 'elements'],
          additionalProperties: false,
        },
      },
    },
    required: ['scenes'],
    additionalProperties: false,
  };
}

// ---------------------------------------------------------------- Calls

interface Ask {
  system: string;
  user: string;
  schema: { [key: string]: unknown };
  /** What the request does, for error messages ("break down these scenes"). */
  task: string;
}

async function askAnthropic(cfg: ProviderSettings, ask: Ask, signal: AbortSignal): Promise<string> {
  const { Anthropic, client } = await anthropicClient(cfg);
  const model = cfg.model.trim();
  const base = {
    model,
    max_tokens: 16000,
    system: ask.system,
    messages: [{ role: 'user' as const, content: ask.user }],
  };
  const structured = {
    output_config: { effort: 'medium' as const, format: { type: 'json_schema' as const, schema: ask.schema } },
  };
  const fallback = FALLBACK_MODELS.has(model)
    ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const }
    : {};
  try {
    let res;
    try {
      res = await client.beta.messages.create({ ...base, ...structured, ...fallback }, { signal });
    } catch (e) {
      // Older models don't take effort or structured outputs: retry with the plain request.
      if (!(e instanceof Anthropic.BadRequestError)) throw e;
      res = await client.beta.messages.create({ ...base, ...fallback }, { signal });
    }
    if (res.stop_reason === 'refusal') throw new Error(`Claude declined to ${ask.task}.`);
    if (res.stop_reason === 'max_tokens') throw new Error(CUT_OFF);
    return res.content.map((b) => (b.type === 'text' ? b.text : '')).join('');
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) throw new Error('The API key was rejected by Anthropic.');
    if (e instanceof Anthropic.PermissionDeniedError) throw new Error(`This key can't use ${model}.`);
    if (e instanceof Anthropic.NotFoundError)
      throw new Error(`Model “${model}” wasn't found. Pick another in AI settings.`);
    if (e instanceof Anthropic.RateLimitError)
      throw new Error('Anthropic rate limit reached. Wait a minute and try again.');
    if (e instanceof Anthropic.APIConnectionTimeoutError) throw timeoutError('anthropic', timeoutMs('anthropic'));
    if (e instanceof Anthropic.APIConnectionError) throw new Error("Couldn't reach Anthropic. Check your connection.");
    throw e;
  }
}

async function askOpenAI(id: ProviderId, cfg: ProviderSettings, ask: Ask, signal: AbortSignal): Promise<string> {
  const body = {
    model: cfg.model.trim(),
    messages: [
      { role: 'system', content: ask.system },
      { role: 'user', content: ask.user },
    ],
  };
  const call = (extra: object) =>
    openaiFetch(id, cfg, '/chat/completions', { method: 'POST', body: JSON.stringify({ ...body, ...extra }), signal });
  let res;
  try {
    res = await call({ response_format: { type: 'json_object' } });
  } catch (e) {
    // Some local servers don't support JSON mode; the prompt already asks for JSON.
    if ((e as { status?: number }).status !== 400) throw e;
    res = await call({});
  }
  const choice = res?.choices?.[0];
  // A cut-off answer is half a JSON document: say so instead of reporting a malformed breakdown.
  if (choice?.finish_reason === 'length') throw new Error(CUT_OFF);
  return choice?.message?.content ?? '';
}

const ask = (id: ProviderId, cfg: ProviderSettings, a: Ask, signal: AbortSignal) =>
  PROVIDERS[id].kind === 'anthropic' ? askAnthropic(cfg, a, signal) : askOpenAI(id, cfg, a, signal);

/** Pulls the JSON object out of a reply, tolerating code fences or text around it. */
function parseReply<T>(text: string): T {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('The model did not return a breakdown.');
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    throw new Error('The model returned a malformed breakdown. Try again or pick another model.');
  }
}

export interface RunProgress {
  done: number;
  total: number;
  suggestions: Suggestion[];
}

/**
 * Breaks down the given scenes in batches. Each batch's suggestions are passed to
 * onBatch as soon as they arrive, so stopping halfway keeps what was already received.
 */
export async function runAIBreakdown(
  p: Project,
  sheetIds: string[],
  s: AISettings,
  onBatch: (progress: RunProgress) => void,
  signal: AbortSignal,
): Promise<void> {
  const problem = aiUnavailable(s);
  if (problem) throw new Error(problem);
  const id = s.provider!;
  const cfg = providerSettings(s, id);
  const by = `AI · ${PROVIDERS[id].label.replace(/ \(.*\)$/, '')} ${cfg.model}`;
  const cats = new Set(p.categories.map((c) => c.id));
  const batches = makeBatches(p, sheetIds, id);
  for (let i = 0; i < batches.length; i++) {
    if (signal.aborted) return;
    const b = batches[i];
    const reply = await ask(
      id,
      cfg,
      {
        system: systemPrompt(p),
        user: `Break down these scenes.\n\n${b.text}`,
        schema: outputSchema(p),
        task: 'break down these scenes',
      },
      signal,
    );
    const suggestions: Suggestion[] = [];
    type Reply = { scenes?: { scene?: string; elements?: { category?: string; name?: string; quote?: string }[] }[] };
    for (const sc of parseReply<Reply>(reply).scenes ?? []) {
      const sheetId = b.keys.get(String(sc.scene ?? '').replace(/^key=/, ''));
      if (!sheetId) continue;
      for (const el of sc.elements ?? []) {
        const name = String(el.name ?? '').trim();
        const category = String(el.category ?? '').trim();
        if (!name || name.length > 60 || !cats.has(category)) continue;
        suggestions.push({ sheetId, categoryId: category, name, quote: String(el.quote ?? '').slice(0, 200), by });
      }
    }
    onBatch({ done: i + 1, total: batches.length, suggestions });
  }
}

// ---------------------------------------------------------------- Briefs

/** A scene proposed from a creative brief, treatment or script without scene headings. */
export interface BriefScene {
  number: string;
  intExt: string;
  set: string;
  dayNight: string;
  synopsis: string;
  /** The scene's action as the brief describes it; becomes the scene's script text. */
  description: string;
  characters: string[];
  keyShot: string;
  /** Estimated on-screen seconds, 0 when the brief gives no hint. */
  seconds: number;
  risks: string[];
}

// Follows the breakdown step of the user's filmmaker skill: locations, scenes per location,
// talent per scene, key shots, and technically complex or light-dependent shots.
const BRIEF_PROMPT = `You are a director-producer with ten years in branded content, commercials, music videos and short films.
Your strength is production efficiency: reading a brief fast and seeing what it costs in time and money.

You receive a creative brief, treatment or script that has no scene headings. Break it down into the scenes a
production would actually shoot. Before writing anything, identify:
- the distinct locations,
- the scenes at each location,
- the characters and talent in each scene,
- product shots or KEY SHOTS, explicit or implied,
- technically complex shots: slow motion, macro, oners, drone, water, and anything that depends on natural light.

List the scenes in the order of the piece (edit order), one entry per scene:
- number: "1", "2"… or the brief's own numbering if it has one.
- intExt: "INT", "EXT" or "INT/EXT"; "" if the brief gives no way to tell.
- set: a short location name in capitals, in the brief's language.
- dayNight: "DAY", "NIGHT", "DAWN", "DUSK" (or the brief's own word, in capitals); "" if not stated or implied.
- synopsis: one sentence.
- description: the action of the scene as the brief describes it, in the brief's language. Reuse the brief's words
  where possible; do not invent story.
- characters: the people on camera, in capitals, as the brief names them; unnamed people by role ("MUJER 30s").
  A product is not a character.
- keyShot: the shot this scene cannot lose (product or hero shot), or "".
- seconds: on-screen duration if the brief gives or clearly implies one, otherwise 0.
- risks: short production alerts for this scene (natural light, slow motion, water, children, animals, stunts,
  drone, crowd, night exterior…), or an empty list.

Only propose scenes the text supports. If the brief is mostly mood or tone, propose the fewest scenes it implies.
Answer only with JSON: {"scenes":[{"number":"1","intExt":"EXT","set":"…","dayNight":"DAY","synopsis":"…",
"description":"…","characters":["…"],"keyShot":"…","seconds":0,"risks":["…"]}]}`;

const BRIEF_SCHEMA = {
  type: 'object',
  properties: {
    scenes: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          number: { type: 'string' },
          intExt: { type: 'string' },
          set: { type: 'string' },
          dayNight: { type: 'string' },
          synopsis: { type: 'string' },
          description: { type: 'string' },
          characters: { type: 'array', items: { type: 'string' } },
          keyShot: { type: 'string' },
          seconds: { type: 'number' },
          risks: { type: 'array', items: { type: 'string' } },
        },
        required: [
          'number',
          'intExt',
          'set',
          'dayNight',
          'synopsis',
          'description',
          'characters',
          'keyShot',
          'seconds',
          'risks',
        ],
        additionalProperties: false,
      },
    },
  },
  required: ['scenes'],
  additionalProperties: false,
};

export function estimateBrief(text: string) {
  return { inputTokens: Math.round((text.length + BRIEF_PROMPT.length) / 4) };
}

const clean = (v: unknown, max: number) =>
  String(v ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
const cleanList = (v: unknown, max: number, count: number) =>
  (Array.isArray(v) ? v : [])
    .map((x) => clean(x, max))
    .filter(Boolean)
    .slice(0, count);

/** Asks the chosen AI to turn a brief into proposed scenes. Returns them with a label of who proposed them. */
export async function breakdownBrief(
  text: string,
  s: AISettings,
  signal: AbortSignal,
): Promise<{ scenes: BriefScene[]; by: string }> {
  const problem = aiUnavailable(s);
  if (problem) throw new Error(problem);
  if (text.length > briefMaxChars(s))
    throw new Error(
      `This text is too long to send in one request (${Math.round(text.length / 1000)}k characters). Split it into parts.`,
    );
  const id = s.provider!;
  const cfg = providerSettings(s, id);
  const reply = await ask(
    id,
    cfg,
    {
      system: BRIEF_PROMPT,
      user: `Break down this brief.\n\n${text}`,
      schema: BRIEF_SCHEMA,
      task: 'break down this brief',
    },
    signal,
  );
  type Raw = Partial<Record<keyof BriefScene, unknown>>;
  const raw = parseReply<{ scenes?: Raw[] }>(reply).scenes ?? [];
  const scenes = raw
    .slice(0, 300)
    .map((sc, i) => {
      const ie = clean(sc.intExt, 10).toUpperCase().replace(/\.$/, '');
      const seconds = Number(sc.seconds);
      return {
        number: clean(sc.number, 10) || String(i + 1),
        intExt: /INT.*EXT|EXT.*INT|I\/E/.test(ie)
          ? 'INT/EXT'
          : ie.startsWith('INT')
            ? 'INT'
            : ie.startsWith('EXT')
              ? 'EXT'
              : '',
        set: clean(sc.set, 80).toUpperCase(),
        dayNight: clean(sc.dayNight, 20).toUpperCase(),
        synopsis: clean(sc.synopsis, 300),
        description: String(sc.description ?? '')
          .trim()
          .slice(0, 4000),
        characters: cleanList(sc.characters, 40, 30).map((c) => c.toUpperCase()),
        keyShot: clean(sc.keyShot, 120),
        seconds: Number.isFinite(seconds) && seconds > 0 ? Math.min(Math.round(seconds), 3600) : 0,
        risks: cleanList(sc.risks, 80, 10),
      };
    })
    .filter((sc) => sc.set || sc.synopsis || sc.description);
  if (!scenes.length) throw new Error('The AI found no scenes in this text.');
  return { scenes, by: `AI · ${PROVIDERS[id].label.replace(/ \(.*\)$/, '')} ${cfg.model}` };
}

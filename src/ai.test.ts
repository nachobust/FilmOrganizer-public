import { afterEach, describe, expect, it, vi } from 'vitest';
import { briefMaxChars, estimateRun, runAIBreakdown, storedAISettings, type AISettings } from './ai';
import { newProject, newSheet, type Project } from './model';

function projectWithScenes(n: number): Project {
  return {
    ...newProject('AI test'),
    sheets: Array.from({ length: n }, (_, i) =>
      newSheet({
        heading: `INT. ROOM ${i + 1} - DAY`,
        script: [{ t: 'Action', x: 'MARTA opens a drawer and takes out an old lantern. '.repeat(20) }],
      }),
    ),
  };
}

const ollama: AISettings = {
  provider: 'ollama',
  providers: { ollama: { apiKey: '', model: 'llama3', baseUrl: 'http://localhost:11434/v1' } },
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('request sizes', () => {
  it('sends local models smaller batches than cloud providers', () => {
    const p = projectWithScenes(12);
    const ids = p.sheets.map((s) => s.id);
    expect(estimateRun(p, ids, 'anthropic').requests).toBe(1);
    expect(estimateRun(p, ids, 'ollama').requests).toBeGreaterThanOrEqual(3);
  });

  it('allows shorter briefs for local models', () => {
    expect(briefMaxChars(ollama)).toBeLessThan(briefMaxChars({ provider: 'openai', providers: {} }));
  });
});

describe('API keys', () => {
  it('leaves out keys the user chose not to remember', () => {
    const s: AISettings = {
      provider: 'openai',
      providers: {
        openai: { apiKey: 'sk-secret', model: 'gpt', baseUrl: 'https://api.openai.com/v1', rememberKey: false },
        gemini: { apiKey: 'kept', model: 'g', baseUrl: 'https://example.com', rememberKey: true },
      },
    };
    const stored = storedAISettings(s);
    expect(stored.providers.openai!.apiKey).toBe('');
    expect(stored.providers.gemini!.apiKey).toBe('kept');
    expect(s.providers.openai!.apiKey).toBe('sk-secret');
  });
});

describe('AI answers', () => {
  it('reports a cut-off answer instead of a malformed breakdown', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ choices: [{ finish_reason: 'length', message: { content: '{"scenes":[{"scene":"s1",' } }] }),
      })),
    );
    const p = projectWithScenes(1);
    await expect(
      runAIBreakdown(p, [p.sheets[0].id], ollama, () => {}, new AbortController().signal),
    ).rejects.toThrow(/cut off/);
  });

  it('gives up on a server that never answers, with a clear message', async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url: string, init: RequestInit) =>
          new Promise((_, reject) =>
            init.signal!.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError'))),
          ),
      ),
    );
    const p = projectWithScenes(1);
    const run = runAIBreakdown(p, [p.sheets[0].id], ollama, () => {}, new AbortController().signal);
    const check = expect(run).rejects.toThrow(/No answer from Ollama/);
    await vi.advanceTimersByTimeAsync(10 * 60_000 + 1);
    await check;
  });

  it('stopping a run is not reported as a timeout', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url: string, init: RequestInit) =>
          new Promise((_, reject) =>
            init.signal!.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError'))),
          ),
      ),
    );
    const p = projectWithScenes(1);
    const ctrl = new AbortController();
    const run = runAIBreakdown(p, [p.sheets[0].id], ollama, () => {}, ctrl.signal);
    ctrl.abort();
    await expect(run).rejects.toMatchObject({ name: 'AbortError' });
  });
});

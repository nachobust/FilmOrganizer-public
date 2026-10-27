import { describe, expect, it } from 'vitest';
import { newProject, newSheet, type Project } from './model';
import { estimateScriptDays, ruleSuggestions, runRules } from './rules';

function sampleProject(): Project {
  const scene = (heading: string, intExt: string, set: string, dayNight: string, action: string) =>
    newSheet({
      heading,
      intExt,
      set,
      dayNight,
      script: [
        { t: 'Scene Heading', x: heading },
        { t: 'Action', x: action },
      ],
    });
  return {
    ...newProject('Rules test'),
    sheets: [
      scene(
        'EXT. CLIFFTOP LIGHTHOUSE - NIGHT',
        'EXT',
        'CLIFFTOP LIGHTHOUSE',
        'NIGHT',
        'MARTA (60s), in a yellow oilskin coat, climbs the path with her sheepdog and a lantern. Rain lashes the rocks.',
      ),
      scene(
        'INT. LIGHTHOUSE - KITCHEN - DAY',
        'INT',
        'LIGHTHOUSE - KITCHEN',
        'DAY',
        'MARTA pours coffee. A boy, TOMÁS (10), drives a toy truck across the table.',
      ),
    ],
  };
}

describe('rule-based breakdown', () => {
  it('is deterministic: the same script gives the same suggestions', () => {
    const p = sampleProject();
    const a = ruleSuggestions(p);
    const b = ruleSuggestions(structuredClone(p));
    expect(a.length).toBeGreaterThan(0);
    expect(b).toEqual(a);
  });

  it('only suggests categories the project has, each with a quote and the rule that made it', () => {
    const p = sampleProject();
    const cats = new Set(p.categories.map((c) => c.id));
    for (const s of ruleSuggestions(p)) {
      expect(cats.has(s.categoryId)).toBe(true);
      expect(s.name.trim()).not.toBe('');
      expect(s.by.trim()).not.toBe('');
    }
  });

  it('adds rule results as suggestions, never as confirmed tags', () => {
    const { project } = runRules(sampleProject());
    const tags = project.sheets.flatMap((s) => s.tags);
    expect(tags.length).toBeGreaterThan(0);
    expect(tags.every((t) => t.state === 'suggested' && t.source === 'rules')).toBe(true);
  });

  it('running the rules twice adds nothing new', () => {
    const once = runRules(sampleProject()).project;
    const twice = runRules(once);
    expect(twice.added).toBe(0);
    expect(twice.project.sheets.flatMap((s) => s.tags)).toEqual(once.sheets.flatMap((s) => s.tags));
  });
});

describe('estimateScriptDays', () => {
  it('starts a new story day after a night scene is followed by a day scene', () => {
    const { project } = estimateScriptDays(sampleProject());
    expect(project.sheets.map((s) => s.scriptDay)).toEqual(['D1', 'D2']);
  });

  it('keeps script days the user typed', () => {
    const p = sampleProject();
    p.sheets[1].scriptDay = 'D7';
    const { project, filled } = estimateScriptDays(p);
    expect(filled).toBe(1);
    expect(project.sheets[1].scriptDay).toBe('D7');
  });
});

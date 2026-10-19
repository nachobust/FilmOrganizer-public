// Rule-based breakdown: reads the script with fixed rules (no AI, works offline) and
// returns suggestions. The same script always gives the same suggestions, and each one
// carries the script text and the rule that produced it.

import { type Project, type Sheet } from './model';
import { CAPS_STOPWORDS, CATEGORY_TERMS, NAME_TITLES, RISK_TERMS, type DictEntry } from './rules-dictionary';
import { reducer } from './store';

export interface Suggestion {
  sheetId: string;
  categoryId: string;
  name: string;
  quote: string;
  by: string;
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Paragraph types that describe what is on screen (dialogue is what people say, not what is there). */
const DESCRIPTIVE = new Set(['Action', 'General', 'Shot', 'Scene Heading']);

/** Heading plus action text of a scene, split into sentences for quoting. */
function sentences(sheet: Sheet): string[] {
  const blocks = [
    sheet.heading || [sheet.intExt, sheet.set, sheet.dayNight].join(' '),
    ...sheet.script.filter((p) => DESCRIPTIVE.has(p.t)).map((p) => p.x),
  ];
  return blocks
    .flatMap((b) => b.split(/(?<=[.!?])\s+|\n+/))
    .map((s) => s.trim())
    .filter(Boolean);
}

const clip = (s: string) => (s.length > 160 ? `${s.slice(0, 157)}…` : s);

interface Matcher {
  re: RegExp;
  /** Lowercase term → the entry it belongs to. */
  entryOf: Map<string, DictEntry>;
}

/** One regex per category: longest terms first, optional plural ending, Unicode word boundaries. */
function buildMatcher(entries: DictEntry[]): Matcher {
  const entryOf = new Map<string, DictEntry>();
  for (const e of entries) for (const t of e.terms) if (!entryOf.has(t.toLowerCase())) entryOf.set(t.toLowerCase(), e);
  const terms = [...entryOf.keys()].sort((a, b) => b.length - a.length).map(escapeRe);
  return { re: new RegExp(`(?<![\\p{L}\\p{N}])(${terms.join('|')})(?:es|s)?(?![\\p{L}\\p{N}])`, 'giu'), entryOf };
}

const MATCHERS = Object.fromEntries(
  Object.entries(CATEGORY_TERMS).map(([cat, entries]) => [cat, buildMatcher(entries)]),
);
const RISK_MATCHER = buildMatcher(RISK_TERMS);

/** Cast names as they may appear in action lines: the full name, and the name without a title. */
function castPatterns(names: string[]): { re: RegExp; nameOf: Map<string, string> } | null {
  const nameOf = new Map<string, string>();
  for (const name of names) {
    if (name.length < 2 || /\b(VOICE|V\.O|NARRATOR|ANNOUNCER|VOZ)\b/.test(name)) continue;
    nameOf.set(name.toLowerCase(), name);
    const words = name.split(/\s+/);
    if (words.length > 1 && NAME_TITLES.has(words[0])) {
      const rest = words.slice(1).join(' ');
      if (rest.length > 2 && !nameOf.has(rest.toLowerCase())) nameOf.set(rest.toLowerCase(), name);
    }
  }
  if (!nameOf.size) return null;
  const alts = [...nameOf.keys()].sort((a, b) => b.length - a.length).map(escapeRe);
  return { re: new RegExp(`(?<![\\p{L}\\p{N}])(${alts.join('|')})(?![\\p{L}\\p{N}])`, 'giu'), nameOf };
}

/** Characters introduced in capitals with an age, the screenplay convention: "MARTA (60s)", "TOMÁS, 30". */
const INTRO_RE =
  /(?<![\p{L}\p{N}])(\p{Lu}[\p{Lu}'’.-]*(?:\s+\p{Lu}[\p{Lu}'’.-]*){0,3})\s*(?:\(\s*(?:\d{1,2}s?|early|mid|late)[^)]*\)|,\s*\d{1,2}\b)/gu;

export function ruleSuggestions(p: Project, sheetIds?: string[]): Suggestion[] {
  const out: Suggestion[] = [];
  const target = sheetIds ? p.sheets.filter((s) => sheetIds.includes(s.id)) : p.sheets;
  const els = new Map(p.elements.map((e) => [e.id, e]));
  const castNames = p.elements.filter((e) => e.categoryId === 'cast').map((e) => e.name);
  const introduced = new Set<string>();
  // Pass 1: characters introduced with an age anywhere in the script join the cast list.
  for (const s of p.sheets)
    for (const sentence of sentences(s))
      for (const m of sentence.matchAll(INTRO_RE)) {
        const name = m[1].trim().replace(/[.,]$/, '');
        if (name.length > 1 && !name.split(/\s+/).every((w) => CAPS_STOPWORDS.has(w)))
          introduced.add(name.toUpperCase());
      }
  const cast = castPatterns([...new Set([...castNames, ...introduced])]);

  // Elements the user confirmed somewhere are looked for in every other scene.
  const confirmed = new Map<string, { categoryId: string; name: string }>();
  for (const s of p.sheets)
    for (const t of s.tags) {
      const el = els.get(t.elementId);
      if (t.state === 'confirmed' && el && el.categoryId !== 'cast' && el.categoryId !== 'notes' && el.name.length >= 3)
        confirmed.set(el.id, { categoryId: el.categoryId, name: el.name });
    }
  const propagation = confirmed.size
    ? {
        re: new RegExp(
          `(?<![\\p{L}\\p{N}])(${[...confirmed.values()]
            .map((c) => escapeRe(c.name.toLowerCase()))
            .sort((a, b) => b.length - a.length)
            .join('|')})(?:es|s)?(?![\\p{L}\\p{N}])`,
          'giu',
        ),
        byName: new Map([...confirmed.values()].map((c) => [c.name.toLowerCase(), c])),
      }
    : null;

  for (const s of target) {
    const seen = new Set<string>();
    const add = (categoryId: string, name: string, quote: string, by: string) => {
      const key = `${categoryId}:${name.toLowerCase()}`;
      if (seen.has(key)) return;
      seen.add(key);
      out.push({ sheetId: s.id, categoryId, name, quote: clip(quote), by });
    };
    const text = sentences(s);

    text.forEach((sentence, i) => {
      // The heading names the set: only vehicles ("INT. CAR") and risks are read from it.
      const isHeading = i === 0;
      if (cast && !isHeading)
        for (const m of sentence.matchAll(cast.re)) {
          const name = cast.nameOf.get(m[1].toLowerCase())!;
          add(
            'cast',
            name,
            sentence,
            introduced.has(name) && !castNames.includes(name)
              ? 'Character introduced in capitals'
              : `Name “${m[1]}” in the action`,
          );
        }
      for (const [categoryId, matcher] of Object.entries(MATCHERS))
        if (!isHeading || categoryId === 'vehicles')
          for (const m of sentence.matchAll(matcher.re)) {
            const term = m[1].toLowerCase();
            const entry = matcher.entryOf.get(term)!;
            add(categoryId, entry.label ?? capitalize(term), sentence, `Keyword “${m[0]}”`);
            if (categoryId === 'animals') add('wrangler', 'Animal wrangler', sentence, `Animal in scene (“${m[0]}”)`);
          }
      for (const m of sentence.matchAll(RISK_MATCHER.re))
        add('notes', RISK_MATCHER.entryOf.get(m[1].toLowerCase())!.label!, sentence, `Keyword “${m[0]}”`);
      if (propagation && !isHeading)
        for (const m of sentence.matchAll(propagation.re)) {
          const c = propagation.byName.get(m[1].toLowerCase());
          if (c) add(c.categoryId, c.name, sentence, `“${c.name}” is tagged in another scene`);
        }
    });

    // Risks read from the sheet fields.
    const heading = text[0] ?? '';
    if (s.intExt.includes('EXT') && /NIGHT|NOCHE/i.test(s.dayNight))
      add('notes', 'Risk: night exterior', heading, 'EXT + NIGHT in the heading');
    if (s.pages >= 24) add('notes', 'Risk: long scene (3+ pages)', heading, 'Page count');
  }
  return out;
}

/** Adds suggestions as pending chips. Existing tags and rejected elements are left alone. */
export function applySuggestions(
  p: Project,
  suggestions: Suggestion[],
  source: 'rules' | 'ai',
): { project: Project; added: number } {
  let next = p;
  let added = 0;
  for (const s of suggestions) {
    const before = next;
    next = reducer(next, {
      type: 'addTag',
      sheetId: s.sheetId,
      categoryId: s.categoryId,
      name: s.name,
      state: 'suggested',
      source,
      quote: s.quote,
      by: s.by,
    });
    if (next.sheets !== before.sheets) added++;
  }
  return { project: next, added };
}

const NEW_DAY_RE =
  /\b(NEXT DAY|NEXT MORNING|THE NEXT|DAYS LATER|DÍA SIGUIENTE|DIA SIGUIENTE|A LA MAÑANA SIGUIENTE|AL DÍA SIGUIENTE|DÍAS DESPUÉS)\b/i;
const timeOf = (dn: string) =>
  /NIGHT|NOCHE|EVENING|DUSK|ANOCHECER|SUNSET/i.test(dn)
    ? 'night'
    : /DAWN|MORNING|SUNRISE|AMANECER|MAÑANA|MADRUGADA/i.test(dn)
      ? 'morning'
      : /CONTINUOUS|CONTINUO|LATER|MÁS TARDE|SAME|MOMENTS/i.test(dn)
        ? 'same'
        : dn
          ? 'day'
          : 'same';

/**
 * Estimates story days in script order: a new day starts after a night scene is followed
 * by a day or morning scene, or when the script says so ("NEXT DAY", "AL DÍA SIGUIENTE").
 * Only empty Script Day fields are filled, so values typed by the user are kept.
 */
export function estimateScriptDays(p: Project): { project: Project; filled: number } {
  let day = 1;
  let prev = '';
  let filled = 0;
  const sheets = p.sheets.map((s, i) => {
    const t = timeOf(s.dayNight);
    const said = NEW_DAY_RE.test(
      `${s.heading} ${s.dayNight} ${s.script
        .slice(0, 2)
        .map((x) => x.x)
        .join(' ')}`,
    );
    if (i > 0 && (said || (prev === 'night' && (t === 'morning' || t === 'day')))) day++;
    if (t !== 'same') prev = t;
    if (s.scriptDay.trim()) return s;
    filled++;
    return { ...s, scriptDay: `D${day}` };
  });
  return { project: filled ? { ...p, sheets } : p, filled };
}

/** Rule suggestions and script days in one step; what runs after a script import. */
export function runRules(p: Project, sheetIds?: string[]): { project: Project; added: number; scenes: number } {
  const suggestions = ruleSuggestions(p, sheetIds);
  const { project, added } = applySuggestions(p, suggestions, 'rules');
  const withDays = sheetIds ? project : estimateScriptDays(project).project;
  const scenes = new Set(suggestions.map((s) => s.sheetId)).size;
  return { project: withDays, added, scenes };
}

import {
  addDays,
  newProject,
  newSchedule,
  newSheet,
  parseEighths,
  toISO,
  weekStart,
  type Project,
  type ScriptParagraph,
} from './model';
import type { BriefScene } from './ai';
import { runRules } from './rules';
import { reducer } from './store';

export interface Para {
  type: string;
  text: string;
  number?: string;
  length?: number;
  page?: string;
  summary?: string;
}

export interface ParsedScene {
  number: string;
  heading: string;
  intExt: string;
  set: string;
  dayNight: string;
  eighths: number;
  page: string;
  synopsis: string;
  script: ScriptParagraph[];
  characters: string[];
}

const LINES_PER_PAGE = 55;

export function parseHeading(raw: string) {
  const s = raw
    .trim()
    .replace(/^\.(?=[A-Za-z])/, '')
    .replace(/\s*#[^#]*#\s*$/, '');
  const m = s.match(/^(INT\.?\s*\/\s*EXT\.?|EXT\.?\s*\/\s*INT\.?|I\s*\/\s*E\.?|INT\.?|EXT\.?|EST\.?)\s+(.*)$/i);
  let intExt = '';
  let rest = s;
  if (m) {
    const prefix = m[1].toUpperCase().replace(/[.\s]/g, '');
    intExt = prefix.includes('/') ? 'INT/EXT' : prefix.startsWith('INT') ? 'INT' : 'EXT';
    rest = m[2];
  }
  const parts = rest.split(/\s+[-–—]+\s+/);
  const dayNight = parts.length > 1 ? parts.pop()!.trim().toUpperCase() : '';
  return { intExt, set: parts.join(' - ').trim().toUpperCase(), dayNight };
}

export function cleanCharacter(cue: string) {
  return cue
    .replace(/^[@]/, '')
    .replace(/\^$/, '')
    .replace(/\(.*?\)/g, '')
    .replace(/\s+CONT'?D\.?$/i, '')
    .trim()
    .toUpperCase();
}

/** Rough line count for page-length estimation (standard screenplay margins). */
function lineCount(p: Para): number {
  const rows = (width: number) =>
    p.text.split('\n').reduce((n, line) => n + Math.max(1, Math.ceil(line.length / width)), 0);
  switch (p.type) {
    case 'Scene Heading':
      return rows(58) + 2;
    case 'Character':
      return 2;
    case 'Parenthetical':
      return rows(22);
    case 'Dialogue':
      return rows(35);
    case 'Transition':
      return 2;
    default:
      return rows(58) + 1;
  }
}

export function buildScenes(paras: Para[]): ParsedScene[] {
  const scenes: ParsedScene[] = [];
  let current: ParsedScene | null = null;
  let lines = 0;
  let total = 0;
  const finish = () => {
    if (current && !current.eighths) current.eighths = Math.max(1, Math.round((lines / LINES_PER_PAGE) * 8));
  };
  for (const p of paras) {
    const n = lineCount(p);
    if (p.type === 'Scene Heading') {
      finish();
      const h = parseHeading(p.text);
      current = {
        number: p.number ?? String(scenes.length + 1),
        heading: p.text.trim().replace(/^\./, ''),
        ...h,
        eighths: p.length ?? 0,
        page: p.page ?? String(Math.floor(total / LINES_PER_PAGE) + 1),
        synopsis: p.summary ?? '',
        script: [],
        characters: [],
      };
      scenes.push(current);
      lines = n;
    } else if (current) {
      lines += n;
      current.script.push({ t: p.type, x: p.text });
      if (p.type === 'Character') {
        const name = cleanCharacter(p.text);
        if (name && !current.characters.includes(name)) current.characters.push(name);
      }
    }
    total += n;
  }
  finish();
  return scenes;
}

const textOf = (el: Element) =>
  Array.from(el.children)
    .filter((c) => c.tagName === 'Text')
    .map((c) => c.textContent ?? '')
    .join('');

export function parseFDX(xml: string): ParsedScene[] {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  if (doc.querySelector('parsererror')) throw new Error('This file is not valid Final Draft XML.');
  const content = doc.getElementsByTagName('Content')[0];
  if (!content) throw new Error('No script content found in this Final Draft file.');
  const paras: Para[] = Array.from(content.children)
    .filter((e) => e.tagName === 'Paragraph')
    .map((e) => {
      const props = e.getElementsByTagName('SceneProperties')[0];
      const summary = props?.getElementsByTagName('Summary')[0];
      return {
        type: e.getAttribute('Type') ?? 'Action',
        text: textOf(e),
        number: e.getAttribute('Number') ?? undefined,
        length: props?.getAttribute('Length') ? (parseEighths(props.getAttribute('Length')!) ?? undefined) : undefined,
        page: props?.getAttribute('Page') ?? undefined,
        summary: summary
          ? Array.from(summary.getElementsByTagName('Paragraph')).map(textOf).join(' ').trim() || undefined
          : undefined,
      };
    });
  return buildScenes(paras);
}

const HEADING_RE = /^(\.(?=[A-Za-z])|(INT|EXT|EST|INT\.?\/EXT|EXT\.?\/INT|I\/E)[.\s])/i;

/** Parses Fountain or plain-text screenplays. */
export function parseFountain(text: string): ParsedScene[] {
  let body = text.replace(/\r\n?/g, '\n').replace(/\[\[[\s\S]*?\]\]/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
  // Skip a Fountain title page (key: value block at the top).
  if (/^[A-Za-z][\w ]*:/.test(body.trimStart())) {
    const split = body.trimStart().indexOf('\n\n');
    body = split >= 0 ? body.trimStart().slice(split + 2) : body;
  }
  const lines = body.split('\n');
  const paras: Para[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i].trim();
    const prevBlank = i === 0 || lines[i - 1].trim() === '';
    const next = lines[i + 1]?.trim() ?? '';
    if (!line) {
      i++;
      continue;
    }
    const isUpper = line === line.toUpperCase() && /[A-Z]/.test(line);
    if (prevBlank && HEADING_RE.test(line) && (isUpper || line.startsWith('.'))) {
      paras.push({ type: 'Scene Heading', text: line, number: line.match(/#([^#]+)#\s*$/)?.[1] });
      i++;
    } else if (prevBlank && isUpper && /TO:$/.test(line)) {
      paras.push({ type: 'Transition', text: line });
      i++;
    } else if (prevBlank && next && ((isUpper && line.length < 40 && !/[.!?]$/.test(line)) || line.startsWith('@'))) {
      paras.push({ type: 'Character', text: line });
      i++;
      while (i < lines.length && lines[i].trim()) {
        const d = lines[i].trim();
        paras.push({ type: d.startsWith('(') ? 'Parenthetical' : 'Dialogue', text: d });
        i++;
      }
    } else {
      const block: string[] = [];
      while (i < lines.length && lines[i].trim()) block.push(lines[i++].trim());
      paras.push({ type: 'Action', text: block.join('\n').replace(/^!/, '') });
    }
  }
  return buildScenes(paras);
}

export function projectFromScenes(title: string, scenes: ParsedScene[]): Project {
  let p = newProject(title);
  p.sheets = scenes.map((s, i) =>
    newSheet({
      sheetNumber: String(i + 1),
      scenes: s.number,
      intExt: s.intExt,
      set: s.set,
      dayNight: s.dayNight,
      pages: s.eighths,
      scriptPage: s.page,
      synopsis: s.synopsis,
      heading: s.heading,
      script: s.script,
    }),
  );
  // Speaking characters arrive as suggestions for the user to confirm.
  scenes.forEach((s, i) => {
    for (const name of s.characters)
      p = reducer(p, {
        type: 'addTag',
        sheetId: p.sheets[i].id,
        categoryId: 'cast',
        name,
        state: 'suggested',
        source: 'import',
        quote: `${name} speaks in this scene`,
      });
  });
  // The offline rule-based breakdown runs straight away; its results are suggestions too.
  return runRules(p).project;
}

interface LegacyStrip {
  num?: string | number;
  loc?: string;
  io?: string;
  tod?: string;
  len?: string;
  col?: number | null;
}

/** Accepts any fraction ("4/4", "1 3/8") like the original strip board did. */
function legacyEighths(raw = ''): number {
  const s = String(raw).trim();
  let m = s.match(/^(\d+)\s+(\d+)\/(\d+)$/);
  if (m) return +m[1] * 8 + Math.round((+m[2] / +m[3]) * 8);
  m = s.match(/^(\d+)\/(\d+)$/);
  if (m) return Math.round((+m[1] / +m[2]) * 8);
  m = s.match(/^\d+(?:\.\d+)?$/);
  return m ? Math.round(parseFloat(s) * 8) : 0;
}

/**
 * Loads an export from the standalone strip board app ({scenes, dayDates}).
 * Its 7 columns are MON–SUN of one week; the week is found from any "dd/mm" date,
 * taking the next occurrence of that date from today. Scenes are matched to existing
 * sheets by scene number, and missing ones are created.
 */
export function importLegacyBoard(project: Project, data: unknown): Project | null {
  const d = data as { scenes?: LegacyStrip[]; dayDates?: string[] };
  if (!Array.isArray(d?.scenes)) return null;
  const today = new Date();
  let monday = weekStart(today);
  (d.dayDates ?? []).some((label, col) => {
    const m = String(label).match(/^(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2,4}))?$/);
    if (!m) return false;
    let year = m[3] ? Number(m[3].length === 2 ? `20${m[3]}` : m[3]) : today.getFullYear();
    let date = new Date(year, +m[2] - 1, +m[1]);
    if (!m[3] && date < addDays(today, -60)) date = new Date(++year, +m[2] - 1, +m[1]);
    monday = addDays(date, -col);
    return true;
  });

  let p: Project = { ...project, schedule: newSchedule() };
  for (const s of d.scenes) {
    const num = String(s.num ?? '').trim();
    let sheet = num ? p.sheets.find((x) => x.scenes.trim() === num) : undefined;
    if (!sheet) {
      sheet = newSheet({
        sheetNumber: String(p.sheets.length + 1),
        scenes: num,
        set: (s.loc ?? '').toUpperCase(),
        intExt: (s.io ?? '').toLowerCase().startsWith('int') ? 'INT' : 'EXT',
        dayNight: (s.tod ?? '').toUpperCase(),
        pages: legacyEighths(s.len),
      });
      p = { ...p, sheets: [...p.sheets, sheet] };
    }
    if (typeof s.col === 'number' && s.col >= 0 && s.col < 7)
      p = reducer(p, { type: 'moveStrip', sheetId: sheet.id, date: toISO(addDays(monday, s.col)) });
  }
  return p;
}

/**
 * Thrown when a file has readable text but no scene headings: most likely a creative brief,
 * treatment or script written without INT./EXT. lines. The app offers an AI breakdown for it.
 */
export class NoScenesError extends Error {
  constructor(
    readonly title: string,
    readonly text: string,
  ) {
    super(`No scene headings (INT. / EXT.) were found in “${title}”.`);
  }
}

const titleOf = (fileName: string) => fileName.replace(/\.[^.]+$/, '');
const parasText = (paras: Para[]) =>
  paras
    .map((p) => p.text.trim())
    .filter(Boolean)
    .join('\n\n');

/** Projects need scenes; text without any goes back to the caller as a possible brief. */
function scenesOrBrief(title: string, scenes: ParsedScene[], text: () => string): Project {
  if (scenes.length) return projectFromScenes(title, scenes);
  const body = text().trim();
  if (body.length < 40) throw new Error(`“${title}” has no scene headings (INT. / EXT.) and too little text to break down.`);
  throw new NoScenesError(title, body);
}

/** Opens any supported script file: Final Draft, Fountain, plain text, PDF or Word. */
export async function importScriptFile(file: File): Promise<Project> {
  const title = titleOf(file.name);
  if (/\.pdf$/i.test(file.name)) {
    const { parsePDF } = await import('./pdf-import');
    const paras = await parsePDF(await file.arrayBuffer());
    return scenesOrBrief(title, buildScenes(paras), () => parasText(paras));
  }
  if (/\.docx$/i.test(file.name)) {
    const { parseDocx } = await import('./docx-import');
    const result = await parseDocx(await file.arrayBuffer());
    if ('paras' in result) return scenesOrBrief(title, buildScenes(result.paras), () => parasText(result.paras));
    return scenesOrBrief(title, parseFountain(result.fountain), () => result.fountain);
  }
  if (/\.doc$/i.test(file.name)) throw new Error('Old Word .doc files are not supported. Open it in Word and save as .docx.');
  const text = await file.text();
  if (/\.fdx$/i.test(file.name)) {
    const scenes = parseFDX(text);
    return scenesOrBrief(title, scenes, () =>
      Array.from(new DOMParser().parseFromString(text, 'application/xml').getElementsByTagName('Paragraph'))
        .map(textOf)
        .join('\n\n'),
    );
  }
  return scenesOrBrief(title, parseFountain(text), () => text);
}

/**
 * Builds a project from scenes an AI proposed for a brief. Characters, key shots and risks
 * arrive as suggestions marked as AI, and the rule-based breakdown then reads each scene's
 * description like any script text.
 */
export function projectFromBrief(title: string, scenes: BriefScene[], by: string): Project {
  let p = newProject(title);
  p.sheets = scenes.map((sc, i) =>
    newSheet({
      sheetNumber: String(i + 1),
      scenes: sc.number,
      intExt: sc.intExt,
      set: sc.set,
      dayNight: sc.dayNight,
      synopsis: sc.synopsis,
      heading: [sc.intExt && `${sc.intExt}.`, sc.set, sc.dayNight && `- ${sc.dayNight}`].filter(Boolean).join(' '),
      // Rough length from the text, about 400 characters per eighth of a page.
      pages: Math.max(1, Math.round(sc.description.length / 400)),
      timing: sc.seconds ? `${sc.seconds}s` : '',
      script: sc.description ? [{ t: 'Action', x: sc.description }] : [],
    }),
  );
  scenes.forEach((sc, i) => {
    const sheetId = p.sheets[i].id;
    const add = (categoryId: string, name: string, quote: string) =>
      (p = reducer(p, { type: 'addTag', sheetId, categoryId, name, state: 'suggested', source: 'ai', quote, by }));
    for (const name of sc.characters) add('cast', name, 'On camera in this scene, per the brief');
    if (sc.keyShot) add('notes', `Key shot: ${sc.keyShot}`, sc.keyShot);
    for (const risk of sc.risks) add('notes', `Risk: ${risk}`, risk);
  });
  return runRules(p).project;
}

export function importScript(fileName: string, text: string): Project {
  const title = fileName.replace(/\.[^.]+$/, '');
  const scenes = /\.fdx$/i.test(fileName) ? parseFDX(text) : parseFountain(text);
  if (!scenes.length) throw new Error('No scene headings (INT. / EXT.) were found in this script.');
  return projectFromScenes(title, scenes);
}

// Reads screenplays written in Word (.docx). Three cases, from most to least reliable:
// 1. Screenplay paragraph styles ("Scene Heading", "Character", "Diálogo"…) give each type directly.
// 2. Otherwise paragraph indents are read like a PDF page (dialogue ~1" in, character cue ~2.2").
// 3. With neither, the text is read by screenplay conventions, like a Fountain file.

import type { Para } from './importers';
import { parasFromLayout, type Line } from './pdf-import';

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

/** Paragraph style names (English and Spanish) that name a screenplay element. */
const STYLE_TYPES: [RegExp, string][] = [
  [/scene\s*heading|slug|encabezado|cabecera|escena/i, 'Scene Heading'],
  [/parenthetical|acotaci|par[eé]ntesis/i, 'Parenthetical'],
  [/character|personaje/i, 'Character'],
  [/dialog|di[aá]logo/i, 'Dialogue'],
  [/transition|transici[oó]n/i, 'Transition'],
  [/action|acci[oó]n|description|descripci[oó]n|general/i, 'Action'],
];

interface WordPara {
  text: string;
  /** Left indent in points, from the paragraph or its style, plus leading tabs. */
  indent: number;
  right: boolean;
  hint?: string;
}

const attr = (el: Element | null | undefined, name: string) =>
  el?.getAttributeNS(W, name) ?? el?.getAttribute(`w:${name}`) ?? null;
const child = (el: Element | null | undefined, name: string) =>
  el ? (Array.from(el.children).find((c) => c.localName === name) ?? null) : null;

function indentOf(pPr: Element | null): number | null {
  const ind = child(pPr, 'ind');
  const left = attr(ind, 'left') ?? attr(ind, 'start');
  return left === null ? null : Number(left) / 20;
}

async function readParagraphs(data: ArrayBuffer): Promise<WordPara[]> {
  const { default: JSZip } = await import('jszip');
  let zip;
  try {
    zip = await JSZip.loadAsync(data);
  } catch {
    throw new Error('This is not a valid Word .docx file. Older .doc files must be saved as .docx first.');
  }
  const docXml = await zip.file('word/document.xml')?.async('string');
  if (!docXml) throw new Error('This Word file has no document content.');
  const parse = (xml: string) => new DOMParser().parseFromString(xml, 'application/xml');

  // Style id → { name, indent } so styled paragraphs inherit their style's indent.
  const styles = new Map<string, { name: string; indent: number | null }>();
  const stylesXml = await zip.file('word/styles.xml')?.async('string');
  if (stylesXml)
    for (const st of Array.from(parse(stylesXml).getElementsByTagNameNS(W, 'style'))) {
      const id = attr(st, 'styleId');
      if (id) styles.set(id, { name: attr(child(st, 'name'), 'val') ?? id, indent: indentOf(child(st, 'pPr')) });
    }

  const body = parse(docXml).getElementsByTagNameNS(W, 'body')[0];
  if (!body) throw new Error('This Word file has no document content.');
  const out: WordPara[] = [];
  for (const p of Array.from(body.getElementsByTagNameNS(W, 'p'))) {
    let text = '';
    let leadingTabs = 0;
    for (const node of Array.from(p.getElementsByTagNameNS(W, '*'))) {
      if (node.localName === 't') text += node.textContent ?? '';
      else if (node.localName === 'tab' && node.parentElement?.localName === 'r') {
        if (!text.trim()) leadingTabs++;
        else text += ' ';
      } else if (node.localName === 'br' || node.localName === 'cr') text += ' ';
    }
    text = text.replace(/\s+/g, ' ').trim();
    if (!text) continue;
    const pPr = child(p, 'pPr');
    const style = styles.get(attr(child(pPr, 'pStyle'), 'val') ?? '');
    const indent = (indentOf(pPr) ?? style?.indent ?? 0) + leadingTabs * 36;
    const jc = attr(child(pPr, 'jc'), 'val');
    const hint = style ? STYLE_TYPES.find(([re]) => re.test(style.name))?.[1] : undefined;
    out.push({ text, indent, right: jc === 'right' || jc === 'end', hint });
  }
  return out;
}

/** Word paragraphs as screenplay paragraphs, or as Fountain-style text when the file has no layout to go on. */
export async function parseDocx(data: ArrayBuffer): Promise<{ paras: Para[] } | { fountain: string }> {
  const word = await readParagraphs(data);
  if (!word.length) throw new Error('This Word file is empty.');
  const hinted = word.filter((w) => w.hint).length;
  const indents = new Set(word.map((w) => Math.round(w.indent / 18)));

  if (hinted >= word.length * 0.5 || indents.size > 1) {
    const base = Math.min(...word.map((w) => w.indent));
    // Each Word paragraph is one "line"; spacing them out keeps separate paragraphs separate.
    const lines: Line[] = word.map((w, i) => ({
      text: w.text,
      x: 108 + (w.right ? 324 : w.indent - base),
      pos: i * 30,
      page: 1,
      hint: hinted >= word.length * 0.5 ? w.hint : undefined,
    }));
    return { paras: parasFromLayout(lines, false) };
  }

  // No styles and no indents: rebuild Fountain text. A short line in capitals followed by
  // text is a character cue with its dialogue, so those stay together without a blank line.
  const caps = (s: string) => s === s.toUpperCase() && /\p{Lu}/u.test(s);
  const isCue = (s: string) =>
    caps(s.replace(/\(.*?\)/g, '')) && s.length < 40 && !/[.!?:]$/.test(s) && !/^(INT|EXT|I\/E|EST)[.\s/]/i.test(s);
  const blocks: string[][] = [];
  let inSpeech = false;
  let afterParen = false;
  for (const { text } of word) {
    const block = blocks[blocks.length - 1];
    // Inside a speech: the line after the cue, a parenthetical, and the line after a parenthetical.
    if (inSpeech && (block.length === 1 || afterParen || text.startsWith('('))) {
      block.push(text);
      afterParen = text.startsWith('(');
      continue;
    }
    blocks.push([text]);
    inSpeech = isCue(text);
    afterParen = false;
  }
  return { fountain: blocks.map((b) => b.join('\n')).join('\n\n') };
}

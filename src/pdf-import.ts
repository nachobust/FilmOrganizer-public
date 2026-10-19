// Reads screenplay PDFs. A screenplay's layout is standardised: scene headings and action
// sit at the left margin, dialogue about 1" further in, parentheticals ~1.5", character
// cues ~2.2" and transitions far right. Each text line is classified by its indent, and
// scene lengths are measured from where each heading sits on the page, in eighths.

import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import type { Para } from './importers';

export interface Line {
  text: string;
  /** Left edge of the line, in points. */
  x: number;
  /** Distance from the top of the first page, in points (continuous across pages). */
  pos: number;
  page: number;
  /** Paragraph type already known from the source (a Word paragraph style). */
  hint?: string;
}

/**
 * Usable text height of a US Letter screenplay page (11" minus 1" margins). Positions on
 * other paper sizes, such as A4, are scaled to it so a full page always counts as 8/8.
 */
const TEXT_HEIGHT = 648;

const NOISE = [
  /^\(?\s*(MORE|CONTINUED|CONT'D|CONT’D|CONTINÚA|CONTINUA)\s*\)?\.?:?$/i,
  /^(CONTINUED|CONTINÚA|CONTINUA)\s*:?\s*(\(\d+\))?$/i,
  /^\d+[A-Z]?\.?$/, // page numbers and lone scene numbers
  /^\*+$/, // revision marks
];

const HEADING_RE =
  /^(INT\.?\s*\/\s*EXT\.?|EXT\.?\s*\/\s*INT\.?|I\s*\/\s*E\.?|INT\.?|EXT\.?|EST\.?|INTERIOR|EXTERIOR)[\s.]/i;
const isCaps = (s: string) => s === s.toUpperCase() && /\p{Lu}/u.test(s);

async function readLines(data: ArrayBuffer): Promise<{ lines: Line[]; pages: number }> {
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  const doc = await pdfjs.getDocument({ data }).promise;
  const lines: Line[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const { height } = page.getViewport({ scale: 1 });
    const top = height - 72;
    const scale = TEXT_HEIGHT / (height - 144);
    const content = await page.getTextContent();
    // Group text pieces into rows by their baseline.
    const rows = new Map<number, { x: number; w: number; s: string }[]>();
    for (const item of content.items) {
      if (!('str' in item) || !item.str.trim()) continue;
      const y = Math.round(item.transform[5]);
      const key = [...rows.keys()].find((k) => Math.abs(k - y) <= 2) ?? y;
      if (!rows.has(key)) rows.set(key, []);
      rows.get(key)!.push({ x: item.transform[4], w: item.width, s: item.str });
    }
    for (const [y, pieces] of [...rows.entries()].sort((a, b) => b[0] - a[0])) {
      pieces.sort((a, b) => a.x - b.x);
      // A wide gap inside a row means two columns (dual dialogue, or a scene number in the margin).
      let seg = { x: pieces[0].x, end: pieces[0].x, text: '' };
      const flush = () =>
        seg.text.trim() &&
        lines.push({
          text: seg.text.replace(/\s+/g, ' ').trim(),
          x: seg.x,
          pos: (p - 1) * TEXT_HEIGHT + (top - y) * scale,
          page: p,
        });
      for (const piece of pieces) {
        const gapPts = piece.x - seg.end;
        if (seg.text && gapPts > 40) {
          flush();
          seg = { x: piece.x, end: piece.x, text: '' };
        }
        seg.text +=
          (seg.text && gapPts > 1.5 && !seg.text.endsWith(' ') && !piece.s.startsWith(' ') ? ' ' : '') + piece.s;
        seg.end = piece.x + piece.w;
      }
      flush();
    }
  }
  return { lines, pages: doc.numPages };
}

/** The left margin: the smallest indent that a fair share of lines start at. */
function leftMargin(lines: Line[]): number {
  const counts = new Map<number, number>();
  for (const l of lines) counts.set(Math.round(l.x / 3) * 3, (counts.get(Math.round(l.x / 3) * 3) ?? 0) + 1);
  const min = Math.max(3, lines.length * 0.03);
  return Math.min(...[...counts.entries()].filter(([, n]) => n >= min).map(([x]) => x));
}

export async function parsePDF(data: ArrayBuffer): Promise<Para[]> {
  const { lines } = await readLines(data);
  if (!lines.length)
    throw new Error('This PDF has no readable text. It may be a scan; export the script as a text PDF or .fdx.');
  return parasFromLayout(lines, true);
}

/**
 * Turns positioned lines into screenplay paragraphs. With `measure`, positions are real page
 * geometry and each scene's length is measured in eighths; otherwise lengths are estimated later.
 */
export function parasFromLayout(raw: Line[], measure: boolean): Para[] {
  const all = raw.filter((l) => !NOISE.some((re) => re.test(l.text)));
  const base = leftMargin(all);
  // Scene numbers printed in the margins, beside their heading on the same line.
  const marginNumber = new Map<number, string>();
  for (const l of raw) {
    const m = l.text.match(/^(\d+[A-Z]?)\.?$/);
    if (m && (l.x < base - 20 || l.x > base + 380)) marginNumber.set(Math.round(l.pos), m[1]);
  }
  const paras: (Para & { pos: number })[] = [];
  let prev: { type: string; pos: number; page: number } | null = null;
  const lineGap = 14;

  for (const l of all) {
    const dx = l.x - base;
    if (dx < -20) continue; // scene numbers in the left margin
    const text = l.text;
    const inDialogue = !!prev && ['Character', 'Parenthetical', 'Dialogue'].includes(prev.type);
    let type: string;
    if (dx < 36 || l.hint === 'Scene Heading') {
      const number = text.match(/^(\d+[A-Z]?)\s+(?=\S)/)?.[1] ?? marginNumber.get(Math.round(l.pos));
      const stripped = text.replace(/^\d+[A-Z]?\s+/, '').replace(/\s+\d+[A-Z]?\s*\*?$/, '');
      if (l.hint === 'Scene Heading' || (!l.hint && HEADING_RE.test(stripped) && isCaps(stripped))) {
        paras.push({ type: 'Scene Heading', text: stripped, number, pos: l.pos, page: String(l.page) });
        prev = { type: 'Scene Heading', pos: l.pos, page: l.page };
        continue;
      }
      type = l.hint ?? 'Action';
    } else if (l.hint) type = l.hint;
    else if (dx >= 250) type = isCaps(text) ? 'Transition' : 'Action';
    else if (dx >= 135 && isCaps(text.replace(/\(.*?\)/g, ''))) type = 'Character';
    else if (text.startsWith('(') && inDialogue) type = 'Parenthetical';
    else type = inDialogue ? 'Dialogue' : 'Action';

    const last = paras[paras.length - 1];
    const continues =
      last &&
      prev &&
      last.type === type &&
      (type === 'Action' || type === 'Dialogue' || (type === 'Parenthetical' && !last.text.endsWith(')'))) &&
      // Never across a page break: the blank line between paragraphs is dropped at the top of a page.
      prev.page === l.page &&
      l.pos - prev.pos <= lineGap * 1.4;
    if (continues) last.text += ' ' + text;
    else paras.push({ type, text, pos: l.pos });
    prev = { type, pos: l.pos, page: l.page };
  }

  // Scene length in eighths, measured on the page: heading to next heading.
  if (!measure) return paras.map(({ pos: _pos, ...p }) => p);
  const headings = paras.filter((p) => p.type === 'Scene Heading');
  const endPos = all[all.length - 1].pos + lineGap;
  headings.forEach((h, i) => {
    const next = headings[i + 1]?.pos ?? endPos;
    h.length = Math.max(1, Math.round(((next - h.pos) / TEXT_HEIGHT) * 8));
  });
  return paras.map(({ pos: _pos, ...p }) => p);
}

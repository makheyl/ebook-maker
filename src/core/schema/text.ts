import type { Paragraph, TextRun } from './types';

type Marks = Omit<TextRun, 'text'>;

function sameMarks(a: Marks, b: Marks): boolean {
  return (
    !!a.bold === !!b.bold &&
    !!a.italic === !!b.italic &&
    !!a.underline === !!b.underline &&
    (a.color ?? '') === (b.color ?? '')
  );
}

/** Plain text of a text element's content; paragraphs joined by newlines. */
export function plainText(paragraphs: readonly Paragraph[]): string {
  return paragraphs.map((p) => p.runs.map((r) => r.text).join('')).join('\n');
}

/** One unstyled run per line. */
export function paragraphsFromPlainText(text: string): Paragraph[] {
  return text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => ({ runs: [{ text: line }] }));
}

/** Merges adjacent runs that share marks and drops empty runs (keeping one per paragraph). */
export function normalizeParagraphs(paragraphs: readonly Paragraph[]): Paragraph[] {
  const out: Paragraph[] = paragraphs.map((p) => {
    const runs: TextRun[] = [];
    for (const run of p.runs) {
      if (!run.text) continue;
      const prev = runs[runs.length - 1];
      if (prev && sameMarks(prev, run)) prev.text += run.text;
      else runs.push(stripFalsyMarks({ ...run }));
    }
    return { runs: runs.length ? runs : [{ text: '' }] };
  });
  return out.length ? out : [{ runs: [{ text: '' }] }];
}

function stripFalsyMarks(run: TextRun): TextRun {
  const clean: TextRun = { text: run.text };
  if (run.bold) clean.bold = true;
  if (run.italic) clean.italic = true;
  if (run.underline) clean.underline = true;
  if (run.color) clean.color = run.color;
  return clean;
}

export function isTextEmpty(paragraphs: readonly Paragraph[]): boolean {
  return plainText(paragraphs).trim() === '';
}

import type { BubbleElement, PageElement, Paragraph, TextElement, TextRun } from './types';

/** Elements holding styled paragraphs: text boxes and speech bubbles. */
export type TextLike = TextElement | BubbleElement;

export const hasText = (el: PageElement): el is TextLike =>
  el.type === 'text' || el.type === 'bubble';

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

/**
 * Splits rich text at a plain-text offset (paragraph breaks count as one character, like
 * `plainText`). Formatting is kept on both sides.
 */
export function splitParagraphsAt(
  paragraphs: readonly Paragraph[],
  offset: number,
): [Paragraph[], Paragraph[]] {
  const before: Paragraph[] = [];
  const after: Paragraph[] = [];
  let pos = 0;
  paragraphs.forEach((p, pi) => {
    const length = p.runs.reduce((n, r) => n + r.text.length, 0);
    const start = pos;
    const end = pos + length;
    pos = end + (pi < paragraphs.length - 1 ? 1 : 0);
    if (end <= offset) {
      before.push(p);
      return;
    }
    if (start >= offset) {
      after.push(p);
      return;
    }
    const head: TextRun[] = [];
    const tail: TextRun[] = [];
    let at = start;
    for (const run of p.runs) {
      const runEnd = at + run.text.length;
      if (runEnd <= offset) head.push(run);
      else if (at >= offset) tail.push(run);
      else {
        const cut = offset - at;
        head.push({ ...run, text: run.text.slice(0, cut) });
        tail.push({ ...run, text: run.text.slice(cut) });
      }
      at = runEnd;
    }
    before.push({ runs: head });
    after.push({ runs: tail });
  });
  return [before, after];
}

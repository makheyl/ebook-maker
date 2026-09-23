import { normalizeParagraphs, type Paragraph, type TextRun } from '@/core/schema';

type Marks = Omit<TextRun, 'text'>;

const BLOCK_TAGS = new Set([
  'P',
  'DIV',
  'LI',
  'H1',
  'H2',
  'H3',
  'H4',
  'H5',
  'H6',
  'BLOCKQUOTE',
  'PRE',
]);

/**
 * Converts a contentEditable DOM subtree back into structured paragraphs/runs.
 * Only a whitelist of marks is kept (bold, italic, underline, color) — everything else a
 * browser or a paste may inject is dropped, so no HTML ever reaches the document.
 */
export function parseEditable(root: HTMLElement): Paragraph[] {
  const paragraphs: Paragraph[] = [];
  let current: TextRun[] = [];

  const endParagraph = () => {
    paragraphs.push({ runs: current });
    current = [];
  };

  const marksFor = (el: HTMLElement, inherited: Marks): Marks => {
    const marks: Marks = { ...inherited };
    const tag = el.tagName;
    const style = el.style;
    if (tag === 'B' || tag === 'STRONG') marks.bold = true;
    if (tag === 'I' || tag === 'EM') marks.italic = true;
    if (tag === 'U') marks.underline = true;
    const weight = style.fontWeight;
    if (weight === 'bold' || Number(weight) >= 600) marks.bold = true;
    if (weight === 'normal' || (Number(weight) > 0 && Number(weight) < 600)) delete marks.bold;
    if (style.fontStyle === 'italic') marks.italic = true;
    if (style.fontStyle === 'normal') delete marks.italic;
    if (
      style.textDecorationLine?.includes('underline') ||
      style.textDecoration?.includes('underline')
    ) {
      marks.underline = true;
    }
    const color = tag === 'FONT' ? el.getAttribute('color') : style.color;
    if (color && /^(#[0-9a-f]{3,8}|rgba?\([\d\s.,%]+\))$/i.test(color)) marks.color = color;
    return marks;
  };

  const walk = (node: Node, marks: Marks) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = (node.textContent ?? '').replace(/\u00a0/g, ' ').replace(/\u200b/g, '');
      if (text) current.push({ text, ...marks });
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node as HTMLElement;
    if (el.classList.contains('fl-sr-only')) return;
    if (el.tagName === 'BR') {
      // A trailing <br> inside a block is just the browser keeping an empty line open.
      const isPlaceholder =
        !el.nextSibling && el.parentElement !== root && BLOCK_TAGS.has(el.parentElement!.tagName);
      if (!isPlaceholder) endParagraph();
      return;
    }
    const isBlock = BLOCK_TAGS.has(el.tagName);
    if (isBlock && current.length) endParagraph();
    const childMarks = marksFor(el, marks);
    el.childNodes.forEach((child) => walk(child, childMarks));
    if (isBlock) endParagraph();
  };

  root.childNodes.forEach((child) => walk(child, {}));
  if (current.length || paragraphs.length === 0) endParagraph();
  return normalizeParagraphs(paragraphs);
}

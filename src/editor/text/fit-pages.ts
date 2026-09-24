import { fontStack } from '@/core/fonts/catalog';
import type { Page, PageSize, TextElement } from '@/core/schema';
import { fitText } from './fit';

/**
 * Measures every text box on generated pages with the real fonts (templates only estimate font
 * sizes) and applies each box's auto-fit rule, so new books never start with text that doesn't fit.
 */
export async function fitGeneratedText(pages: Page[], pageSize: PageSize): Promise<Page[]> {
  const fonts = new Set<string>();
  for (const page of pages) {
    for (const el of page.elements) if (el.type === 'text') fonts.add(el.style.fontFamily);
  }
  if (typeof document !== 'undefined' && document.fonts) {
    await Promise.all(
      [...fonts].map((id) => document.fonts.load(`32px ${fontStack(id)}`).catch(() => undefined)),
    );
    await document.fonts.ready;
  }
  return pages.map((page) => ({
    ...page,
    elements: page.elements.map((el) => {
      if (el.type !== 'text') return el;
      const fit = fitText(el as TextElement, pageSize);
      return { ...el, height: fit.height, style: fit.style };
    }),
  }));
}

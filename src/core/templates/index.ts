import { createPage } from '../schema/factories';
import type { AssetRef, Page, PageSize } from '../schema/types';
import { fullBleed } from './layouts/full-bleed';
import { imageTop } from './layouts/image-top';
import { sideBySide } from './layouts/side-by-side';
import { textOnly } from './layouts/text-only';
import type { LayoutTemplate, PagePalette } from './types';

export type { LayoutTemplate, LayoutInput, LayoutResult, PagePalette } from './types';

/** Quick-create layouts. To add one, create a file in layouts/ and list it here. */
export const LAYOUT_TEMPLATES: readonly LayoutTemplate[] = [
  imageTop,
  fullBleed,
  sideBySide,
  textOnly,
];

export const PALETTES: readonly PagePalette[] = [
  { id: 'paper', label: 'Paper', background: '#ffffff', text: '#1f1d2b', accent: '#367f48' },
  { id: 'cream', label: 'Cream', background: '#f7f1e3', text: '#3b2f25', accent: '#c2703d' },
  { id: 'night', label: 'Night', background: '#10222a', text: '#eef7f4', accent: '#5fb2e3' },
];

export function getTemplate(id: string): LayoutTemplate {
  return LAYOUT_TEMPLATES.find((t) => t.id === id) ?? LAYOUT_TEMPLATES[0]!;
}

export type PageSpec = { text: string; asset?: AssetRef };

/** Builds editable pages from text + image rows with a template (text-only when a row has no image). */
export function generatePages(
  rows: readonly PageSpec[],
  opts: {
    templateId: string;
    pageSize: PageSize;
    palette: PagePalette;
    fontId: string;
    animate: boolean;
  },
): Page[] {
  const template = getTemplate(opts.templateId);
  return rows.map((row) => {
    const layout = row.asset || !template.usesImage ? template : textOnly;
    const result = layout.build({ ...opts, text: row.text, asset: row.asset });
    return createPage(undefined, {
      background: result.background,
      elements: result.elements,
      animations: result.animations,
    });
  });
}

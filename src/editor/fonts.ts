import { buildFontFaceCss, FONT_CATALOG, type FontFace } from '@/core/fonts/catalog';
import inter_latin_ext_italic from '@fontsource-variable/inter/files/inter-latin-ext-wght-italic.woff2?url';
import inter_latin_ext_normal from '@fontsource-variable/inter/files/inter-latin-ext-wght-normal.woff2?url';
import inter_latin_italic from '@fontsource-variable/inter/files/inter-latin-wght-italic.woff2?url';
import inter_latin_normal from '@fontsource-variable/inter/files/inter-latin-wght-normal.woff2?url';
import montserrat_latin_ext_italic from '@fontsource-variable/montserrat/files/montserrat-latin-ext-wght-italic.woff2?url';
import montserrat_latin_ext_normal from '@fontsource-variable/montserrat/files/montserrat-latin-ext-wght-normal.woff2?url';
import montserrat_latin_italic from '@fontsource-variable/montserrat/files/montserrat-latin-wght-italic.woff2?url';
import montserrat_latin_normal from '@fontsource-variable/montserrat/files/montserrat-latin-wght-normal.woff2?url';
import nunito_latin_ext_italic from '@fontsource-variable/nunito/files/nunito-latin-ext-wght-italic.woff2?url';
import nunito_latin_ext_normal from '@fontsource-variable/nunito/files/nunito-latin-ext-wght-normal.woff2?url';
import nunito_latin_italic from '@fontsource-variable/nunito/files/nunito-latin-wght-italic.woff2?url';
import nunito_latin_normal from '@fontsource-variable/nunito/files/nunito-latin-wght-normal.woff2?url';
import fredoka_latin_ext_normal from '@fontsource-variable/fredoka/files/fredoka-latin-ext-wght-normal.woff2?url';
import fredoka_latin_normal from '@fontsource-variable/fredoka/files/fredoka-latin-wght-normal.woff2?url';
import lora_latin_ext_italic from '@fontsource-variable/lora/files/lora-latin-ext-wght-italic.woff2?url';
import lora_latin_ext_normal from '@fontsource-variable/lora/files/lora-latin-ext-wght-normal.woff2?url';
import lora_latin_italic from '@fontsource-variable/lora/files/lora-latin-wght-italic.woff2?url';
import lora_latin_normal from '@fontsource-variable/lora/files/lora-latin-wght-normal.woff2?url';
import merriweather_latin_ext_italic from '@fontsource-variable/merriweather/files/merriweather-latin-ext-wght-italic.woff2?url';
import merriweather_latin_ext_normal from '@fontsource-variable/merriweather/files/merriweather-latin-ext-wght-normal.woff2?url';
import merriweather_latin_italic from '@fontsource-variable/merriweather/files/merriweather-latin-wght-italic.woff2?url';
import merriweather_latin_normal from '@fontsource-variable/merriweather/files/merriweather-latin-wght-normal.woff2?url';
import playfair_display_latin_ext_italic from '@fontsource-variable/playfair-display/files/playfair-display-latin-ext-wght-italic.woff2?url';
import playfair_display_latin_ext_normal from '@fontsource-variable/playfair-display/files/playfair-display-latin-ext-wght-normal.woff2?url';
import playfair_display_latin_italic from '@fontsource-variable/playfair-display/files/playfair-display-latin-wght-italic.woff2?url';
import playfair_display_latin_normal from '@fontsource-variable/playfair-display/files/playfair-display-latin-wght-normal.woff2?url';
import libre_baskerville_latin_ext_italic from '@fontsource-variable/libre-baskerville/files/libre-baskerville-latin-ext-wght-italic.woff2?url';
import libre_baskerville_latin_ext_normal from '@fontsource-variable/libre-baskerville/files/libre-baskerville-latin-ext-wght-normal.woff2?url';
import libre_baskerville_latin_italic from '@fontsource-variable/libre-baskerville/files/libre-baskerville-latin-wght-italic.woff2?url';
import libre_baskerville_latin_normal from '@fontsource-variable/libre-baskerville/files/libre-baskerville-latin-wght-normal.woff2?url';
import roboto_slab_latin_ext_normal from '@fontsource-variable/roboto-slab/files/roboto-slab-latin-ext-wght-normal.woff2?url';
import roboto_slab_latin_normal from '@fontsource-variable/roboto-slab/files/roboto-slab-latin-wght-normal.woff2?url';
import caveat_latin_ext_normal from '@fontsource-variable/caveat/files/caveat-latin-ext-wght-normal.woff2?url';
import caveat_latin_normal from '@fontsource-variable/caveat/files/caveat-latin-wght-normal.woff2?url';

/**
 * Bundled woff2 files for the curated fonts (latin + latin-ext, variable weight).
 * The same files are embedded (base64) into exported books, so text measures identically.
 */
export const FONT_FILES: readonly FontFace[] = [
  { fontId: 'inter', subset: 'latin-ext', style: 'italic', src: inter_latin_ext_italic },
  { fontId: 'inter', subset: 'latin-ext', style: 'normal', src: inter_latin_ext_normal },
  { fontId: 'inter', subset: 'latin', style: 'italic', src: inter_latin_italic },
  { fontId: 'inter', subset: 'latin', style: 'normal', src: inter_latin_normal },
  { fontId: 'montserrat', subset: 'latin-ext', style: 'italic', src: montserrat_latin_ext_italic },
  { fontId: 'montserrat', subset: 'latin-ext', style: 'normal', src: montserrat_latin_ext_normal },
  { fontId: 'montserrat', subset: 'latin', style: 'italic', src: montserrat_latin_italic },
  { fontId: 'montserrat', subset: 'latin', style: 'normal', src: montserrat_latin_normal },
  { fontId: 'nunito', subset: 'latin-ext', style: 'italic', src: nunito_latin_ext_italic },
  { fontId: 'nunito', subset: 'latin-ext', style: 'normal', src: nunito_latin_ext_normal },
  { fontId: 'nunito', subset: 'latin', style: 'italic', src: nunito_latin_italic },
  { fontId: 'nunito', subset: 'latin', style: 'normal', src: nunito_latin_normal },
  { fontId: 'fredoka', subset: 'latin-ext', style: 'normal', src: fredoka_latin_ext_normal },
  { fontId: 'fredoka', subset: 'latin', style: 'normal', src: fredoka_latin_normal },
  { fontId: 'lora', subset: 'latin-ext', style: 'italic', src: lora_latin_ext_italic },
  { fontId: 'lora', subset: 'latin-ext', style: 'normal', src: lora_latin_ext_normal },
  { fontId: 'lora', subset: 'latin', style: 'italic', src: lora_latin_italic },
  { fontId: 'lora', subset: 'latin', style: 'normal', src: lora_latin_normal },
  {
    fontId: 'merriweather',
    subset: 'latin-ext',
    style: 'italic',
    src: merriweather_latin_ext_italic,
  },
  {
    fontId: 'merriweather',
    subset: 'latin-ext',
    style: 'normal',
    src: merriweather_latin_ext_normal,
  },
  { fontId: 'merriweather', subset: 'latin', style: 'italic', src: merriweather_latin_italic },
  { fontId: 'merriweather', subset: 'latin', style: 'normal', src: merriweather_latin_normal },
  {
    fontId: 'playfair-display',
    subset: 'latin-ext',
    style: 'italic',
    src: playfair_display_latin_ext_italic,
  },
  {
    fontId: 'playfair-display',
    subset: 'latin-ext',
    style: 'normal',
    src: playfair_display_latin_ext_normal,
  },
  {
    fontId: 'playfair-display',
    subset: 'latin',
    style: 'italic',
    src: playfair_display_latin_italic,
  },
  {
    fontId: 'playfair-display',
    subset: 'latin',
    style: 'normal',
    src: playfair_display_latin_normal,
  },
  {
    fontId: 'libre-baskerville',
    subset: 'latin-ext',
    style: 'italic',
    src: libre_baskerville_latin_ext_italic,
  },
  {
    fontId: 'libre-baskerville',
    subset: 'latin-ext',
    style: 'normal',
    src: libre_baskerville_latin_ext_normal,
  },
  {
    fontId: 'libre-baskerville',
    subset: 'latin',
    style: 'italic',
    src: libre_baskerville_latin_italic,
  },
  {
    fontId: 'libre-baskerville',
    subset: 'latin',
    style: 'normal',
    src: libre_baskerville_latin_normal,
  },
  {
    fontId: 'roboto-slab',
    subset: 'latin-ext',
    style: 'normal',
    src: roboto_slab_latin_ext_normal,
  },
  { fontId: 'roboto-slab', subset: 'latin', style: 'normal', src: roboto_slab_latin_normal },
  { fontId: 'caveat', subset: 'latin-ext', style: 'normal', src: caveat_latin_ext_normal },
  { fontId: 'caveat', subset: 'latin', style: 'normal', src: caveat_latin_normal },
];

let installed = false;

/** Declares every catalog font once for the whole app (editor, thumbnails, preview). */
export function installAppFonts(): void {
  if (installed) return;
  installed = true;
  const style = document.createElement('style');
  style.dataset.folioFonts = '';
  style.textContent = buildFontFaceCss(FONT_FILES);
  document.head.appendChild(style);
}

/** Resolves once the given fonts are usable, so text measurement is accurate. */
export async function loadFonts(fontIds: Iterable<string>): Promise<void> {
  const wanted = new Set(fontIds);
  const loads = FONT_CATALOG.filter((f) => wanted.has(f.id)).flatMap((f) => [
    document.fonts.load(`400 16px '${f.family}'`),
    ...(f.hasItalic ? [document.fonts.load(`italic 400 16px '${f.family}'`)] : []),
  ]);
  await Promise.allSettled(loads);
}

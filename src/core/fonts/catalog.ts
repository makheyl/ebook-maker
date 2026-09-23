/**
 * The curated, bundled font list. Pure data — the actual woff2 files are wired up by the app
 * (src/editor/fonts.ts) and embedded as base64 by the exporter, using the same family names,
 * so text measures identically in the editor and the exported book.
 */
export type FontCategory = 'sans' | 'serif' | 'display' | 'handwriting';

export type FontDef = {
  id: string;
  label: string;
  /** The @font-face family name (matches @fontsource-variable). */
  family: string;
  fallback: string;
  category: FontCategory;
  weight: readonly [min: number, max: number];
  hasItalic: boolean;
};

export const FONT_CATALOG: readonly FontDef[] = [
  {
    id: 'inter',
    label: 'Inter',
    family: 'Inter Variable',
    fallback: 'system-ui, sans-serif',
    category: 'sans',
    weight: [100, 900],
    hasItalic: true,
  },
  {
    id: 'montserrat',
    label: 'Montserrat',
    family: 'Montserrat Variable',
    fallback: 'system-ui, sans-serif',
    category: 'sans',
    weight: [100, 900],
    hasItalic: true,
  },
  {
    id: 'nunito',
    label: 'Nunito',
    family: 'Nunito Variable',
    fallback: 'system-ui, sans-serif',
    category: 'sans',
    weight: [200, 900],
    hasItalic: true,
  },
  {
    id: 'fredoka',
    label: 'Fredoka',
    family: 'Fredoka Variable',
    fallback: 'system-ui, sans-serif',
    category: 'display',
    weight: [300, 700],
    hasItalic: false,
  },
  {
    id: 'lora',
    label: 'Lora',
    family: 'Lora Variable',
    fallback: 'Georgia, serif',
    category: 'serif',
    weight: [400, 700],
    hasItalic: true,
  },
  {
    id: 'merriweather',
    label: 'Merriweather',
    family: 'Merriweather Variable',
    fallback: 'Georgia, serif',
    category: 'serif',
    weight: [300, 900],
    hasItalic: true,
  },
  {
    id: 'playfair-display',
    label: 'Playfair Display',
    family: 'Playfair Display Variable',
    fallback: 'Georgia, serif',
    category: 'display',
    weight: [400, 900],
    hasItalic: true,
  },
  {
    id: 'libre-baskerville',
    label: 'Libre Baskerville',
    family: 'Libre Baskerville Variable',
    fallback: 'Georgia, serif',
    category: 'serif',
    weight: [400, 700],
    hasItalic: true,
  },
  {
    id: 'roboto-slab',
    label: 'Roboto Slab',
    family: 'Roboto Slab Variable',
    fallback: 'Georgia, serif',
    category: 'serif',
    weight: [100, 900],
    hasItalic: false,
  },
  {
    id: 'caveat',
    label: 'Caveat',
    family: 'Caveat Variable',
    fallback: 'cursive',
    category: 'handwriting',
    weight: [400, 700],
    hasItalic: false,
  },
];

export const DEFAULT_FONT_ID = 'inter';

const byId = new Map(FONT_CATALOG.map((f) => [f.id, f]));

export function getFont(fontId: string): FontDef {
  return byId.get(fontId) ?? byId.get(DEFAULT_FONT_ID)!;
}

/** CSS font-family value for a font id; unknown ids fall back to the default font. */
export function fontStack(fontId: string): string {
  const font = getFont(fontId);
  return `'${font.family}', ${font.fallback}`;
}

/** Clamp a requested weight into what the variable font supports. */
export function clampWeight(fontId: string, weight: number): number {
  const [min, max] = getFont(fontId).weight;
  return Math.min(max, Math.max(min, weight));
}

export type FontSubset = 'latin' | 'latin-ext';

export const SUBSET_UNICODE_RANGES: Record<FontSubset, string> = {
  latin:
    'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD',
  'latin-ext':
    'U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF',
};

export type FontFace = {
  fontId: string;
  style: 'normal' | 'italic';
  subset: FontSubset;
  /** A URL the page can load: an asset URL in the app, a data: URI or relative path in exports. */
  src: string;
};

/** Builds @font-face rules. Used by the editor and by the exporter so both declare fonts identically. */
export function buildFontFaceCss(faces: readonly FontFace[]): string {
  return faces
    .map((face) => {
      const font = getFont(face.fontId);
      return [
        '@font-face{',
        `font-family:'${font.family}';`,
        `font-style:${face.style};`,
        'font-display:block;',
        `font-weight:${font.weight[0]} ${font.weight[1]};`,
        `src:url(${JSON.stringify(face.src)}) format('woff2-variations');`,
        `unicode-range:${SUBSET_UNICODE_RANGES[face.subset]};`,
        '}',
      ].join('');
    })
    .join('\n');
}

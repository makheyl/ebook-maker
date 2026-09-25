import BRAND_ICON from '@/assets/brand/inkbug-favicon-32.png?inline';
import { flattenElements } from '../schema/tree';
import JSZip from 'jszip';
import { PRODUCT_NAME } from '../brand';
import { buildFontFaceCss, type FontFace } from '../fonts/catalog';
import { SCHEMA_VERSION } from '../schema/project';
import { plainText } from '../schema/text';
import type { Project } from '../schema/types';
import { escapeHtml, escapeInlineCode, escapeJsonForHtml, slugify } from './escape';
import { BOOK_DATA_ID, BOOK_FORMAT_VERSION, BOOK_ROOT_ID, type BookData } from './format';
import { bookVoiceIds, exportedAssetIds, usedFontFaces } from './usage';

/**
 * Export packaging. Everything here is pure (inputs in, strings/blobs out) so it can be unit
 * tested; the editor supplies asset blobs, font bytes and the compiled player bundle.
 */

export type ExportFormat = 'html' | 'zip';

export type ExportInputs = {
  project: Project;
  playerJs: string;
  playerCss: string;
  showBadge: boolean;
  /** Blob of each used asset (full resolution variant). */
  getAsset: (assetId: string) => Promise<Blob | undefined>;
  /** Bytes of a bundled font file (by the URL in FONT_FILES). */
  getFont: (face: FontFace) => Promise<ArrayBuffer>;
  /** All font files the app ships (from src/editor/fonts.ts). */
  fontFiles: readonly FontFace[];
};

export type ExportResult = { blob: Blob; filename: string; bytes: number };

const EXT_BY_MIME: Record<string, string> = {
  'image/webp': 'webp',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/avif': 'avif',
  'image/svg+xml': 'svg',
  'audio/mpeg': 'mp3',
  'audio/ogg': 'ogg',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/wave': 'wav',
  'audio/mp4': 'm4a',
  'audio/x-m4a': 'm4a',
  'audio/aac': 'aac',
};

function toBase64(bytes: ArrayBuffer): string {
  const view = new Uint8Array(bytes);
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < view.length; i += chunk) {
    binary += String.fromCharCode(...view.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export async function blobToDataUri(blob: Blob): Promise<string> {
  return `data:${blob.type || 'application/octet-stream'};base64,${toBase64(await blob.arrayBuffer())}`;
}

function bookDescription(project: Project): string {
  if (project.description) return project.description;
  for (const page of project.pages) {
    for (const el of flattenElements(page.elements)) {
      if (el.type === 'text' && !el.hidden) {
        const text = plainText(el.content).replace(/\s+/g, ' ').trim();
        if (text) return text.slice(0, 160);
      }
    }
  }
  return `An interactive book made with ${PRODUCT_NAME}.`;
}

/** Only fonts the book uses, restricted to the faces (style/subset) it needs. */
function selectFontFaces(project: Project, fontFiles: readonly FontFace[]): FontFace[] {
  const wanted = usedFontFaces(project);
  return fontFiles.filter((f) =>
    wanted.some((w) => w.fontId === f.fontId && w.style === f.style && w.subset === f.subset),
  );
}

export type HtmlParts = {
  project: Project;
  assets: Record<string, string>;
  playerJs?: string;
  playerCss?: string;
  playerJsSrc?: string;
  playerCssHref?: string;
  fontCss: string;
  showBadge: boolean;
  /** Content-Security-Policy that keeps the book fully offline. */
  csp: string;
  /** Defaults to now. */
  exportedAt?: string;
};

/** The exported page. All dynamic values are escaped for their context. */
export function renderBookHtml(parts: HtmlParts): string {
  const { project } = parts;
  const data: BookData = {
    format: 'folio-book',
    schemaVersion: SCHEMA_VERSION,
    project,
    assets: parts.assets,
    options: { showBadge: parts.showBadge },
    generator: {
      app: PRODUCT_NAME,
      formatVersion: BOOK_FORMAT_VERSION,
      exportedAt: parts.exportedAt ?? new Date().toISOString(),
    },
  };
  const title = escapeHtml(project.title || 'Untitled book');
  const description = escapeHtml(bookDescription(project));
  const author = project.author
    ? `\n<meta name="author" content="${escapeHtml(project.author)}">`
    : '';
  // The Inkbug icon goes with the “Made with Inkbug” badge; without it the book is unbranded.
  const icon = parts.showBadge ? `\n<link rel="icon" type="image/png" href="${BRAND_ICON}">` : '';
  const baseCss = `html,body{margin:0;height:100%;background:#111114}#${BOOK_ROOT_ID}{height:100%}`;
  const styles = parts.playerCss
    ? `<style>${escapeInlineCode(baseCss + parts.fontCss + parts.playerCss, 'style')}</style>`
    : `<style>${escapeInlineCode(baseCss + parts.fontCss, 'style')}</style>\n<link rel="stylesheet" href="${escapeHtml(parts.playerCssHref ?? '')}">`;
  const script = parts.playerJs
    ? `<script>${escapeInlineCode(parts.playerJs, 'script')}</script>`
    : `<script src="${escapeHtml(parts.playerJsSrc ?? '')}"></script>`;

  return `<!doctype html>
<html lang="${escapeHtml(project.language || 'en')}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="${escapeHtml(parts.csp)}">
<title>${title}</title>
<meta name="description" content="${description}">
<meta name="generator" content="${escapeHtml(PRODUCT_NAME)}">${author}${icon}
<meta property="og:title" content="${title}">
<meta property="og:description" content="${description}">
${styles}
</head>
<body>
<div id="${BOOK_ROOT_ID}"><noscript>This book needs JavaScript to be read.</noscript></div>
<script type="application/json" id="${BOOK_DATA_ID}">${escapeJsonForHtml(JSON.stringify(data))}</script>
${script}
</body>
</html>
`;
}

const SINGLE_FILE_CSP =
  "default-src 'none'; img-src data: blob:; font-src data:; media-src data:; style-src 'unsafe-inline'; script-src 'unsafe-inline'; base-uri 'none'; form-action 'none'";
const FOLDER_CSP =
  "default-src 'none'; img-src 'self' data: blob:; font-src 'self' data:; media-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; base-uri 'none'; form-action 'none'";

async function fontCssFor(inputs: ExportInputs): Promise<{ css: string; bytes: number }> {
  const faces = selectFontFaces(inputs.project, inputs.fontFiles);
  let bytes = 0;
  const embedded: FontFace[] = [];
  for (const face of faces) {
    const data = await inputs.getFont(face);
    bytes += data.byteLength;
    embedded.push({ ...face, src: `data:font/woff2;base64,${toBase64(data)}` });
  }
  return { css: buildFontFaceCss(embedded), bytes };
}

/** One self-contained .html file: player, data, images and fonts inlined. Works offline by double-click. */
export async function buildSingleFile(inputs: ExportInputs): Promise<ExportResult> {
  const assets: Record<string, string> = {};
  for (const id of exportedAssetIds(inputs.project)) {
    const blob = await inputs.getAsset(id);
    if (blob) assets[id] = await blobToDataUri(blob);
  }
  const { css } = await fontCssFor(inputs);
  const html = renderBookHtml({
    project: inputs.project,
    assets,
    playerJs: inputs.playerJs,
    playerCss: inputs.playerCss,
    fontCss: css,
    showBadge: inputs.showBadge,
    csp: SINGLE_FILE_CSP,
  });
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  return { blob, filename: `${slugify(inputs.project.title)}.html`, bytes: blob.size };
}

/** index.html + assets/ folder: smaller and better for many images or web hosting. */
export async function buildZip(inputs: ExportInputs): Promise<ExportResult> {
  const zip = new JSZip();
  const assets: Record<string, string> = {};
  const voice = new Set(bookVoiceIds(inputs.project));
  for (const id of exportedAssetIds(inputs.project)) {
    const blob = await inputs.getAsset(id);
    if (!blob) continue;
    const folder = voice.has(id)
      ? 'voice'
      : inputs.project.music.tracks[id]
        ? 'music'
        : inputs.project.sounds[id]
          ? 'audio'
          : 'images';
    const path = `assets/${folder}/${id}.${EXT_BY_MIME[blob.type] ?? 'bin'}`;
    zip.file(path, blob);
    assets[id] = path;
  }
  // Fonts stay inlined: browsers block @font-face loads from file:// URLs.
  const { css } = await fontCssFor(inputs);
  zip.file('assets/player.js', inputs.playerJs);
  zip.file('assets/player.css', inputs.playerCss);
  const html = renderBookHtml({
    project: inputs.project,
    assets,
    playerJsSrc: 'assets/player.js',
    playerCssHref: 'assets/player.css',
    fontCss: css,
    showBadge: inputs.showBadge,
    csp: FOLDER_CSP,
  });
  zip.file('index.html', html);
  const blob = await zip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });
  return { blob, filename: `${slugify(inputs.project.title)}.zip`, bytes: blob.size };
}

export type SizeEstimate = {
  bytes: number;
  images: number;
  audio: number;
  voice: number;
  music: number;
  fonts: number;
  runtime: number;
  data: number;
};

/**
 * Predicts the export size without building it. Base64 inlining grows binary data by 4/3
 * in single-file mode.
 */
export function estimateSize(opts: {
  format: ExportFormat;
  imageBytes: readonly number[];
  audioBytes?: readonly number[];
  voiceBytes?: readonly number[];
  musicBytes?: readonly number[];
  fontBytes: readonly number[];
  playerBytes: number;
  projectJsonBytes: number;
}): SizeEstimate {
  const inflate = (n: number) => (opts.format === 'html' ? Math.ceil(n / 3) * 4 : n);
  const images = opts.imageBytes.reduce((s, n) => s + inflate(n), 0);
  const audio = (opts.audioBytes ?? []).reduce((s, n) => s + inflate(n), 0);
  const voice = (opts.voiceBytes ?? []).reduce((s, n) => s + inflate(n), 0);
  const music = (opts.musicBytes ?? []).reduce((s, n) => s + inflate(n), 0);
  const fonts = opts.fontBytes.reduce((s, n) => s + Math.ceil(n / 3) * 4, 0);
  const runtime = opts.playerBytes;
  const data = opts.projectJsonBytes + 2048;
  return {
    bytes: images + audio + voice + music + fonts + runtime + data,
    images,
    audio,
    voice,
    music,
    fonts,
    runtime,
    data,
  };
}

export const SIZE_WARNING_BYTES = 25 * 1024 * 1024;

export { selectFontFaces };

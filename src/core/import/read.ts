import JSZip from 'jszip';
import { PRODUCT_NAME } from '../brand';
import { BOOK_DATA_ID, isBookData, type BookData } from '../export/format';
import { loadProject } from '../migrations';
import { projectAssetIds } from '../schema/asset-ids';
import { MAX_MUSIC_BYTES, MAX_SOUND_BYTES, MAX_VOICE_BYTES, SOUND_MIMES } from '../schema/project';
import { voiceClips } from '../voice/lines';
import type { Project } from '../schema/types';

/**
 * Reading a book back from an Inkbug (or Folio, its earlier name) export (single .html, .zip folder) or a raw project JSON.
 * The file is untrusted: nothing in it is executed, the project goes through the same
 * migrate → validate → repair pipeline as stored books, and only embedded files (data: URIs,
 * or entries inside the zip's assets/ folder) are accepted — never URLs.
 */

export const MAX_IMPORT_BYTES = 300 * 1024 * 1024;
export const MAX_IMAGE_BYTES = 25 * 1024 * 1024;
export const MAX_ZIP_UNPACKED_BYTES = 500 * 1024 * 1024;
export const IMPORT_IMAGE_MIMES = ['image/webp', 'image/png', 'image/jpeg', 'image/gif'] as const;

export type ImportSource = 'html' | 'zip' | 'json';

export type ImportErrorReason =
  'too-big' | 'unknown-file' | 'not-folio' | 'damaged' | 'invalid' | 'too-new';

export class ImportError extends Error {
  constructor(
    message: string,
    readonly reason: ImportErrorReason,
    readonly details: string[] = [],
  ) {
    super(message);
    this.name = 'ImportError';
  }
}

export type FileKind = 'image' | 'audio' | 'voice' | 'music';

/** A picture, sound or voice recording found in the file, checked for type and size (not yet decoded). */
export type ImportedFile = { id: string; kind: FileKind; mime: string; bytes: Uint8Array };

/** A file the book refers to that couldn't be restored, and why. */
export type MissingFile = { id: string; kind: FileKind; name?: string; reason: string };

export type ParsedImport = {
  source: ImportSource;
  project: Project;
  /** The schema version the book was saved with (older books were upgraded). */
  sourceSchema: number;
  files: ImportedFile[];
  missing: MissingFile[];
  exportedAt?: string;
};

// ─── Recognising the file ──────────────────────────────────────────────────────

export function detectKind(bytes: Uint8Array, name: string): ImportSource | null {
  if (bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04) {
    return 'zip';
  }
  // TextDecoder drops a leading byte-order mark.
  const head = new TextDecoder().decode(bytes.subarray(0, 1024)).trimStart().toLowerCase();
  if (head.startsWith('<!doctype html') || head.startsWith('<html')) return 'html';
  if (head.startsWith('{')) return 'json';
  if (/\.html?$/i.test(name) && head.startsWith('<')) return 'html';
  return null;
}

/** The book data embedded in an exported page. Parsing only: scripts are never run. */
export function extractBookData(html: string): unknown {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const script = doc.getElementById(BOOK_DATA_ID);
  if (!script || script.getAttribute('type') !== 'application/json') {
    throw new ImportError(`This page is not a book exported by ${PRODUCT_NAME}.`, 'not-folio');
  }
  try {
    return JSON.parse(script.textContent ?? '');
  } catch {
    throw new ImportError('The book data inside this file is damaged.', 'damaged');
  }
}

/** Decodes `data:<mime>;base64,<data>` without fetch. Null when it isn't one. */
export function decodeDataUri(uri: string): { mime: string; bytes: Uint8Array } | null {
  if (!uri.startsWith('data:')) return null;
  const comma = uri.indexOf(',');
  if (comma < 0) return null;
  const meta = uri.slice(5, comma).split(';');
  if (!meta.includes('base64')) return null;
  const mime = (meta[0] ?? '').toLowerCase();
  try {
    const binary = atob(uri.slice(comma + 1));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return { mime, bytes };
  } catch {
    return null;
  }
}

// ─── Files ─────────────────────────────────────────────────────────────────────

/** Where a zip export keeps each file (relative to its index.html). */
const ZIP_ASSET_PATH = /^assets\/(images|audio|voice|music)\/[A-Za-z0-9_-]{1,100}\.[a-z0-9]{1,5}$/;

const MIME_BY_EXT: Record<string, string> = {
  webp: 'image/webp',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  mp3: 'audio/mpeg',
  ogg: 'audio/ogg',
  wav: 'audio/wav',
  m4a: 'audio/mp4',
  aac: 'audio/aac',
};

function checkFile(kind: FileKind, mime: string, size: number): string | null {
  if (kind === 'image') {
    if (!(IMPORT_IMAGE_MIMES as readonly string[]).includes(mime)) return 'not a supported picture';
    if (size > MAX_IMAGE_BYTES) return 'picture is too large';
  } else if (kind === 'music') {
    if (!(SOUND_MIMES as readonly string[]).includes(mime)) return 'not a supported music file';
    if (size > MAX_MUSIC_BYTES) return 'music is over 15 MB';
  } else if (kind === 'voice') {
    if (!(SOUND_MIMES as readonly string[]).includes(mime)) return 'not a supported recording';
    if (size > MAX_VOICE_BYTES) return 'recording is over 10 MB';
  } else {
    if (!(SOUND_MIMES as readonly string[]).includes(mime)) return 'not a supported sound';
    if (size > MAX_SOUND_BYTES) return 'sound is over 2 MB';
  }
  if (size === 0) return 'the file is empty';
  return null;
}

/** JSZip keeps the unpacked size of each entry; used to refuse zip bombs before unpacking. */
const unpackedSize = (entry: JSZip.JSZipObject): number =>
  (entry as unknown as { _data?: { uncompressedSize?: number } })._data?.uncompressedSize ?? 0;

/** Reads one file of the book: the file, or why it couldn't be restored. */
type FileReader = (id: string, kind: FileKind) => Promise<ImportedFile | string>;

async function collectFiles(project: Project, read: FileReader) {
  const files: ImportedFile[] = [];
  const missing: MissingFile[] = [];
  const voice = new Map(voiceClips(project).map((c) => [c.id, c]));
  for (const id of projectAssetIds(project)) {
    const kind: FileKind = voice.has(id)
      ? 'voice'
      : project.music.tracks[id]
        ? 'music'
        : project.sounds[id]
          ? 'audio'
          : 'image';
    const name =
      kind === 'voice'
        ? voice.get(id)?.name
        : kind === 'music'
          ? project.music.tracks[id]?.name
          : kind === 'audio'
            ? project.sounds[id]?.name
            : project.assets[id]?.name;
    if (kind === 'image' && !project.assets[id]) {
      missing.push({ id, kind, reason: 'the book has no details for this picture' });
      continue;
    }
    const result = await read(id, kind);
    if (typeof result === 'string') missing.push({ id, kind, name, reason: result });
    else files.push(result);
  }
  return { files, missing };
}

// ─── Entry point ───────────────────────────────────────────────────────────────

function toProject(raw: unknown): { project: Project; sourceSchema: number } {
  const result = loadProject(raw);
  if (!result.ok) {
    const tooNew = result.error.reason === 'too-new';
    throw new ImportError(
      tooNew
        ? `This book was made with a newer version of ${PRODUCT_NAME}. Update the app to import it.`
        : 'The book inside this file is not valid.',
      tooNew ? 'too-new' : 'invalid',
      result.error.issues,
    );
  }
  const version = (raw as { schemaVersion?: unknown }).schemaVersion;
  return { project: result.project, sourceSchema: typeof version === 'number' ? version : 0 };
}

function asBookData(value: unknown): BookData {
  if (!isBookData(value)) {
    throw new ImportError(`This file is not a book exported by ${PRODUCT_NAME}.`, 'not-folio');
  }
  return value;
}

/** Book data whose files are embedded as data: URIs (single-file export, or its JSON). */
async function fromEmbedded(data: BookData, source: ImportSource): Promise<ParsedImport> {
  const { project, sourceSchema } = toProject(data.project);
  const { files, missing } = await collectFiles(project, async (id, kind) => {
    const src = data.assets[id];
    if (typeof src !== 'string') return 'not included in this file';
    const decoded = decodeDataUri(src);
    if (!decoded) return 'not embedded in the file (links are not imported)';
    const problem = checkFile(kind, decoded.mime, decoded.bytes.length);
    return problem ?? { id, kind, mime: decoded.mime, bytes: decoded.bytes };
  });
  return { source, project, sourceSchema, files, missing, exportedAt: data.generator?.exportedAt };
}

async function fromZip(bytes: Uint8Array): Promise<ParsedImport> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(bytes);
  } catch {
    throw new ImportError('This ZIP file is damaged.', 'damaged');
  }
  // The export's index.html, or the shallowest one if the folder was re-zipped inside another.
  const pages = Object.keys(zip.files)
    .filter((n) => /(^|\/)index\.html$/i.test(n) && !n.includes('__MACOSX'))
    .sort((a, b) => a.split('/').length - b.split('/').length);
  const indexPath = pages[0];
  if (!indexPath) throw new ImportError('This ZIP has no book in it (no index.html).', 'not-folio');
  const base = indexPath.slice(0, indexPath.length - 'index.html'.length);
  const data = asBookData(extractBookData(await zip.file(indexPath)!.async('string')));
  const { project, sourceSchema } = toProject(data.project);
  const voice = new Map(voiceClips(project).map((c) => [c.id, c]));

  let unpacked = 0;
  const { files, missing } = await collectFiles(project, async (id, kind) => {
    const src = data.assets[id];
    if (typeof src !== 'string') return 'not included in this file';
    if (src.startsWith('data:')) {
      const decoded = decodeDataUri(src);
      if (!decoded) return 'damaged';
      const problem = checkFile(kind, decoded.mime, decoded.bytes.length);
      return problem ?? { id, kind, mime: decoded.mime, bytes: decoded.bytes };
    }
    if (!ZIP_ASSET_PATH.test(src)) return 'not stored inside the ZIP (links are not imported)';
    const entry = zip.file(base + src);
    if (!entry || entry.dir) return 'missing from the ZIP';
    const size = unpackedSize(entry);
    unpacked += size;
    if (size > MAX_IMAGE_BYTES || unpacked > MAX_ZIP_UNPACKED_BYTES) return 'file is too large';
    const ext = src.slice(src.lastIndexOf('.') + 1).toLowerCase();
    const mime =
      (kind === 'voice'
        ? voice.get(id)?.mime
        : kind === 'music'
          ? project.music.tracks[id]?.mime
          : kind === 'audio'
            ? project.sounds[id]?.mime
            : project.assets[id]?.mime) ??
      MIME_BY_EXT[ext] ??
      '';
    const fileBytes = await entry.async('uint8array');
    const problem = checkFile(kind, mime, fileBytes.length);
    return problem ?? { id, kind, mime, bytes: fileBytes };
  });
  return {
    source: 'zip',
    project,
    sourceSchema,
    files,
    missing,
    exportedAt: data.generator?.exportedAt,
  };
}

/**
 * Reads an import file. Throws ImportError with a message a person can act on. Files the
 * book refers to but that can't be restored are listed in `missing` (the book still imports).
 */
export async function parseImport(name: string, bytes: Uint8Array): Promise<ParsedImport> {
  if (bytes.length > MAX_IMPORT_BYTES) {
    throw new ImportError('This file is too large to import (over 300 MB).', 'too-big');
  }
  const kind = detectKind(bytes, name);
  if (kind === 'zip') return fromZip(bytes);
  if (kind === 'html') {
    const data = asBookData(extractBookData(new TextDecoder().decode(bytes)));
    return fromEmbedded(data, 'html');
  }
  if (kind === 'json') {
    let value: unknown;
    try {
      value = JSON.parse(new TextDecoder().decode(bytes));
    } catch {
      throw new ImportError('This JSON file is damaged.', 'damaged');
    }
    // An exported book's data, or a project saved with "Download raw data" (no files inside:
    // they are often still in this browser).
    if (isBookData(value)) return fromEmbedded(value, 'json');
    if (
      !value ||
      typeof value !== 'object' ||
      !Array.isArray((value as { pages?: unknown }).pages)
    ) {
      throw new ImportError(`This JSON file is not a ${PRODUCT_NAME} book.`, 'not-folio');
    }
    const { project, sourceSchema } = toProject(value);
    const { files, missing } = await collectFiles(project, async () => 'not included in this file');
    return { source: 'json', project, sourceSchema, files, missing };
  }
  throw new ImportError(
    `Choose a book exported by ${PRODUCT_NAME}: an .html file, a .zip file, or a saved .json backup.`,
    'unknown-file',
  );
}

import { makeThumbnail } from '@/core/image/process';
import {
  asCopy,
  ImportError,
  localIsNewer,
  MAX_IMPORT_BYTES,
  parseImport,
  type MissingFile,
  type ParsedImport,
} from '@/core/import';
import { assetUrls } from '@/editor/assets/asset-urls';
import { assetRepo, projectRepo, type ProjectSummary } from '@/storage';

/** A file to write to the asset store (thumbnails already made). */
type PreparedFile = {
  id: string;
  kind: 'image' | 'audio' | 'voice';
  blob: Blob;
  thumb: Blob;
  width: number;
  height: number;
};

export type PreparedImport = {
  parsed: ParsedImport;
  /** Files to add to this browser (ones already here are skipped: same id = same content). */
  files: PreparedFile[];
  /** Files already stored in this browser (e.g. the book was made here). */
  alreadyHere: number;
  /** Files the book refers to that couldn't be restored. */
  missing: MissingFile[];
  /** A book with the same id in this browser. */
  existing: ProjectSummary | null;
  /** That book was changed after the file was exported. */
  localNewer: boolean;
};

export type ImportProgress = { done: number; total: number };

const nextTask = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

/**
 * Reads and checks an import file without writing anything: decodes every picture (making its
 * thumbnail), notices files that are already in this browser, and looks for the same book.
 */
export async function prepareImport(
  file: File,
  onProgress?: (p: ImportProgress) => void,
): Promise<PreparedImport> {
  if (file.size > MAX_IMPORT_BYTES) {
    throw new ImportError('This file is too large to import (over 300 MB).', 'too-big');
  }
  const parsed = await parseImport(file.name, new Uint8Array(await file.arrayBuffer()));
  const missing: MissingFile[] = [];
  const files: PreparedFile[] = [];
  let alreadyHere = 0;
  const total = parsed.files.length;

  for (const [i, f] of parsed.files.entries()) {
    onProgress?.({ done: i, total });
    await nextTask(); // keep the page responsive while big books import
    if (await assetRepo.has(f.id)) {
      alreadyHere++;
      continue;
    }
    const blob = new Blob([f.bytes as BlobPart], { type: f.mime });
    if (f.kind === 'audio' || f.kind === 'voice') {
      // Recordings have no thumbnail; they're stored as they are.
      files.push({ id: f.id, kind: f.kind, blob, thumb: blob, width: 0, height: 0 });
      continue;
    }
    try {
      const { thumb, width, height } = await makeThumbnail(blob);
      files.push({ id: f.id, kind: 'image', blob, thumb, width, height });
      // Lets the preview show the cover before anything is saved (memory only).
      assetUrls.register(f.id, blob, thumb);
    } catch {
      const ref = parsed.project.assets[f.id];
      missing.push({
        id: f.id,
        kind: 'image',
        name: ref?.name,
        reason: 'the picture could not be read',
      });
    }
  }
  onProgress?.({ done: total, total });

  // Files not in the file may still be in this browser (e.g. a raw backup made here).
  for (const m of parsed.missing) {
    if (await assetRepo.has(m.id)) alreadyHere++;
    else missing.push(m);
  }

  const existing = (await projectRepo.list()).find((p) => p.id === parsed.project.id) ?? null;
  return {
    parsed,
    files,
    alreadyHere,
    missing,
    existing,
    localNewer: !!existing && localIsNewer(existing.updatedAt, parsed.project),
  };
}

export type ImportMode = 'keep-both' | 'replace';

/**
 * Saves the book: its files first, then the book, so an interrupted import never leaves a book
 * pointing at files that aren't there. Returns the new (or replaced) book's id.
 */
export async function commitImport(prep: PreparedImport, mode: ImportMode): Promise<string> {
  const project =
    prep.existing && mode === 'keep-both' ? asCopy(prep.parsed.project) : prep.parsed.project;
  for (const f of prep.files) {
    await assetRepo.put({
      id: f.id,
      blob: f.blob,
      thumb: f.thumb,
      mime: f.blob.type,
      width: f.width,
      height: f.height,
      bytes: f.blob.size,
      createdAt: Date.now(),
    });
    if (f.kind !== 'image') assetUrls.register(f.id, f.blob, f.blob);
  }
  const saved = await projectRepo.save(project);
  return saved.id;
}

/** File types the import picker offers. */
export const IMPORT_ACCEPT = '.html,.htm,.zip,.json,text/html,application/zip,application/json';

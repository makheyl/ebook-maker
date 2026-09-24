import type { Project } from '../schema/types';

/** The JSON embedded in an exported book (`<script type="application/json" id="book-data">`). */
export type BookData = {
  format: 'folio-book';
  schemaVersion: number;
  project: Project;
  /** assetId → URL the player loads (data: URI in single-file exports, relative path in zips). */
  assets: Record<string, string>;
  options: { showBadge: boolean };
  /**
   * Who wrote the file (added with import support). Optional: files without it are still
   * imported. `formatVersion` 2 = the export carries every file the book owns.
   */
  generator?: { app: string; formatVersion: number; exportedAt: string };
};

/** Bump when the exported file layout changes in a way the importer must know about. */
export const BOOK_FORMAT_VERSION = 2;

export const BOOK_DATA_ID = 'book-data';
export const BOOK_ROOT_ID = 'book';

export function isBookData(value: unknown): value is BookData {
  if (!value || typeof value !== 'object') return false;
  const v = value as Partial<BookData>;
  return (
    v.format === 'folio-book' &&
    typeof v.schemaVersion === 'number' &&
    !!v.project &&
    Array.isArray(v.project.pages) &&
    v.project.pages.length > 0 &&
    typeof v.assets === 'object'
  );
}

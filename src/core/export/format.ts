import type { Project } from '../schema/types';

/** The JSON embedded in an exported book (`<script type="application/json" id="book-data">`). */
export type BookData = {
  format: 'folio-book';
  schemaVersion: number;
  project: Project;
  /** assetId → URL the player loads (data: URI in single-file exports, relative path in zips). */
  assets: Record<string, string>;
  options: { showBadge: boolean };
};

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

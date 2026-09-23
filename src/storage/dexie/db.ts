import Dexie, { type EntityTable } from 'dexie';
import type { ProjectSummary, StoredAsset } from '../repository';

export type ProjectRow = { id: string; data: unknown };

/**
 * IndexedDB layout:
 * - projects:    full project JSON (only read when a book is opened)
 * - projectMeta: small summaries for the dashboard (kept in sync on every save)
 * - assets:      image blobs + thumbnails, keyed by content hash (deduplicated across books)
 */
export class FolioDatabase extends Dexie {
  projects!: EntityTable<ProjectRow, 'id'>;
  projectMeta!: EntityTable<ProjectSummary, 'id'>;
  assets!: EntityTable<StoredAsset, 'id'>;

  constructor(name = 'folio') {
    super(name);
    this.version(1).stores({
      projects: 'id',
      projectMeta: 'id, updatedAt',
      assets: 'id, createdAt',
    });
  }
}

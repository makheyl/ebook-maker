import type { LoadResult } from '@/core/migrations';
import type { AssetRef, Character, Page, PageSize, Project } from '@/core/schema';

/**
 * Persistence boundary. The editor only talks to these interfaces, so the local IndexedDB
 * implementation can later be swapped for (or synced with) a cloud backend.
 */

export type ProjectSummary = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  pageCount: number;
  pageSize: PageSize;
  /** First page, rendered live as the dashboard thumbnail. */
  cover: Page | null;
  coverAssets: Record<string, AssetRef>;
  /** Characters on the cover page (absent in summaries saved before v2). */
  coverCharacters?: Record<string, Character>;
  /** Every asset the project references (used for asset garbage collection). */
  assetIds: string[];
};

export interface ProjectRepository {
  list(): Promise<ProjectSummary[]>;
  /** Calls `onChange` with the current list and again after every change. Returns an unsubscribe. */
  watchList(
    onChange: (list: ProjectSummary[]) => void,
    onError?: (err: unknown) => void,
  ): () => void;
  /** `null` when no project has that id. */
  load(id: string): Promise<LoadResult | null>;
  /** Raw stored JSON (for "download backup" when a project fails to load). */
  loadRaw(id: string): Promise<unknown>;
  save(project: Project): Promise<Project>;
  rename(id: string, title: string): Promise<void>;
  duplicate(id: string): Promise<Project>;
  delete(id: string): Promise<void>;
}

export type StoredAsset = {
  id: string;
  blob: Blob;
  thumb: Blob;
  mime: string;
  width: number;
  height: number;
  bytes: number;
  createdAt: number;
};

export interface AssetRepository {
  /** Idempotent: content-addressed ids mean an existing asset is left untouched. */
  put(asset: StoredAsset): Promise<void>;
  has(id: string): Promise<boolean>;
  get(id: string): Promise<StoredAsset | undefined>;
  getMany(ids: readonly string[]): Promise<Map<string, StoredAsset>>;
  count(): Promise<number>;
}

export class StorageQuotaError extends Error {
  constructor(cause?: unknown) {
    super('Your browser storage is full. Delete unused books or images to free up space.');
    this.name = 'StorageQuotaError';
    this.cause = cause;
  }
}

export function isQuotaError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as { name?: string; inner?: unknown };
  return e.name === 'QuotaExceededError' || isQuotaError(e.inner);
}

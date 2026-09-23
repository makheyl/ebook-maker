import { liveQuery } from 'dexie';
import { newId } from '@/core/ids';
import { loadProject, type LoadResult } from '@/core/migrations';
import { nowIso, type Project } from '@/core/schema';
import {
  isQuotaError,
  StorageQuotaError,
  type ProjectRepository,
  type ProjectSummary,
} from '../repository';
import { pruneUnusedAssets, summarize } from '../summary';
import type { FolioDatabase } from './db';

/** Assets younger than this are never garbage-collected (they may belong to an unsaved edit). */
const GC_GRACE_MS = 60 * 60 * 1000;

export class DexieProjectRepository implements ProjectRepository {
  constructor(private readonly db: FolioDatabase) {}

  async list(): Promise<ProjectSummary[]> {
    return this.db.projectMeta.orderBy('updatedAt').reverse().toArray();
  }

  watchList(onChange: (list: ProjectSummary[]) => void, onError?: (err: unknown) => void) {
    const sub = liveQuery(() => this.list()).subscribe({ next: onChange, error: onError });
    return () => sub.unsubscribe();
  }

  async load(id: string): Promise<LoadResult | null> {
    const row = await this.db.projects.get(id);
    if (!row) return null;
    const result = loadProject(row.data);
    return result.ok ? { ok: true, project: pruneUnusedAssets(result.project) } : result;
  }

  async loadRaw(id: string): Promise<unknown> {
    return (await this.db.projects.get(id))?.data;
  }

  async save(project: Project): Promise<Project> {
    const saved: Project = { ...project, updatedAt: nowIso() };
    await this.write(saved);
    return saved;
  }

  async rename(id: string, title: string): Promise<void> {
    const result = await this.load(id);
    if (!result?.ok) throw new Error('Could not open this book to rename it');
    await this.save({ ...result.project, title: title.trim() || 'Untitled book' });
  }

  async duplicate(id: string): Promise<Project> {
    const result = await this.load(id);
    if (!result?.ok) throw new Error('Could not open this book to duplicate it');
    const now = nowIso();
    const copy: Project = {
      ...structuredClone(result.project),
      id: newId('bk'),
      title: `${result.project.title} (copy)`,
      createdAt: now,
      updatedAt: now,
    };
    await this.write(copy);
    return copy;
  }

  async delete(id: string): Promise<void> {
    const db = this.db;
    await db.transaction('rw', db.projects, db.projectMeta, db.assets, async () => {
      await db.projects.delete(id);
      await db.projectMeta.delete(id);
      // Content-addressed assets can be shared between books: only drop unreferenced ones.
      const referenced = new Set<string>();
      await db.projectMeta.each((meta) => meta.assetIds.forEach((a) => referenced.add(a)));
      const cutoff = Date.now() - GC_GRACE_MS;
      const orphans = await db.assets
        .where('createdAt')
        .below(cutoff)
        .filter((asset) => !referenced.has(asset.id))
        .primaryKeys();
      await db.assets.bulkDelete(orphans);
    });
  }

  private async write(project: Project): Promise<void> {
    const db = this.db;
    try {
      await db.transaction('rw', db.projects, db.projectMeta, async () => {
        await db.projects.put({ id: project.id, data: project });
        await db.projectMeta.put(summarize(project));
      });
    } catch (err) {
      if (isQuotaError(err)) throw new StorageQuotaError(err);
      throw err;
    }
  }
}

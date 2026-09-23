import type { AssetRef, Page, Project } from '@/core/schema';
import type { ProjectSummary } from './repository';

/** Asset ids referenced by a page (image elements and image backgrounds). */
export function pageAssetIds(page: Page): string[] {
  const ids = new Set<string>();
  if (page.background.type === 'image') ids.add(page.background.assetId);
  for (const el of page.elements) if (el.type === 'image') ids.add(el.assetId);
  return [...ids];
}

export function projectAssetIds(project: Project): string[] {
  const ids = new Set<string>();
  for (const page of project.pages) for (const id of pageAssetIds(page)) ids.add(id);
  return [...ids];
}

export function summarize(project: Project): ProjectSummary {
  const cover = project.pages[0] ?? null;
  const coverAssets: Record<string, AssetRef> = {};
  if (cover) {
    for (const id of pageAssetIds(cover)) {
      const ref = project.assets[id];
      if (ref) coverAssets[id] = ref;
    }
  }
  return {
    id: project.id,
    title: project.title,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
    pageCount: project.pages.length,
    pageSize: project.pageSize,
    cover,
    coverAssets,
    assetIds: projectAssetIds(project),
  };
}

/** Drops asset refs no page uses any more (safe on load, when there is no undo history). */
export function pruneUnusedAssets(project: Project): Project {
  const used = new Set(projectAssetIds(project));
  const entries = Object.entries(project.assets);
  if (entries.every(([id]) => used.has(id))) return project;
  return { ...project, assets: Object.fromEntries(entries.filter(([id]) => used.has(id))) };
}

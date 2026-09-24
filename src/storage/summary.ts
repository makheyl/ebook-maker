import { pageAssetIds, projectAssetIds } from '@/core/schema';
import type { AssetRef, Character, Project } from '@/core/schema';

export { pageAssetIds, projectAssetIds };
import type { ProjectSummary } from './repository';

export function summarize(project: Project): ProjectSummary {
  const cover = project.pages[0] ?? null;
  const coverAssets: Record<string, AssetRef> = {};
  const coverCharacters: Record<string, Character> = {};
  if (cover) {
    for (const id of pageAssetIds(cover)) {
      const ref = project.assets[id];
      if (ref) coverAssets[id] = ref;
    }
    for (const el of cover.elements) {
      const character =
        el.type === 'image' && el.characterId ? project.characters[el.characterId] : undefined;
      if (character) coverCharacters[character.id] = character;
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
    coverCharacters,
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

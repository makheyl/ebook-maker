import type { AssetRef, Character, Page, Project } from '@/core/schema';
import type { ProjectSummary } from './repository';

/** Asset ids referenced by a page (image elements and image backgrounds). */
export function pageAssetIds(page: Page): string[] {
  const ids = new Set<string>();
  if (page.background.type === 'image') ids.add(page.background.assetId);
  for (const el of page.elements) if (el.type === 'image') ids.add(el.assetId);
  return [...ids];
}

/** Every asset the book owns: page images plus each character's artwork and poses. */
export function projectAssetIds(project: Project): string[] {
  const ids = new Set<string>();
  for (const page of project.pages) for (const id of pageAssetIds(page)) ids.add(id);
  for (const character of Object.values(project.characters)) {
    ids.add(character.assetId);
    for (const pose of character.poses) ids.add(pose.assetId);
  }
  return [...ids];
}

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

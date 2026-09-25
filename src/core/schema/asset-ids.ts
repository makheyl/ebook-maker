import { voiceClips } from '../voice/lines';
import { flattenElements } from './tree';
import type { Page, Project } from './types';

/** Asset ids referenced by a page (image elements and image backgrounds, hidden ones too). */
export function pageAssetIds(page: Page): string[] {
  const ids = new Set<string>();
  if (page.background.type === 'image') ids.add(page.background.assetId);
  for (const el of flattenElements(page.elements)) if (el.type === 'image') ids.add(el.assetId);
  return [...ids];
}

/**
 * Every stored file the book owns: page images (hidden ones included), each character's
 * artwork and poses, every sound in its list, and every voice recording. Storage keeps these from garbage collection,
 * and exports carry all of them so any export can be imported back as an editable book.
 */
export function projectAssetIds(project: Project): string[] {
  const ids = new Set<string>();
  for (const page of project.pages) for (const id of pageAssetIds(page)) ids.add(id);
  for (const character of Object.values(project.characters)) {
    ids.add(character.assetId);
    for (const pose of character.poses) ids.add(pose.assetId);
  }
  // Sound and voice blobs live in the same store, so they must count as owned too.
  for (const id of Object.keys(project.sounds)) ids.add(id);
  for (const clip of voiceClips(project)) ids.add(clip.id);
  for (const id of Object.keys(project.music?.tracks ?? {})) ids.add(id);
  return [...ids];
}

import type { Draft } from 'immer';
import type { AssetRef, Character, Project } from '../schema/types';
import { getPage } from './pages';
import { cleanReferences } from './references';

type DraftCharacter = Draft<Project>['characters'][string];

export function addCharacter(draft: Draft<Project>, character: Character): void {
  draft.characters[character.id] = character;
}

export function updateCharacter(
  draft: Draft<Project>,
  characterId: string,
  recipe: (character: DraftCharacter) => void,
): void {
  const character = draft.characters[characterId];
  if (character) recipe(character);
}

/** Makes an image an instance of a character (or a plain image again with `undefined`). */
export function linkCharacter(
  draft: Draft<Project>,
  pageId: string,
  elementId: string,
  characterId: string | undefined,
): void {
  const el = getPage(draft, pageId).elements.find((e) => e.id === elementId);
  if (el?.type !== 'image') return;
  if (characterId) el.characterId = characterId;
  else {
    delete el.characterId;
    delete el.idleOverride;
  }
}

/** Deletes a character; its instances become plain images again. */
export function removeCharacter(draft: Draft<Project>, characterId: string): void {
  delete draft.characters[characterId];
  for (const page of draft.pages) {
    for (const el of page.elements) {
      if (el.type === 'image' && el.characterId === characterId) delete el.idleOverride;
    }
  }
  cleanReferences(draft);
}

/** Stores transparency info computed after the fact (for images uploaded before v2). */
export function setAssetAlpha(
  draft: Draft<Project>,
  assetId: string,
  info: Pick<AssetRef, 'hasAlpha' | 'opaqueBounds'>,
): void {
  const asset = draft.assets[assetId];
  if (!asset) return;
  asset.hasAlpha = info.hasAlpha;
  if (info.opaqueBounds) asset.opaqueBounds = info.opaqueBounds;
}

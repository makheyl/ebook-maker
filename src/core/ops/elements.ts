import type { Draft } from 'immer';
import { newId } from '../ids';
import type { AssetRef, Character, PageElement, Project } from '../schema/types';
import { getPage } from './pages';
import { cleanReferences } from './references';
import { plain } from './util';

type DraftPage = Draft<Project>['pages'][number];
type DraftElement = DraftPage['elements'][number];

export type GeometryPatch = Partial<
  Pick<
    PageElement,
    'x' | 'y' | 'width' | 'height' | 'rotation' | 'opacity' | 'locked' | 'hidden' | 'name'
  >
>;

export function getElement(page: DraftPage, elementId: string): DraftElement {
  const el = page.elements.find((e) => e.id === elementId);
  if (!el) throw new Error(`Element ${elementId} not found`);
  return el;
}

/** Adds elements on top of the stack (or at `index`). */
export function addElements(
  draft: Draft<Project>,
  pageId: string,
  elements: readonly PageElement[],
  index?: number,
): void {
  const page = getPage(draft, pageId);
  const at = index === undefined ? page.elements.length : index;
  page.elements.splice(at, 0, ...(elements as DraftElement[]));
}

/** Applies a type-aware recipe to one element. */
export function updateElement(
  draft: Draft<Project>,
  pageId: string,
  elementId: string,
  recipe: (el: DraftElement) => void,
): void {
  recipe(getElement(getPage(draft, pageId), elementId));
}

/** Shallow-merges shared fields (geometry, opacity, lock/hide, name) into many elements. */
export function patchElements(
  draft: Draft<Project>,
  pageId: string,
  patches: ReadonlyArray<{ id: string; patch: GeometryPatch }>,
): void {
  const page = getPage(draft, pageId);
  for (const { id, patch } of patches) {
    const el = page.elements.find((e) => e.id === id);
    if (el) Object.assign(el, patch);
  }
}

/** Deletes elements together with their animation steps. */
export function deleteElements(
  draft: Draft<Project>,
  pageId: string,
  ids: readonly string[],
): void {
  const doomed = new Set(ids);
  const page = getPage(draft, pageId);
  page.elements = page.elements.filter((e) => !doomed.has(e.id));
  page.animations = page.animations.filter((a) => !doomed.has(a.elementId));
  cleanReferences(draft);
}

export function cloneElement<T extends PageElement>(el: T, offset = 0): T {
  const copy = structuredClone(plain(el)) as T;
  copy.id = newId('el');
  copy.x += offset;
  copy.y += offset;
  if (copy.interactions) {
    copy.interactions = copy.interactions.map((i) => ({ ...i, id: newId('ia') }));
  }
  return copy;
}

/**
 * Duplicates elements (with their animations) on top of the stack, offset slightly,
 * and returns the new ids in the same order as `ids`.
 */
export function duplicateElements(
  draft: Draft<Project>,
  pageId: string,
  ids: readonly string[],
  offset = 24,
): string[] {
  const page = getPage(draft, pageId);
  const wanted = new Set(ids);
  const sources = page.elements.filter((e) => wanted.has(e.id)) as PageElement[];
  const idMap = new Map<string, string>();
  const copies = sources.map((src) => {
    const copy = cloneElement(src, offset);
    idMap.set(src.id, copy.id);
    return copy;
  });
  page.elements.push(...(copies as DraftElement[]));
  const steps = page.animations.filter((a) => idMap.has(a.elementId)).map((a) => plain(a));
  const stepMap = new Map<string, string>();
  for (const step of steps) {
    const stepId = newId('an');
    stepMap.set(step.id, stepId);
    page.animations.push({
      ...structuredClone(step),
      id: stepId,
      elementId: idMap.get(step.elementId)!,
    });
  }
  // A copied "tap → play my reaction" should play the copy's reaction, not the original's.
  for (const copy of copies) {
    const target = page.elements.find((e) => e.id === copy.id);
    if (!target?.interactions) continue;
    for (const interaction of target.interactions) {
      for (const action of interaction.actions) {
        if (action.type === 'playStep' && stepMap.has(action.stepId)) {
          action.stepId = stepMap.get(action.stepId)!;
        }
      }
    }
  }
  return ids.map((id) => idMap.get(id)).filter((id): id is string => !!id);
}

/**
 * Pastes elements (copied from any page or book) with fresh ids. Asset refs and character
 * definitions travel with them so images and characters still resolve in another book.
 * Interactions that pointed at things on the source page are dropped by cleanReferences.
 */
export function pasteElements(
  draft: Draft<Project>,
  pageId: string,
  elements: readonly PageElement[],
  assets: Readonly<Record<string, AssetRef>>,
  offset = 24,
  characters: Readonly<Record<string, Character>> = {},
): string[] {
  const copyAsset = (id: string) => {
    if (assets[id] && !draft.assets[id]) draft.assets[id] = { ...assets[id]! };
  };
  for (const el of elements) {
    if (el.type !== 'image') continue;
    copyAsset(el.assetId);
    const character = el.characterId ? characters[el.characterId] : undefined;
    if (character && !draft.characters[character.id]) {
      draft.characters[character.id] = structuredClone(character);
      copyAsset(character.assetId);
      character.poses.forEach((p) => copyAsset(p.assetId));
    }
  }
  const copies = elements.map((el) => cloneElement(el, offset));
  getPage(draft, pageId).elements.push(...(copies as DraftElement[]));
  cleanReferences(draft);
  return copies.map((c) => c.id);
}

export function addAsset(draft: Draft<Project>, asset: AssetRef): void {
  draft.assets[asset.id] = asset;
}

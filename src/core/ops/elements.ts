import type { Draft } from 'immer';
import { newId } from '../ids';
import type { AssetRef, PageElement, Project } from '../schema/types';
import { getPage } from './pages';
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
}

export function cloneElement<T extends PageElement>(el: T, offset = 0): T {
  const copy = structuredClone(plain(el)) as T;
  copy.id = newId('el');
  copy.x += offset;
  copy.y += offset;
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
  for (const step of steps) {
    page.animations.push({
      ...structuredClone(step),
      id: newId('an'),
      elementId: idMap.get(step.elementId)!,
    });
  }
  return ids.map((id) => idMap.get(id)).filter((id): id is string => !!id);
}

/**
 * Pastes elements (copied from any page or book) with fresh ids.
 * Asset refs travel with them so images still resolve in another book.
 */
export function pasteElements(
  draft: Draft<Project>,
  pageId: string,
  elements: readonly PageElement[],
  assets: Readonly<Record<string, AssetRef>>,
  offset = 24,
): string[] {
  for (const el of elements) {
    if (el.type === 'image' && assets[el.assetId] && !draft.assets[el.assetId]) {
      draft.assets[el.assetId] = { ...assets[el.assetId]! };
    }
  }
  const copies = elements.map((el) => cloneElement(el, offset));
  getPage(draft, pageId).elements.push(...(copies as DraftElement[]));
  return copies.map((c) => c.id);
}

export function addAsset(draft: Draft<Project>, asset: AssetRef): void {
  draft.assets[asset.id] = asset;
}

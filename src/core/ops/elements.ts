import type { Draft } from 'immer';
import { newId } from '../ids';
import { findElement, flattenElements, isGroup, locate, walkElements } from '../schema/tree';
import type { AssetRef, Character, PageElement, Project } from '../schema/types';
import { fitGroupsToChildren, scaleGroupChildren } from './groups';
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

/** Finds an element anywhere on the page, inside groups too. */
export function getElement(page: DraftPage, elementId: string): DraftElement {
  const el = findElement(page.elements, elementId);
  if (!el) throw new Error(`Element ${elementId} not found`);
  return el;
}

/** Adds elements on top of the page's stack (or at `index`). */
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

/** Applies a type-aware recipe to one element (anywhere in the tree). */
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
    const el = findElement(page.elements, id);
    if (!el) continue;
    if (el.type === 'group' && (patch.width !== undefined || patch.height !== undefined)) {
      scaleGroupChildren(el, patch.width ?? el.width, patch.height ?? el.height);
    }
    Object.assign(el, patch);
  }
  // Moving or resizing something inside a group changes the group's bounds.
  fitGroupsToChildren(page);
}

/** Deletes elements (and everything inside deleted groups) together with their animation steps. */
export function deleteElements(
  draft: Draft<Project>,
  pageId: string,
  ids: readonly string[],
): void {
  const page = getPage(draft, pageId);
  const doomed = new Set<string>();
  for (const id of ids) {
    const el = findElement(page.elements, id);
    if (el) for (const e of flattenElements([el as PageElement])) doomed.add(e.id);
  }
  const prune = (list: DraftElement[]): DraftElement[] =>
    list
      .filter((e) => !doomed.has(e.id))
      .map((e) => {
        if (isGroup(e as PageElement)) {
          const g = e as Extract<DraftElement, { type: 'group' }>;
          g.children = prune(g.children as DraftElement[]) as typeof g.children;
        }
        return e;
      })
      // A group left empty goes too.
      .filter(
        (e) => !(isGroup(e as PageElement) && (e as { children: unknown[] }).children.length === 0),
      );
  page.elements = prune(page.elements);
  page.animations = page.animations.filter((a) => !doomed.has(a.elementId));
  fitGroupsToChildren(page);
  cleanReferences(draft);
}

/**
 * A copy with fresh ids (all the way down, for groups). `idMap` collects old → new element ids
 * so animation steps and "play step" actions can follow.
 */
export function cloneElement<T extends PageElement>(
  el: T,
  offset = 0,
  idMap: Map<string, string> = new Map(),
): T {
  const copy = structuredClone(plain(el)) as T;
  walkElements([copy], (e) => {
    const nextId = newId('el');
    idMap.set(e.id, nextId);
    e.id = nextId;
    if (e.interactions) e.interactions = e.interactions.map((i) => ({ ...i, id: newId('ia') }));
  });
  copy.x += offset;
  copy.y += offset;
  return copy;
}

/**
 * Duplicates elements (with their animations) on top of their own stack (inside the same
 * group), offset slightly, and returns the new ids in the same order as `ids`.
 */
export function duplicateElements(
  draft: Draft<Project>,
  pageId: string,
  ids: readonly string[],
  offset = 24,
): string[] {
  const page = getPage(draft, pageId);
  const idMap = new Map<string, string>();
  const topMap = new Map<string, string>();
  const copies: PageElement[] = [];
  for (const id of ids) {
    const where = locate(page.elements, id);
    if (!where) continue;
    const copy = cloneElement(where.list[where.index] as PageElement, offset, idMap);
    topMap.set(id, copy.id);
    (where.list as DraftElement[]).push(copy as DraftElement);
    copies.push(copy);
  }
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
    walkElements([findElement(page.elements, copy.id) as PageElement], (target) => {
      for (const interaction of target.interactions ?? []) {
        for (const action of interaction.actions) {
          if (action.type === 'playStep' && stepMap.has(action.stepId)) {
            action.stepId = stepMap.get(action.stepId)!;
          }
        }
      }
    });
  }
  fitGroupsToChildren(page);
  return ids.map((id) => topMap.get(id)).filter((id): id is string => !!id);
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
  for (const el of flattenElements(elements)) {
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

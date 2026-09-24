import { walkElements } from '../schema/tree';
import type { Draft } from 'immer';
import { newId } from '../ids';
import { createPage } from '../schema/factories';
import type { Page, Project } from '../schema/types';
import { cleanReferences } from './references';
import { arrayMove, plain } from './util';

/**
 * Core document operations are Immer recipes: they mutate a draft project and are
 * recorded by the patch history, so every one of them is undoable for free.
 */

export function pageIndex(project: Project | Draft<Project>, pageId: string): number {
  const index = project.pages.findIndex((p) => p.id === pageId);
  if (index < 0) throw new Error(`Page ${pageId} not found`);
  return index;
}

export function getPage<P extends Project | Draft<Project>>(
  project: P,
  pageId: string,
): P['pages'][number] {
  return project.pages[pageIndex(project, pageId)]!;
}

export function addPage(draft: Draft<Project>, page: Page, index = draft.pages.length): void {
  draft.pages.splice(Math.max(0, Math.min(index, draft.pages.length)), 0, page);
}

/**
 * Deep-copies a page with fresh page, element, animation and interaction ids. Actions that
 * play a step on the page are re-pointed at the copied steps.
 */
export function clonePage(page: Page): Page {
  const copy = structuredClone(page) as Page;
  const idMap = new Map<string, string>();
  copy.id = newId('pg');
  walkElements(copy.elements, (el) => {
    const nextId = newId('el');
    idMap.set(el.id, nextId);
    el.id = nextId;
  });
  const stepMap = new Map<string, string>();
  copy.animations = copy.animations
    .filter((a) => idMap.has(a.elementId))
    .map((a) => {
      const nextId = newId('an');
      stepMap.set(a.id, nextId);
      return { ...a, id: nextId, elementId: idMap.get(a.elementId)! };
    });
  walkElements(copy.elements, (el) => {
    if (!el.interactions) return;
    el.interactions = el.interactions.map((i) => ({
      ...i,
      id: newId('ia'),
      actions: i.actions.map((a) =>
        a.type === 'playStep' && stepMap.has(a.stepId)
          ? { ...a, stepId: stepMap.get(a.stepId)! }
          : a,
      ),
    }));
  });
  return copy;
}

/** Inserts a copy right after the original and returns the new page id. */
export function duplicatePage(draft: Draft<Project>, pageId: string): string {
  const index = pageIndex(draft, pageId);
  const copy = clonePage(plain(draft.pages[index]) as Page);
  draft.pages.splice(index + 1, 0, copy);
  return copy.id;
}

/** Deletes pages; a book always keeps at least one page. */
export function deletePages(draft: Draft<Project>, pageIds: readonly string[]): void {
  const doomed = new Set(pageIds);
  const remaining = draft.pages.filter((p) => !doomed.has(p.id));
  draft.pages = remaining.length ? remaining : [createPage(draft.theme)];
  cleanReferences(draft);
}

export function movePage(draft: Draft<Project>, from: number, to: number): void {
  arrayMove(draft.pages, from, to);
}

export function updatePage(
  draft: Draft<Project>,
  pageId: string,
  patch: Partial<Pick<Page, 'background' | 'transition' | 'notes' | 'flow' | 'goal'>>,
): void {
  Object.assign(getPage(draft, pageId), patch);
}

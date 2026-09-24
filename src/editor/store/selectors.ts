import { flattenElements } from '@/core/schema/tree';
import { useDocStore } from './doc-store';
import { useUiStore } from './ui-store';
import type { Page, PageElement, Project } from '@/core/schema';

/** The open project; editor components only render once it is loaded. */
export function useProject(): Project {
  const project = useDocStore((s) => s.project);
  if (!project) throw new Error('useProject used outside a loaded editor');
  return project;
}

/** Resolves the active page, falling back to the first page (e.g. after undoing a page add). */
export function resolveActivePage(project: Project, activePageId: string | null): Page {
  return project.pages.find((p) => p.id === activePageId) ?? project.pages[0]!;
}

export function useActivePage(): Page {
  const project = useProject();
  const activePageId = useUiStore((s) => s.activePageId);
  return resolveActivePage(project, activePageId);
}

/** Selected elements (anywhere, inside groups too) that still exist on the active page. */
export function useSelectedElements(): PageElement[] {
  const page = useActivePage();
  const selectedIds = useUiStore((s) => s.selectedIds);
  return flattenElements(page.elements).filter((e) => selectedIds.includes(e.id));
}

/** Imperative helpers for event handlers. */
export function getActivePage(): Page | null {
  const project = useDocStore.getState().project;
  if (!project) return null;
  return resolveActivePage(project, useUiStore.getState().activePageId);
}

export function getSelectedElements(): PageElement[] {
  const page = getActivePage();
  if (!page) return [];
  const ids = useUiStore.getState().selectedIds;
  return flattenElements(page.elements).filter((e) => ids.includes(e.id));
}

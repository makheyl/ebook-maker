import { flattenElements } from '../schema/tree';
import type { Page, Project } from '../schema/types';
import { accessibleName } from './names';

export { accessibleName };

export type CheckIssue = {
  /** Stable key for React lists. */
  id: string;
  severity: 'error' | 'warning';
  pageId: string;
  elementId?: string;
  message: string;
};

/** Actions that take the reader to another page (anything after them never runs). */
const NAVIGATION = new Set(['next', 'prev', 'goToPage', 'firstPage']);

const pageLabel = (project: Project, pageId: string) =>
  `Page ${project.pages.findIndex((p) => p.id === pageId) + 1}`;

/** Whether tapping something on the page can let the reader leave it. */
function hasWayOut(page: Page): boolean {
  if (page.goal && page.goal.count > 0) {
    const collectibles = flattenElements(page.elements).filter((e) =>
      e.interactions?.some((i) => i.actions.some((a) => a.type === 'collect')),
    ).length;
    if (collectibles >= page.goal.count) return true;
  }
  return flattenElements(page.elements).some(
    (e) =>
      !e.hidden &&
      e.interactions?.some((i) =>
        i.actions.some((a) => ['next', 'goToPage', 'unlockNext', 'firstPage'].includes(a.type)),
      ),
  );
}

/** Pages the reader can reach from page 1 by reading forward and tapping. */
export function reachablePages(project: Project): Set<string> {
  const index = new Map(project.pages.map((p, i) => [p.id, i]));
  const seen = new Set<string>();
  const queue = project.pages.length ? [0] : [];
  while (queue.length) {
    const i = queue.shift()!;
    const page = project.pages[i];
    if (!page || seen.has(page.id)) continue;
    seen.add(page.id);
    const next = page.flow?.next;
    if (next === undefined) queue.push(i + 1);
    else if (next !== 'end' && index.has(next)) queue.push(index.get(next)!);
    for (const e of flattenElements(page.elements)) {
      for (const it of e.interactions ?? []) {
        for (const a of it.actions) {
          if (a.type === 'goToPage' && index.has(a.pageId)) queue.push(index.get(a.pageId)!);
          if (a.type === 'next') queue.push(i + 1);
        }
      }
    }
  }
  return seen;
}

/**
 * Editor "checks" for interactive books: things a reader would trip over. Pure so it can be
 * unit-tested and shown live in the Interact tab.
 */
export function validateInteractivity(project: Project): CheckIssue[] {
  const issues: CheckIssue[] = [];
  const pageIds = new Set(project.pages.map((p) => p.id));
  for (const page of project.pages) {
    const stepIds = new Set(page.animations.map((s) => s.id));
    if (page.flow?.lockNext && !hasWayOut(page)) {
      issues.push({
        id: `lock:${page.id}`,
        severity: 'error',
        pageId: page.id,
        message: `${pageLabel(project, page.id)} is locked but nothing on it unlocks the next page.`,
      });
    }
    if (page.flow?.next && page.flow.next !== 'end' && !pageIds.has(page.flow.next)) {
      issues.push({
        id: `flow:${page.id}`,
        severity: 'error',
        pageId: page.id,
        message: `${pageLabel(project, page.id)} continues to a page that no longer exists.`,
      });
    }
    if (page.flow?.next === page.id) {
      issues.push({
        id: `self:${page.id}`,
        severity: 'warning',
        pageId: page.id,
        message: `${pageLabel(project, page.id)} continues to itself — readers can only go back.`,
      });
    }
    if (page.goal && page.goal.count > 0) {
      const collectibles = flattenElements(page.elements).filter((e) =>
        e.interactions?.some((i) => i.actions.some((a) => a.type === 'collect')),
      ).length;
      if (collectibles < page.goal.count) {
        issues.push({
          id: `goal:${page.id}`,
          severity: 'warning',
          pageId: page.id,
          message: `${pageLabel(project, page.id)} asks for ${page.goal.count} items but only ${collectibles} can be collected.`,
        });
      }
    }
    for (const element of flattenElements(page.elements)) {
      const interactions = element.interactions ?? [];
      const interactive =
        element.type === 'button' || element.type === 'hotspot' || interactions.length > 0;
      const characterName =
        element.type === 'image' && element.characterId
          ? project.characters[element.characterId]?.name
          : undefined;
      if (interactive && !accessibleName(element, characterName)) {
        issues.push({
          id: `name:${element.id}`,
          severity: 'warning',
          pageId: page.id,
          elementId: element.id,
          message: `“${element.name}” on ${pageLabel(project, page.id)} needs a name for screen readers.`,
        });
      }
      if ((element.type === 'button' || element.type === 'hotspot') && !interactions.length) {
        issues.push({
          id: `noop:${element.id}`,
          severity: 'warning',
          pageId: page.id,
          elementId: element.id,
          message: `“${element.name}” on ${pageLabel(project, page.id)} doesn't do anything when tapped yet.`,
        });
      }
      for (const it of interactions) {
        const nav = it.actions.findIndex((a) => NAVIGATION.has(a.type));
        if (nav >= 0 && nav < it.actions.length - 1) {
          issues.push({
            id: `afternav:${it.id}`,
            severity: 'warning',
            pageId: page.id,
            elementId: element.id,
            message: `“${element.name}” on ${pageLabel(project, page.id)} has actions after a page turn — they won't run.`,
          });
        }
        for (const a of it.actions) {
          const dangling =
            (a.type === 'goToPage' && !pageIds.has(a.pageId)) ||
            (a.type === 'playStep' && !stepIds.has(a.stepId)) ||
            (a.type === 'playSound' && !project.sounds[a.soundId]);
          if (dangling) {
            issues.push({
              id: `dangling:${it.id}:${a.type}`,
              severity: 'error',
              pageId: page.id,
              elementId: element.id,
              message: `“${element.name}” on ${pageLabel(project, page.id)} points at something that was deleted.`,
            });
          }
        }
      }
    }
  }
  if (!project.reader.showPageMenu) {
    const reachable = reachablePages(project);
    for (const page of project.pages) {
      if (!reachable.has(page.id)) {
        issues.push({
          id: `unreachable:${page.id}`,
          severity: 'warning',
          pageId: page.id,
          message: `Readers can't get to ${pageLabel(project, page.id)} — no page or button leads there.`,
        });
      }
    }
  }
  return issues;
}

import type { GroupElement, PageElement } from './types';

/**
 * Elements form a tree once groups exist. These helpers are how everything finds, walks and
 * places elements; code that only cares about top-level layout can keep using `page.elements`.
 */

export const isGroup = (el: PageElement): el is GroupElement => el.type === 'group';

/** Visits every element depth-first (a group before its children). Return false to skip a subtree. */
export function walkElements(
  elements: readonly PageElement[],
  visit: (el: PageElement, parent: GroupElement | null, depth: number) => void | false,
  parent: GroupElement | null = null,
  depth = 0,
): void {
  for (const el of elements) {
    if (visit(el, parent, depth) === false) continue;
    if (isGroup(el)) walkElements(el.children, visit, el, depth + 1);
  }
}

/** Every element, groups and their descendants included, in drawing order. */
export function flattenElements(elements: readonly PageElement[]): PageElement[] {
  const out: PageElement[] = [];
  walkElements(elements, (el) => void out.push(el));
  return out;
}

export function findElement<T extends PageElement>(
  elements: readonly T[],
  id: string,
): T | undefined {
  for (const el of elements) {
    if (el.id === id) return el;
    if (isGroup(el)) {
      const hit = findElement(el.children as T[], id);
      if (hit) return hit;
    }
  }
  return undefined;
}

/** The array that holds the element (the page's list or a group's children), and its index. */
export function locate<T extends PageElement>(
  elements: T[],
  id: string,
): { list: T[]; index: number; parent: GroupElement | null } | undefined {
  const index = elements.findIndex((e) => e.id === id);
  if (index >= 0) return { list: elements, index, parent: null };
  for (const el of elements) {
    if (!isGroup(el)) continue;
    const hit = locate(el.children as T[], id);
    if (hit) return { ...hit, parent: hit.parent ?? el };
  }
  return undefined;
}

/** The groups containing the element, outermost first. */
export function ancestorsOf(elements: readonly PageElement[], id: string): GroupElement[] {
  for (const el of elements) {
    if (el.id === id) return [];
    if (isGroup(el)) {
      if (el.children.some((c) => c.id === id)) return [el];
      const deeper = ancestorsOf(el.children, id);
      if (deeper.length || findElement(el.children, id)) return [el, ...deeper];
    }
  }
  return [];
}

export const parentOf = (elements: readonly PageElement[], id: string): GroupElement | null =>
  ancestorsOf(elements, id).at(-1) ?? null;

/** How deeply nested groups are below (and including) this element. */
export function groupDepth(el: PageElement): number {
  return isGroup(el) ? 1 + Math.max(0, ...el.children.map(groupDepth)) : 0;
}

export type Point = { x: number; y: number };

/**
 * Maps a point in an element's parent space to page space, through every enclosing group's
 * position and rotation (each group rotates about its own centre, like elements do).
 */
export function toPageSpace(ancestors: readonly GroupElement[], p: Point): Point {
  let point = p;
  for (let i = ancestors.length - 1; i >= 0; i--) {
    const g = ancestors[i]!;
    const cx = g.width / 2;
    const cy = g.height / 2;
    const r = (g.rotation * Math.PI) / 180;
    const dx = point.x - cx;
    const dy = point.y - cy;
    point = {
      x: g.x + cx + dx * Math.cos(r) - dy * Math.sin(r),
      y: g.y + cy + dx * Math.sin(r) + dy * Math.cos(r),
    };
  }
  return point;
}

/** The inverse of toPageSpace: a page point in the space of the innermost ancestor. */
export function fromPageSpace(ancestors: readonly GroupElement[], p: Point): Point {
  let point = p;
  for (const g of ancestors) {
    const cx = g.width / 2;
    const cy = g.height / 2;
    const r = (-g.rotation * Math.PI) / 180;
    const dx = point.x - g.x - cx;
    const dy = point.y - g.y - cy;
    point = {
      x: cx + dx * Math.cos(r) - dy * Math.sin(r),
      y: cy + dx * Math.sin(r) + dy * Math.cos(r),
    };
  }
  return point;
}

/** Sum of the enclosing groups' rotations (degrees). */
export const inheritedRotation = (ancestors: readonly GroupElement[]) =>
  ancestors.reduce((sum, g) => sum + g.rotation, 0);

/** Replaces elements anywhere in the tree (pure): `map` returns the new element or the same one. */
export function mapElements(
  elements: readonly PageElement[],
  map: (el: PageElement) => PageElement,
): PageElement[] {
  let changed = false;
  const out = elements.map((el) => {
    let next = map(el);
    if (isGroup(next)) {
      const children = mapElements(next.children, map);
      if (children !== next.children) next = { ...next, children };
    }
    if (next !== el) changed = true;
    return next;
  });
  return changed ? out : (elements as PageElement[]);
}

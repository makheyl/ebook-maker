import type { Draft } from 'immer';
import { rotatedBounds, unionRects } from '../geometry';
import { newId } from '../ids';
import { MAX_GROUP_DEPTH } from '../schema/project';
import {
  ancestorsOf,
  findElement,
  fromPageSpace,
  groupDepth,
  inheritedRotation,
  isGroup,
  locate,
  toPageSpace,
} from '../schema/tree';
import type { GroupElement, Page, PageElement, Project } from '../schema/types';
import { getPage } from './pages';
import { cleanReferences } from './references';

type DraftPage = Draft<Project>['pages'][number];
type AnyElement = PageElement | Draft<PageElement>;

/**
 * Shrinks or grows a group's box to exactly fit its children, without moving anything on the
 * page: children shift inside the group and the group moves by the same amount (through its
 * rotation). Keeps "the group's box = its children's bounds" true after edits inside it.
 */
export function fitGroupToChildren(group: GroupElement | Draft<GroupElement>): void {
  const bounds = unionRects(group.children.map((c) => rotatedBounds(c)));
  if (!bounds) return;
  const { x: minX, y: minY, width: w2, height: h2 } = bounds;
  if (
    Math.abs(minX) < 0.01 &&
    Math.abs(minY) < 0.01 &&
    Math.abs(w2 - group.width) < 0.01 &&
    Math.abs(h2 - group.height) < 0.01
  ) {
    return;
  }
  const r = (group.rotation * Math.PI) / 180;
  // Centre of the new box, relative to the old box's centre, rotated into the parent space.
  const dx = minX + w2 / 2 - group.width / 2;
  const dy = minY + h2 / 2 - group.height / 2;
  const cx = group.x + group.width / 2 + dx * Math.cos(r) - dy * Math.sin(r);
  const cy = group.y + group.height / 2 + dx * Math.sin(r) + dy * Math.cos(r);
  for (const child of group.children) {
    child.x -= minX;
    child.y -= minY;
  }
  group.width = w2;
  group.height = h2;
  group.x = cx - w2 / 2;
  group.y = cy - h2 / 2;
}

/** Re-fits every group on the page (innermost first). */
export function fitGroupsToChildren(page: Page | DraftPage): void {
  const visit = (list: readonly AnyElement[]) => {
    for (const el of list) {
      if (!isGroup(el as PageElement)) continue;
      const g = el as GroupElement;
      visit(g.children);
      if (g.children.length) fitGroupToChildren(g);
    }
  };
  visit(page.elements as AnyElement[]);
}

/** Scales everything inside a group so the group takes a new size (fonts are unchanged). */
export function scaleGroupChildren(
  group: GroupElement | Draft<GroupElement>,
  width: number,
  height: number,
): void {
  const sx = width / group.width;
  const sy = height / group.height;
  const scale = (list: AnyElement[]) => {
    for (const el of list) {
      el.x *= sx;
      el.y *= sy;
      el.width = Math.max(1, el.width * sx);
      el.height = Math.max(1, el.height * sy);
      if (isGroup(el as PageElement)) scale((el as GroupElement).children as AnyElement[]);
    }
  };
  scale(group.children as AnyElement[]);
  group.width = width;
  group.height = height;
}

/** Whether these elements can be grouped: 2+ siblings, not too deeply nested afterwards. */
export function canGroup(page: Page, ids: readonly string[]): boolean {
  if (ids.length < 2) return false;
  const first = locate(page.elements, ids[0]!);
  if (!first) return false;
  if (!ids.every((id) => locate(page.elements, id)?.list === first.list)) return false;
  const depth = ancestorsOf(page.elements, ids[0]!).length;
  const inner = Math.max(
    ...ids.map((id) => groupDepth(findElement(page.elements, id) as PageElement)),
  );
  return depth + 1 + inner <= MAX_GROUP_DEPTH;
}

/**
 * Groups sibling elements (keeping their stacking order) at the position of the topmost one.
 * Nothing moves on the page. Returns the new group's id.
 */
export function groupElements(
  draft: Draft<Project>,
  pageId: string,
  ids: readonly string[],
): string | undefined {
  const page = getPage(draft, pageId);
  if (!canGroup(page as Page, ids)) return undefined;
  const where = locate(page.elements, ids[0]!)!;
  const list = where.list as AnyElement[];
  const chosen = new Set(ids);
  const indexes = list.flatMap((e, i) => (chosen.has(e.id) ? [i] : []));
  const members = indexes.map((i) => list[i]!);
  const bounds = unionRects(members.map((m) => rotatedBounds(m)))!;
  const children = members.map((m) => {
    const copy = structuredClone(JSON.parse(JSON.stringify(m))) as PageElement;
    copy.x -= bounds.x;
    copy.y -= bounds.y;
    return copy;
  });
  const group: GroupElement = {
    id: newId('el'),
    type: 'group',
    name: 'Group',
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    rotation: 0,
    opacity: 1,
    locked: false,
    hidden: false,
    children,
  };
  const top = indexes[indexes.length - 1]!;
  const insertAt = top - (indexes.length - 1);
  for (let i = indexes.length - 1; i >= 0; i--) list.splice(indexes[i]!, 1);
  list.splice(insertAt, 0, group as AnyElement);
  fitGroupsToChildren(page);
  return group.id;
}

/**
 * Ungroups: the children take the group's place in the stack, keeping where they are on the
 * page (the group's rotation, opacity and visibility pass on to them). The group's own
 * animations and tap actions go (as in PowerPoint). Returns the children's ids and how many of
 * the group's animation steps were removed.
 */
export function ungroupElements(
  draft: Draft<Project>,
  pageId: string,
  groupId: string,
): { ids: string[]; removedSteps: number } {
  const page = getPage(draft, pageId);
  const where = locate(page.elements, groupId);
  const group = where && (where.list[where.index] as PageElement);
  if (!where || !group || !isGroup(group)) return { ids: [], removedSteps: 0 };
  const g = JSON.parse(JSON.stringify(group)) as GroupElement;
  const outer = ancestorsOf(page.elements as PageElement[], groupId);
  const children = g.children.map((child) => {
    const center = { x: child.x + child.width / 2, y: child.y + child.height / 2 };
    const onPage = toPageSpace([...outer, g], center);
    const local = fromPageSpace(outer, onPage);
    return {
      ...child,
      x: local.x - child.width / 2,
      y: local.y - child.height / 2,
      rotation: normalizeAngle(child.rotation + g.rotation),
      opacity: Math.round(child.opacity * g.opacity * 1000) / 1000,
      hidden: child.hidden || g.hidden,
    } as PageElement;
  });
  (where.list as AnyElement[]).splice(where.index, 1, ...(children as AnyElement[]));
  const before = page.animations.length;
  page.animations = page.animations.filter((a) => a.elementId !== groupId);
  const removedSteps = before - page.animations.length;
  fitGroupsToChildren(page);
  cleanReferences(draft);
  return { ids: children.map((c) => c.id), removedSteps };
}

/**
 * Moves an element into another group (or out to the page, `parentId` null) at `index` of that
 * list, keeping where it is on the page.
 */
export function moveToParent(
  draft: Draft<Project>,
  pageId: string,
  id: string,
  parentId: string | null,
  index: number,
): void {
  const page = getPage(draft, pageId);
  const from = locate(page.elements, id);
  if (!from || id === parentId) return;
  const el = JSON.parse(JSON.stringify(from.list[from.index])) as PageElement;
  // Can't move a group into itself or its own descendants.
  if (parentId && findElement([el], parentId)) return;
  const oldChain = ancestorsOf(page.elements as PageElement[], id);
  const center = { x: el.x + el.width / 2, y: el.y + el.height / 2 };
  const onPage = toPageSpace(oldChain, center);
  const pageRotation = el.rotation + inheritedRotation(oldChain);
  from.list.splice(from.index, 1);
  const target = parentId ? (findElement(page.elements, parentId) as PageElement) : null;
  if (parentId && (!target || !isGroup(target))) return;
  const newChain = target
    ? [...ancestorsOf(page.elements as PageElement[], parentId!), target as GroupElement]
    : [];
  if (newChain.length + groupDepth(el) > MAX_GROUP_DEPTH) return;
  const local = fromPageSpace(newChain, onPage);
  const moved = {
    ...el,
    x: local.x - el.width / 2,
    y: local.y - el.height / 2,
    rotation: normalizeAngle(pageRotation - inheritedRotation(newChain)),
  } as PageElement;
  const list = (target ? (target as GroupElement).children : page.elements) as AnyElement[];
  list.splice(Math.max(0, Math.min(index, list.length)), 0, moved as AnyElement);
  fitGroupsToChildren(page);
  cleanReferences(draft);
}

const normalizeAngle = (deg: number) => {
  const a = ((deg % 360) + 360) % 360;
  return Math.round((a > 180 ? a - 360 : a) * 100) / 100;
};

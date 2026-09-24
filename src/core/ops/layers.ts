import type { Draft } from 'immer';
import { locate } from '../schema/tree';
import type { PageElement, Project } from '../schema/types';
import { getPage } from './pages';
import { arrayMove } from './util';

export type LayerMove = 'forward' | 'backward' | 'front' | 'back';

/**
 * Re-stacks the selected elements. Array order is z-order (last = top).
 * Multi-selection keeps its relative order.
 */
export function reorderElements(
  draft: Draft<Project>,
  pageId: string,
  ids: readonly string[],
  move: LayerMove,
): void {
  const page = getPage(draft, pageId);
  const selected = new Set(ids);
  // Each element moves within its own stack (the page's, or its group's).
  const lists = new Set(
    ids.map((id) => locate(page.elements, id)?.list).filter((l): l is PageElement[] => !!l),
  );
  for (const els of lists) restack(els as { id: string }[], selected, move);
}

function restack(els: { id: string }[], selected: Set<string>, move: LayerMove): void {
  if (move === 'front' || move === 'back') {
    const picked = els.filter((e) => selected.has(e.id));
    const rest = els.filter((e) => !selected.has(e.id));
    els.splice(0, els.length, ...(move === 'front' ? [...rest, ...picked] : [...picked, ...rest]));
    return;
  }
  if (move === 'forward') {
    for (let i = els.length - 2; i >= 0; i--) {
      if (selected.has(els[i]!.id) && !selected.has(els[i + 1]!.id)) {
        [els[i], els[i + 1]] = [els[i + 1]!, els[i]!];
      }
    }
  } else {
    for (let i = 1; i < els.length; i++) {
      if (selected.has(els[i]!.id) && !selected.has(els[i - 1]!.id)) {
        [els[i], els[i - 1]] = [els[i - 1]!, els[i]!];
      }
    }
  }
}

/** Moves one element to an absolute stack index (used by the Layers panel drag). */
export function moveElementToIndex(
  draft: Draft<Project>,
  pageId: string,
  elementId: string,
  toIndex: number,
): void {
  const page = getPage(draft, pageId);
  const where = locate(page.elements, elementId);
  if (where) arrayMove(where.list, where.index, toIndex);
}

import type { PageView } from '@/core/render';

/** The PageView currently mounted on the editor stage (used by animation previews). */
let current: PageView | null = null;

export function setStageView(view: PageView | null): void {
  current = view;
}

export function getStageView(): PageView | null {
  return current;
}

import { createPageTimeline, type PageTimeline } from '@/core/animation';
import type { PageView } from '@/core/render';
import type { Page, PageSize } from '@/core/schema';
import { useUiStore } from '../store/ui-store';
import { endScrub, isScrubbing } from '../timeline/session';

/**
 * Plays a page's animations on the editor stage with the same runtime as the exported book.
 * Click groups auto-advance after a short pause. Stopping cancels every effect, returning the
 * stage to its editable (end-state-free) look.
 */
let active: { timeline: PageTimeline; cancelled: boolean } | null = null;

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const reducedMotion = () =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

export async function previewAnimations(
  view: PageView,
  page: Page,
  pageSize: PageSize,
  onlyStepIds?: readonly string[],
): Promise<void> {
  stopPreview();
  if (isScrubbing()) endScrub();
  useUiStore.getState().setPreviewing(true);
  const timeline = createPageTimeline(page, (id) => view.getNodes(id), {
    pageSize,
    onlyStepIds,
    reducedMotion: reducedMotion(),
  });
  const token = { timeline, cancelled: false };
  active = token;
  timeline.startIdle();
  // Let the "before" states paint (elements hidden) so entrances are visible.
  await wait(onlyStepIds ? 150 : 350);
  for (let group = 0; group < timeline.groupCount; group++) {
    if (token.cancelled) return;
    if (group > 0) await wait(500);
    if (token.cancelled) return;
    await timeline.play(group);
  }
  await wait(600);
  if (!token.cancelled && active === token) stopPreview();
}

export function stopPreview(): void {
  if (active) {
    active.cancelled = true;
    active.timeline.cancel();
    active = null;
  }
  if (useUiStore.getState().previewing) useUiStore.getState().setPreviewing(false);
}

import { createPageTimeline, type PageTimeline } from '@/core/animation';
import type { PageView } from '@/core/render';
import type { Page, PageSize, Project } from '@/core/schema';
import { startTimelineAudio, stopTimelineAudio } from '../audio/timeline-audio';
import { stopPreview } from '../animation/preview';
import { getStageView } from '../stage/stage-view';
import { useUiStore } from '../store/ui-store';

/**
 * Timeline scrubbing on the editor stage. It builds the same PageTimeline as the reader on the
 * stage's PageView and calls seek() — so what the playhead shows is exactly what the exported
 * book shows at that moment. Playback just moves the playhead and seeks every frame.
 */
type Session = { timeline: PageTimeline; page: Page; view: PageView };

let session: Session | null = null;
let raf = 0;

function ensure(page: Page, pageSize: PageSize): Session | null {
  const view = getStageView();
  if (!view) return null;
  if (session && session.page === page && session.view === view) return session;
  session?.timeline.cancel();
  // The stage must be rendered from this exact page before animations attach to its nodes.
  if (view.page !== page) view.update(page, view.assets, view.characters);
  session = {
    page,
    view,
    timeline: createPageTimeline(page, (id) => view.getNodes(id), { pageSize }),
  };
  return session;
}

export function isScrubbing(): boolean {
  return !!session;
}

/** Shows the page frozen at `ms` into `group` on the stage. */
export function scrubTo(page: Page, pageSize: PageSize, group: number, ms: number): void {
  if (!session) stopPreview();
  const s = ensure(page, pageSize);
  if (!s) return;
  const ui = useUiStore.getState();
  if (!ui.previewing) ui.setPreviewing(true);
  s.timeline.seek(Math.min(group, s.timeline.groupCount - 1), Math.max(0, ms));
  ui.setPlayhead({ group, ms: Math.max(0, ms) });
}

/** Plays from the playhead to the end of the group (looping if asked). */
export function playFrom(
  page: Page,
  pageSize: PageSize,
  opts: {
    group: number;
    from: number;
    end: number;
    speed: number;
    loop: boolean;
    onDone?: () => void;
    /** Plays the page's audio along (the timeline's language for voice lines). */
    audio?: { project: Project; lang: string };
  },
): void {
  pause();
  let ms = opts.from >= opts.end ? 0 : opts.from;
  let last = performance.now();
  const audio = () =>
    opts.audio &&
    startTimelineAudio(page, opts.audio.project, opts.group, ms, opts.speed, opts.audio.lang);
  audio();
  const tick = (now: number) => {
    ms += (now - last) * opts.speed;
    last = now;
    if (ms >= opts.end) {
      if (opts.loop) {
        ms = 0;
        audio();
      } else {
        scrubTo(page, pageSize, opts.group, opts.end);
        raf = 0;
        opts.onDone?.();
        return;
      }
    }
    scrubTo(page, pageSize, opts.group, ms);
    raf = requestAnimationFrame(tick);
  };
  scrubTo(page, pageSize, opts.group, ms);
  raf = requestAnimationFrame(tick);
}

export function pause(): void {
  if (raf) cancelAnimationFrame(raf);
  raf = 0;
  stopTimelineAudio();
}

export function isPlaying(): boolean {
  return raf !== 0;
}

/** Leaves scrub mode: effects removed, the stage is editable again. */
export function endScrub(): void {
  pause();
  session?.timeline.cancel();
  session = null;
  const ui = useUiStore.getState();
  if (ui.previewing) ui.setPreviewing(false);
}

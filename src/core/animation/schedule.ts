import type { AnimationStep } from '../schema/types';

export type ScheduledStep = {
  step: AnimationStep;
  /** Index in the page's step list. */
  index: number;
  /** ms from the start of its group. */
  start: number;
  end: number;
};

export type StepGroup = {
  /** Group 0 plays automatically when the page appears; later groups each wait for a click. */
  trigger: 'auto' | 'click';
  steps: ScheduledStep[];
  duration: number;
};

export type Schedule = { groups: StepGroup[] };

/** Total time of one step including repeats (a looping step counts one cycle). */
export function stepSpan(step: AnimationStep): number {
  if (step.loop) return step.duration;
  const iterations =
    typeof step.params?.iterations === 'number' ? Math.max(1, step.params.iterations) : 1;
  return step.duration * iterations;
}

/** Steps that only play when an interaction triggers them (not part of the click sequence). */
export function isInteractionStep(step: AnimationStep): boolean {
  return step.trigger === 'onInteraction';
}

/**
 * Turns the ordered Animation Pane list into timed groups (PowerPoint semantics):
 * - `onPageEnter`   starts when the page appears (or, after a click step, with that click)
 * - `withPrevious`  starts together with the previous step
 * - `afterPrevious` starts when the previous step ends
 * - `onClick`       waits for the reader to click / press next, and starts a new group
 * - `onInteraction` is left out entirely (it plays when a tap action triggers it)
 * Each step's delay is added to its computed start.
 */
export function scheduleSteps(steps: readonly AnimationStep[]): Schedule {
  const groups: StepGroup[] = [{ trigger: 'auto', steps: [], duration: 0 }];
  let prev: ScheduledStep | null = null;

  steps.forEach((step, index) => {
    if (isInteractionStep(step)) return;
    let group = groups[groups.length - 1]!;
    let anchor = 0;
    switch (step.trigger) {
      case 'onClick':
        group = { trigger: 'click', steps: [], duration: 0 };
        groups.push(group);
        prev = null;
        anchor = 0;
        break;
      case 'onPageEnter':
        anchor = 0;
        break;
      case 'withPrevious':
        anchor = prev ? prev.start : 0;
        break;
      case 'afterPrevious':
        anchor = prev ? prev.end : 0;
        break;
    }
    const start = anchor + step.delay;
    const scheduled: ScheduledStep = { step, index, start, end: start + stepSpan(step) };
    group.steps.push(scheduled);
    group.duration = Math.max(group.duration, scheduled.end);
    prev = scheduled;
  });

  return { groups };
}

/** Number of reader clicks the page's animations need. */
export function clickCount(steps: readonly AnimationStep[]): number {
  return steps.filter((s) => s.trigger === 'onClick').length;
}

/** Number of click groups (group 0 plus one per click) — pure, for the reader runtime. */
export function groupCount(steps: readonly AnimationStep[]): number {
  return 1 + clickCount(steps);
}

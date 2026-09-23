import type { ElementNodes } from '../render/page-view';
import type { AnimationKind, Page, PageSize } from '../schema/types';
import { resolveEasing } from './easing';
import { getPreset } from './presets';
import { scheduleSteps } from './schedule';
import type { KeyframeSpec } from './types';

/**
 * The one animation runtime (Web Animations API), shared by the editor preview, the in-app
 * preview and the exported player. It turns a page's animation steps into WAAPI animations
 * grouped by click, and drives them.
 */

export type NodeLookup = (elementId: string) => ElementNodes | undefined;
export type AnimateFn = (target: Element, keyframes: Keyframe[], options: KeyframeAnimationOptions) => Animation;

export type TimelineOptions = {
  pageSize: PageSize;
  /** Honour prefers-reduced-motion: entrances/exits become short fades, emphasis is skipped. */
  reducedMotion?: boolean;
  /** Only build these steps (Animation Pane "preview this step"). */
  onlyStepIds?: readonly string[];
  /** Injectable for tests. */
  animate?: AnimateFn;
};

export type PageTimeline = {
  /** Group 0 plays on page enter; each further group needs one "next". */
  readonly groupCount: number;
  /** Plays a group; resolves when all its animations finished (or were finished early). */
  play(group: number): Promise<void>;
  /** Jumps a group to its end state. */
  finish(group: number): void;
  /** Jumps everything to its end state (e.g. when paging backwards). */
  finishAll(): void;
  /** Removes every effect, returning elements to their natural (edited) state. */
  cancel(): void;
  isRunning(group: number): boolean;
};

const defaultAnimate: AnimateFn = (target, keyframes, options) => target.animate(keyframes, options);

/** Element ids whose text must be split into character spans for their animations. */
export function elementsNeedingCharSplit(page: Page): Set<string> {
  const ids = new Set<string>();
  for (const step of page.animations) {
    if (getPreset(step.preset)?.splitText === 'chars') ids.add(step.elementId);
  }
  return ids;
}

function reducedSpecs(kind: AnimationKind): KeyframeSpec[] {
  if (kind === 'entrance') return [{ target: 'element', keyframes: [{ opacity: 0 }, { opacity: 1 }] }];
  if (kind === 'exit') return [{ target: 'element', keyframes: [{ opacity: 1 }, { opacity: 0 }] }];
  return [];
}

export function createPageTimeline(page: Page, lookup: NodeLookup, opts: TimelineOptions): PageTimeline {
  const animate = opts.animate ?? defaultAnimate;
  const steps = opts.onlyStepIds
    ? page.animations.filter((s) => opts.onlyStepIds!.includes(s.id)).map((s) => ({ ...s, trigger: 'onPageEnter' as const, delay: 0 }))
    : page.animations;
  const schedule = scheduleSteps(steps);
  const groups: Animation[][] = schedule.groups.map(() => []);

  schedule.groups.forEach((group, gi) => {
    for (const { step, start } of group.steps) {
      const preset = getPreset(step.preset);
      const nodes = lookup(step.elementId);
      if (!preset || !nodes) continue;
      const element = nodes.element;
      if (element.hidden) continue;
      if (preset.appliesTo && !preset.appliesTo.includes(element.type)) continue;

      const params = { ...preset.defaults.params, ...step.params };
      let specs = preset.build({ element, params, pageSize: opts.pageSize });
      let duration = step.duration;
      let delay = start;
      if (opts.reducedMotion) {
        specs = reducedSpecs(preset.kind);
        duration = Math.min(duration, 250);
        delay = 0;
      }
      const fill: FillMode =
        preset.kind === 'entrance' ? 'both' : preset.kind === 'exit' || preset.holdEnd ? 'forwards' : 'none';
      const easing = resolveEasing(step.easing);

      for (const spec of specs) {
        const specEasing = spec.easing ? resolveEasing(spec.easing) : easing;
        if (spec.target === 'chars') {
          const chars = [...nodes.anim.querySelectorAll('.fl-char')];
          const each = Math.max(16, duration * (spec.durationFraction ?? 0.1));
          const spread = Math.max(0, duration - each);
          chars.forEach((char, i) => {
            const offset = chars.length > 1 ? (spread * i) / (chars.length - 1) : 0;
            groups[gi]!.push(make(char, spec.keyframes, { duration: each, delay: delay + offset, easing: specEasing, fill }));
          });
          continue;
        }
        const targets = spec.target === 'media' ? [...nodes.anim.querySelectorAll('.fl-img')] : [nodes.anim];
        for (const target of targets) {
          groups[gi]!.push(
            make(target, spec.keyframes, {
              duration,
              delay,
              easing: specEasing,
              fill,
              iterations: spec.iterations ?? 1,
            }),
          );
        }
      }
    }
  });

  function make(target: Element, keyframes: Keyframe[], options: KeyframeAnimationOptions): Animation {
    let anim: Animation;
    try {
      anim = animate(target, keyframes, options);
    } catch {
      // An unsupported easing string throws; fall back to a safe one.
      anim = animate(target, keyframes, { ...options, easing: 'ease-out' });
    }
    // Hold at t=0 so entrances apply their "before" state (hidden) until played.
    anim.pause();
    anim.currentTime = 0;
    return anim;
  }

  return {
    groupCount: groups.length,
    play(group) {
      const anims = groups[group] ?? [];
      for (const a of anims) {
        a.currentTime = 0;
        a.play();
      }
      return Promise.all(anims.map((a) => a.finished.then(() => undefined, () => undefined))).then(() => undefined);
    },
    finish(group) {
      for (const a of groups[group] ?? []) {
        try {
          a.finish();
        } catch {
          a.cancel();
        }
      }
    },
    finishAll() {
      groups.forEach((_, i) => this.finish(i));
    },
    cancel() {
      for (const list of groups) for (const a of list) a.cancel();
    },
    isRunning(group) {
      return (groups[group] ?? []).some((a) => a.playState === 'running');
    },
  };
}

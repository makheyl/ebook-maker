import type { ElementNodes } from '../render/page-view';
import type { AnimationKind, AnimationStep, Page, PageSize } from '../schema/types';
import { getIdleMotion } from './idle';
import { resolveEasing } from './easing';
import { compileMotion } from './motion';
import { getPreset } from './presets';
import { isInteractionStep, scheduleSteps } from './schedule';
import type { KeyframeSpec } from './types';

/**
 * The one animation runtime (Web Animations API), shared by the editor preview, the timeline,
 * the in-app preview and the exported player. It turns a page's animation steps into WAAPI
 * animations grouped by click, plus interaction-triggered steps and character idle loops.
 *
 * Everything is a WAAPI animation created paused at t=0, so any moment can be reached with
 * seek() — which is what keeps the editor timeline and the exported book identical.
 */

export type NodeLookup = (elementId: string) => ElementNodes | undefined;
export type AnimateFn = (
  target: Element,
  keyframes: Keyframe[],
  options: KeyframeAnimationOptions,
) => Animation;

export type TimelineOptions = {
  pageSize: PageSize;
  /** Honour prefers-reduced-motion: entrances/exits become short fades, emphasis and idle are skipped. */
  reducedMotion?: boolean;
  /** Only build these steps (Animation Pane "preview this step"). */
  onlyStepIds?: readonly string[];
  /** Injectable for tests. */
  animate?: AnimateFn;
};

export type PageTimeline = {
  /** Group 0 plays on page enter; each further group needs one "next". */
  readonly groupCount: number;
  /** Length of each group in ms (a looping step counts one cycle). */
  readonly durations: readonly number[];
  /** Plays a group; resolves when its non-looping animations finished (or were finished early). */
  play(group: number): Promise<void>;
  /** Jumps a group to its end state. Looping steps keep looping. */
  finish(group: number): void;
  /** Jumps everything to its end state (e.g. when paging backwards). */
  finishAll(): void;
  /** Removes every effect, returning elements to their natural (edited) state. */
  cancel(): void;
  isRunning(group: number): boolean;
  /** Freezes the page at `ms` into `group`: earlier groups ended, later ones not started. */
  seek(group: number, ms: number): void;
  /** Plays an "on interaction" step (reveal, reaction…). Resolves when it finishes. */
  playStep(stepId: string): Promise<void>;
  hasInteractionStep(stepId: string): boolean;
  /** Starts the characters' idle loops. */
  startIdle(): void;
};

type Tracked = { anim: Animation; end: number; loop: boolean };

const defaultAnimate: AnimateFn = (target, keyframes, options) =>
  target.animate(keyframes, options);

/** Element ids whose text must be split into character spans for their animations. */
export function elementsNeedingCharSplit(page: Page): Set<string> {
  const ids = new Set<string>();
  for (const step of page.animations) {
    if (getPreset(step.preset)?.splitText === 'chars') ids.add(step.elementId);
  }
  return ids;
}

function reducedSpecs(kind: AnimationKind): KeyframeSpec[] {
  if (kind === 'entrance')
    return [{ target: 'element', keyframes: [{ opacity: 0 }, { opacity: 1 }] }];
  if (kind === 'exit') return [{ target: 'element', keyframes: [{ opacity: 1 }, { opacity: 0 }] }];
  return [];
}

function targetsFor(spec: KeyframeSpec, nodes: ElementNodes): Element[] {
  switch (spec.target) {
    case 'element':
      return [nodes.anim];
    case 'idle':
      return nodes.idle ? [nodes.idle] : [];
    case 'shadow':
      return nodes.shadow ? [nodes.shadow] : [];
    case 'face':
      return [...nodes.anim.querySelectorAll('.fl-image-flip')];
    case 'media':
      return [...nodes.anim.querySelectorAll('.fl-img')];
    case 'strips':
      return [...nodes.anim.querySelectorAll('.fl-strip')];
    case 'poses':
      return [...nodes.anim.querySelectorAll('.fl-pose')];
    case 'chars':
      return [...nodes.anim.querySelectorAll('.fl-char')];
  }
}

const finished = (list: readonly Tracked[]) =>
  Promise.all(
    list
      .filter((t) => !t.loop)
      .map((t) =>
        t.anim.finished.then(
          () => undefined,
          () => undefined,
        ),
      ),
  ).then(() => undefined);

export function createPageTimeline(
  page: Page,
  lookup: NodeLookup,
  opts: TimelineOptions,
): PageTimeline {
  const animate = opts.animate ?? defaultAnimate;
  const reduced = !!opts.reducedMotion;
  const steps: AnimationStep[] = opts.onlyStepIds
    ? page.animations
        .filter((s) => opts.onlyStepIds!.includes(s.id))
        .map((s) => ({ ...s, trigger: 'onPageEnter' as const, delay: 0 }))
    : page.animations;
  const schedule = scheduleSteps(steps);
  const groups: Tracked[][] = schedule.groups.map(() => []);
  const interactions = new Map<string, Tracked[]>();
  const idle: Tracked[] = [];

  function make(
    target: Element,
    keyframes: Keyframe[],
    options: KeyframeAnimationOptions,
    into: Tracked[],
  ): void {
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
    const iterations = Number(options.iterations ?? 1);
    const loop = !Number.isFinite(iterations);
    const end =
      Number(options.delay ?? 0) + Number(options.duration ?? 0) * (loop ? 1 : iterations);
    into.push({ anim, end, loop });
  }

  function buildStep(step: AnimationStep, start: number, into: Tracked[]) {
    const preset = getPreset(step.preset);
    const nodes = lookup(step.elementId);
    if (!preset || !nodes) return;
    const element = nodes.element;
    if (element.hidden) return;
    if (preset.appliesTo && !preset.appliesTo.includes(element.type)) return;
    if (preset.requiresCharacter && !nodes.character) return;

    const params = { ...preset.defaults.params, ...step.params };
    let specs = preset.build({
      element,
      params,
      pageSize: opts.pageSize,
      character: nodes.character,
      step,
    });
    let duration = step.duration;
    let delay = start;
    if (reduced) {
      specs = reducedSpecs(preset.kind);
      duration = Math.min(duration, 250);
      delay = 0;
    }
    const loop = !!step.loop && !reduced;
    const fill: FillMode =
      preset.fill ??
      (preset.kind === 'entrance'
        ? 'both'
        : preset.kind === 'exit' || preset.holdEnd
          ? 'forwards'
          : 'none');
    const easing = resolveEasing(step.easing);

    for (const spec of specs) {
      const specEasing = spec.easing ? resolveEasing(spec.easing) : easing;
      const targets = targetsFor(spec, nodes);
      if (spec.target === 'chars') {
        const each = Math.max(16, duration * (spec.durationFraction ?? 0.1));
        const spread = Math.max(0, duration - each);
        targets.forEach((char, i) => {
          const offset = targets.length > 1 ? (spread * i) / (targets.length - 1) : 0;
          make(
            char,
            spec.keyframes,
            { duration: each, delay: delay + offset, easing: specEasing, fill },
            into,
          );
        });
        continue;
      }
      targets.forEach((target, i) => {
        make(
          target,
          spec.perTarget ? spec.perTarget(i, targets.length) : spec.keyframes,
          {
            duration,
            delay,
            easing: specEasing,
            fill,
            iterations: loop ? Infinity : (spec.iterations ?? 1),
          },
          into,
        );
      });
    }
  }

  schedule.groups.forEach((group, gi) => {
    for (const { step, start } of group.steps) buildStep(step, start, groups[gi]!);
  });

  // Interaction steps are built now so their entrances start hidden, and play on demand.
  if (!opts.onlyStepIds) {
    for (const step of page.animations) {
      if (!isInteractionStep(step)) continue;
      const list: Tracked[] = [];
      buildStep(step, 0, list);
      interactions.set(step.id, list);
    }
  }

  // Character idle loops, on their own layer.
  if (!reduced) {
    for (const element of page.elements) {
      const nodes = lookup(element.id);
      if (!nodes?.character || !nodes.idle || element.hidden || element.type !== 'image') continue;
      const id = element.idleOverride ?? nodes.character.idle?.preset;
      const motion = id === 'none' ? undefined : getIdleMotion(id);
      if (!motion) continue;
      const frames = motion.frames({
        element,
        character: nodes.character,
        intensity: nodes.character.idle?.intensity ?? 1,
      });
      const specs = compileMotion(
        { idle: frames },
        { element, params: {}, pageSize: opts.pageSize, character: nodes.character },
      );
      for (const spec of specs) {
        for (const target of targetsFor(spec, nodes)) {
          make(
            target,
            spec.keyframes,
            { duration: motion.duration, iterations: Infinity, fill: 'none', easing: 'linear' },
            idle,
          );
        }
      }
    }
  }

  const all = () => [...groups.flat(), ...[...interactions.values()].flat(), ...idle];

  return {
    groupCount: groups.length,
    durations: schedule.groups.map((g) => g.duration),
    play(group) {
      const list = groups[group] ?? [];
      for (const t of list) {
        t.anim.currentTime = 0;
        t.anim.play();
      }
      return finished(list);
    },
    finish(group) {
      for (const t of groups[group] ?? []) {
        if (t.loop) {
          if (t.anim.playState !== 'running') t.anim.play();
          continue;
        }
        try {
          t.anim.finish();
        } catch {
          t.anim.cancel();
        }
      }
    },
    finishAll() {
      groups.forEach((_, i) => this.finish(i));
    },
    cancel() {
      for (const t of all()) t.anim.cancel();
    },
    isRunning(group) {
      return (groups[group] ?? []).some((t) => !t.loop && t.anim.playState === 'running');
    },
    seek(group, ms) {
      groups.forEach((list, gi) => {
        for (const t of list) {
          t.anim.pause();
          t.anim.currentTime = gi < group ? (t.loop ? ms : t.end) : gi === group ? ms : 0;
        }
      });
      for (const list of interactions.values()) {
        for (const t of list) {
          t.anim.pause();
          t.anim.currentTime = 0;
        }
      }
      for (const t of idle) {
        t.anim.pause();
        t.anim.currentTime = ms;
      }
    },
    playStep(stepId) {
      const list = interactions.get(stepId) ?? [];
      for (const t of list) {
        t.anim.currentTime = 0;
        t.anim.play();
      }
      return finished(list);
    },
    hasInteractionStep(stepId) {
      return interactions.has(stepId);
    },
    startIdle() {
      for (const t of idle) t.anim.play();
    },
  };
}

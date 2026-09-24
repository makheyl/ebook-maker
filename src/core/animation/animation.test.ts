import { describe, expect, it, vi } from 'vitest';
import { createPageView } from '../render/page-view';
import { animationStepSchema } from '../schema/project';
import {
  createImageElement,
  createPage,
  createShapeElement,
  createTextElement,
  type AnimationStep,
  type AnimationTrigger,
  type Character,
  type Page,
} from '../schema';
import { EASINGS, resolveEasing } from './easing';
import { createAnimationStep } from './factory';
import { ANIMATION_PRESETS, getPreset, presetsFor } from './presets';
import { scheduleSteps } from './schedule';
import { createPageTimeline, elementsNeedingCharSplit, type AnimateFn } from './timeline';
import { TRANSITIONS } from './transitions';

const PAGE_SIZE = { width: 1000, height: 800 };

const TEST_CHARACTER: Character = {
  id: 'ch1',
  name: 'Pip',
  assetId: 'a',
  pivot: { x: 0.5, y: 1 },
  facing: 'right',
  shadow: { enabled: true, opacity: 0.5, size: 1 },
  idle: { preset: 'breathe', intensity: 1 },
  warp: false,
  poses: [],
};

function step(
  trigger: AnimationTrigger,
  duration: number,
  delay = 0,
  extra: Partial<AnimationStep> = {},
): AnimationStep {
  return {
    id: `s${Math.random()}`,
    elementId: 'e',
    kind: 'entrance',
    preset: 'fadeIn',
    trigger,
    duration,
    delay,
    easing: 'easeOut',
    ...extra,
  };
}

describe('preset registry', () => {
  it('has ~10 presets with unique ids covering every kind', () => {
    const ids = ANIMATION_PRESETS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.length).toBeGreaterThanOrEqual(10);
    for (const kind of ['entrance', 'emphasis', 'exit'] as const) {
      expect(ANIMATION_PRESETS.some((p) => p.kind === kind)).toBe(true);
    }
  });

  it('every preset builds valid keyframes and produces a schema-valid default step', () => {
    for (const preset of ANIMATION_PRESETS) {
      const type = preset.appliesTo?.[0] ?? 'shape';
      const element =
        type === 'text'
          ? createTextElement('Hi', { x: 0, y: 0, width: 10, height: 10 })
          : type === 'image'
            ? createImageElement(
                { id: 'a', width: 10, height: 10 },
                { x: 0, y: 0, width: 10, height: 10 },
              )
            : createShapeElement('rect', { x: 0, y: 0, width: 10, height: 10 });
      const created = createAnimationStep(element.id, preset.id);
      // Custom moves build from their tracks; character motions need a character.
      const step =
        preset.id === 'keyframes'
          ? {
              ...created,
              tracks: [
                {
                  property: 'x' as const,
                  keyframes: [
                    { t: 0, v: 0 },
                    { t: 1, v: 50 },
                  ],
                },
              ],
            }
          : created;
      const specs = preset.build({
        element,
        params: { ...preset.defaults.params },
        pageSize: PAGE_SIZE,
        step,
        character: preset.requiresCharacter ? TEST_CHARACTER : undefined,
      });
      expect(specs.length, preset.id).toBeGreaterThan(0);
      for (const spec of specs) {
        if (spec.perTarget)
          expect(spec.perTarget(0, 4).length, preset.id).toBeGreaterThanOrEqual(2);
        else expect(spec.keyframes.length, preset.id).toBeGreaterThanOrEqual(2);
      }
      expect(animationStepSchema.safeParse(created).success, preset.id).toBe(true);
      expect(created.kind).toBe(preset.kind);
    }
  });

  it('filters presets by element type (typewriter is text-only, Ken Burns image-only)', () => {
    expect(presetsFor('entrance', 'shape').map((p) => p.id)).not.toContain('typewriter');
    expect(presetsFor('entrance', 'text').map((p) => p.id)).toContain('typewriter');
    expect(presetsFor('emphasis', 'image').map((p) => p.id)).toContain('kenBurns');
    expect(presetsFor('emphasis', 'text').map((p) => p.id)).not.toContain('kenBurns');
  });

  it('resolves easings to CSS strings', () => {
    for (const e of EASINGS) expect(resolveEasing(e.id)).toMatch(/^(linear|cubic-bezier|ease)/);
    expect(resolveEasing('cubic-bezier(0.1, 0.2, 0.3, 0.4)')).toBe(
      'cubic-bezier(0.1, 0.2, 0.3, 0.4)',
    );
    expect(resolveEasing('url(evil)')).toBe('ease-out');
  });

  it('has all page transitions', () => {
    expect(TRANSITIONS.map((t) => t.id)).toEqual(['none', 'fade', 'slide', 'flip', 'zoom', 'curl']);
  });

  it('unknown presets are rejected by the factory', () => {
    expect(() => createAnimationStep('e', 'nope')).toThrow();
    expect(getPreset('nope')).toBeUndefined();
  });
});

describe('scheduleSteps (PowerPoint trigger semantics)', () => {
  it('chains afterPrevious and aligns withPrevious', () => {
    const s = scheduleSteps([
      step('onPageEnter', 500),
      step('afterPrevious', 300, 100),
      step('withPrevious', 1000),
    ]);
    expect(s.groups).toHaveLength(1);
    expect(s.groups[0]!.steps.map((x) => [x.start, x.end])).toEqual([
      [0, 500],
      [600, 900],
      [600, 1600],
    ]);
    expect(s.groups[0]!.duration).toBe(1600);
  });

  it('starts a new click group for each onClick step', () => {
    const s = scheduleSteps([
      step('onPageEnter', 500),
      step('onClick', 400),
      step('withPrevious', 200, 50),
      step('onClick', 100),
      step('afterPrevious', 100),
    ]);
    expect(s.groups.map((g) => g.trigger)).toEqual(['auto', 'click', 'click']);
    expect(s.groups[1]!.steps.map((x) => x.start)).toEqual([0, 50]);
    expect(s.groups[2]!.steps.map((x) => x.start)).toEqual([0, 100]);
  });

  it('always has an auto group, even when everything waits for clicks', () => {
    const s = scheduleSteps([step('onClick', 100)]);
    expect(s.groups[0]!.steps).toHaveLength(0);
    expect(s.groups).toHaveLength(2);
  });

  it('counts repeats in a step span', () => {
    const s = scheduleSteps([
      step('onPageEnter', 300, 0, { params: { iterations: 3 } }),
      step('afterPrevious', 100),
    ]);
    expect(s.groups[0]!.steps[1]!.start).toBe(900);
  });
});

describe('page timeline', () => {
  function setup(animations: (elIds: { text: string; shape: string }) => AnimationStep[]) {
    const text = createTextElement('Hello', { x: 0, y: 0, width: 100, height: 40 });
    const shape = createShapeElement('rect', { x: 0, y: 0, width: 50, height: 50 });
    const page: Page = { ...createPage(), elements: [text, shape] };
    page.animations = animations({ text: text.id, shape: shape.id });
    const view = createPageView({
      pageSize: PAGE_SIZE,
      mode: 'player',
      resolveAsset: () => undefined,
      splitTextFor: elementsNeedingCharSplit,
    });
    view.update(page, {});
    const calls: { target: Element; keyframes: Keyframe[]; options: KeyframeAnimationOptions }[] =
      [];
    const animate: AnimateFn = (target, keyframes, options) => {
      calls.push({ target, keyframes, options });
      const anim = {
        pause: vi.fn(),
        play: vi.fn(),
        finish: vi.fn(),
        cancel: vi.fn(),
        currentTime: 0,
        playState: 'paused',
        finished: Promise.resolve(),
      };
      return anim as unknown as Animation;
    };
    const timeline = createPageTimeline(page, (id) => view.getNodes(id), {
      pageSize: PAGE_SIZE,
      animate,
    });
    return { timeline, calls, view, text, shape };
  }

  it('groups by click and uses fill modes that keep entrances hidden until they play', () => {
    const { timeline, calls } = setup(({ text, shape }) => [
      { ...createAnimationStep(text, 'fadeIn'), trigger: 'onPageEnter' },
      { ...createAnimationStep(shape, 'pulse'), trigger: 'onClick' },
      { ...createAnimationStep(shape, 'fadeOut'), trigger: 'onClick' },
    ]);
    expect(timeline.groupCount).toBe(3);
    expect(calls.map((c) => c.options.fill)).toEqual(['both', 'none', 'forwards']);
    expect(calls[1]!.options.iterations).toBe(2);
  });

  it('staggers typewriter characters across the duration', () => {
    const { calls } = setup(({ text }) => [
      { ...createAnimationStep(text, 'typewriter'), duration: 1000 },
    ]);
    expect(calls).toHaveLength(5); // "Hello"
    const delays = calls.map((c) => Number(c.options.delay));
    expect(delays[0]).toBe(0);
    expect(delays[4]).toBeGreaterThan(delays[3]!);
    expect(delays[4]! + Number(calls[4]!.options.duration)).toBeCloseTo(1000);
  });

  it('reduced motion turns entrances into short fades and skips emphasis', () => {
    const text = createTextElement('Hi', { x: 0, y: 0, width: 10, height: 10 });
    const page: Page = { ...createPage(), elements: [text] };
    page.animations = [
      createAnimationStep(text.id, 'slideUp', 'onPageEnter'),
      createAnimationStep(text.id, 'pulse'),
    ];
    const view = createPageView({
      pageSize: PAGE_SIZE,
      mode: 'player',
      resolveAsset: () => undefined,
    });
    view.update(page, {});
    const calls: KeyframeAnimationOptions[] = [];
    const animate: AnimateFn = (_t, kf, options) => {
      calls.push({ ...options, id: JSON.stringify(kf) });
      return { pause() {}, currentTime: 0, finished: Promise.resolve() } as unknown as Animation;
    };
    createPageTimeline(page, (id) => view.getNodes(id), {
      pageSize: PAGE_SIZE,
      reducedMotion: true,
      animate,
    });
    expect(calls).toHaveLength(1);
    expect(Number(calls[0]!.duration)).toBeLessThanOrEqual(250);
    expect(calls[0]!.id).not.toContain('translate');
  });

  it('builds only the requested step for single-step previews', () => {
    const { calls } = setup(({ text, shape }) => [
      createAnimationStep(text, 'fadeIn'),
      { ...createAnimationStep(shape, 'zoomIn'), id: 'only-me', trigger: 'onClick', delay: 500 },
    ]);
    expect(calls).toHaveLength(2);
    const preview = setup(({ shape }) => [
      { ...createAnimationStep(shape, 'zoomIn'), id: 'only-me', trigger: 'onClick' },
    ]);
    expect(preview.calls).toHaveLength(1);
  });
});

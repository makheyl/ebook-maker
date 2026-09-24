import { describe, expect, it } from 'vitest';
import { createPageView } from '../render/page-view';
import {
  createImageElement,
  createPage,
  createShapeElement,
  type AssetRef,
  type Character,
  type Page,
} from '../schema';
import { createAnimationStep } from './factory';
import { scheduleSteps } from './schedule';
import { createPageTimeline, type AnimateFn } from './timeline';

const PAGE_SIZE = { width: 1000, height: 800 };

/** A stand-in for a WAAPI Animation that records what the timeline does to it. */
class FakeAnimation {
  currentTime: number | null = 0;
  playState: AnimationPlayState = 'idle';
  finishCalls = 0;
  constructor(
    readonly target: Element,
    readonly keyframes: Keyframe[],
    readonly options: KeyframeAnimationOptions,
  ) {}
  get finished() {
    return Promise.resolve(this as unknown as Animation);
  }
  pause() {
    this.playState = 'paused';
  }
  play() {
    this.playState = 'running';
  }
  finish() {
    if (!Number.isFinite(Number(this.options.iterations ?? 1))) {
      throw new DOMException('Cannot finish an infinite animation', 'InvalidStateError');
    }
    this.finishCalls++;
    this.playState = 'finished';
  }
  cancel() {
    this.playState = 'idle';
  }
}

function setup(build: (ids: { a: string; b: string; mascot: string }) => Page['animations']) {
  const asset: AssetRef = {
    id: 'art',
    kind: 'image',
    mime: 'image/png',
    width: 400,
    height: 400,
    bytes: 1,
  };
  const character: Character = {
    id: 'pip',
    name: 'Pip',
    assetId: 'art',
    pivot: { x: 0.5, y: 0.95 },
    facing: 'right',
    shadow: { enabled: true, opacity: 0.4, size: 1 },
    idle: { preset: 'breathe', intensity: 1 },
    warp: false,
    poses: [],
  };
  const a = createShapeElement('rect', { x: 0, y: 0, width: 50, height: 50 });
  const b = createShapeElement('ellipse', { x: 0, y: 0, width: 50, height: 50 });
  const mascot = createImageElement(
    asset,
    { x: 100, y: 100, width: 200, height: 200 },
    { characterId: 'pip' },
    'exact',
  );
  const page: Page = { ...createPage(), elements: [a, b, mascot] };
  page.animations = build({ a: a.id, b: b.id, mascot: mascot.id });
  const view = createPageView({
    pageSize: PAGE_SIZE,
    mode: 'player',
    resolveAsset: () => 'blob:x',
  });
  view.update(page, { art: asset }, { pip: character });
  const anims: FakeAnimation[] = [];
  const animate: AnimateFn = (target, keyframes, options) => {
    const anim = new FakeAnimation(target, keyframes, options);
    anims.push(anim);
    return anim as unknown as Animation;
  };
  const timeline = createPageTimeline(page, (id) => view.getNodes(id), {
    pageSize: PAGE_SIZE,
    animate,
  });
  return { timeline, anims, view, page, ids: { a: a.id, b: b.id, mascot: mascot.id } };
}

describe('timeline: seek', () => {
  it('freezes earlier groups at their end, the current group at ms; later ones wait', () => {
    const { timeline, anims, view, ids } = setup(({ a, b }) => [
      { ...createAnimationStep(a, 'fadeIn'), trigger: 'onPageEnter', duration: 400 },
      { ...createAnimationStep(b, 'fadeIn'), trigger: 'onClick', duration: 600, delay: 100 },
      { ...createAnimationStep(a, 'fadeOut'), trigger: 'onClick', duration: 300 },
    ]);
    const on = (id: string) =>
      anims.filter(
        (x) =>
          x.target === view.getNodes(id)!.anim && !String(x.options.iterations).includes('Inf'),
      );
    timeline.seek(1, 250);
    const [enterA, exitA] = on(ids.a);
    const [enterB] = on(ids.b);
    expect(enterA!.currentTime).toBe(400); // group 0 ended
    expect(enterB!.currentTime).toBe(250); // group 1 at 250ms (delay is inside currentTime)
    expect([enterA, enterB].every((x) => x!.playState === 'paused')).toBe(true);
    // Group 2 hasn't started: an exit has no "before" state, so it waits idle (no effect).
    expect(exitA!.playState).toBe('idle');
  });

  it('waiting reactions never pin a character over its story motion', () => {
    const { timeline, anims, view, ids } = setup(({ mascot, b }) => [
      { ...createAnimationStep(mascot, 'hop'), trigger: 'onPageEnter' },
      { ...createAnimationStep(mascot, 'wiggle'), trigger: 'onInteraction' },
      { ...createAnimationStep(b, 'popIn'), trigger: 'onInteraction' },
    ]);
    const anim = view.getNodes(ids.mascot)!.anim;
    const onMascot = anims.filter((x) => x.target === anim);
    timeline.seek(0, 300);
    const hop = onMascot.find((x) => x.currentTime === 300)!;
    expect(hop.playState).toBe('paused');
    // The wiggle (no backwards fill) rests idle instead of holding its first frame.
    const wiggle = onMascot.filter((x) => x !== hop && x.options.fill === 'none');
    expect(wiggle.length).toBeGreaterThan(0);
    expect(wiggle.every((x) => x.playState === 'idle')).toBe(true);
    // A reveal (entrance) still holds its hidden start.
    const reveal = anims.find((x) => x.target === view.getNodes(ids.b)!.anim)!;
    expect(reveal.playState).toBe('paused');
    expect(reveal.currentTime).toBe(0);
  });

  it('reports each group length (loops count one cycle)', () => {
    const { timeline } = setup(({ a, b }) => [
      { ...createAnimationStep(a, 'pulse'), trigger: 'onPageEnter', duration: 500, loop: true },
      { ...createAnimationStep(b, 'fadeIn'), trigger: 'afterPrevious', duration: 200 },
    ]);
    expect(timeline.durations).toEqual([700]);
  });
});

describe('timeline: loops', () => {
  it('loops run forever and survive finish()', () => {
    const { timeline, anims } = setup(({ a }) => [
      { ...createAnimationStep(a, 'pulse'), trigger: 'onPageEnter', loop: true },
    ]);
    const loop = anims.find(
      (x) =>
        x.options.iterations === Infinity &&
        x.keyframes.some((k) => String(k.transform).includes('scale(1.1)')),
    )!;
    expect(loop).toBeDefined();
    expect(() => timeline.finishAll()).not.toThrow();
    expect(loop.playState).toBe('running');
    expect(timeline.isRunning(0)).toBe(false);
  });
});

describe('timeline: interaction steps', () => {
  it('are not part of the click sequence, start hidden, and play on demand', () => {
    const steps = (ids: { a: string; b: string }) => [
      { ...createAnimationStep(ids.a, 'fadeIn'), trigger: 'onPageEnter' as const },
      { ...createAnimationStep(ids.b, 'popIn'), id: 'reveal', trigger: 'onInteraction' as const },
    ];
    expect(scheduleSteps(steps({ a: 'x', b: 'y' })).groups[0]!.steps).toHaveLength(1);
    const { timeline, anims, view, ids } = setup(steps);
    expect(timeline.groupCount).toBe(1);
    expect(timeline.hasInteractionStep('reveal')).toBe(true);
    const reveal = anims.find((x) => x.target === view.getNodes(ids.b)!.anim)!;
    expect(reveal.options.fill).toBe('both'); // entrance → hidden until played
    expect(reveal.playState).toBe('paused');
    void timeline.playStep('reveal');
    expect(reveal.playState).toBe('running');
  });
});

describe('timeline: characters', () => {
  it('runs the idle loop on the idle layer, and couples the shadow to motion', () => {
    const { timeline, anims, view, ids } = setup(() => []);
    const nodes = view.getNodes(ids.mascot)!;
    expect(nodes.idle).toBeDefined();
    const idle = anims.filter((x) => x.target === nodes.idle);
    expect(idle).toHaveLength(1);
    expect(idle[0]!.options.iterations).toBe(Infinity);
    expect(idle[0]!.playState).toBe('idle'); // waits without effect until started
    timeline.startIdle();
    expect(idle[0]!.playState).toBe('running');
    // Breathing doesn't leave the ground, so the shadow isn't animated by it.
    expect(anims.some((x) => x.target === nodes.shadow)).toBe(false);
  });

  it('reduced motion turns idle loops off', () => {
    const { page, view } = setup(() => []);
    const anims: unknown[] = [];
    createPageTimeline(page, (id) => view.getNodes(id), {
      pageSize: PAGE_SIZE,
      reducedMotion: true,
      animate: (t, k, o) => {
        anims.push(o);
        return new FakeAnimation(t, k, o) as unknown as Animation;
      },
    });
    expect(anims).toHaveLength(0);
  });
});

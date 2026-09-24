import { produce } from 'immer';
import { describe, expect, it } from 'vitest';
import { createAnimationStep } from '../animation/factory';
import { createPageTimeline, followKeyframes, leadingTranslation } from '../animation/timeline';
import { createPageView } from '../render/page-view';
import { tailTip } from '../render/bubble-geometry';
import {
  createBubbleElement,
  createImageElement,
  createPage,
  createProject,
  createShapeElement,
  createTextElement,
  findElement,
  projectSchema,
  type AssetRef,
  type BubbleElement,
  type Character,
  type Page,
  type Project,
} from '../schema';
import { attachTail, bubbleTapStep, alwaysShowBubble, showBubbleOnTap } from './bubbles';
import { removeCharacter } from './characters';
import { deleteElements } from './elements';
import { groupElements } from './groups';
import { replaceElement } from './replace';

const asset: AssetRef = {
  id: 'art',
  kind: 'image',
  mime: 'image/png',
  width: 400,
  height: 400,
  bytes: 1,
  opaqueBounds: { x: 0.25, y: 0.2, width: 0.5, height: 0.7 },
};
const pip: Character = {
  id: 'pip',
  name: 'Pip',
  assetId: 'art',
  pivot: { x: 0.5, y: 0.9 },
  facing: 'right',
  shadow: { enabled: false, opacity: 0.4, size: 1 },
  idle: { preset: 'none', intensity: 1 },
  warp: false,
  poses: [],
};

function book() {
  const mascot = createImageElement(
    asset,
    { x: 100, y: 400, width: 200, height: 200 },
    { characterId: 'pip' },
    'exact',
  );
  const bubble = createBubbleElement('Hello!', { x: 300, y: 100, width: 300, height: 160 });
  const page = { ...createPage(), elements: [mascot, bubble] };
  let project: Project = { ...createProject({ pages: [page] }), characters: { pip: pip } };
  project = { ...project, assets: { art: asset } };
  project = produce(project, (d) => attachTail(d, page.id, bubble.id, mascot.id));
  return { project, pageId: page.id, mascot: mascot.id, bubble: bubble.id };
}

const bubbleOf = (project: Project, id: string) =>
  findElement(project.pages[0]!.elements, id) as BubbleElement;

describe('speech bubbles: attaching', () => {
  it('attaches above the visible head and makes a character the speaker', () => {
    const { project, bubble } = book();
    const b = bubbleOf(project, bubble);
    expect(b.speakerId).toBe('pip');
    // Top-centre of the opaque pixels (20% down), a little above it.
    expect(b.tail.anchor.x).toBeCloseTo(0.5, 5);
    expect(b.tail.anchor.y).toBeCloseTo(0.17, 5);
    // In the bubble's own coordinates: head at page (200, 434) → (-100, 334).
    expect(tailTip(project.pages[0]!.elements, b)).toEqual({ x: -100, y: 334 });
  });

  it('follows its target through groups and rotations', () => {
    const { project, pageId, mascot, bubble } = book();
    const rotated = produce(project, (d) => {
      const b = findElement(d.pages[0]!.elements, bubble)!;
      b.rotation = 90;
    });
    // Turning the page point (200, 434) back by 90° about the bubble's centre (450, 180)
    // gives (704, 430), i.e. (404, 330) in the bubble's own box.
    const tip = tailTip(rotated.pages[0]!.elements, bubbleOf(rotated, bubble));
    expect(tip.x).toBeCloseTo(404, 5);
    expect(tip.y).toBeCloseTo(330, 5);

    const grouped = produce(project, (d) => {
      const other = createShapeElement('rect', { x: 0, y: 700, width: 20, height: 20 });
      d.pages[0]!.elements.push(other);
      groupElements(d, pageId, [mascot, other.id]);
    });
    expect(tailTip(grouped.pages[0]!.elements, bubbleOf(grouped, bubble))).toEqual({
      x: -100,
      y: 334,
    });
  });

  it('keeps pointing at the same spot when its speaker is deleted, and forgets removed characters', () => {
    const { project, pageId, mascot, bubble } = book();
    const deleted = produce(project, (d) => deleteElements(d, pageId, [mascot]));
    const b = bubbleOf(deleted, bubble);
    expect(b.tail.targetId).toBeUndefined();
    expect(b.tail.tip).toEqual({ x: -100, y: 334 });
    const gone = produce(project, (d) => removeCharacter(d, 'pip'));
    expect(bubbleOf(gone, bubble).speakerId).toBeUndefined();
    expect(bubbleOf(gone, bubble).tail.targetId).toBe(mascot); // still a picture on the page
  });

  it('round-trips through the schema', () => {
    const { project } = book();
    const parsed = projectSchema.safeParse(project);
    expect(parsed.error?.issues ?? []).toEqual([]);
  });
});

describe('speech bubbles: moving with the speaker', () => {
  it('copies only the translation of a transform, turned into the bubble’s space', () => {
    expect(
      leadingTranslation('translate(10px, -4px) rotate(5deg) scale(1.1, 0.9)', {
        width: 100,
        height: 100,
      }),
    ).toEqual({ x: 10, y: -4 });
    expect(leadingTranslation('translateY(50%)', { width: 100, height: 200 })).toEqual({
      x: 0,
      y: 100,
    });
    expect(leadingTranslation('scale(2) translateX(10px)', { width: 1, height: 1 })).toEqual({
      x: 0,
      y: 0,
    });
    const frames = followKeyframes(
      [
        { transform: 'translate(-300px, 0px) rotate(3deg)', offset: 0 },
        { transform: 'translate(0px, 0px) rotate(0deg)', offset: 1 },
      ],
      { width: 100, height: 100 },
      90,
    )!;
    expect(frames[0]).toEqual({ transform: 'translate(0px, -300px)', offset: 0 });
    expect(followKeyframes([{ opacity: 0 }, { opacity: 1 }], { width: 1, height: 1 }, 0)).toBe(
      null,
    );
  });

  const timelineFor = (project: Project, reducedMotion = false) => {
    const page = project.pages[0]!;
    const view = createPageView({
      pageSize: project.pageSize,
      mode: 'player',
      resolveAsset: () => 'blob:x',
    });
    view.update(page, project.assets, project.characters);
    const calls: { target: Element; keyframes: Keyframe[]; options: KeyframeAnimationOptions }[] =
      [];
    createPageTimeline(page, (id) => view.getNodes(id), {
      pageSize: project.pageSize,
      reducedMotion,
      animate: (target, keyframes, options) => {
        calls.push({ target, keyframes, options });
        return {
          pause() {},
          play() {},
          cancel() {},
          currentTime: 0,
          finished: Promise.resolve(),
        } as unknown as Animation;
      },
    });
    return { calls, view };
  };

  it('a walking speaker moves its bubble on the follow layer, with the same timing', () => {
    const { project, mascot, bubble } = book();
    const walking = produce(project, (d) => {
      d.pages[0]!.animations.push({ ...createAnimationStep(mascot, 'walkIn'), duration: 1200 });
    });
    const { calls, view } = timelineFor(walking);
    const follow = view.getNodes(bubble)!.follow!;
    expect(follow.className).toBe('fl-follow');
    const copies = calls.filter((c) => c.target === follow);
    expect(copies).toHaveLength(1);
    const walk = calls.find((c) => c.target === view.getNodes(mascot)!.anim)!;
    expect(copies[0]!.options.duration).toBe(walk.options.duration);
    expect(copies[0]!.options.fill).toBe(walk.options.fill);
    for (const kf of copies[0]!.keyframes) {
      expect(String(kf.transform)).toMatch(/^translate\([-\d.]+px, [-\d.]+px\)$/);
      expect(kf.opacity).toBeUndefined();
    }

    // Off: the bubble stays put. Reduced motion: nothing moves.
    const still = produce(walking, (d) => {
      (findElement(d.pages[0]!.elements, bubble) as BubbleElement).moveWithSpeaker = false;
    });
    expect(timelineFor(still).calls.some((c) => c.target.className === 'fl-follow')).toBe(false);
    expect(timelineFor(walking, true).calls.some((c) => c.target.className === 'fl-follow')).toBe(
      false,
    );
  });

  it('the renderer announces the speaker and draws a tail', () => {
    const { project, bubble } = book();
    const { view } = timelineFor(project);
    const frame = view.getNodes(bubble)!.frame;
    expect(frame.querySelector('.fl-sr-only')!.textContent).toBe('Pip says:');
    expect(frame.querySelectorAll('.fl-bubble-shape path')).toHaveLength(3); // tail, body, cover
    expect(frame.querySelector('.fl-text')!.textContent).toContain('Hello!');
  });
});

describe('speech bubbles: tap to show and replace', () => {
  it('shows on the speaker’s tap alongside its existing reaction, and back again', () => {
    const { project, pageId, mascot, bubble } = book();
    const withWiggle = produce(project, (d) => {
      const step = createAnimationStep(mascot, 'wiggle', 'onInteraction');
      d.pages[0]!.animations.push(step);
      findElement(d.pages[0]!.elements, mascot)!.interactions = [
        {
          id: 'ia1',
          trigger: 'tap',
          once: false,
          actions: [{ type: 'playStep', stepId: step.id }],
        },
      ];
    });
    const on = produce(withWiggle, (d) => showBubbleOnTap(d, pageId, bubble));
    const stepId = bubbleTapStep(on.pages[0]! as Page, bubble)!;
    expect(stepId).toBeTruthy();
    const step = on.pages[0]!.animations.find((s) => s.id === stepId)!;
    expect(step.preset).toBe('popFromTail');
    expect(step.trigger).toBe('onInteraction');
    const tap = findElement(on.pages[0]!.elements, mascot)!.interactions!;
    expect(tap).toHaveLength(1);
    expect(tap[0]!.actions).toHaveLength(2);

    const off = produce(on, (d) => alwaysShowBubble(d, pageId, bubble));
    expect(bubbleTapStep(off.pages[0]! as Page, bubble)).toBeUndefined();
    expect(findElement(off.pages[0]!.elements, mascot)!.interactions![0]!.actions).toHaveLength(1);
  });

  it('a text box replaced by a bubble keeps its words and its typewriter', () => {
    const text = createTextElement('Once upon a time', { x: 0, y: 0, width: 300, height: 80 });
    const page = { ...createPage(), elements: [text] };
    page.animations = [createAnimationStep(text.id, 'typewriter')];
    const project = createProject({ pages: [page] });
    let removed: unknown[] = [];
    const next = produce(project, (d) => {
      removed = replaceElement(d, page.id, text.id, { kind: 'bubble', shape: 'thought' }).removed;
    });
    const b = bubbleOf(next, text.id);
    expect(b.type).toBe('bubble');
    expect(b.bubble.shape).toBe('thought');
    expect(b.content[0]!.runs[0]!.text).toBe('Once upon a time');
    expect(removed).toHaveLength(0);
  });
});

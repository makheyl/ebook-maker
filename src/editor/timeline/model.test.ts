import { describe, expect, it } from 'vitest';
import { createAnimationStep } from '@/core/animation';
import { createCharacter } from '@/core/character';
import {
  createImageElement,
  createPage,
  createProject,
  createShapeElement,
  type Page,
} from '@/core/schema';
import { buildTimelineModel, dragResult, groupOffsets, snapTime, snapTargets } from './model';

function setup() {
  const a = createShapeElement('rect', { x: 0, y: 0, width: 10, height: 10 });
  const b = createShapeElement('ellipse', { x: 0, y: 0, width: 10, height: 10 });
  const asset = {
    id: 'art',
    kind: 'image' as const,
    mime: 'image/png',
    width: 10,
    height: 10,
    bytes: 1,
  };
  const character = createCharacter(asset, 'Pip');
  const mascot = createImageElement(
    asset,
    { x: 0, y: 0, width: 10, height: 10 },
    { characterId: character.id },
  );
  const page: Page = { ...createPage(), elements: [a, b, mascot] };
  page.animations = [
    { ...createAnimationStep(a.id, 'fadeIn', 'onPageEnter'), duration: 500 },
    { ...createAnimationStep(b.id, 'fadeIn', 'afterPrevious'), duration: 400, delay: 100 },
    { ...createAnimationStep(a.id, 'pulse', 'onClick'), duration: 300 },
    { ...createAnimationStep(mascot.id, 'wiggle', 'onInteraction'), id: 'tap' },
  ];
  const project = createProject({ pages: [page] });
  project.assets.art = asset;
  project.characters[character.id] = character;
  return { page, project, a, b, mascot };
}

describe('timeline model', () => {
  it('lays steps out per click group, top-most element first, with idle and tap lanes', () => {
    const { page, project, a, b, mascot } = setup();
    const model = buildTimelineModel(page, project);
    expect(model.groups.map((g) => [g.label, g.duration])).toEqual([
      ['Page opens', 1000],
      ['Click 1', 600], // pulse repeats twice by default
    ]);
    expect(model.lanes.map((l) => l.element.id)).toEqual([mascot.id, b.id, a.id]);
    expect(model.lanes[0]!.idle).toEqual({ id: 'breathe', label: 'Breathe' });
    const bBar = model.lanes[1]!.bars[0]!;
    expect([bBar.start, bBar.end, bBar.anchor]).toEqual([600, 1000, 500]);
    expect(model.lanes[2]!.bars.map((x) => x.group)).toEqual([0, 1]);
    expect(model.interaction.map((x) => x.step.id)).toEqual(['tap']);
  });

  it('places groups side by side', () => {
    expect(groupOffsets([1000, 300], 0.1, 20)).toEqual([0, 150 + 20]);
  });

  it('snaps to nearby edges, else to the grid', () => {
    expect(snapTime(505, { targets: [500], thresholdMs: 30, grid: 100 })).toBe(500);
    expect(snapTime(560, { targets: [500], thresholdMs: 30, grid: 100 })).toBe(600);
    expect(snapTime(560, { targets: [500], thresholdMs: 30 })).toBe(560);
  });

  it('turns drags into delay/duration changes, never before the anchor', () => {
    const { page, project } = setup();
    const model = buildTimelineModel(page, project);
    const bar = model.lanes[1]!.bars[0]!; // anchor 500, start 600, duration 400
    const none = (ms: number) => ms;
    expect(dragResult(bar, 'move', 250, none)).toEqual({ delay: 350, duration: 400 });
    expect(dragResult(bar, 'move', -1000, none)).toEqual({ delay: 0, duration: 400 });
    expect(dragResult(bar, 'end', 100, none)).toEqual({ delay: 100, duration: 500 });
    expect(dragResult(bar, 'end', -1000, none)).toEqual({ delay: 100, duration: 50 });
    expect(dragResult(bar, 'start', 50, none)).toEqual({ delay: 150, duration: 350 });
    expect(snapTargets(model, 0, bar.step.id, 777)).toEqual([0, 0, 500, 777]);
  });
});

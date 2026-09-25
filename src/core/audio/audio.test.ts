import { produce } from 'immer';
import { describe, expect, it } from 'vitest';
import { createAnimationStep } from '../animation/factory';
import { migrate } from '../migrations';
import { addClip, addSoundToTap, createClip } from '../ops/audio';
import { deleteElements, duplicateElements } from '../ops/elements';
import { removeAnimations } from '../ops/animations';
import { removeSound } from '../ops/sounds';
import {
  createPage,
  createProject,
  createShapeElement,
  projectSchema,
  type AudioMix,
  type Page,
  type Project,
} from '../schema';
import { clampMix, DEFAULT_MIX, gainAt, playLength } from './mix';
import { audioSchedule, entranceStepOf, openSoundClipId } from './schedule';

const mix = (patch: Partial<AudioMix> = {}): AudioMix => ({ ...DEFAULT_MIX, ...patch });

describe('mix: length and fades', () => {
  it('plays from the in-point to the out-point (or the end)', () => {
    expect(playLength(mix({ trimStartMs: 200 }), 1000)).toBe(800);
    expect(playLength(mix({ trimStartMs: 200, trimEndMs: 700 }), 1000)).toBe(500);
    expect(playLength(mix(), undefined)).toBeUndefined();
  });

  it('shapes the volume with fades in and out', () => {
    const m = mix({ volume: 0.8, fadeInMs: 100, fadeOutMs: 200 });
    expect(gainAt(m, 0, 1000)).toBe(0);
    expect(gainAt(m, 50, 1000)).toBeCloseTo(0.4, 5);
    expect(gainAt(m, 500, 1000)).toBeCloseTo(0.8, 5);
    expect(gainAt(m, 900, 1000)).toBeCloseTo(0.4, 5);
    expect(gainAt(m, 1000, 1000)).toBe(0);
    expect(clampMix(mix({ fadeInMs: 900, fadeOutMs: 900 }), 1000)).toMatchObject({
      fadeInMs: 500,
      fadeOutMs: 500,
    });
  });
});

function book() {
  const star = createShapeElement('ellipse', { x: 0, y: 0, width: 50, height: 50 });
  const page: Page = { ...createPage(), elements: [star] };
  const enter = { ...createAnimationStep(star.id, 'popIn', 'onPageEnter'), delay: 400 };
  const click = createAnimationStep(star.id, 'pulse', 'onClick');
  const tap = createAnimationStep(star.id, 'pulse', 'onInteraction');
  page.animations = [enter, click, tap];
  let project: Project = createProject({ pages: [page] });
  project = produce(project, (d) => {
    d.sounds.snd_pop = { id: 'snd_pop', kind: 'audio', mime: 'audio/mpeg', bytes: 1 };
    const pop = { kind: 'sound' as const, soundId: 'snd_pop' };
    addClip(d, page.id, {
      ...createClip(pop, { kind: 'withStep', stepId: enter.id, offset: 0 }, star.id),
      id: 'appears',
    });
    addClip(d, page.id, {
      ...createClip(pop, { kind: 'withStep', stepId: enter.id, offset: -900 }, star.id),
      id: 'early',
    });
    addClip(d, page.id, { ...createClip(pop, { kind: 'time', group: 1, at: 1500 }), id: 'timed' });
    addClip(d, page.id, {
      ...createClip(pop, { kind: 'withStep', stepId: tap.id, offset: 100 }, star.id),
      id: 'ontap',
    });
  });
  return { project, star, enter, click, tap, pageId: page.id };
}

describe('when timed audio plays', () => {
  it('with its step (and offset), at a time, or on a tapped step', () => {
    const { project, enter, click, tap } = book();
    const starts = [
      { stepId: enter.id, group: 0, at: 400 },
      { stepId: click.id, group: 1, at: 0 },
      { stepId: tap.id, group: null, at: 0 },
    ];
    const got = audioSchedule(project.pages[0]!, starts).map((s) => [
      s.clip.id,
      s.group,
      s.at,
      s.stepId ?? null,
    ]);
    expect(got).toEqual(
      [
        ['early', 0, 0], // never before its group starts
        ['appears', 0, 400],
        ['timed', 1, 1500],
        ['ontap', null, 100, tap.id],
      ].map(([id, g, at, step]) => [id, g, at, step ?? null]),
    );
    // Reduced motion: steps start at 0, so "with a step" clips do too; timed ones keep their time.
    const reduced = audioSchedule(project.pages[0]!, [
      { stepId: enter.id, group: 0, at: 0 },
      { stepId: tap.id, group: null, at: 0 },
    ]);
    expect(reduced.find((s) => s.clip.id === 'appears')!.at).toBe(0);
    expect(reduced.find((s) => s.clip.id === 'timed')!.at).toBe(1500);
    expect(entranceStepOf(project.pages[0]!, book().star.id)).toBeUndefined();
  });

  it('keeps references valid: sounds, elements and steps that go away', () => {
    const { project, pageId, star, enter } = book();
    expect(projectSchema.safeParse(project).success).toBe(true);
    const stepGone = produce(project, (d) => removeAnimations(d, pageId, [enter.id]));
    expect(stepGone.pages[0]!.audio!.find((c) => c.id === 'appears')!.start).toEqual({
      kind: 'time',
      group: 0,
      at: 0,
    });
    const elementGone = produce(project, (d) => deleteElements(d, pageId, [star.id]));
    expect(elementGone.pages[0]!.audio!.map((c) => c.id)).toEqual(['timed']);
    const soundGone = produce(project, (d) => removeSound(d, 'snd_pop'));
    expect(soundGone.pages[0]!.audio).toBeUndefined();
  });

  it('a duplicated element brings its sounds, on its own steps', () => {
    const { project, pageId, star } = book();
    let copyId = '';
    const next = produce(
      project,
      (d) => void (copyId = duplicateElements(d, pageId, [star.id])[0]!),
    );
    const page = next.pages[0]!;
    const copies = page.audio!.filter((c) => c.elementId === copyId);
    expect(copies).toHaveLength(3);
    const copiedEntrance = page.animations.find(
      (s) => s.elementId === copyId && s.kind === 'entrance',
    )!;
    expect(
      copies.some((c) => c.start.kind === 'withStep' && c.start.stepId === copiedEntrance.id),
    ).toBe(true);
  });

  it('a tap sound joins the existing tap', () => {
    const { project, pageId, star } = book();
    const next = produce(project, (d) => {
      addSoundToTap(d, pageId, star.id, 'snd_pop');
      addSoundToTap(d, pageId, star.id, 'snd_pop');
    });
    const taps = next.pages[0]!.elements[0]!.interactions!;
    expect(taps).toHaveLength(1);
    expect(taps[0]!.actions).toHaveLength(2);
  });

  it('a v6 "when the page opens" sound becomes a timed clip at 0 s', () => {
    const v6 = structuredClone(createProject()) as unknown as Record<string, unknown> & {
      pages: Record<string, unknown>[];
    };
    v6.schemaVersion = 6;
    v6.pages[0]!.openSound = 'snd_x';
    (v6 as unknown as { sounds: unknown }).sounds = {
      snd_x: { id: 'snd_x', kind: 'audio', mime: 'audio/mpeg', bytes: 3 },
    };
    const migrated = migrate(v6) as Project;
    const page = migrated.pages[0]!;
    expect(page).not.toHaveProperty('openSound');
    expect(page.audio).toEqual([
      {
        id: openSoundClipId(page.id),
        source: { kind: 'sound', soundId: 'snd_x' },
        start: { kind: 'time', group: 0, at: 0 },
        mix: DEFAULT_MIX,
        loop: false,
      },
    ]);
    expect(projectSchema.safeParse(migrated).success).toBe(true);
  });
});

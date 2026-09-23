import { describe, expect, it } from 'vitest';
import { createImageElement, type Character } from '../../schema';
import { getIdleMotion, IDLE_MOTIONS } from '../idle';
import type { MotionFrame } from '../motion';
import { stripKeyframes } from '../warp';
import { CHARACTER_MOTIONS } from './index';
import { findPose, poseSwap } from './poses';

const character: Character = {
  id: 'pip',
  name: 'Pip',
  assetId: 'art',
  pivot: { x: 0.5, y: 0.95 },
  facing: 'right',
  shadow: { enabled: true, opacity: 0.35, size: 1 },
  idle: { preset: 'breathe', intensity: 1 },
  warp: false,
  poses: [],
};
const element = createImageElement(
  { id: 'art', width: 400, height: 500 },
  { x: 600, y: 500, width: 400, height: 500 },
  { characterId: 'pip' },
  'exact',
);
const ctx = (params = {}) => ({
  element,
  params,
  pageSize: { width: 1600, height: 1200 },
  character,
  pivot: { x: 0.5, y: 0.95 },
});

const tracksOf = (m: (typeof CHARACTER_MOTIONS)[number], params = {}) =>
  m.tracks({ ...ctx({ ...m.defaults.params, ...params }) });

function checkOffsets(frames: readonly { offset: number }[], id: string) {
  expect(frames.length, id).toBeGreaterThanOrEqual(2);
  expect(frames[0]!.offset, id).toBe(0);
  expect(frames[frames.length - 1]!.offset, id).toBe(1);
  for (let i = 1; i < frames.length; i++) {
    expect(frames[i]!.offset, `${id} offsets must not decrease`).toBeGreaterThanOrEqual(
      frames[i - 1]!.offset,
    );
  }
}

describe('character motions', () => {
  it('has 26 step motions with unique ids, all character-only', () => {
    const ids = CHARACTER_MOTIONS.map((m) => m.id);
    expect(ids).toHaveLength(26);
    expect(new Set(ids).size).toBe(26);
    expect(
      CHARACTER_MOTIONS.every((m) => m.requiresCharacter && m.appliesTo?.[0] === 'image'),
    ).toBe(true);
  });

  it('are deterministic and have valid, ordered keyframes', () => {
    for (const m of CHARACTER_MOTIONS) {
      const a = tracksOf(m);
      // Functions (per-strip keyframes) are compared by what they produce.
      const comparable = (t: ReturnType<typeof tracksOf>) => ({
        ...t,
        extra: t.extra?.map((e) => ({ ...e, perTarget: e.perTarget?.(3, 8) })),
      });
      expect(comparable(tracksOf(m)), m.id).toEqual(comparable(a));
      if (a.element) checkOffsets(a.element, m.id);
      for (const spec of a.extra ?? [])
        if (spec.perTarget)
          checkOffsets(spec.perTarget(0, 8) as { offset: number }[], `${m.id} strips`);
      if (a.face) checkOffsets(a.face, `${m.id} face`);
      const specs = m.build(ctx(m.defaults.params));
      expect(specs.length, m.id).toBeGreaterThan(0);
    }
  });

  it('keep the feet planted while breathing, waving, bowing and wiggling', () => {
    const planted = (frames: readonly MotionFrame[] | undefined, id: string) => {
      for (const f of frames ?? []) {
        expect(Math.abs(f.x ?? 0), id).toBeLessThan(0.5);
        expect(Math.abs(f.y ?? 0), id).toBeLessThan(0.5);
      }
    };
    for (const id of ['wave', 'bow', 'wiggle', 'shakeNo', 'talk']) {
      planted(tracksOf(CHARACTER_MOTIONS.find((m) => m.id === id)!).element, id);
    }
    const breathe = getIdleMotion('breathe')!.build({
      element,
      character,
      intensity: 1,
      pivot: { x: 0.5, y: 0.95 },
    });
    planted(breathe.idle, 'breathe');
  });

  it('hop leaves the ground only upward and lands where it started', () => {
    const frames = tracksOf(CHARACTER_MOTIONS.find((m) => m.id === 'hop')!).element!;
    expect(frames.every((f) => (f.x ?? 0) === 0 && (f.y ?? 0) <= 0)).toBe(true);
    expect(frames[0]!.y ?? 0).toBe(0);
    expect(frames[frames.length - 1]!.y ?? 0).toBe(0);
    expect(Math.min(...frames.map((f) => f.y ?? 0))).toBeLessThan(-element.height * 0.2);
  });

  it('squash and stretch keep volume within 5%', () => {
    const all = [
      ...CHARACTER_MOTIONS.filter((m) => !['grow', 'spin'].includes(m.id)).flatMap(
        (m) => tracksOf(m).element ?? [],
      ),
      ...IDLE_MOTIONS.flatMap(
        (m) => m.build({ element, character, intensity: 1, pivot: { x: 0.5, y: 0.95 } }).idle ?? [],
      ),
    ];
    for (const f of all) {
      if (f.scaleX === undefined && f.scaleY === undefined) continue;
      const volume = (f.scaleX ?? 1) * Math.sqrt(f.scaleY ?? 1);
      expect(Math.abs(volume - 1)).toBeLessThan(0.05);
    }
  });

  it('entrances start off the page and settle where the character stands', () => {
    const walk = tracksOf(
      CHARACTER_MOTIONS.find((m) => m.id === 'walkIn')!,
      { from: 'left' },
    ).element!;
    expect(walk[0]!.x! + element.x + element.width).toBeLessThanOrEqual(0);
    expect(walk[walk.length - 1]!.x ?? 0).toBe(0);
    const right = tracksOf(
      CHARACTER_MOTIONS.find((m) => m.id === 'walkIn')!,
      { from: 'right' },
    ).element!;
    expect(right[0]!.x! + element.x).toBeGreaterThanOrEqual(1600);
  });

  it('walks face the way they travel', () => {
    const fromRight = tracksOf(
      CHARACTER_MOTIONS.find((m) => m.id === 'walkIn')!,
      { from: 'right' },
    );
    expect(fromRight.face![0]!.scaleX).toBe(-1); // art faces right, walking left
    expect(fromRight.face![fromRight.face!.length - 1]!.scaleX).toBe(1);
  });
});

describe('strip warp', () => {
  it('bends more toward the top, keeps the feet still, and keeps edges continuous', () => {
    const height = 400;
    const kf = stripKeyframes(height, 1, 20, [
      { offset: 0, sway: 0 },
      { offset: 1, sway: 1 },
    ]);
    const n = 8;
    const parse = (t: string) => {
      const m = /translateX\(([-\d.]+)px\) skewX\(([-\d.]+)deg\)/.exec(t)!;
      return { mid: Number(m[1]), skew: Number(m[2]) };
    };
    const edges = Array.from({ length: n }, (_, i) => {
      const { mid, skew } = parse(String(kf(i, n)[1]!.transform));
      // CSS skewX: x' = x + tan(θ)·y, with y measured downward from the strip's centre.
      const half = Math.tan((skew * Math.PI) / 180) * (height / n / 2);
      return { top: mid - half, bottom: mid + half };
    });
    expect(edges[0]!.top).toBeCloseTo(20, 1); // top of the character moves the most
    expect(Math.abs(edges[n - 1]!.bottom)).toBeLessThan(0.01); // feet don't move
    for (let i = 1; i < n; i++) expect(edges[i]!.top).toBeCloseTo(edges[i - 1]!.bottom, 1);
    expect(String(kf(3, n)[0]!.transform)).toBe('translateX(0px) skewX(0deg)');
  });
});

describe('poses', () => {
  const posed: Character = {
    ...character,
    poses: [
      { id: 'po1', name: 'happy', assetId: 'a1' },
      { id: 'po2', name: 'pip-talk', assetId: 'a2' },
      { id: 'po3', name: 'Eyes closed', assetId: 'a3' },
    ],
  };
  const withPoses = (params = {}) => ({ ...ctx(params), character: posed });
  const byId = (id: string) => CHARACTER_MOTIONS.find((m) => m.id === id)!;
  const opacityAt = (frames: Keyframe[], t: number) => {
    // Last keyframe at or before t (hard cuts use repeated offsets).
    let v = frames[0]!.opacity;
    for (const f of frames) if ((f.offset as number) <= t) v = f.opacity;
    return v;
  };

  it('finds poses by id or by name', () => {
    expect(findPose(posed, 'po3')).toBe(2);
    expect(findPose(posed, /talk/i)).toBe(1);
    expect(findPose(posed, /blink|closed/i)).toBe(2);
    expect(findPose(character, /talk/i)).toBe(-1);
  });

  it('swaps a pose in and the artwork out, with hard cuts', () => {
    const [poses, base] = poseSwap(1, [[0.25, 0.5]]);
    const shown = poses!.perTarget!(1, 3);
    const other = poses!.perTarget!(0, 3);
    expect(opacityAt(shown, 0.1)).toBe(0);
    expect(opacityAt(shown, 0.3)).toBe(1);
    expect(opacityAt(shown, 0.6)).toBe(0);
    expect(other.every((f) => f.opacity === 0)).toBe(true);
    expect(opacityAt(base!.keyframes, 0.3)).toBe(0);
    expect(opacityAt(base!.keyframes, 0.6)).toBe(1);
    // Offsets never decrease (WAAPI requirement).
    for (const frames of [shown, base!.keyframes]) {
      const offsets = frames.map((f) => f.offset as number);
      expect([...offsets].sort((a, b) => a - b)).toEqual(offsets);
    }
  });

  it('Talk flaps the talk pose, Blink uses the closed-eyes pose, both only when present', () => {
    const talk = byId('talk');
    expect(talk.tracks(withPoses(talk.defaults.params)).extra?.map((s) => s.target)).toEqual([
      'poses',
      'base',
    ]);
    expect(talk.tracks(ctx(talk.defaults.params)).extra).toBeUndefined();
    const blink = byId('blink').tracks(withPoses({ times: 2 }));
    const eyes = blink.extra![0]!.perTarget!(2, 3);
    expect(eyes.filter((f) => f.opacity === 1).length).toBe(4); // two windows, two edges each
  });

  it('Show pose holds the chosen pose; an unknown pose shows the artwork', () => {
    const show = byId('showPose');
    expect(show.holdEnd).toBe(true);
    const [poses, base] = show.tracks(withPoses({ pose: 'po1' })).extra!;
    expect(opacityAt(poses!.perTarget!(0, 3), 1)).toBe(1);
    expect(opacityAt(base!.keyframes, 1)).toBe(0);
    const [, back] = show.tracks(withPoses({ pose: 'gone' })).extra!;
    expect(back!.keyframes.every((f) => f.opacity === 1)).toBe(true);
  });
});

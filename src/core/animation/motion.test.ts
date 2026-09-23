import { describe, expect, it } from 'vitest';
import { cubicBezier, easingFunction, parseLinear } from './easing-fn';
import { compileFrames, compileTransform, shadowFrames } from './motion';
import { compileTracks, evaluateTrack } from './tracks';

describe('compileTransform', () => {
  it('always composes translate → rotate → scale', () => {
    expect(compileTransform({ offset: 0, scaleX: 2, rotate: 10, x: 5, y: -3 })).toBe(
      'translate(5px, -3px) rotate(10deg) scale(2, 1)',
    );
    expect(compileTransform({ offset: 0 })).toBe('translate(0px, 0px) rotate(0deg) scale(1, 1)');
  });

  it('adds opacity to every frame only when some frame sets it', () => {
    expect(compileFrames([{ offset: 0 }, { offset: 1, x: 1 }]).some((k) => 'opacity' in k)).toBe(
      false,
    );
    const kf = compileFrames([
      { offset: 0, opacity: 0 },
      { offset: 1, x: 1 },
    ]);
    expect(kf.map((k) => k.opacity)).toEqual([0, 1]);
  });
});

describe('shadow coupling', () => {
  it('shrinks and fades the shadow as the character rises, and follows it sideways', () => {
    const character = { shadow: { enabled: true, opacity: 0.5, size: 1 } } as never;
    const [ground, air] = shadowFrames(
      [
        { offset: 0, x: 10 },
        { offset: 1, y: -100 },
      ],
      { height: 200 },
      character,
    );
    expect(ground!.transform).toBe('translateX(10px) scale(1)');
    expect(ground!.opacity).toBe(0.5);
    expect(Number(/scale\(([\d.]+)\)/.exec(String(air!.transform))![1])).toBeLessThan(0.5);
    expect(Number(air!.opacity)).toBeLessThan(0.5);
  });
});

describe('easing functions', () => {
  it('cubic-bezier matches known values', () => {
    const ease = cubicBezier(0.42, 0, 0.58, 1);
    expect(ease(0)).toBe(0);
    expect(ease(1)).toBe(1);
    expect(ease(0.5)).toBeCloseTo(0.5, 5);
    expect(ease(0.25)).toBeLessThan(0.25);
    expect(cubicBezier(0, 0, 1, 1)(0.3)).toBeCloseTo(0.3, 5);
  });

  it('parses CSS linear() stops, including implicit positions', () => {
    const fn = parseLinear('linear(0, 1 50%, 0.5)');
    expect(fn(0.25)).toBeCloseTo(0.5);
    expect(fn(0.5)).toBeCloseTo(1);
    expect(fn(0.75)).toBeCloseTo(0.75);
  });

  it('resolves named easings (bounce uses its true curve)', () => {
    expect(easingFunction('linear')(0.3)).toBeCloseTo(0.3);
    const bounce = easingFunction('bounce');
    expect(bounce(0.364)).toBeCloseTo(1, 2);
    expect(bounce(0.455)).toBeCloseTo(0.75, 2);
  });
});

describe('custom keyframe tracks', () => {
  it('evaluates each segment with its own easing', () => {
    const keys = [
      { t: 0, v: 0, easing: 'linear' },
      { t: 0.5, v: 100, easing: 'easeIn' },
      { t: 1, v: 0 },
    ];
    expect(evaluateTrack(keys, 0.25)).toBeCloseTo(50);
    expect(evaluateTrack(keys, 0.5)).toBe(100);
    const eased = evaluateTrack(keys, 0.75);
    expect(eased).toBeGreaterThan(50); // ease-in is slow at first
    expect(evaluateTrack(keys, -1)).toBe(0);
    expect(evaluateTrack(keys, 2)).toBe(0);
  });

  it('samples tracks accurately and within the sample budget', () => {
    const tracks = [
      {
        property: 'x' as const,
        keyframes: [
          { t: 0, v: 0, easing: 'easeInOut' },
          { t: 1, v: 300 },
        ],
      },
      {
        property: 'rotate' as const,
        keyframes: [
          { t: 0, v: 0 },
          { t: 0.5, v: 45 },
          { t: 1, v: 0 },
        ],
      },
    ];
    const frames = compileTracks(tracks, 2000);
    expect(frames.length).toBeLessThanOrEqual(240 + 10);
    expect(frames[0]!.offset).toBe(0);
    expect(frames[frames.length - 1]!.offset).toBe(1);
    const easeInOut = easingFunction('easeInOut');
    for (const f of frames) {
      expect(f.x).toBeCloseTo(300 * easeInOut(f.offset), 6);
    }
    expect(frames.find((f) => f.offset === 0.5)!.rotate).toBe(45);
    // Untracked properties are left to their defaults.
    expect(frames.every((f) => f.opacity === undefined)).toBe(true);
    // Long moves are capped.
    expect(compileTracks(tracks, 60_000).length).toBeLessThanOrEqual(240 + 10);
  });
});

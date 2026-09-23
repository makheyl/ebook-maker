import type { Character, ImageElement } from '../../schema/types';
import type { MotionFrame } from '../motion';
import type { BuildContext, ParamDef } from '../types';

export type MotionContext = BuildContext & { character: Character };
export type Side = 'left' | 'right';

export const clampInt = (v: number, min: number, max: number) =>
  Math.min(max, Math.max(min, Math.round(v)));

/** Offset (element-local px) that puts the element fully off the page on that side. */
export function offPage(ctx: MotionContext, side: Side): number {
  const el = ctx.element;
  return side === 'left' ? -(el.x + el.width) - 40 : ctx.pageSize.width - el.x + 40;
}

/** Offset that puts the element fully above the page. */
export function offTop(ctx: MotionContext): number {
  return -(ctx.element.y + ctx.element.height) - 40;
}

const flipped = (ctx: MotionContext) =>
  ctx.element.type === 'image' && (ctx.element as ImageElement).flipX;

/** The way the character looks on the page (artwork facing, mirrored by a flip). */
export function facing(ctx: MotionContext): Side {
  const f = ctx.character.facing;
  return flipped(ctx) ? (f === 'left' ? 'right' : 'left') : f;
}

/** The flip layer's resting scaleX. */
export const baseFlip = (ctx: MotionContext) => (flipped(ctx) ? -1 : 1);

/** Flip-layer scaleX that makes the character look toward `side`. */
export function faceToward(ctx: MotionContext, side: Side): number {
  return facing(ctx) === side ? baseFlip(ctx) : -baseFlip(ctx);
}

/** Squash/stretch that keeps the character's volume: scaleX = 1/√scaleY. */
export function squash(amount: number) {
  const scaleY = 1 - amount;
  return { scaleX: 1 / Math.sqrt(scaleY), scaleY };
}
export function stretch(amount: number) {
  const scaleY = 1 + amount;
  return { scaleX: 1 / Math.sqrt(scaleY), scaleY };
}

/**
 * One hop between offsets t0 and t1: anticipation squash → stretch on take-off → apex →
 * stretch while falling → squash on landing. x travels from x0 to x1 along the arc.
 */
export function hopFrames(
  t0: number,
  t1: number,
  height: number,
  x0 = 0,
  x1 = 0,
  squashAmount = 0.12,
): MotionFrame[] {
  const at = (p: number) => t0 + (t1 - t0) * p;
  const x = (p: number) => x0 + (x1 - x0) * p;
  return [
    { offset: at(0), x: x(0), y: 0, scaleX: 1, scaleY: 1, easing: 'easeOut' },
    { offset: at(0.15), x: x(0), y: 0, ...squash(squashAmount), easing: 'easeOut' },
    {
      offset: at(0.3),
      x: x(0.2),
      y: -height * 0.4,
      ...stretch(squashAmount * 0.7),
      easing: 'easeOut',
    },
    { offset: at(0.55), x: x(0.55), y: -height, scaleX: 1, scaleY: 1, easing: 'easeIn' },
    {
      offset: at(0.8),
      x: x(0.9),
      y: -height * 0.15,
      ...stretch(squashAmount * 0.5),
      easing: 'easeIn',
    },
    { offset: at(0.88), x: x(1), y: 0, ...squash(squashAmount), easing: 'easeOut' },
    { offset: at(1), x: x(1), y: 0, scaleX: 1, scaleY: 1 },
  ];
}

/** Drops consecutive frames that share an offset (keeping the later one). */
export function tidy(frames: MotionFrame[]): MotionFrame[] {
  const out: MotionFrame[] = [];
  for (const f of frames) {
    const offset = Math.min(1, Math.max(0, Math.round(f.offset * 10000) / 10000));
    const last = out[out.length - 1];
    if (last && last.offset === offset) out[out.length - 1] = { ...f, offset };
    else out.push({ ...f, offset });
  }
  return out;
}

export const intensityParam: ParamDef = {
  key: 'intensity',
  label: 'Intensity',
  type: 'number',
  min: 0.25,
  max: 2,
  step: 0.05,
};

export const fromSideParam: ParamDef = {
  key: 'from',
  label: 'From',
  type: 'select',
  options: [
    { value: 'left', label: 'The left' },
    { value: 'right', label: 'The right' },
  ],
};

export const toSideParam: ParamDef = {
  key: 'to',
  label: 'Toward',
  type: 'select',
  options: [
    { value: 'right', label: 'The right' },
    { value: 'left', label: 'The left' },
  ],
};

export const stepsParam: ParamDef = {
  key: 'steps',
  label: 'Steps',
  type: 'number',
  min: 2,
  max: 8,
  step: 1,
};

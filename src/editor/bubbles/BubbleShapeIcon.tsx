import { bubbleGeometry } from '@/core/render/bubble-geometry';
import type { BubbleShape } from '@/core/schema';

/** A tiny drawing of a bubble shape (made by the same geometry as the real thing). */
export function BubbleShapeIcon({ shape, size = 18 }: { shape: BubbleShape; size?: number }) {
  const g = bubbleGeometry(shape, 40, 26, { x: 12, y: 38 }, 10, 3);
  return (
    <svg
      viewBox="-3 -3 46 44"
      width={size}
      height={size}
      aria-hidden="true"
      className="overflow-visible"
    >
      {g.tail && (
        <path d={g.tail} fill="none" stroke="currentColor" strokeWidth={3} strokeLinejoin="round" />
      )}
      <path
        d={g.body}
        fill="var(--background, #fff)"
        stroke="currentColor"
        strokeWidth={3}
        strokeLinejoin="round"
        strokeDasharray={shape === 'whisper' ? '5 4' : undefined}
      />
    </svg>
  );
}

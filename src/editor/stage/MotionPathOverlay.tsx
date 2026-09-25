import { useState } from 'react';
import { evaluateTrack } from '@/core/animation';
import { pivotToLocal } from '@/core/character';
import type { KeyframeTrack, PageElement } from '@/core/schema';
import { editTracks, setKeyframe } from '../timeline/actions';
import { useActivePage, useProject } from '../store/selectors';
import { useUiStore } from '../store/ui-store';
import { elementToPage, pageToElement, type Point } from './geometry';

const valueAt = (tracks: readonly KeyframeTrack[], property: 'x' | 'y', t: number) => {
  const track = tracks.find((tr) => tr.property === property);
  return track?.keyframes.length ? evaluateTrack(track.keyframes, t) : 0;
};

/**
 * Shows a custom move's path on the stage (dashed curve + a dot per keyframe time). Dragging a
 * dot sets the x/y keyframes at that time — one undo step per drag.
 */
export function MotionPathOverlay({ scale }: { scale: number }) {
  const project = useProject();
  const page = useActivePage();
  const selectedStepId = useUiStore((s) => s.selectedStepId);
  const [drag, setDrag] = useState<{ t: number; offset: Point } | null>(null);
  const step = page.animations.find((s) => s.id === selectedStepId && s.preset === 'keyframes');
  const element = step ? page.elements.find((e) => e.id === step.elementId) : undefined;
  const tracks = step?.tracks ?? [];
  if (!step || !element || !tracks.some((t) => t.property === 'x' || t.property === 'y'))
    return null;

  const anchor = anchorPoint(element, project);
  const times = [
    ...new Set(
      tracks
        .filter((t) => t.property === 'x' || t.property === 'y')
        .flatMap((t) => t.keyframes.map((k) => k.t)),
    ),
  ].sort((a, b) => a - b);
  const offsetAt = (t: number): Point =>
    drag && Math.abs(drag.t - t) < 1e-6
      ? drag.offset
      : { x: valueAt(tracks, 'x', t), y: valueAt(tracks, 'y', t) };
  const toScreen = (offset: Point) => {
    const p = elementToPage(element, { x: anchor.x + offset.x, y: anchor.y + offset.y });
    return { x: p.x * scale, y: p.y * scale };
  };
  const curve = Array.from({ length: 41 }, (_, i) => toScreen(offsetAt(i / 40)));

  const fromEvent = (e: React.PointerEvent<SVGElement>): Point => {
    const svg = e.currentTarget.ownerSVGElement ?? (e.currentTarget as SVGSVGElement);
    const box = svg.getBoundingClientRect();
    const local = pageToElement(element, {
      x: (e.clientX - box.left) / scale,
      y: (e.clientY - box.top) / scale,
    });
    return { x: Math.round(local.x - anchor.x), y: Math.round(local.y - anchor.y) };
  };

  return (
    <svg
      className="pointer-events-none absolute inset-0 z-10 overflow-visible"
      width="100%"
      height="100%"
    >
      <polyline
        points={curve.map((p) => `${p.x},${p.y}`).join(' ')}
        fill="none"
        stroke="var(--signal)"
        strokeWidth={2}
        strokeDasharray="5 4"
      />
      {times.map((t, i) => {
        const p = toScreen(offsetAt(t));
        return (
          <circle
            key={t}
            cx={p.x}
            cy={p.y}
            r={i === times.length - 1 ? 8 : 6}
            fill={i === times.length - 1 ? 'var(--signal)' : '#fff'}
            stroke="var(--signal)"
            strokeWidth={2}
            data-stage-control
            data-testid="path-point"
            className="pointer-events-auto cursor-move"
            role="slider"
            tabIndex={0}
            aria-label={`Path point at ${Math.round(t * 100)}%`}
            aria-valuetext={`${Math.round(offsetAt(t).x)}, ${Math.round(offsetAt(t).y)}`}
            onPointerDown={(e) => {
              e.stopPropagation();
              e.currentTarget.setPointerCapture(e.pointerId);
              setDrag({ t, offset: fromEvent(e) });
            }}
            onPointerMove={(e) => drag && setDrag({ t, offset: fromEvent(e) })}
            onPointerUp={(e) => {
              if (!drag) return;
              const offset = fromEvent(e);
              editTracks(step.id, 'Move path point', (ts) =>
                setKeyframe(setKeyframe(ts, 'x', t, offset.x), 'y', t, offset.y),
              );
              setDrag(null);
            }}
          />
        );
      })}
    </svg>
  );
}

/** The element's reference point: a character's feet, otherwise its centre (element px). */
function anchorPoint(element: PageElement, project: ReturnType<typeof useProject>): Point {
  if (element.type === 'image' && element.characterId) {
    const character = project.characters[element.characterId];
    const asset = project.assets[element.assetId];
    if (character && asset) {
      const p = pivotToLocal(asset, element, character.pivot);
      return { x: p.x * element.width, y: p.y * element.height };
    }
  }
  return { x: element.width / 2, y: element.height / 2 };
}

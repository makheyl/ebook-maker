import { useState } from 'react';
import { localToPivot, pivotToLocal } from '@/core/character';
import type { ImageElement } from '@/core/schema';
import { editCharacter } from '../character/actions';
import { useProject, useSelectedElements } from '../store/selectors';
import { useUiStore } from '../store/ui-store';

type Point = { x: number; y: number };

/** Element-local (0–1) → page coordinates, honouring the element's rotation. */
function localToPage(el: ImageElement, p: Point): Point {
  const cx = el.x + el.width / 2;
  const cy = el.y + el.height / 2;
  const dx = el.x + p.x * el.width - cx;
  const dy = el.y + p.y * el.height - cy;
  const r = (el.rotation * Math.PI) / 180;
  return {
    x: cx + dx * Math.cos(r) - dy * Math.sin(r),
    y: cy + dx * Math.sin(r) + dy * Math.cos(r),
  };
}

function pageToLocal(el: ImageElement, p: Point): Point {
  const cx = el.x + el.width / 2;
  const cy = el.y + el.height / 2;
  const r = (-el.rotation * Math.PI) / 180;
  const dx = p.x - cx;
  const dy = p.y - cy;
  const x = cx + dx * Math.cos(r) - dy * Math.sin(r);
  const y = cy + dx * Math.sin(r) + dy * Math.cos(r);
  return { x: (x - el.x) / el.width, y: (y - el.y) / el.height };
}

/**
 * The character's feet: a draggable dot (with a ground line) on the stage. Motions pivot on
 * this point and the ground shadow sits under it. One drag = one undo step.
 */
export function PivotHandle({ scale }: { scale: number }) {
  const project = useProject();
  const selected = useSelectedElements();
  const editing = useUiStore((s) => s.editingPivot);
  const [drag, setDrag] = useState<Point | null>(null);
  const el = selected.length === 1 && selected[0]!.type === 'image' ? selected[0]! : null;
  const character = el?.characterId ? project.characters[el.characterId] : undefined;
  const asset = el ? project.assets[el.assetId] : undefined;
  if (!editing || !el || !character || !asset) return null;

  const local = drag ?? pivotToLocal(asset, el, character.pivot);
  const point = localToPage(el, local);
  const left = localToPage(el, { x: 0, y: local.y });
  const right = localToPage(el, { x: 1, y: local.y });

  const commit = (next: Point) =>
    editCharacter(character.id, (c) => void (c.pivot = localToPivot(asset, el, next)), {
      label: 'Move feet',
    });

  const fromEvent = (e: React.PointerEvent<HTMLElement>): Point => {
    const box = e.currentTarget.parentElement!.getBoundingClientRect();
    const page = { x: (e.clientX - box.left) / scale, y: (e.clientY - box.top) / scale };
    const l = pageToLocal(el, page);
    return { x: Math.min(1, Math.max(0, l.x)), y: Math.min(1, Math.max(0, l.y)) };
  };

  return (
    <>
      <svg
        className="pointer-events-none absolute inset-0 z-10 overflow-visible"
        width="100%"
        height="100%"
        aria-hidden="true"
      >
        <line
          x1={left.x * scale}
          y1={left.y * scale}
          x2={right.x * scale}
          y2={right.y * scale}
          stroke="#ff3d8b"
          strokeWidth={1.5}
          strokeDasharray="6 4"
        />
      </svg>
      <div
        role="slider"
        tabIndex={0}
        data-stage-control
        aria-label={`${character.name}'s feet`}
        aria-valuetext={`${Math.round(local.x * 100)}% across, ${Math.round(local.y * 100)}% down`}
        className="absolute z-20 size-5 -translate-x-1/2 -translate-y-1/2 cursor-grab rounded-full border-2 border-white bg-[#ff3d8b] shadow-md outline-none focus-visible:ring-4 focus-visible:ring-[#ff3d8b]/40 active:cursor-grabbing"
        style={{ left: point.x * scale, top: point.y * scale }}
        onPointerDown={(e) => {
          e.stopPropagation();
          e.currentTarget.setPointerCapture(e.pointerId);
          setDrag(fromEvent(e));
        }}
        onPointerMove={(e) => drag && setDrag(fromEvent(e))}
        onPointerUp={(e) => {
          if (!drag) return;
          commit(fromEvent(e));
          setDrag(null);
        }}
        onKeyDown={(e) => {
          const step = e.shiftKey ? 0.05 : 0.01;
          const d = {
            ArrowLeft: [-step, 0],
            ArrowRight: [step, 0],
            ArrowUp: [0, -step],
            ArrowDown: [0, step],
          }[e.key];
          if (!d) return;
          e.preventDefault();
          e.stopPropagation();
          commit({
            x: Math.min(1, Math.max(0, local.x + d[0]!)),
            y: Math.min(1, Math.max(0, local.y + d[1]!)),
          });
        }}
      />
    </>
  );
}

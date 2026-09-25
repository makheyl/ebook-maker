import { useState } from 'react';
import { defaultTailAnchor } from '@/core/ops';
import type { PageView } from '@/core/render';
import { pageToBubble } from '@/core/render/bubble-geometry';
import {
  findElement,
  mapElements,
  type BubbleElement,
  type ImageElement,
  type PageElement,
} from '@/core/schema';
import { attachBubbleTo, setFreeTail, tailTipOnPage } from '../bubbles/actions';
import { useActivePage, useProject, useSelectedElements } from '../store/selectors';
import { useUiStore } from '../store/ui-store';

type Point = { x: number; y: number };
type Rect = { left: number; top: number; width: number; height: number };
type Drag = { tip: Point; over: ImageElement | null; overRect: Rect | null; moved: boolean };

/**
 * The tail's tip on the stage: drag it anywhere to point the tail there, or onto a picture
 * (a character, usually) to attach it — the tail then follows that picture, and the bubble can
 * move with it. Arrow keys nudge a free tip. One drag = one undo step.
 */
export function BubbleTailHandle({ view, scale }: { view: PageView | null; scale: number }) {
  const project = useProject();
  const page = useActivePage();
  const selected = useSelectedElements();
  const editingId = useUiStore((s) => s.editingTextId);
  const previewing = useUiStore((s) => s.previewing);
  const [drag, setDrag] = useState<Drag | null>(null);
  const only = selected.length === 1 ? selected[0]! : null;
  const bubble = only?.type === 'bubble' ? only : null;
  if (
    !bubble ||
    bubble.locked ||
    bubble.hidden ||
    previewing ||
    editingId === bubble.id ||
    bubble.bubble.shape === 'caption'
  ) {
    return null;
  }

  const tip = drag?.tip ?? tailTipOnPage(page.elements, bubble);
  const target = bubble.tail.targetId ? findElement(page.elements, bubble.tail.targetId) : null;

  const pageOf = (e: React.PointerEvent<HTMLElement>): Point => {
    const box = e.currentTarget.parentElement!.getBoundingClientRect();
    return { x: (e.clientX - box.left) / scale, y: (e.clientY - box.top) / scale };
  };

  /** The picture under the pointer (never the bubble itself), and its outline on the overlay. */
  const pictureAt = (e: React.PointerEvent<HTMLElement>) => {
    const host = e.currentTarget.parentElement!.getBoundingClientRect();
    for (const node of document.elementsFromPoint(e.clientX, e.clientY)) {
      if (
        !(node instanceof HTMLElement) ||
        !node.matches('.fl-mode-editor .fl-el[data-type=image]')
      )
        continue;
      const el = findElement(page.elements, node.dataset.elementId!);
      if (el?.type !== 'image' || el.hidden) continue;
      const r = node.getBoundingClientRect();
      const overRect = {
        left: r.left - host.left,
        top: r.top - host.top,
        width: r.width,
        height: r.height,
      };
      return { over: el, overRect };
    }
    return { over: null, overRect: null };
  };

  /** Draws the bubble with the tail where it's being dragged (the document changes on drop). */
  const preview = (next: Drag) => {
    if (!view) return;
    let tail: BubbleElement['tail'];
    if (next.over) {
      tail = {
        ...bubble.tail,
        targetId: next.over.id,
        anchor: defaultTailAnchor(next.over, project.assets[next.over.assetId]),
      };
    } else {
      const { targetId: _unused, ...free } = bubble.tail;
      void _unused;
      tail = { ...free, tip: pageToBubble(page.elements, bubble, next.tip) };
    }
    const elements = mapElements(page.elements, (el) =>
      el.id === bubble.id ? ({ ...bubble, tail } as PageElement) : el,
    );
    view.update({ ...page, elements }, project.assets, project.characters);
  };

  const status = target
    ? `attached to ${target.type === 'image' && target.characterId ? (project.characters[target.characterId]?.name ?? target.name) : target.name}`
    : 'free';

  return (
    <>
      {drag?.overRect && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute z-10 rounded-sm border-2 border-dashed border-signal bg-signal/10"
          style={drag.overRect}
        />
      )}
      <div
        role="slider"
        tabIndex={0}
        data-stage-control
        data-testid="bubble-tail-handle"
        aria-label={`Tail tip of ${bubble.name}`}
        aria-valuetext={`Tail ${status}`}
        title="Drag onto a character to attach the tail"
        className="absolute z-20 size-4 -translate-x-1/2 -translate-y-1/2 cursor-grab rounded-full border-2 border-white bg-signal shadow-md outline-none focus-visible:ring-4 focus-visible:ring-signal/40 active:cursor-grabbing"
        style={{ left: tip.x * scale, top: tip.y * scale }}
        onPointerDown={(e) => {
          e.stopPropagation();
          e.preventDefault();
          e.currentTarget.setPointerCapture(e.pointerId);
          setDrag({ tip, over: null, overRect: null, moved: false });
        }}
        onPointerMove={(e) => {
          if (!drag) return;
          const next = { tip: pageOf(e), ...pictureAt(e), moved: true };
          setDrag(next);
          preview(next);
        }}
        onPointerUp={(e) => {
          if (!drag) return;
          setDrag(null);
          if (!drag.moved) return;
          const { over } = pictureAt(e);
          if (over) attachBubbleTo(bubble.id, over.id);
          else setFreeTail(bubble.id, pageToBubble(page.elements, bubble, pageOf(e)));
        }}
        onPointerCancel={() => {
          setDrag(null);
          view?.update(page, project.assets, project.characters);
        }}
        onKeyDown={(e) => {
          const step = e.shiftKey ? 32 : 8;
          const d = {
            ArrowLeft: [-step, 0],
            ArrowRight: [step, 0],
            ArrowUp: [0, -step],
            ArrowDown: [0, step],
          }[e.key];
          if (!d) return;
          e.preventDefault();
          e.stopPropagation();
          const moved = { x: tip.x + d[0]!, y: tip.y + d[1]! };
          setFreeTail(bubble.id, pageToBubble(page.elements, bubble, moved));
        }}
      />
    </>
  );
}

import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import Moveable, {
  type OnDrag,
  type OnDragGroup,
  type OnResize,
  type OnResizeGroup,
  type OnResizeStart,
  type OnRotate,
  type OnRotateGroup,
} from 'react-moveable';
import Selecto, { type OnDragStart as OnSelectoDragStart, type OnSelectEnd } from 'react-selecto';
import { updateElement } from '@/core/ops';
import type { PageView } from '@/core/render';
import type { Page, PageElement, TextElement } from '@/core/schema';
import { docStore } from '../store/doc-store';
import { useActivePage, useProject } from '../store/selectors';
import { useUiStore } from '../store/ui-store';
import { measureTextHeight } from '../text/measure';

/** A pending change to one element while a gesture is in progress. */
type LivePatch = Partial<Pick<PageElement, 'x' | 'y' | 'width' | 'height' | 'rotation'>> & {
  fontSize?: number;
};

const EDITOR_SCOPE = '.fl-mode-editor';
const frameSelector = (id: string) => `${EDITOR_SCOPE} .fl-el[data-element-id="${CSS.escape(id)}"]`;
const ALL_DIRS = { top: true, left: true, bottom: true, right: true, center: true, middle: true };

function applyLive(el: PageElement, patch: LivePatch): PageElement {
  const { fontSize, ...geometry } = patch;
  const next = { ...el, ...geometry } as PageElement;
  if (fontSize !== undefined && next.type === 'text') next.style = { ...next.style, fontSize };
  return next;
}

type Props = {
  view: PageView | null;
  scale: number;
  viewportEl: HTMLElement | null;
  contentEl: HTMLElement | null;
};

/**
 * Selection + transform handles over the stage (react-moveable + react-selecto).
 * During a gesture the page is re-rendered through the shared PageView with the live
 * values; the document is only changed once, at the end — one gesture, one undo step.
 */
export function SelectionLayer({ view, scale, viewportEl, contentEl }: Props) {
  const project = useProject();
  const page = useActivePage();
  const selectedIds = useUiStore((s) => s.selectedIds);
  const editingTextId = useUiStore((s) => s.editingTextId);
  const previewing = useUiStore((s) => s.previewing);
  const playerOpen = useUiStore((s) => s.playerOpen);
  const moveableRef = useRef<Moveable>(null);
  const live = useRef(new Map<string, LivePatch>());
  const start = useRef(new Map<string, PageElement>());

  const selected = useMemo(
    () => page.elements.filter((e) => selectedIds.includes(e.id) && !e.hidden),
    [page, selectedIds],
  );
  const active = editingTextId || previewing || playerOpen ? [] : selected;
  const locked = active.some((e) => e.locked);
  const targets = active.map((e) => frameSelector(e.id));
  const guidelineEls = useMemo(
    () =>
      page.elements
        .filter((e) => !selectedIds.includes(e.id) && !e.hidden)
        .map((e) => frameSelector(e.id)),
    [page, selectedIds],
  );
  const single = active.length === 1 ? active[0]! : null;
  const { width: W, height: H } = project.pageSize;

  // Keep handles glued to elements after any document or zoom change.
  useLayoutEffect(() => {
    moveableRef.current?.updateRect();
  }, [page, scale, selectedIds]);

  // Drop selection of elements that no longer exist (e.g. after undo).
  useEffect(() => {
    const existing = selectedIds.filter((id) => page.elements.some((e) => e.id === id));
    if (existing.length !== selectedIds.length) useUiStore.getState().select(existing);
  }, [page, selectedIds]);

  const renderLive = () => {
    if (!view) return;
    const patched: Page = {
      ...page,
      elements: page.elements.map((el) => {
        const p = live.current.get(el.id);
        return p ? applyLive(el, p) : el;
      }),
    };
    view.update(patched, project.assets, project.characters);
  };

  const beginGesture = () => {
    live.current.clear();
    start.current = new Map(active.map((e) => [e.id, e]));
  };

  const setLive = (id: string, patch: LivePatch) => {
    live.current.set(id, { ...live.current.get(id), ...patch });
  };

  const commit = (label: string) => {
    const entries = [...live.current.entries()];
    live.current.clear();
    if (!entries.length) return;
    docStore.change(
      (d) =>
        entries.forEach(([id, patch]) =>
          updateElement(d, page.id, id, (el) => {
            const { fontSize, ...geometry } = patch;
            Object.assign(el, roundGeometry(geometry));
            if (fontSize !== undefined && el.type === 'text')
              el.style.fontSize = Math.round(fontSize * 10) / 10;
          }),
        ),
      { label },
    );
  };

  const idOf = (target: HTMLElement | SVGElement) => (target as HTMLElement).dataset.elementId!;

  // ── Drag
  const onDrag = (e: OnDrag) => {
    setLive(idOf(e.target), { x: e.left, y: e.top });
  };

  // ── Resize: corners scale text/images proportionally; text edges reflow and auto-fit height.
  const resizeDir = useRef<number[]>([0, 0]);
  const onResizeStart = (e: OnResizeStart) => {
    resizeDir.current = e.direction;
    e.setMin([8, 8]);
  };
  const resizeOne = (
    target: HTMLElement | SVGElement,
    width: number,
    height: number,
    left: number,
    top: number,
    direction: number[],
  ) => {
    const id = idOf(target);
    const orig = start.current.get(id);
    if (!orig) return;
    const corner = direction[0] !== 0 && direction[1] !== 0;
    if (orig.type === 'text' && !corner) {
      const h = Math.max(20, measureTextHeight({ ...orig, width } as TextElement));
      setLive(id, {
        x: left,
        y: direction[1] === -1 ? orig.y + orig.height - h : orig.y,
        width,
        height: h,
      });
      return;
    }
    if ((orig.type === 'text' || orig.type === 'image') && corner) {
      const s = Math.max(width / orig.width, height / orig.height);
      const w = orig.width * s;
      const h = orig.height * s;
      setLive(id, {
        width: w,
        height: h,
        x: direction[0] === -1 ? orig.x + orig.width - w : orig.x,
        y: direction[1] === -1 ? orig.y + orig.height - h : orig.y,
        ...(orig.type === 'text' ? { fontSize: orig.style.fontSize * s } : {}),
      });
      return;
    }
    setLive(id, { width, height, x: left, y: top });
  };
  const onResize = (e: OnResize) => {
    resizeOne(e.target, e.width, e.height, e.drag.left, e.drag.top, e.direction);
  };

  // ── Rotate
  const onRotate = (e: OnRotate) => {
    setLive(idOf(e.target), { rotation: normalizeRotation(e.rotation) });
  };

  // ── Selecto: click / marquee selection
  const onSelectoDragStart = (e: OnSelectoDragStart) => {
    const target = e.inputEvent.target as HTMLElement;
    const moveable = moveableRef.current;
    if (target.closest('[contenteditable="true"]')) return e.stop();
    if (moveable?.isMoveableElement(target)) return e.stop();
    const frame = target.closest<HTMLElement>(`${EDITOR_SCOPE} .fl-el`);
    if (frame && useUiStore.getState().selectedIds.includes(frame.dataset.elementId!)) e.stop();
  };

  const onSelectEnd = (e: OnSelectEnd) => {
    const byId = new Map(page.elements.map((el) => [el.id, el]));
    let ids = e.selected
      .map((el) => (el as HTMLElement).dataset.elementId!)
      .filter((id) => byId.has(id));
    if (!e.isClick) ids = ids.filter((id) => !byId.get(id)!.locked);
    // Keep stacking order stable (bottom → top) for predictable group behaviour.
    ids.sort((a, b) => page.elements.indexOf(byId.get(a)!) - page.elements.indexOf(byId.get(b)!));
    useUiStore.getState().select(ids);
    if (e.isDragStart && ids.length && !ids.some((id) => byId.get(id)!.locked)) {
      e.inputEvent.preventDefault();
      moveableRef.current
        ?.waitToChangeTarget()
        .then(() => moveableRef.current?.dragStart(e.inputEvent));
    }
  };

  const isTextOnly = active.length > 0 && active.every((e) => e.type === 'text');

  return (
    <>
      {viewportEl && contentEl && (
        <Selecto
          container={contentEl}
          dragContainer={viewportEl}
          selectableTargets={[`${EDITOR_SCOPE} .fl-el`]}
          selectByClick
          selectFromInside={false}
          toggleContinueSelect={['shift']}
          hitRate={0}
          ratio={0}
          preventClickEventOnDrag
          onDragStart={onSelectoDragStart}
          onSelectEnd={onSelectEnd}
        />
      )}
      <Moveable
        ref={moveableRef}
        target={targets.length === 1 ? targets[0] : targets}
        draggable={!locked}
        resizable={!locked}
        rotatable={!locked}
        throttleDrag={0}
        throttleResize={0}
        throttleRotate={0}
        keepRatio={false}
        origin={false}
        rotationPosition="top"
        renderDirections={
          locked
            ? []
            : isTextOnly
              ? ['nw', 'ne', 'sw', 'se', 'w', 'e']
              : ['nw', 'n', 'ne', 'w', 'e', 'sw', 's', 'se']
        }
        snappable
        snapThreshold={6}
        snapDirections={ALL_DIRS}
        elementSnapDirections={ALL_DIRS}
        elementGuidelines={guidelineEls}
        verticalGuidelines={[0, (W * scale) / 2, W * scale]}
        horizontalGuidelines={[0, (H * scale) / 2, H * scale]}
        snapRotationDegrees={[0, 45, 90, 135, 180, 225, 270, 315]}
        snapRotationThreshold={4}
        isDisplaySnapDigit={false}
        className="folio-moveable"
        onDragStart={beginGesture}
        onDrag={(e) => {
          onDrag(e);
          renderLive();
        }}
        onDragEnd={() => commit('Move')}
        onDragGroupStart={beginGesture}
        onDragGroup={(e: OnDragGroup) => {
          e.events.forEach(onDrag);
          renderLive();
        }}
        onDragGroupEnd={() => commit('Move')}
        onResizeStart={(e) => {
          beginGesture();
          onResizeStart(e);
        }}
        onResize={(e) => {
          onResize(e);
          renderLive();
        }}
        onResizeEnd={() => commit('Resize')}
        onResizeGroupStart={(e) => {
          beginGesture();
          resizeDir.current = e.direction;
        }}
        onResizeGroup={(e: OnResizeGroup) => {
          e.events.forEach((ev) =>
            resizeOne(ev.target, ev.width, ev.height, ev.drag.left, ev.drag.top, [0, 1]),
          );
          renderLive();
        }}
        onResizeGroupEnd={() => commit('Resize')}
        onRotateStart={beginGesture}
        onRotate={(e) => {
          onRotate(e);
          renderLive();
        }}
        onRotateEnd={() => commit('Rotate')}
        onRotateGroupStart={beginGesture}
        onRotateGroup={(e: OnRotateGroup) => {
          e.events.forEach((ev) =>
            setLive(idOf(ev.target), {
              rotation: normalizeRotation(ev.rotation),
              x: ev.drag.left,
              y: ev.drag.top,
            }),
          );
          renderLive();
        }}
        onRotateGroupEnd={() => commit('Rotate')}
      />
      {single?.locked && <span className="sr-only">Selected element is locked</span>}
    </>
  );
}

function normalizeRotation(deg: number): number {
  const r = ((deg % 360) + 360) % 360;
  return Math.round((r > 180 ? r - 360 : r) * 10) / 10;
}

function roundGeometry(g: LivePatch): LivePatch {
  const out: LivePatch = {};
  for (const [k, v] of Object.entries(g) as [keyof LivePatch, number][]) {
    out[k] = k === 'rotation' ? v : Math.round(v * 10) / 10;
  }
  return out;
}

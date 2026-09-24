import { useRef } from 'react';
import { cn } from '@/ui/utils';
import { maxFor, PANEL_LIMITS, useLayoutStore, type PanelId } from './layout-store';

const EDGE: Record<PanelId, { orientation: 'vertical' | 'horizontal'; sign: 1 | -1 }> = {
  // Dragging right grows the left panel; dragging left grows the right panel; up grows the timeline.
  left: { orientation: 'vertical', sign: 1 },
  right: { orientation: 'vertical', sign: -1 },
  bottom: { orientation: 'horizontal', sign: -1 },
};

/**
 * A draggable, keyboard-operable panel edge (role="separator"): arrows ±16 px (Shift ±64),
 * Home/End for min/max, double-click to reset. One size change per drag is saved.
 */
export function ResizeHandle({
  panel,
  label,
  controls,
  className,
}: {
  panel: PanelId;
  label: string;
  controls: string;
  className?: string;
}) {
  const size = useLayoutStore((s) => s.sizes[panel]);
  const start = useRef<{ pos: number; size: number } | null>(null);
  const { orientation, sign } = EDGE[panel];
  const coord = (e: React.PointerEvent) => (orientation === 'vertical' ? e.clientX : e.clientY);
  const store = () => useLayoutStore.getState();

  return (
    <div
      role="separator"
      tabIndex={0}
      aria-label={label}
      aria-controls={controls}
      aria-orientation={orientation}
      aria-valuenow={size}
      aria-valuemin={PANEL_LIMITS[panel].min}
      aria-valuemax={maxFor(panel)}
      data-testid={`resize-${panel}`}
      className={cn(
        'group relative z-20 shrink-0 touch-none outline-none select-none',
        orientation === 'vertical' ? '-mx-1 w-2 cursor-col-resize' : '-my-1 h-2 cursor-row-resize',
        className,
      )}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        start.current = { pos: coord(e), size };
      }}
      onPointerMove={(e) => {
        if (!start.current) return;
        store().setSize(panel, start.current.size + sign * (coord(e) - start.current.pos));
      }}
      onPointerUp={() => {
        if (!start.current) return;
        start.current = null;
        store().persist();
      }}
      onPointerCancel={() => {
        start.current = null;
        store().persist();
      }}
      onDoubleClick={() => store().reset(panel)}
      onKeyDown={(e) => {
        const step = e.shiftKey ? 64 : 16;
        const grow =
          orientation === 'vertical'
            ? { ArrowRight: sign, ArrowLeft: -sign }
            : { ArrowUp: -sign, ArrowDown: sign };
        const dir = grow[e.key as keyof typeof grow];
        if (dir) {
          e.preventDefault();
          store().setSize(panel, size + dir * step, { persist: true });
        } else if (e.key === 'Home') {
          e.preventDefault();
          store().setSize(panel, PANEL_LIMITS[panel].min, { persist: true });
        } else if (e.key === 'End') {
          e.preventDefault();
          store().setSize(panel, maxFor(panel), { persist: true });
        }
      }}
    >
      <span
        aria-hidden="true"
        className={cn(
          'absolute bg-primary opacity-0 transition-opacity group-hover:opacity-60 group-focus-visible:opacity-100 group-active:opacity-100',
          orientation === 'vertical'
            ? 'inset-y-0 left-1/2 w-0.5 -translate-x-1/2'
            : 'inset-x-0 top-1/2 h-0.5 -translate-y-1/2',
        )}
      />
    </div>
  );
}

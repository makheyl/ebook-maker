import { Maximize, Minus, Plus } from 'lucide-react';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { PageView } from '@/core/render';
import { Button } from '@/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/ui/dropdown-menu';
import { useActivePage, useProject } from '../store/selectors';
import { useUiStore, type Zoom } from '../store/ui-store';
import { PageCanvas } from './PageCanvas';
import { stepZoom, ZOOM_STEPS } from './zoom';

const PAD = 48;

function ZoomControl() {
  const zoom = useUiStore((s) => s.zoom);
  const scale = useUiStore((s) => s.scale);
  const setZoom = useUiStore((s) => s.setZoom);
  return (
    <div className="absolute right-3 bottom-3 flex items-center gap-0.5 rounded-lg border bg-popover p-0.5 shadow-sm">
      <Button
        variant="ghost"
        size="icon-xs"
        aria-label="Zoom out"
        onClick={() => setZoom(stepZoom(scale, -1))}
      >
        <Minus />
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="xs" className="w-14 tabular-nums" aria-label="Zoom level">
            {Math.round(scale * 100)}%
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" side="top">
          <DropdownMenuItem onSelect={() => setZoom('fit')}>
            <Maximize /> Fit {zoom === 'fit' && '✓'}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          {ZOOM_STEPS.map((z) => (
            <DropdownMenuItem key={z} onSelect={() => setZoom(z)}>
              {z * 100}%
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      <Button
        variant="ghost"
        size="icon-xs"
        aria-label="Zoom in"
        onClick={() => setZoom(stepZoom(scale, 1))}
      >
        <Plus />
      </Button>
    </div>
  );
}

function resolveScale(
  zoom: Zoom,
  viewport: { width: number; height: number },
  page: { width: number; height: number },
) {
  if (zoom !== 'fit') return zoom;
  const fit = Math.min(
    (viewport.width - PAD * 2) / page.width,
    (viewport.height - PAD * 2) / page.height,
  );
  return Math.max(0.05, Math.min(fit, 4));
}

export type StageOverlayProps = {
  view: PageView | null;
  scale: number;
  pageEl: HTMLElement | null;
};

/**
 * The center canvas: the active page drawn by the shared renderer at the current zoom.
 * `overlay` renders selection/transform UI (added in the editing milestone).
 */
export function Stage({ overlay }: { overlay?: (props: StageOverlayProps) => React.ReactNode }) {
  const project = useProject();
  const page = useActivePage();
  const zoom = useUiStore((s) => s.zoom);
  const scale = useUiStore((s) => s.scale);
  const viewportRef = useRef<HTMLDivElement>(null);
  const [pageEl, setPageEl] = useState<HTMLDivElement | null>(null);
  const [viewport, setViewport] = useState({ width: 800, height: 600 });
  const [view, setView] = useState<PageView | null>(null);
  const { width: pw, height: ph } = project.pageSize;

  useLayoutEffect(() => {
    const el = viewportRef.current!;
    const ro = new ResizeObserver(([entry]) => {
      if (!entry) return;
      setViewport({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useLayoutEffect(() => {
    useUiStore.getState().setScale(resolveScale(zoom, viewport, project.pageSize));
  }, [zoom, viewport, project.pageSize]);

  // Ctrl/⌘ + wheel zooms around the stage.
  useEffect(() => {
    const el = viewportRef.current!;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const { scale: s, setZoom } = useUiStore.getState();
      setZoom(Math.max(0.1, Math.min(4, s * (e.deltaY < 0 ? 1.1 : 1 / 1.1))));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const onView = useCallback((v: PageView | null) => setView(v), []);

  const contentW = Math.max(viewport.width, pw * scale + PAD * 2);
  const contentH = Math.max(viewport.height, ph * scale + PAD * 2);
  const left = (contentW - pw * scale) / 2;
  const top = (contentH - ph * scale) / 2;

  return (
    <div className="relative min-w-0 flex-1 bg-canvas">
      <div
        ref={viewportRef}
        className="absolute inset-0 overflow-auto"
        data-testid="stage-viewport"
        onPointerDown={(e) => {
          if (e.target === e.currentTarget || e.target === e.currentTarget.firstChild) {
            useUiStore.getState().clearSelection();
          }
        }}
      >
        <div className="relative" style={{ width: contentW, height: contentH }}>
          <div
            ref={setPageEl}
            className="absolute bg-white shadow-[0_1px_3px_rgba(0,0,0,.12),0_8px_24px_-6px_rgba(0,0,0,.18)]"
            style={{ left, top, width: pw * scale, height: ph * scale }}
            data-testid="stage-page"
          >
            <div
              style={{
                transform: `scale(${scale})`,
                transformOrigin: '0 0',
                width: pw,
                height: ph,
              }}
            >
              <PageCanvas
                page={page}
                pageSize={project.pageSize}
                assets={project.assets}
                mode="editor"
                onView={onView}
              />
            </div>
          </div>
          {overlay?.({ view, scale, pageEl })}
        </div>
      </div>
      <ZoomControl />
    </div>
  );
}

import { GanttChart, Maximize, Minus, Plus } from 'lucide-react';
import { useCallback, useEffect, useLayoutEffect, useState } from 'react';
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
import { elementsNeedingCharSplit } from '@/core/animation';
import { PageCanvas } from './PageCanvas';
import { setStageView } from './stage-view';
import { endScrub, isScrubbing } from '../timeline/session';
import { stepZoom, ZOOM_STEPS } from './zoom';

const PAD = 48;

function ZoomControl() {
  const zoom = useUiStore((s) => s.zoom);
  const scale = useUiStore((s) => s.scale);
  const setZoom = useUiStore((s) => s.setZoom);
  const timelineOpen = useUiStore((s) => s.timelineOpen);
  return (
    <div className="absolute right-3 bottom-3 flex items-center gap-0.5 rounded-lg border bg-popover p-0.5 shadow-sm">
      <Button
        variant={timelineOpen ? 'secondary' : 'ghost'}
        size="xs"
        aria-pressed={timelineOpen}
        title="Timeline (T)"
        onClick={() => useUiStore.getState().setTimelineOpen(!timelineOpen)}
      >
        <GanttChart /> Timeline
      </Button>
      <div className="mx-0.5 h-4 w-px bg-border" />
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
  viewportEl: HTMLElement | null;
  contentEl: HTMLElement | null;
};

/** Converts a client point to page coordinates. */
function toPagePoint(pageEl: HTMLElement, clientX: number, clientY: number, scale: number) {
  const rect = pageEl.getBoundingClientRect();
  return { x: (clientX - rect.left) / scale, y: (clientY - rect.top) / scale };
}

/**
 * The center canvas: the active page drawn by the shared renderer at the current zoom.
 * `overlay` renders selection/transform UI inside the page box (unscaled coordinates).
 */
export function Stage({
  overlay,
  onDropFiles,
  onEditText,
}: {
  overlay?: (props: StageOverlayProps) => React.ReactNode;
  onDropFiles?: (files: File[], at: { x: number; y: number }) => void;
  onEditText?: (elementId: string, client: { x: number; y: number }) => void;
}) {
  const project = useProject();
  const page = useActivePage();
  const zoom = useUiStore((s) => s.zoom);
  const scale = useUiStore((s) => s.scale);
  const [viewportEl, setViewportEl] = useState<HTMLDivElement | null>(null);
  const [contentEl, setContentEl] = useState<HTMLDivElement | null>(null);
  const [pageEl, setPageEl] = useState<HTMLDivElement | null>(null);
  const [viewport, setViewport] = useState({ width: 800, height: 600 });
  const [view, setView] = useState<PageView | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const { width: pw, height: ph } = project.pageSize;

  useLayoutEffect(() => {
    if (!viewportEl) return;
    const ro = new ResizeObserver(([entry]) => {
      if (!entry) return;
      setViewport({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    ro.observe(viewportEl);
    return () => ro.disconnect();
  }, [viewportEl]);

  useLayoutEffect(() => {
    useUiStore.getState().setScale(resolveScale(zoom, viewport, project.pageSize));
  }, [zoom, viewport, project.pageSize]);

  // Ctrl/⌘ + wheel (and trackpad pinch) zooms the stage.
  useEffect(() => {
    if (!viewportEl) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const { scale: s, setZoom } = useUiStore.getState();
      setZoom(Math.max(0.1, Math.min(4, s * (e.deltaY < 0 ? 1.1 : 1 / 1.1))));
    };
    viewportEl.addEventListener('wheel', onWheel, { passive: false });
    return () => viewportEl.removeEventListener('wheel', onWheel);
  }, [viewportEl]);

  const onView = useCallback((v: PageView | null) => {
    setView(v);
    setStageView(v);
  }, []);

  const contentW = Math.max(viewport.width, pw * scale + PAD * 2);
  const contentH = Math.max(viewport.height, ph * scale + PAD * 2);
  const left = (contentW - pw * scale) / 2;
  const top = (contentH - ph * scale) / 2;

  const hasFiles = (e: React.DragEvent) => [...e.dataTransfer.types].includes('Files');

  return (
    <div className="relative min-w-0 flex-1 bg-canvas">
      <div
        ref={setViewportEl}
        className="absolute inset-0 overflow-auto"
        data-testid="stage-viewport"
        role="region"
        aria-label="Page canvas"
        aria-describedby="stage-help"
        onPointerDownCapture={() => {
          if (isScrubbing()) endScrub();
        }}
        onDoubleClick={(e) => {
          const frame = (e.target as HTMLElement).closest<HTMLElement>('.fl-mode-editor .fl-el');
          if (frame?.dataset.type === 'text' && !frame.hasAttribute('data-locked')) {
            onEditText?.(frame.dataset.elementId!, { x: e.clientX, y: e.clientY });
          }
        }}
        onDragOver={(e) => {
          if (!hasFiles(e)) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = 'copy';
          setDragOver(true);
        }}
        onDragLeave={(e) => {
          if (e.currentTarget === e.target) setDragOver(false);
        }}
        onDrop={(e) => {
          if (!hasFiles(e) || !pageEl) return;
          e.preventDefault();
          setDragOver(false);
          onDropFiles?.(
            [...e.dataTransfer.files],
            toPagePoint(pageEl, e.clientX, e.clientY, scale),
          );
        }}
      >
        <div ref={setContentEl} className="relative" style={{ width: contentW, height: contentH }}>
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
                characters={project.characters}
                mode="editor"
                splitTextFor={elementsNeedingCharSplit}
                onView={onView}
              />
            </div>
            {overlay?.({ view, scale, viewportEl, contentEl })}
          </div>
        </div>
      </div>
      {dragOver && (
        <div className="pointer-events-none absolute inset-3 grid place-items-center rounded-xl border-2 border-dashed border-primary bg-primary/5 text-sm font-medium text-primary">
          Drop images to add them to this page
        </div>
      )}
      <ZoomControl />
      <p id="stage-help" className="sr-only">
        Select elements with the mouse, or from the Layers tab with the keyboard. Arrow keys move
        the selection (Shift for 10 pixels), Enter edits selected text, Delete removes it.
      </p>
    </div>
  );
}

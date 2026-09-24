import { AlertTriangle } from 'lucide-react';
import { rotatedBounds } from '@/core/geometry';
import type { TextElement } from '@/core/schema';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/ui/dropdown-menu';
import { useActivePage, useProject } from '../store/selectors';
import { useUiStore } from '../store/ui-store';
import { continueOnNewPage, moveOntoPage, setAutofit } from '../text/actions';
import { textProblems } from '../text/fit';

/**
 * Marks text that doesn't fit its box or runs off the page — like an "overset text" marker in
 * page-layout apps — with one-click fixes. What's flagged here is what the reader would lose.
 */
export function OverflowBadge({ scale }: { scale: number }) {
  const project = useProject();
  const page = useActivePage();
  const previewing = useUiStore((s) => s.previewing);
  const editingId = useUiStore((s) => s.editingTextId);
  if (previewing) return null;
  const texts = page.elements.filter(
    (e): e is TextElement => e.type === 'text' && !e.hidden && e.id !== editingId,
  );
  const flagged = texts
    .map((el) => ({ el, problems: textProblems(el, project.pageSize) }))
    .filter(({ problems }) => problems.overflow || problems.offPage);
  if (!flagged.length) return null;

  return (
    <div className="pointer-events-none absolute inset-0 z-10" data-testid="overflow-badges">
      {flagged.map(({ el, problems }) => {
        const b = rotatedBounds(el);
        const { width: W, height: H } = project.pageSize;
        // Keep the badge on the visible page, at the box's bottom edge.
        const x = Math.min(Math.max(b.x + b.width / 2, 60), W - 60) * scale;
        const y = Math.min(Math.max(b.y + b.height, 30), H - 12) * scale;
        const label = problems.overflow ? 'Text doesn’t fit' : 'Text runs off the page';
        return (
          <div key={el.id}>
            <div
              aria-hidden="true"
              className="absolute border-2 border-dashed border-red-500/80"
              style={{
                left: el.x * scale,
                top: el.y * scale,
                width: el.width * scale,
                height: el.height * scale,
                transform: el.rotation ? `rotate(${el.rotation}deg)` : undefined,
              }}
            />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  data-stage-control
                  data-testid="overflow-badge"
                  className="pointer-events-auto absolute flex -translate-x-1/2 -translate-y-1/2 items-center gap-1 rounded-full bg-red-600 px-2 py-0.5 text-[11px] font-medium whitespace-nowrap text-white shadow focus-visible:ring-2 focus-visible:ring-ring"
                  style={{ left: x, top: y }}
                  aria-label={`${label}: ${el.name}. Show fixes`}
                  onPointerDown={(e) => e.stopPropagation()}
                >
                  <AlertTriangle className="size-3" /> {label}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="center">
                <DropdownMenuLabel className="text-xs">
                  Part of this text won’t show in the book
                </DropdownMenuLabel>
                <DropdownMenuItem
                  onSelect={() => {
                    useUiStore.getState().select([el.id]);
                    setAutofit('shrink');
                  }}
                >
                  Shrink text to fit the box
                </DropdownMenuItem>
                {problems.overflow && (
                  <DropdownMenuItem
                    onSelect={() => {
                      useUiStore.getState().select([el.id]);
                      setAutofit('grow');
                    }}
                  >
                    Grow the box
                  </DropdownMenuItem>
                )}
                {problems.offPage && (
                  <DropdownMenuItem onSelect={() => moveOntoPage(el.id)}>
                    Move it onto the page
                  </DropdownMenuItem>
                )}
                {problems.overflow && !problems.offPage && (
                  <DropdownMenuItem onSelect={() => continueOnNewPage(el.id)}>
                    Continue on a new page
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        );
      })}
    </div>
  );
}

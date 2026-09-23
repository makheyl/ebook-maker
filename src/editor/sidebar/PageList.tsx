import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { restrictToVerticalAxis } from '@dnd-kit/modifiers';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { useVirtualizer } from '@tanstack/react-virtual';
import { ArrowDown, ArrowUp, Copy, MoreVertical, Plus, Trash2 } from 'lucide-react';
import { useEffect, useRef } from 'react';
import type { Page, Project } from '@/core/schema';
import { Button } from '@/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/ui/dropdown-menu';
import { cn } from '@/ui/utils';
import { PageThumbnail } from '../stage/PageThumbnail';
import { pageActions } from './page-actions';
import { resolveActivePage, useProject } from '../store/selectors';
import { useUiStore } from '../store/ui-store';

const THUMB_WIDTH = 132;
const ITEM_CHROME = 18; // vertical padding + gap around each thumbnail

function PageItem({
  page,
  index,
  project,
  active,
  count,
  style,
}: {
  page: Page;
  index: number;
  project: Project;
  active: boolean;
  count: number;
  style: React.CSSProperties;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: page.id,
  });
  const dragY = transform ? transform.y : 0;
  return (
    <div
      ref={setNodeRef}
      style={{
        ...style,
        transform: `translateY(${(style.top as number) + dragY}px)`,
        top: 0,
        transition,
        zIndex: isDragging ? 10 : undefined,
      }}
      className="group absolute inset-x-0 flex items-start gap-1.5 px-2 py-[5px]"
      data-testid="page-item"
    >
      <span className="w-5 pt-1 text-right text-xs text-muted-foreground tabular-nums">
        {index + 1}
      </span>
      <button
        type="button"
        {...attributes}
        {...listeners}
        aria-label={`Page ${index + 1}`}
        aria-current={active ? 'page' : undefined}
        onClick={() => useUiStore.getState().setActivePage(page.id)}
        className={cn(
          'relative overflow-hidden rounded-md border bg-white shadow-xs outline-none transition-shadow focus-visible:ring-2 focus-visible:ring-ring',
          active ? 'ring-2 ring-primary' : 'hover:ring-2 hover:ring-primary/40',
          isDragging && 'opacity-80 shadow-lg',
        )}
      >
        <PageThumbnail
          page={page}
          pageSize={project.pageSize}
          assets={project.assets}
          width={THUMB_WIDTH}
        />
      </button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="secondary"
            size="icon-xs"
            aria-label={`Page ${index + 1} options`}
            className="absolute top-2 right-3 opacity-0 shadow-sm group-hover:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100"
          >
            <MoreVertical />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" side="right">
          <DropdownMenuItem onSelect={() => pageActions.add(index)}>
            <Plus /> Add page after
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => pageActions.duplicate(page.id)}>
            <Copy /> Duplicate
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={index === 0}
            onSelect={() => pageActions.move(index, index - 1)}
          >
            <ArrowUp /> Move up
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={index === count - 1}
            onSelect={() => pageActions.move(index, index + 1)}
          >
            <ArrowDown /> Move down
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onSelect={() => pageActions.remove(page.id)}>
            <Trash2 /> Delete page
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

/** Virtualized, drag-to-reorder page sidebar; stays fast with hundreds of pages. */
export function PageList() {
  const project = useProject();
  const activePageId = useUiStore((s) => s.activePageId);
  const active = resolveActivePage(project, activePageId);
  const scrollRef = useRef<HTMLDivElement>(null);
  const itemHeight =
    Math.round((THUMB_WIDTH * project.pageSize.height) / project.pageSize.width) + ITEM_CHROME;
  const pages = project.pages;

  const virtualizer = useVirtualizer({
    count: pages.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => itemHeight,
    overscan: 6,
    getItemKey: (i) => pages[i]!.id,
  });

  const activeIndex = pages.indexOf(active);
  useEffect(() => {
    if (activeIndex >= 0) virtualizer.scrollToIndex(activeIndex, { align: 'auto' });
  }, [activeIndex, virtualizer]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const onDragEnd = ({ active: dragged, over }: DragEndEvent) => {
    if (!over || dragged.id === over.id) return;
    const from = pages.findIndex((p) => p.id === dragged.id);
    const to = pages.findIndex((p) => p.id === over.id);
    if (from >= 0 && to >= 0) pageActions.move(from, to);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (
      e.target !== e.currentTarget &&
      !(e.target as HTMLElement).matches('button[aria-label^="Page "]')
    )
      return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      const next = pages[activeIndex + (e.key === 'ArrowDown' ? 1 : -1)];
      if (next) {
        e.preventDefault();
        useUiStore.getState().setActivePage(next.id);
        requestAnimationFrame(() =>
          scrollRef.current?.querySelector<HTMLElement>(`[aria-current="page"]`)?.focus(),
        );
      }
    }
  };

  return (
    <nav aria-label="Pages" className="flex w-[184px] shrink-0 flex-col border-r bg-sidebar">
      <div className="flex h-10 items-center justify-between px-3">
        <span className="text-xs font-medium text-muted-foreground">
          {pages.length} {pages.length === 1 ? 'page' : 'pages'}
        </span>
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label="Add page"
          onClick={() => pageActions.add(activeIndex)}
        >
          <Plus />
        </Button>
      </div>
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto" onKeyDown={onKeyDown}>
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={onDragEnd}
          modifiers={[restrictToVerticalAxis]}
        >
          <SortableContext items={pages.map((p) => p.id)} strategy={verticalListSortingStrategy}>
            <div className="relative" style={{ height: virtualizer.getTotalSize() }}>
              {virtualizer.getVirtualItems().map((item) => {
                const page = pages[item.index]!;
                return (
                  <PageItem
                    key={page.id}
                    page={page}
                    index={item.index}
                    project={project}
                    active={page.id === active.id}
                    count={pages.length}
                    style={{ top: item.start, height: item.size }}
                  />
                );
              })}
            </div>
          </SortableContext>
        </DndContext>
        <div className="p-3 pt-1">
          <Button variant="outline" size="sm" className="w-full" onClick={() => pageActions.add()}>
            <Plus /> Add page
          </Button>
        </div>
      </div>
    </nav>
  );
}

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
import { CSS } from '@dnd-kit/utilities';
import { Circle, Eye, EyeOff, GripVertical, Image, Lock, Minus, Square, Type, Unlock } from 'lucide-react';
import { useState } from 'react';
import { moveElementToIndex, patchElements } from '@/core/ops';
import type { PageElement } from '@/core/schema';
import { cn } from '@/ui/utils';
import { setElementsFlag } from '../actions';
import { docStore } from '../store/doc-store';
import { useActivePage } from '../store/selectors';
import { useUiStore } from '../store/ui-store';

function TypeIcon({ el }: { el: PageElement }) {
  const cls = 'size-3.5 shrink-0 text-muted-foreground';
  if (el.type === 'text') return <Type className={cls} />;
  if (el.type === 'image') return <Image className={cls} />;
  if (el.shape === 'ellipse') return <Circle className={cls} />;
  if (el.shape === 'line') return <Minus className={cls} />;
  return <Square className={cls} />;
}

function LayerRow({ el, pageId, selected }: { el: PageElement; pageId: string; selected: boolean }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: el.id });
  const [renaming, setRenaming] = useState(false);

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        'group flex h-9 items-center gap-1 rounded-md px-1 text-sm',
        selected ? 'bg-accent text-accent-foreground' : 'hover:bg-muted',
        isDragging && 'z-10 bg-popover shadow-md',
        el.hidden && 'opacity-60',
      )}
    >
      <button
        type="button"
        className="cursor-grab rounded p-0.5 text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
        aria-label={`Reorder ${el.name}`}
        {...attributes}
        {...listeners}
      >
        <GripVertical className="size-3.5" />
      </button>
      <TypeIcon el={el} />
      {renaming ? (
        <input
          autoFocus
          defaultValue={el.name}
          aria-label="Layer name"
          className="h-7 min-w-0 flex-1 rounded border bg-background px-1.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onBlur={(e) => {
            const name = e.target.value.trim().slice(0, 120);
            setRenaming(false);
            if (name && name !== el.name) {
              docStore.change((d) => patchElements(d, pageId, [{ id: el.id, patch: { name } }]), {
                label: 'Rename layer',
              });
            }
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur();
            if (e.key === 'Escape') setRenaming(false);
          }}
        />
      ) : (
        <button
          type="button"
          className="h-7 min-w-0 flex-1 truncate rounded px-1.5 text-left focus-visible:ring-2 focus-visible:ring-ring"
          aria-pressed={selected}
          onClick={(e) => {
            if (e.shiftKey || e.metaKey || e.ctrlKey) useUiStore.getState().toggleSelect(el.id);
            else useUiStore.getState().select([el.id]);
          }}
          onDoubleClick={() => setRenaming(true)}
        >
          {el.name}
        </button>
      )}
      <button
        type="button"
        aria-label={el.locked ? `Unlock ${el.name}` : `Lock ${el.name}`}
        aria-pressed={el.locked}
        onClick={() => setElementsFlag([el.id], 'locked', !el.locked)}
        className={cn(
          'rounded p-1 text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring',
          !el.locked && 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100',
        )}
      >
        {el.locked ? <Lock className="size-3.5" /> : <Unlock className="size-3.5" />}
      </button>
      <button
        type="button"
        aria-label={el.hidden ? `Show ${el.name}` : `Hide ${el.name}`}
        aria-pressed={el.hidden}
        onClick={() => setElementsFlag([el.id], 'hidden', !el.hidden)}
        className={cn(
          'rounded p-1 text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring',
          !el.hidden && 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100',
        )}
      >
        {el.hidden ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
      </button>
    </li>
  );
}

/** Stack of elements on the active page, top-most first (like Figma/Canva). */
export function LayersPanel() {
  const page = useActivePage();
  const selectedIds = useUiStore((s) => s.selectedIds);
  const topFirst = [...page.elements].reverse();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const toIndex = page.elements.findIndex((e) => e.id === over.id);
    docStore.change((d) => moveElementToIndex(d, page.id, String(active.id), toIndex), {
      label: 'Reorder layers',
    });
  };

  if (!page.elements.length) {
    return <p className="p-4 text-sm text-muted-foreground">This page is empty. Add text, images or shapes from the toolbar.</p>;
  }

  return (
    <div className="p-2">
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd} modifiers={[restrictToVerticalAxis]}>
        <SortableContext items={topFirst.map((e) => e.id)} strategy={verticalListSortingStrategy}>
          <ul aria-label="Layers" className="grid gap-0.5">
            {topFirst.map((el) => (
              <LayerRow key={el.id} el={el} pageId={page.id} selected={selectedIds.includes(el.id)} />
            ))}
          </ul>
        </SortableContext>
      </DndContext>
      <p className="px-2 pt-3 text-[11px] text-muted-foreground">Double-click a name to rename. Drag to reorder.</p>
    </div>
  );
}

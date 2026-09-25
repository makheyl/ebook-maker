import { LayerContextMenu } from '../menus/EditorContextMenu';
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
import {
  Boxes,
  ChevronDown,
  ChevronRight,
  Circle,
  Eye,
  EyeOff,
  GripVertical,
  Image,
  Lock,
  MessageCircle,
  Minus,
  Pointer,
  RectangleHorizontal,
  Smile,
  Square,
  Type,
  Unlock,
} from 'lucide-react';
import { useState } from 'react';
import { moveElementToIndex, moveToParent, patchElements } from '@/core/ops';
import { isGroup, locate, type PageElement } from '@/core/schema';
import { cn } from '@/ui/utils';
import { setElementsFlag } from '../actions';
import { docStore } from '../store/doc-store';
import { useActivePage } from '../store/selectors';
import { useUiStore } from '../store/ui-store';

function TypeIcon({ el }: { el: PageElement }) {
  const cls = 'size-3.5 shrink-0 text-muted-foreground';
  if (el.type === 'text') return <Type className={cls} />;
  if (el.type === 'image')
    return el.characterId ? <Smile className={cls} /> : <Image className={cls} />;
  if (el.type === 'button') return <RectangleHorizontal className={cls} />;
  if (el.type === 'hotspot') return <Pointer className={cls} />;
  if (el.type === 'group') return <Boxes className={cls} />;
  if (el.type === 'bubble') return <MessageCircle className={cls} />;
  if (el.shape === 'ellipse') return <Circle className={cls} />;
  if (el.shape === 'line') return <Minus className={cls} />;
  return <Square className={cls} />;
}

type Row = { el: PageElement; depth: number; parentId: string | null };

function LayerRow({
  row,
  pageId,
  selected,
  collapsed,
  onToggle,
}: {
  row: Row;
  pageId: string;
  selected: boolean;
  collapsed: boolean;
  onToggle: () => void;
}) {
  const { el, depth, parentId } = row;
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: el.id,
  });
  const [renaming, setRenaming] = useState(false);

  return (
    <LayerContextMenu elementId={el.id} parentId={parentId}>
      <li
        ref={setNodeRef}
        style={{
          transform: CSS.Transform.toString(transform),
          transition,
          paddingLeft: 4 + depth * 14,
        }}
        data-depth={depth}
        className={cn(
          'group flex h-9 items-center gap-1 rounded-md px-1 text-sm',
          selected ? 'bg-accent text-accent-foreground' : 'hover:bg-muted',
          isDragging && 'z-10 bg-surface shadow-md',
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
        {isGroup(el) ? (
          <button
            type="button"
            aria-label={collapsed ? `Expand ${el.name}` : `Collapse ${el.name}`}
            aria-expanded={!collapsed}
            onClick={onToggle}
            className="rounded p-0.5 text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
          >
            {collapsed ? (
              <ChevronRight className="size-3.5" />
            ) : (
              <ChevronDown className="size-3.5" />
            )}
          </button>
        ) : (
          depth > 0 && <span className="w-[18px] shrink-0" aria-hidden="true" />
        )}
        <TypeIcon el={el} />
        {renaming ? (
          <input
            autoFocus
            defaultValue={el.name}
            aria-label="Layer name"
            className="h-7 min-w-0 flex-1 rounded border bg-white/70 dark:bg-white/5 px-1.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
              const ui = useUiStore.getState();
              if (e.shiftKey || e.metaKey || e.ctrlKey) ui.toggleSelect(el.id);
              // Picking an item inside a group edits that group on the stage.
              else ui.enterGroup(parentId, [el.id]);
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
    </LayerContextMenu>
  );
}

/** The rows shown: top-most first, groups followed by their items unless collapsed. */
function visibleRows(elements: readonly PageElement[], collapsed: ReadonlySet<string>): Row[] {
  const rows: Row[] = [];
  const add = (list: readonly PageElement[], depth: number, parentId: string | null) => {
    for (const el of [...list].reverse()) {
      rows.push({ el, depth, parentId });
      if (isGroup(el) && !collapsed.has(el.id)) add(el.children, depth + 1, el.id);
    }
  };
  add(elements, 0, null);
  return rows;
}

/** Stack of elements on the active page, top-most first, groups as a tree (like Figma/Canva). */
export function LayersPanel() {
  const page = useActivePage();
  const selectedIds = useUiStore((s) => s.selectedIds);
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  const rows = visibleRows(page.elements, collapsed);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const toggle = (id: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const from = rows.find((r) => r.el.id === active.id);
    const to = rows.find((r) => r.el.id === over.id);
    if (!from || !to) return;
    const overPlace = locate(page.elements as PageElement[], to.el.id);
    if (!overPlace) return;
    docStore.change(
      (d) => {
        if (from.parentId === to.parentId) {
          // Same stack: just restack.
          moveElementToIndex(d, page.id, from.el.id, overPlace.index);
        } else if (isGroup(to.el) && !collapsed.has(to.el.id)) {
          // Dropped onto an open group: put it on top inside that group.
          moveToParent(d, page.id, from.el.id, to.el.id, to.el.children.length);
        } else {
          // Dropped next to an item in another stack: move it there (keeping its place on the page).
          moveToParent(d, page.id, from.el.id, to.parentId, overPlace.index + 1);
        }
      },
      { label: 'Reorder layers' },
    );
  };

  if (!page.elements.length) {
    return (
      <p className="p-4 text-sm text-muted-foreground">
        This page is empty. Add text, images or shapes from the toolbar.
      </p>
    );
  }

  return (
    <div className="p-2">
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={onDragEnd}
        modifiers={[restrictToVerticalAxis]}
      >
        <SortableContext items={rows.map((r) => r.el.id)} strategy={verticalListSortingStrategy}>
          <ul aria-label="Layers" className="grid gap-0.5">
            {rows.map((row) => (
              <LayerRow
                key={row.el.id}
                row={row}
                pageId={page.id}
                selected={selectedIds.includes(row.el.id)}
                collapsed={collapsed.has(row.el.id)}
                onToggle={() => toggle(row.el.id)}
              />
            ))}
          </ul>
        </SortableContext>
      </DndContext>
      <p className="px-2 pt-3 text-[11px] text-muted-foreground">
        Double-click a name to rename. Drag to reorder, or onto a group to move into it.
      </p>
    </div>
  );
}

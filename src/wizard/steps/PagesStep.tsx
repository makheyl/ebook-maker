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
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  ArrowDown,
  ArrowUp,
  GripVertical,
  ImagePlus,
  Loader2,
  Plus,
  Trash2,
  Upload,
} from 'lucide-react';
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { assetUrls } from '@/editor/assets/asset-urls';
import { imageFilesFrom, importImageFiles } from '@/editor/assets/upload';
import { Button } from '@/ui/button';
import { Textarea } from '@/ui/textarea';
import { cn } from '@/ui/utils';
import {
  mergeIntoRows,
  rowId,
  splitLines,
  swapImages,
  type WizardImage,
  type WizardRow,
} from '../pairing';

async function toWizardImages(files: File[]): Promise<WizardImage[]> {
  const { assets, errors } = await importImageFiles(files);
  errors.forEach((e) => toast.error(`${e.name}: ${e.message}`));
  return assets.map((asset) => ({ asset, name: asset.name ?? 'Image' }));
}

function Row({
  row,
  index,
  count,
  onChange,
  onRemove,
  onSwap,
}: {
  row: WizardRow;
  index: number;
  count: number;
  onChange: (row: WizardRow) => void;
  onRemove: () => void;
  onSwap: (dir: -1 | 1) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: row.id,
  });
  const fileRef = useRef<HTMLInputElement>(null);
  const thumb = row.image ? assetUrls.resolve(row.image.asset.id, 'thumb') : undefined;
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        'flex items-center gap-2 rounded-xl border bg-card p-2',
        isDragging && 'z-10 shadow-lg',
      )}
      data-testid="wizard-row"
    >
      <button
        type="button"
        className="cursor-grab rounded p-1 text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
        aria-label={`Reorder page ${index + 1}`}
        {...attributes}
        {...listeners}
      >
        <GripVertical className="size-4" />
      </button>
      <span className="w-6 text-center text-sm text-muted-foreground tabular-nums">
        {index + 1}
      </span>
      <div className="relative">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="grid size-16 place-items-center overflow-hidden rounded-lg border bg-muted text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={
            row.image ? `Replace image for page ${index + 1}` : `Add image to page ${index + 1}`
          }
        >
          {thumb ? (
            <img src={thumb} alt="" className="size-full object-cover" />
          ) : (
            <ImagePlus className="size-5" />
          )}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          hidden
          onChange={async (e) => {
            const files = imageFilesFrom(e.target.files);
            e.target.value = '';
            const [image] = await toWizardImages(files.slice(0, 1));
            if (image) onChange({ ...row, image });
          }}
        />
      </div>
      <div className="flex flex-col">
        <button
          type="button"
          disabled={index === 0 || !row.image}
          onClick={() => onSwap(-1)}
          className="rounded p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-30 focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={`Move image of page ${index + 1} up`}
          title="Swap image with the page above"
        >
          <ArrowUp className="size-3.5" />
        </button>
        <button
          type="button"
          disabled={index === count - 1 || !row.image}
          onClick={() => onSwap(1)}
          className="rounded p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-30 focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={`Move image of page ${index + 1} down`}
          title="Swap image with the page below"
        >
          <ArrowDown className="size-3.5" />
        </button>
      </div>
      <input
        value={row.text}
        onChange={(e) => onChange({ ...row, text: e.target.value })}
        placeholder="Text for this page"
        aria-label={`Text for page ${index + 1}`}
        maxLength={1000}
        className="h-10 min-w-0 flex-1 rounded-lg border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
      {row.text.length > LONG_LINE && (
        <span
          className="shrink-0 rounded bg-amber-500/15 px-1.5 py-0.5 text-[11px] text-amber-800 dark:text-amber-200"
          title="This line is long: its text will be made smaller to fit the page's layout. You can also split it into two pages."
        >
          Long: shrinks to fit
        </span>
      )}
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={`Remove page ${index + 1}`}
        onClick={onRemove}
      >
        <Trash2 />
      </Button>
    </li>
  );
}

/** Lines longer than this get a hint that they'll be shrunk to fit. */
const LONG_LINE = 280;

/** Step 2: pages as rows of text + image — one at a time or in bulk, paired by order. */
export function PagesStep({
  rows,
  setRows,
}: {
  rows: WizardRow[];
  setRows: React.Dispatch<React.SetStateAction<WizardRow[]>>;
}) {
  const bulkRef = useRef<HTMLInputElement>(null);
  const [lines, setLines] = useState('');
  const [processing, setProcessing] = useState(0);
  const [dragOver, setDragOver] = useState(false);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const addImages = async (files: File[]) => {
    const images = imageFilesFrom(files);
    if (!images.length) return;
    setProcessing((n) => n + images.length);
    try {
      const added = await toWizardImages(images);
      // Uploads resolve asynchronously: always merge into the latest rows.
      setRows((prev) => mergeIntoRows(prev, added, []));
    } finally {
      setProcessing((n) => n - images.length);
    }
  };

  const addLines = () => {
    const parsed = splitLines(lines);
    if (!parsed.length) return;
    setRows((prev) => mergeIntoRows(prev, [], parsed));
    setLines('');
  };

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const from = rows.findIndex((r) => r.id === active.id);
    const to = rows.findIndex((r) => r.id === over.id);
    setRows((prev) => arrayMove(prev, from, to));
  };

  return (
    <div className="grid gap-6">
      <div className="grid gap-4 md:grid-cols-2">
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            void addImages([...e.dataTransfer.files]);
          }}
          className={cn(
            'flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed p-6 text-center transition-colors',
            dragOver ? 'border-primary bg-primary/5' : 'bg-muted/30',
          )}
        >
          <span className="grid size-11 place-items-center rounded-xl bg-accent text-accent-foreground">
            {processing ? (
              <Loader2 className="size-5 animate-spin" />
            ) : (
              <Upload className="size-5" />
            )}
          </span>
          <div>
            <p className="font-medium">Drop images here</p>
            <p className="text-xs text-muted-foreground">
              One image per page, in order. JPG, PNG, WebP…
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => bulkRef.current?.click()}>
            Browse images
          </Button>
          <input
            ref={bulkRef}
            type="file"
            accept="image/*"
            multiple
            hidden
            data-testid="bulk-images-input"
            onChange={(e) => {
              const files = [...(e.target.files ?? [])];
              e.target.value = '';
              void addImages(files);
            }}
          />
          {processing > 0 && (
            <p className="text-xs text-muted-foreground" role="status">
              Processing {processing}…
            </p>
          )}
        </div>
        <div className="flex flex-col gap-2 rounded-2xl border p-4">
          <label htmlFor="bulk-lines" className="font-medium">
            Paste your text
          </label>
          <p className="-mt-1 text-xs text-muted-foreground">
            One line per page. Lines are paired with images by order.
          </p>
          <Textarea
            id="bulk-lines"
            value={lines}
            onChange={(e) => setLines(e.target.value)}
            rows={5}
            placeholder={'Once upon a time…\nThere lived a curious fox.\nOne day, it found a door.'}
            className="flex-1 resize-none"
          />
          <Button
            size="sm"
            variant="secondary"
            onClick={addLines}
            disabled={!splitLines(lines).length}
          >
            Add {splitLines(lines).length || ''} {splitLines(lines).length === 1 ? 'line' : 'lines'}
          </Button>
        </div>
      </div>

      <div className="grid gap-2">
        <div className="flex items-center justify-between">
          <h2 className="font-medium">
            {rows.length} {rows.length === 1 ? 'page' : 'pages'}
          </h2>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setRows((prev) => [...prev, { id: rowId(), text: '', image: null }])}
          >
            <Plus /> Add page
          </Button>
        </div>
        {rows.length === 0 ? (
          <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
            Add images and text above, or add pages one by one.
          </p>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={onDragEnd}
            modifiers={[restrictToVerticalAxis]}
          >
            <SortableContext items={rows.map((r) => r.id)} strategy={verticalListSortingStrategy}>
              <ol className="grid gap-2" aria-label="Pages to create">
                {rows.map((row, i) => (
                  <Row
                    key={row.id}
                    row={row}
                    index={i}
                    count={rows.length}
                    onChange={(next) =>
                      setRows((prev) => prev.map((r) => (r.id === row.id ? next : r)))
                    }
                    onRemove={() => setRows((prev) => prev.filter((r) => r.id !== row.id))}
                    onSwap={(dir) => setRows((prev) => swapImages(prev, i, i + dir))}
                  />
                ))}
              </ol>
            </SortableContext>
          </DndContext>
        )}
      </div>
    </div>
  );
}

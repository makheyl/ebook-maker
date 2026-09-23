import { Crop, FlipHorizontal2, FlipVertical2, ImageUp, Replace, RotateCcw } from 'lucide-react';
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { filterCss } from '@/core/render';
import { FILTER_PRESETS, sameFilters } from '@/core/image/filter-presets';
import { addAsset, deleteElements, updateElement, updatePage } from '@/core/ops';
import { DEFAULT_FILTERS, FULL_CROP, type ImageElement, type ImageFilters } from '@/core/schema';
import { Button } from '@/ui/button';
import { Toggle } from '@/ui/toggle';
import { cn } from '@/ui/utils';
import { updateSelected } from '../actions';
import { assetUrls } from '../assets/asset-urls';
import { imageFilesFrom, importImageFiles } from '../assets/upload';
import { docStore } from '../store/doc-store';
import { getActivePage, useProject } from '../store/selectors';
import { useUiStore } from '../store/ui-store';
import { CropDialog } from './CropDialog';
import { Field, Section, SliderField } from './controls';

type Adjustment = {
  key: keyof ImageFilters;
  label: string;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
};

const pct = (v: number) => `${Math.round(v * 100)}%`;
const ADJUSTMENTS: Adjustment[] = [
  { key: 'brightness', label: 'Brightness', min: 0, max: 2, step: 0.01, format: pct },
  { key: 'contrast', label: 'Contrast', min: 0, max: 2, step: 0.01, format: pct },
  { key: 'saturate', label: 'Saturation', min: 0, max: 2, step: 0.01, format: pct },
  { key: 'hueRotate', label: 'Hue', min: -180, max: 180, step: 1, format: (v) => `${v}°` },
  { key: 'sepia', label: 'Sepia', min: 0, max: 1, step: 0.01, format: pct },
  { key: 'grayscale', label: 'Grayscale', min: 0, max: 1, step: 0.01, format: pct },
  { key: 'blur', label: 'Blur', min: 0, max: 20, step: 0.5, format: (v) => `${v}px` },
];

async function replaceImage(el: ImageElement, file: File) {
  const { assets, errors } = await importImageFiles([file]);
  errors.forEach((e) => toast.error(`${e.name}: ${e.message}`));
  const asset = assets[0];
  const page = getActivePage();
  if (!asset || !page) return;
  docStore.change(
    (d) => {
      addAsset(d, asset);
      updateElement(d, page.id, el.id, (img) => {
        if (img.type !== 'image') return;
        img.assetId = asset.id;
        img.crop = { ...FULL_CROP };
        img.name = asset.name?.replace(/\.[a-z0-9]+$/i, '').slice(0, 32) || img.name;
      });
    },
    { label: 'Replace image' },
  );
}

function setAsPageBackground(el: ImageElement) {
  const page = getActivePage();
  if (!page) return;
  const base = page.background.type === 'gradient' ? page.background.from : page.background.color;
  docStore.change(
    (d) => {
      updatePage(d, page.id, {
        background: { type: 'image', assetId: el.assetId, fit: 'cover', color: base },
      });
      deleteElements(d, page.id, [el.id]);
    },
    { label: 'Set page background' },
  );
  useUiStore.getState().clearSelection();
}

export function ImagePanel({ elements }: { elements: ImageElement[] }) {
  const project = useProject();
  const el = elements[0]!;
  const asset = project.assets[el.assetId];
  const key = elements.map((e) => e.id).join(',');
  const fileRef = useRef<HTMLInputElement>(null);
  const [cropOpen, setCropOpen] = useState(false);
  const single = elements.length === 1;
  const thumb = assetUrls.resolve(el.assetId, 'thumb');
  const setImage = (recipe: (i: ImageElement) => void, label: string, coalesceKey?: string) =>
    updateSelected((d) => d.type === 'image' && recipe(d as ImageElement), { label, coalesceKey });
  const maxRadius = Math.round(Math.min(el.width, el.height) / 2);

  return (
    <>
      <Section title="Image">
        {single && (
          <div className="grid grid-cols-3 gap-1.5">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCropOpen(true)}
              disabled={!asset || el.locked}
            >
              <Crop /> Crop
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => fileRef.current?.click()}
              disabled={el.locked}
            >
              <Replace /> Replace
            </Button>
            <Button
              variant="outline"
              size="sm"
              title="Reset crop, adjustments, flip and corners"
              onClick={() =>
                setImage((i) => {
                  i.crop = { ...FULL_CROP };
                  i.filters = { ...DEFAULT_FILTERS };
                  i.flipX = false;
                  i.flipY = false;
                  i.borderRadius = 0;
                }, 'Reset image')
              }
            >
              <RotateCcw /> Reset
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              hidden
              data-testid="replace-image-input"
              onChange={(e) => {
                const [file] = imageFilesFrom(e.target.files);
                e.target.value = '';
                if (file) void replaceImage(el, file);
              }}
            />
          </div>
        )}
        <div className="flex items-center gap-1">
          <Toggle
            size="sm"
            variant="outline"
            pressed={el.flipX}
            aria-label="Flip horizontally"
            onPressedChange={(v) => setImage((i) => void (i.flipX = v), 'Flip')}
          >
            <FlipHorizontal2 /> Flip H
          </Toggle>
          <Toggle
            size="sm"
            variant="outline"
            pressed={el.flipY}
            aria-label="Flip vertically"
            onPressedChange={(v) => setImage((i) => void (i.flipY = v), 'Flip')}
          >
            <FlipVertical2 /> Flip V
          </Toggle>
        </div>
        <SliderField
          label="Corner radius"
          value={Math.min(el.borderRadius, maxRadius)}
          min={0}
          max={maxRadius}
          format={(v) => `${v}px`}
          gestureLabel="Corner radius"
          onChange={(r) =>
            setImage((i) => void (i.borderRadius = r), 'Corner radius', `radius:${key}`)
          }
        />
        {single && (
          <Button
            variant="ghost"
            size="sm"
            className="justify-start"
            onClick={() => setAsPageBackground(el)}
          >
            <ImageUp /> Use as page background
          </Button>
        )}
      </Section>

      <Section title="Filters">
        <div className="grid grid-cols-4 gap-1.5" role="radiogroup" aria-label="Filter presets">
          {FILTER_PRESETS.map((preset) => {
            const active = sameFilters(el.filters, preset.filters);
            return (
              <button
                key={preset.id}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() =>
                  setImage((i) => void (i.filters = { ...preset.filters }), 'Apply filter')
                }
                className={cn(
                  'grid gap-1 rounded-md p-1 text-[11px] focus-visible:ring-2 focus-visible:ring-ring',
                  active
                    ? 'bg-accent text-accent-foreground ring-2 ring-primary'
                    : 'hover:bg-muted',
                )}
              >
                <span className="block aspect-square overflow-hidden rounded bg-muted">
                  {thumb && (
                    <img
                      src={thumb}
                      alt=""
                      className="size-full object-cover"
                      style={{ filter: filterCss(preset.filters) }}
                    />
                  )}
                </span>
                {preset.label}
              </button>
            );
          })}
        </div>
      </Section>

      <Section title="Adjust">
        {ADJUSTMENTS.map((adj) => (
          <SliderField
            key={adj.key}
            label={adj.label}
            value={el.filters[adj.key]}
            min={adj.min}
            max={adj.max}
            step={adj.step}
            format={adj.format}
            gestureLabel={adj.label}
            onChange={(v) =>
              setImage((i) => void (i.filters[adj.key] = v), adj.label, `filter:${adj.key}:${key}`)
            }
          />
        ))}
      </Section>

      <Section title="Accessibility">
        <Field label="Alt text (read by screen readers)">
          <textarea
            key={el.id}
            defaultValue={el.alt ?? ''}
            maxLength={500}
            rows={2}
            placeholder="Describe the image, or leave empty if decorative"
            onBlur={(e) => {
              const alt = e.target.value.trim();
              if (alt !== (el.alt ?? ''))
                setImage((i) => void (i.alt = alt || undefined), 'Alt text');
            }}
            className="w-full resize-none rounded-md border bg-background px-2 py-1.5 text-sm shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </Field>
      </Section>

      {single && asset && (
        <CropDialog element={el} asset={asset} open={cropOpen} onOpenChange={setCropOpen} />
      )}
    </>
  );
}

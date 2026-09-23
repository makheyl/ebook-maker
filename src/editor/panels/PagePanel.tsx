import { ImagePlus } from 'lucide-react';
import { useRef } from 'react';
import { toast } from 'sonner';
import { addAsset, updatePage } from '@/core/ops';
import type { PageBackground } from '@/core/schema';
import { Button } from '@/ui/button';
import { ToggleGroup, ToggleGroupItem } from '@/ui/toggle-group';
import { assetUrls } from '../assets/asset-urls';
import { imageFilesFrom, importImageFiles } from '../assets/upload';
import { docStore } from '../store/doc-store';
import { useActivePage } from '../store/selectors';
import { ColorField, Field, NumberField, Section } from './controls';

function setBackground(pageId: string, background: PageBackground, coalesceKey?: string) {
  docStore.change((d) => updatePage(d, pageId, { background }), {
    label: 'Page background',
    coalesceKey,
  });
}

async function uploadBackground(pageId: string, file: File, color: string) {
  const { assets, errors } = await importImageFiles([file]);
  errors.forEach((e) => toast.error(`${e.name}: ${e.message}`));
  const asset = assets[0];
  if (!asset) return;
  docStore.change(
    (d) => {
      addAsset(d, asset);
      updatePage(d, pageId, { background: { type: 'image', assetId: asset.id, fit: 'cover', color } });
    },
    { label: 'Page background image' },
  );
}

/** Shown when nothing is selected: page-level settings. */
export function PagePanel({ extra }: { extra?: React.ReactNode }) {
  const page = useActivePage();
  const bg = page.background;
  const key = `bg-${page.id}`;
  const baseColor = bg.type === 'gradient' ? bg.from : bg.color;
  const fileRef = useRef<HTMLInputElement>(null);

  return (
    <div>
      <Section title="Page background">
        <Field label="Fill">
          <ToggleGroup
            type="single"
            variant="outline"
            size="sm"
            value={bg.type}
            onValueChange={(v) => {
              if (v === 'color') setBackground(page.id, { type: 'color', color: baseColor });
              if (v === 'gradient')
                setBackground(page.id, { type: 'gradient', from: baseColor, to: '#c9bfff', angle: 180 });
              if (v === 'image') fileRef.current?.click();
            }}
            className="w-full"
          >
            <ToggleGroupItem value="color" className="flex-1">
              Solid
            </ToggleGroupItem>
            <ToggleGroupItem value="gradient" className="flex-1">
              Gradient
            </ToggleGroupItem>
            <ToggleGroupItem value="image" className="flex-1">
              Image
            </ToggleGroupItem>
          </ToggleGroup>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            hidden
            data-testid="background-image-input"
            onChange={(e) => {
              const [file] = imageFilesFrom(e.target.files);
              e.target.value = '';
              if (file) void uploadBackground(page.id, file, baseColor);
            }}
          />
        </Field>
        {bg.type === 'color' && (
          <ColorField
            label="Color"
            value={bg.color}
            onChange={(color) => color && setBackground(page.id, { ...bg, color }, key)}
          />
        )}
        {bg.type === 'gradient' && (
          <>
            <ColorField
              label="From"
              value={bg.from}
              onChange={(c) => c && setBackground(page.id, { ...bg, from: c }, key)}
            />
            <ColorField
              label="To"
              value={bg.to}
              onChange={(c) => c && setBackground(page.id, { ...bg, to: c }, key)}
            />
            <NumberField
              label="Angle"
              value={bg.angle}
              suffix="°"
              min={-360}
              max={360}
              onCommit={(angle) => setBackground(page.id, { ...bg, angle })}
            />
          </>
        )}
        {bg.type === 'image' && (
          <>
            <div className="flex items-center gap-2">
              <img
                src={assetUrls.resolve(bg.assetId, 'thumb')}
                alt=""
                className="size-12 rounded-md border object-cover"
              />
              <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
                <ImagePlus /> Change image
              </Button>
            </div>
            <Field label="Fit">
              <ToggleGroup
                type="single"
                variant="outline"
                size="sm"
                value={bg.fit}
                onValueChange={(fit) => fit && setBackground(page.id, { ...bg, fit: fit as 'cover' | 'contain' })}
                className="w-full"
              >
                <ToggleGroupItem value="cover" className="flex-1">
                  Fill page
                </ToggleGroupItem>
                <ToggleGroupItem value="contain" className="flex-1">
                  Fit inside
                </ToggleGroupItem>
              </ToggleGroup>
            </Field>
            <ColorField
              label="Color behind image"
              value={bg.color}
              onChange={(color) => color && setBackground(page.id, { ...bg, color }, key)}
            />
          </>
        )}
      </Section>
      {extra}
    </div>
  );
}

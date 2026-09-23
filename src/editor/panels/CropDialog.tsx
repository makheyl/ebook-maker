import { useState } from 'react';
import Cropper, { type Area } from 'react-easy-crop';
import { updateElement } from '@/core/ops';
import { cropAspect } from '@/core/render';
import { FULL_CROP, type AssetRef, type ImageElement, type NormalizedRect } from '@/core/schema';
import { Button } from '@/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/ui/dialog';
import { Slider } from '@/ui/slider';
import { ToggleGroup, ToggleGroupItem } from '@/ui/toggle-group';
import { assetUrls } from '../assets/asset-urls';
import { docStore } from '../store/doc-store';
import { getActivePage } from '../store/selectors';

type AspectOption = {
  id: string;
  label: string;
  value: (asset: AssetRef, el: ImageElement) => number;
};

const ASPECTS: AspectOption[] = [
  { id: 'current', label: 'Current', value: (_, el) => el.width / el.height },
  { id: 'original', label: 'Original', value: (a) => a.width / a.height },
  { id: '1:1', label: '1:1', value: () => 1 },
  { id: '4:3', label: '4:3', value: () => 4 / 3 },
  { id: '3:4', label: '3:4', value: () => 3 / 4 },
  { id: '16:9', label: '16:9', value: () => 16 / 9 },
  { id: '9:16', label: '9:16', value: () => 9 / 16 },
];

function toNormalized(area: Area): NormalizedRect {
  const clamp = (v: number) => Math.min(1, Math.max(0, v));
  const x = clamp(area.x / 100);
  const y = clamp(area.y / 100);
  return {
    x,
    y,
    width: Math.max(0.001, Math.min(1 - x, area.width / 100)),
    height: Math.max(0.001, Math.min(1 - y, area.height / 100)),
  };
}

/**
 * Non-destructive crop: only the normalized crop rect is stored; the original image stays
 * intact. After cropping, the element box takes the crop's aspect ratio (keeping its area
 * and center) so nothing is unexpectedly cut off.
 */
export function CropDialog({
  element,
  asset,
  open,
  onOpenChange,
}: {
  element: ImageElement;
  asset: AssetRef;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl">
        <CropBody element={element} asset={asset} onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

function CropBody({
  element,
  asset,
  onDone,
}: {
  element: ImageElement;
  asset: AssetRef;
  onDone: () => void;
}) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [aspectId, setAspectId] = useState('current');
  const [area, setArea] = useState<NormalizedRect>(element.crop);
  const aspect = ASPECTS.find((a) => a.id === aspectId)!.value(asset, element);
  const src = assetUrls.resolve(asset.id, 'full');

  const apply = () => {
    const page = getActivePage();
    if (!page) return;
    const ratio = cropAspect(asset, area);
    const areaPx = element.width * element.height;
    const width = Math.sqrt(areaPx * ratio);
    const height = width / ratio;
    const cx = element.x + element.width / 2;
    const cy = element.y + element.height / 2;
    docStore.change(
      (d) =>
        updateElement(d, page.id, element.id, (el) => {
          if (el.type !== 'image') return;
          el.crop = area;
          el.width = Math.round(width);
          el.height = Math.round(height);
          el.x = Math.round(cx - width / 2);
          el.y = Math.round(cy - height / 2);
        }),
      { label: 'Crop image' },
    );
    onDone();
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>Crop image</DialogTitle>
        <DialogDescription>
          Drag to reposition, scroll or use the slider to zoom. The original is kept.
        </DialogDescription>
      </DialogHeader>
      <div className="relative h-[min(60vh,480px)] overflow-hidden rounded-lg bg-neutral-900">
        {src && (
          <Cropper
            key={aspectId}
            image={src}
            crop={crop}
            zoom={zoom}
            aspect={aspect}
            maxZoom={8}
            showGrid
            initialCroppedAreaPercentages={
              aspectId === 'current'
                ? {
                    x: element.crop.x * 100,
                    y: element.crop.y * 100,
                    width: element.crop.width * 100,
                    height: element.crop.height * 100,
                  }
                : undefined
            }
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={(a) => setArea(toNormalized(a))}
          />
        )}
      </div>
      <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-center">
        <ToggleGroup
          type="single"
          size="sm"
          variant="outline"
          value={aspectId}
          onValueChange={(v) => v && setAspectId(v)}
          aria-label="Aspect ratio"
          className="flex-wrap"
        >
          {ASPECTS.map((a) => (
            <ToggleGroupItem key={a.id} value={a.id} className="px-2 text-xs">
              {a.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          Zoom
          <Slider
            aria-label="Zoom"
            className="w-36"
            min={1}
            max={8}
            step={0.01}
            value={[zoom]}
            onValueChange={([z]) => setZoom(z!)}
          />
        </div>
      </div>
      <DialogFooter>
        <Button
          variant="ghost"
          onClick={() => {
            setAspectId('original');
            setArea(FULL_CROP);
            setZoom(1);
            setCrop({ x: 0, y: 0 });
          }}
        >
          Reset crop
        </Button>
        <Button onClick={apply}>Apply</Button>
      </DialogFooter>
    </>
  );
}

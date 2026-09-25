import { useMemo } from 'react';
import { FONT_CATALOG, fontStack } from '@/core/fonts/catalog';
import type { AssetRef, PageSize } from '@/core/schema';
import { generatePages, LAYOUT_TEMPLATES, PALETTES } from '@/core/templates';
import { PageThumbnail } from '@/editor/stage/PageThumbnail';
import { Label } from '@/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/ui/select';
import { Switch } from '@/ui/switch';
import { cn } from '@/ui/utils';
import type { WizardRow } from '../pairing';

export type LayoutChoice = {
  templateId: string;
  paletteId: string;
  fontId: string;
  animate: boolean;
};

/** Step 3: pick a layout (live previews of the first page), colors, font and animations. */
export function LayoutStep({
  rows,
  pageSize,
  choice,
  onChange,
}: {
  rows: WizardRow[];
  pageSize: PageSize;
  choice: LayoutChoice;
  onChange: (choice: LayoutChoice) => void;
}) {
  const sample = rows.find((r) => r.image) ?? rows[0];
  const palette = PALETTES.find((p) => p.id === choice.paletteId) ?? PALETTES[0]!;
  const assets = useMemo(() => {
    const map: Record<string, AssetRef> = {};
    if (sample?.image) map[sample.image.asset.id] = sample.image.asset;
    return map;
  }, [sample]);

  const previews = useMemo(
    () =>
      LAYOUT_TEMPLATES.map((template) => ({
        template,
        page: generatePages(
          [{ text: sample?.text || 'Your text here', asset: sample?.image?.asset }],
          {
            templateId: template.id,
            pageSize,
            palette,
            fontId: choice.fontId,
            animate: false,
          },
        )[0]!,
      })),
    [sample, pageSize, palette, choice.fontId],
  );

  return (
    <div className="grid gap-6">
      <div role="radiogroup" aria-label="Layout" className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {previews.map(({ template, page }) => {
          const selected = template.id === choice.templateId;
          return (
            <button
              key={template.id}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={template.label}
              onClick={() => onChange({ ...choice, templateId: template.id })}
              className={cn(
                'group flex flex-col gap-2 rounded-xl border bg-white/55 shadow-[inset_0_1px_0_var(--glass-highlight)] dark:bg-white/5 p-2 text-left transition-shadow focus-visible:ring-2 focus-visible:ring-ring',
                selected ? 'border-primary ring-2 ring-primary/40' : 'hover:shadow-md',
              )}
            >
              <PageThumbnail
                page={page}
                pageSize={pageSize}
                assets={assets}
                width={220}
                className="w-full overflow-hidden rounded-lg border"
              />
              <span className="px-1">
                <span className="block text-sm font-medium">{template.label}</span>
                <span className="block text-xs text-muted-foreground">{template.description}</span>
              </span>
            </button>
          );
        })}
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="grid gap-2">
          <Label>Colors</Label>
          <div role="radiogroup" aria-label="Colors" className="flex gap-2">
            {PALETTES.map((p) => (
              <button
                key={p.id}
                type="button"
                role="radio"
                aria-checked={p.id === choice.paletteId}
                aria-label={p.label}
                title={p.label}
                onClick={() => onChange({ ...choice, paletteId: p.id })}
                className={cn(
                  'grid size-10 place-items-center rounded-lg border text-sm font-semibold focus-visible:ring-2 focus-visible:ring-ring',
                  p.id === choice.paletteId && 'ring-2 ring-primary',
                )}
                style={{ background: p.background, color: p.text }}
              >
                Aa
              </button>
            ))}
          </div>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="wizard-font">Font</Label>
          <Select value={choice.fontId} onValueChange={(fontId) => onChange({ ...choice, fontId })}>
            <SelectTrigger id="wizard-font" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FONT_CATALOG.map((f) => (
                <SelectItem key={f.id} value={f.id} style={{ fontFamily: fontStack(f.id) }}>
                  {f.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <label className="flex items-center justify-between gap-3 self-end rounded-lg border p-3 text-sm">
          <span>
            Add animations
            <span className="block text-xs text-muted-foreground">
              Gentle entrances on every page
            </span>
          </span>
          <Switch
            checked={choice.animate}
            onCheckedChange={(animate) => onChange({ ...choice, animate })}
            aria-label="Add animations"
          />
        </label>
      </div>
    </div>
  );
}

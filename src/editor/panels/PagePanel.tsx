import { updatePage } from '@/core/ops';
import type { PageBackground } from '@/core/schema';
import { ToggleGroup, ToggleGroupItem } from '@/ui/toggle-group';
import { docStore } from '../store/doc-store';
import { useActivePage } from '../store/selectors';
import { ColorField, Field, NumberField, Section } from './controls';

function setBackground(pageId: string, background: PageBackground, coalesceKey?: string) {
  docStore.change((d) => updatePage(d, pageId, { background }), {
    label: 'Page background',
    coalesceKey,
  });
}

/** Shown when nothing is selected: page-level settings. */
export function PagePanel({ extra }: { extra?: React.ReactNode }) {
  const page = useActivePage();
  const bg = page.background;
  const key = `bg-${page.id}`;
  const baseColor = bg.type === 'gradient' ? bg.from : bg.color;

  return (
    <div>
      <Section title="Page background">
        <Field label="Fill">
          <ToggleGroup
            type="single"
            variant="outline"
            size="sm"
            value={bg.type === 'image' ? 'color' : bg.type}
            onValueChange={(v) => {
              if (v === 'color') setBackground(page.id, { type: 'color', color: baseColor });
              if (v === 'gradient')
                setBackground(page.id, {
                  type: 'gradient',
                  from: baseColor,
                  to: '#c9bfff',
                  angle: 180,
                });
            }}
            className="w-full"
          >
            <ToggleGroupItem value="color" className="flex-1">
              Solid
            </ToggleGroupItem>
            <ToggleGroupItem value="gradient" className="flex-1">
              Gradient
            </ToggleGroupItem>
          </ToggleGroup>
        </Field>
        {bg.type !== 'gradient' && (
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
      </Section>
      {extra}
    </div>
  );
}

import { FlipHorizontal2, FlipVertical2 } from 'lucide-react';
import type { ImageElement } from '@/core/schema';
import { Toggle } from '@/ui/toggle';
import { updateSelected } from '../actions';
import { Field, Section, SliderField } from './controls';

export function ImagePanel({ elements }: { elements: ImageElement[] }) {
  const el = elements[0]!;
  const key = elements.map((e) => e.id).join(',');
  const setImage = (recipe: (i: ImageElement) => void, label: string, coalesceKey?: string) =>
    updateSelected((d) => d.type === 'image' && recipe(d as ImageElement), { label, coalesceKey });
  const maxRadius = Math.round(Math.min(el.width, el.height) / 2);

  return (
    <Section title="Image">
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
        onChange={(r) => setImage((i) => void (i.borderRadius = r), 'Corner radius', `radius:${key}`)}
      />
      <Field label="Alt text (for screen readers)">
        <textarea
          key={el.id}
          defaultValue={el.alt ?? ''}
          maxLength={500}
          rows={2}
          placeholder="Describe the image, or leave empty if decorative"
          onBlur={(e) => {
            const alt = e.target.value.trim();
            if (alt !== (el.alt ?? '')) setImage((i) => void (i.alt = alt || undefined), 'Alt text');
          }}
          className="w-full resize-none rounded-md border bg-background px-2 py-1.5 text-sm shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </Field>
    </Section>
  );
}

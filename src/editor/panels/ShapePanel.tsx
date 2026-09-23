import type { ShapeElement } from '@/core/schema';
import { updateSelected } from '../actions';
import { ColorField, NumberField, Section } from './controls';

export function ShapePanel({ elements }: { elements: ShapeElement[] }) {
  const el = elements[0]!;
  const key = elements.map((e) => e.id).join(',');
  const isLine = elements.every((e) => e.shape === 'line');
  const setShape = (recipe: (s: ShapeElement) => void, coalesceKey?: string) =>
    updateSelected((d) => d.type === 'shape' && recipe(d as ShapeElement), {
      label: 'Shape style',
      coalesceKey,
    });

  return (
    <Section title={isLine ? 'Line' : 'Shape'}>
      {!isLine && (
        <ColorField
          label="Fill"
          allowNone
          value={el.fill === 'transparent' ? undefined : el.fill}
          onChange={(c) => setShape((s) => void (s.fill = c ?? 'transparent'), `fill:${key}`)}
        />
      )}
      <ColorField
        label={isLine ? 'Color' : 'Border'}
        allowNone={!isLine}
        value={el.stroke}
        onChange={(c) =>
          setShape((s) => {
            s.stroke = c;
            if (c && s.strokeWidth === 0) s.strokeWidth = 4;
          }, `stroke:${key}`)
        }
      />
      <div className="grid grid-cols-2 gap-2">
        <NumberField
          label={isLine ? 'Thickness' : 'Border width'}
          value={el.strokeWidth}
          min={0}
          max={200}
          onCommit={(w) => setShape((s) => void (s.strokeWidth = w))}
        />
        {elements.every((e) => e.shape === 'rect') && (
          <NumberField
            label="Corner radius"
            value={el.cornerRadius}
            min={0}
            onCommit={(r) => setShape((s) => void (s.cornerRadius = r))}
          />
        )}
      </div>
    </Section>
  );
}

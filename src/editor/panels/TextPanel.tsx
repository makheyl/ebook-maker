import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  AlignVerticalJustifyCenter,
  AlignVerticalJustifyEnd,
  AlignVerticalJustifyStart,
  Bold,
  Italic,
} from 'lucide-react';
import { FONT_CATALOG, fontStack, getFont } from '@/core/fonts/catalog';
import type { TextElement, TextLike } from '@/core/schema';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/ui/select';
import { Switch } from '@/ui/switch';
import { Toggle } from '@/ui/toggle';
import { ToggleGroup, ToggleGroupItem } from '@/ui/toggle-group';
import { autofitOf, type Autofit } from '@/core/text/autofit';
import { getPreset } from '@/core/animation';
import { updateTextStyle } from '../actions';
import { MOD } from '../keys';
import { useActivePage } from '../store/selectors';
import { setAutofit } from '../text/actions';
import { ColorField, Field, NumberField, Section, SliderField } from './controls';

const WEIGHTS = [
  [100, 'Thin'],
  [200, 'Extra light'],
  [300, 'Light'],
  [400, 'Regular'],
  [500, 'Medium'],
  [600, 'Semibold'],
  [700, 'Bold'],
  [800, 'Extra bold'],
  [900, 'Black'],
] as const;

const SHIFT = MOD === '⌘' ? '⇧' : 'Shift+';

/** Hyphenation for justified text, and a hint when a narrow box would look gappy. */
function JustifyOptions({ elements }: { elements: TextLike[] }) {
  const s = elements[0]!.style;
  const typesIn = useActivePage().animations.some(
    (a) => getPreset(a.preset)?.splitText && elements.some((e) => e.id === a.elementId),
  );
  // Roughly: fewer than ~12 characters per line leaves wide gaps between words.
  const narrow = elements.some((e) => e.width - e.style.padding * 2 < e.style.fontSize * 6.5);
  return (
    <>
      <label className="flex items-center justify-between text-xs text-muted-foreground">
        Hyphenate
        <Switch
          checked={s.hyphenate ?? true}
          disabled={typesIn}
          onCheckedChange={(hyphenate) => updateTextStyle({ hyphenate })}
          aria-label="Hyphenate"
        />
      </label>
      {typesIn && (
        <p className="text-[11px] text-muted-foreground">
          Hyphenation is off for text that types in (it would wrap differently while typing).
        </p>
      )}
      {narrow && (
        <p className="text-[11px] text-amber-700 dark:text-amber-400">
          Justified text looks gappy in narrow boxes — try Left, widen the box, or turn on
          Hyphenate.
        </p>
      )}
    </>
  );
}

const DEFAULT_SHADOW = { x: 0, y: 4, blur: 12, color: 'rgba(0, 0, 0, 0.35)' };

export function TextPanel({ elements }: { elements: TextLike[] }) {
  const s = elements[0]!.style;
  const font = getFont(s.fontFamily);
  const key = elements.map((e) => e.id).join(',');
  const weights = WEIGHTS.filter(([w]) => w >= font.weight[0] && w <= font.weight[1]);

  return (
    <Section title="Text">
      <Field label="Font">
        <Select value={font.id} onValueChange={(fontFamily) => updateTextStyle({ fontFamily })}>
          <SelectTrigger className="h-8 w-full" aria-label="Font">
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
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <NumberField
          label="Size"
          value={s.fontSize}
          min={4}
          max={1000}
          precision={1}
          onCommit={(fontSize) => updateTextStyle({ fontSize })}
        />
        <Field label="Weight">
          <Select
            value={String(s.fontWeight)}
            onValueChange={(v) => updateTextStyle({ fontWeight: Number(v) })}
          >
            <SelectTrigger className="h-8 w-full" aria-label="Weight">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {weights.map(([w, label]) => (
                <SelectItem key={w} value={String(w)}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </div>
      <div className="flex items-center gap-1">
        <Toggle
          size="sm"
          variant="outline"
          aria-label="Bold"
          pressed={s.fontWeight >= 600}
          onPressedChange={(on) =>
            updateTextStyle({ fontWeight: on ? Math.min(700, font.weight[1]) : 400 })
          }
        >
          <Bold />
        </Toggle>
        <Toggle
          size="sm"
          variant="outline"
          aria-label="Italic"
          pressed={s.italic}
          disabled={!font.hasItalic && !s.italic}
          onPressedChange={(italic) => updateTextStyle({ italic })}
        >
          <Italic />
        </Toggle>
        <div className="mx-1 h-5 w-px bg-border" />
        <ToggleGroup
          type="single"
          size="sm"
          variant="outline"
          value={s.align}
          onValueChange={(v) => v && updateTextStyle({ align: v as TextElement['style']['align'] })}
          aria-label="Text alignment"
        >
          <ToggleGroupItem value="left" aria-label="Align text left">
            <AlignLeft />
          </ToggleGroupItem>
          <ToggleGroupItem value="center" aria-label="Center text">
            <AlignCenter />
          </ToggleGroupItem>
          <ToggleGroupItem value="right" aria-label="Align text right">
            <AlignRight />
          </ToggleGroupItem>
          <ToggleGroupItem
            value="justify"
            aria-label="Justify text"
            title={`Justify (${MOD}${SHIFT}J)`}
          >
            <AlignJustify />
          </ToggleGroupItem>
        </ToggleGroup>
      </div>
      {s.align === 'justify' && <JustifyOptions elements={elements} />}
      <Field label="Vertical position">
        <ToggleGroup
          type="single"
          size="sm"
          variant="outline"
          value={s.verticalAlign}
          onValueChange={(v) =>
            v && updateTextStyle({ verticalAlign: v as TextElement['style']['verticalAlign'] })
          }
          className="w-full"
        >
          <ToggleGroupItem value="top" aria-label="Top" className="flex-1">
            <AlignVerticalJustifyStart />
          </ToggleGroupItem>
          <ToggleGroupItem value="middle" aria-label="Middle" className="flex-1">
            <AlignVerticalJustifyCenter />
          </ToggleGroupItem>
          <ToggleGroupItem value="bottom" aria-label="Bottom" className="flex-1">
            <AlignVerticalJustifyEnd />
          </ToggleGroupItem>
        </ToggleGroup>
      </Field>
      <Field label="When the text is long">
        <ToggleGroup
          type="single"
          size="sm"
          variant="outline"
          value={autofitOf(s)}
          onValueChange={(v) => v && setAutofit(v as Autofit)}
          className="w-full"
          aria-label="When the text is long"
        >
          <ToggleGroupItem
            value="grow"
            className="flex-1"
            title="The box grows with the text (up to the page bottom)"
          >
            Grow box
          </ToggleGroupItem>
          <ToggleGroupItem
            value="shrink"
            className="flex-1"
            title="The box keeps its size; the text gets smaller to fit"
          >
            Shrink text
          </ToggleGroupItem>
          <ToggleGroupItem
            value="none"
            className="flex-1"
            title="Nothing changes; text that doesn't fit is flagged"
          >
            Fixed
          </ToggleGroupItem>
        </ToggleGroup>
        {autofitOf(s) === 'shrink' && s.fitScale !== undefined && (
          <p className="text-[11px] text-muted-foreground">
            Shown at {Math.round(s.fontSize * s.fitScale)} px to fit the box.
          </p>
        )}
      </Field>
      <ColorField
        label="Color"
        value={s.color}
        onChange={(color) => color && updateTextStyle({ color }, { coalesceKey: `color:${key}` })}
      />
      <SliderField
        label="Line height"
        value={s.lineHeight}
        min={0.8}
        max={3}
        step={0.05}
        format={(v) => v.toFixed(2)}
        gestureLabel="Line height"
        onChange={(lineHeight) => updateTextStyle({ lineHeight }, { coalesceKey: `lh:${key}` })}
      />
      <SliderField
        label="Letter spacing"
        value={s.letterSpacing}
        min={-10}
        max={50}
        step={0.5}
        format={(v) => `${v}px`}
        gestureLabel="Letter spacing"
        onChange={(letterSpacing) =>
          updateTextStyle({ letterSpacing }, { coalesceKey: `ls:${key}` })
        }
      />
      <ColorField
        label="Highlight"
        allowNone
        value={s.background}
        onChange={(background) => updateTextStyle({ background }, { coalesceKey: `bg:${key}` })}
      />
      {s.background && (
        <NumberField
          label="Padding"
          value={s.padding}
          min={0}
          max={500}
          onCommit={(padding) => updateTextStyle({ padding })}
        />
      )}
      <label className="flex items-center justify-between text-xs text-muted-foreground">
        Shadow
        <Switch
          checked={!!s.shadow}
          onCheckedChange={(on) => updateTextStyle({ shadow: on ? DEFAULT_SHADOW : undefined })}
        />
      </label>
    </Section>
  );
}

import { FONT_CATALOG, fontStack, getFont } from '@/core/fonts/catalog';
import { BUTTON_ICON_PATHS } from '@/core/render/icons';
import { BUTTON_ICONS, type ButtonElement, type ButtonIcon } from '@/core/schema';
import { Input } from '@/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/ui/select';
import { Switch } from '@/ui/switch';
import { ToggleGroup, ToggleGroupItem } from '@/ui/toggle-group';
import { updateSelected } from '../actions';
import { ColorField, Field, NumberField, Section } from './controls';

const ICON_LABELS: Record<ButtonIcon, string> = {
  arrowRight: 'Arrow right',
  arrowLeft: 'Arrow left',
  home: 'Home',
  restart: 'Start over',
  star: 'Star',
  heart: 'Heart',
  question: 'Question',
  check: 'Check',
  play: 'Play',
  soundOn: 'Sound on',
  soundOff: 'Sound off',
  paw: 'Paw',
};

const NO_ICON = 'none';

export function IconGlyph({ icon, className }: { icon: ButtonIcon; className?: string }) {
  const { d, filled } = BUTTON_ICON_PATHS[icon];
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={className ?? 'size-4'}
      fill={filled ? 'currentColor' : 'none'}
      stroke={filled ? 'none' : 'currentColor'}
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={d} />
    </svg>
  );
}

/** Look of story buttons (what they do lives in the Interact tab). */
export function ButtonPanel({ elements }: { elements: ButtonElement[] }) {
  const el = elements[0]!;
  const s = el.style;
  const key = elements.map((e) => e.id).join(',');
  const font = getFont(s.fontFamily);
  const set = (recipe: (b: ButtonElement) => void, label = 'Button style', coalesceKey?: string) =>
    updateSelected((d) => d.type === 'button' && recipe(d as ButtonElement), {
      label,
      coalesceKey,
    });

  return (
    <Section title="Button">
      {elements.length === 1 && (
        <Field label="Label" htmlFor={`label-${el.id}`}>
          <Input
            id={`label-${el.id}`}
            key={el.id}
            defaultValue={el.label}
            maxLength={60}
            className="h-8"
            onChange={(e) => {
              const label = e.target.value;
              set((b) => void (b.label = label), 'Button label', `label:${el.id}`);
            }}
          />
        </Field>
      )}
      <div className="grid grid-cols-[1fr_auto] items-end gap-2">
        <Field label="Icon">
          <Select
            value={el.icon ?? NO_ICON}
            onValueChange={(v) =>
              set((b) => {
                if (v === NO_ICON) {
                  delete b.icon;
                  if (b.iconPosition === 'only') b.iconPosition = 'end';
                } else b.icon = v as ButtonIcon;
              })
            }
          >
            <SelectTrigger className="h-8 w-full" aria-label="Icon">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_ICON}>No icon</SelectItem>
              {BUTTON_ICONS.map((icon) => (
                <SelectItem key={icon} value={icon}>
                  <IconGlyph icon={icon} /> {ICON_LABELS[icon]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <ToggleGroup
          type="single"
          size="sm"
          variant="outline"
          disabled={!el.icon}
          value={el.iconPosition}
          onValueChange={(v) =>
            v && set((b) => void (b.iconPosition = v as ButtonElement['iconPosition']))
          }
          aria-label="Icon position"
        >
          <ToggleGroupItem value="start" aria-label="Icon before the label">
            Before
          </ToggleGroupItem>
          <ToggleGroupItem value="end" aria-label="Icon after the label">
            After
          </ToggleGroupItem>
          <ToggleGroupItem value="only" aria-label="Icon only">
            Only
          </ToggleGroupItem>
        </ToggleGroup>
      </div>
      <Field label="Font">
        <Select
          value={font.id}
          onValueChange={(fontFamily) => set((b) => void (b.style.fontFamily = fontFamily))}
        >
          <SelectTrigger className="h-8 w-full" aria-label="Button font">
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
          label="Text size"
          value={s.fontSize}
          min={4}
          max={400}
          onCommit={(fontSize) => set((b) => void (b.style.fontSize = fontSize))}
        />
        <NumberField
          label="Roundness"
          value={s.radius}
          min={0}
          max={1000}
          onCommit={(radius) => set((b) => void (b.style.radius = radius))}
        />
      </div>
      <ColorField
        label="Fill"
        value={s.fill === 'transparent' ? undefined : s.fill}
        allowNone
        onChange={(c) =>
          set((b) => void (b.style.fill = c ?? 'transparent'), 'Button style', `fill:${key}`)
        }
      />
      <ColorField
        label="Text"
        value={s.textColor}
        onChange={(c) =>
          c && set((b) => void (b.style.textColor = c), 'Button style', `text:${key}`)
        }
      />
      <ColorField
        label="Border"
        allowNone
        value={s.borderColor}
        onChange={(c) =>
          set(
            (b) => {
              if (c) {
                b.style.borderColor = c;
                if (!b.style.borderWidth) b.style.borderWidth = 4;
              } else delete b.style.borderColor;
            },
            'Button style',
            `border:${key}`,
          )
        }
      />
      <label className="flex items-center justify-between text-sm">
        Drop shadow
        <Switch
          checked={s.shadow}
          onCheckedChange={(shadow) => set((b) => void (b.style.shadow = shadow))}
          aria-label="Drop shadow"
        />
      </label>
    </Section>
  );
}

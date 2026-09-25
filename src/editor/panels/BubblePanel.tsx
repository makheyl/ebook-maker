import { BUBBLE_LOOKS, BUBBLE_SHAPES, type BubbleElement, type BubbleShape } from '@/core/schema';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/ui/select';
import { Switch } from '@/ui/switch';
import { ToggleGroup, ToggleGroupItem } from '@/ui/toggle-group';
import { updateSelected } from '../actions';
import { bubbleTapStep } from '@/core/ops';
import {
  attachBubbleTo,
  setBubbleShape,
  setFreeTail,
  setShowOnTap,
  tailTargets,
} from '../bubbles/actions';
import { useActivePage, useProject } from '../store/selectors';
import { BubbleShapeIcon } from '../bubbles/BubbleShapeIcon';
import { VoiceSlots } from '../audio/VoiceSlots';
import { ColorField, Field, NumberField, Section } from './controls';

const FREE = '__free__';
const NONE = '__none__';

/** Balloon look, where the tail points, and who's speaking (for screen readers). */
export function BubblePanel({ elements }: { elements: BubbleElement[] }) {
  const project = useProject();
  const page = useActivePage();
  const el = elements[0]!;
  const key = elements.map((e) => e.id).join(',');
  const single = elements.length === 1 ? el : null;
  const shape = elements.every((e) => e.bubble.shape === el.bubble.shape) ? el.bubble.shape : '';
  const set = (label: string, recipe: (b: BubbleElement) => void, coalesceKey?: string) =>
    updateSelected((d) => d.type === 'bubble' && recipe(d as BubbleElement), {
      label,
      coalesceKey,
    });
  const characters = Object.values(project.characters);
  const targets = single ? tailTargets(page.elements, single.id) : [];
  const nameOf = (id: string) => {
    const t = targets.find((e) => e.id === id);
    if (!t) return 'Something on the page';
    const character =
      t.type === 'image' && t.characterId ? project.characters[t.characterId] : null;
    return character ? `${character.name} (${t.name})` : t.name;
  };
  const attached = !!single?.tail.targetId;
  const onTap = single ? !!bubbleTapStep(page, single.id) : false;
  const speakerName = single?.tail.targetId
    ? nameOf(single.tail.targetId).replace(/ \(.*\)$/, '')
    : '';

  return (
    <Section title="Speech bubble">
      <Field label="Shape">
        <ToggleGroup
          type="single"
          size="sm"
          variant="outline"
          value={shape}
          onValueChange={(v) => v && setBubbleShape(v as BubbleShape)}
          aria-label="Bubble shape"
          className="w-full"
        >
          {BUBBLE_SHAPES.map((s) => (
            <ToggleGroupItem
              key={s}
              value={s}
              aria-label={BUBBLE_LOOKS[s].label}
              title={BUBBLE_LOOKS[s].label}
              className="flex-1"
            >
              <BubbleShapeIcon shape={s} />
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <ColorField
          label="Fill"
          value={el.bubble.fill}
          onChange={(c) =>
            set('Bubble fill', (b) => void (b.bubble.fill = c ?? '#ffffff'), `bfill:${key}`)
          }
        />
        <ColorField
          label="Outline"
          allowNone
          value={el.bubble.stroke}
          onChange={(c) =>
            set(
              'Bubble outline',
              (b) => {
                b.bubble.stroke = c;
                if (c && b.bubble.strokeWidth === 0) b.bubble.strokeWidth = 4;
              },
              `bstroke:${key}`,
            )
          }
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <NumberField
          label="Outline width"
          value={el.bubble.strokeWidth}
          min={0}
          max={40}
          onCommit={(w) => set('Bubble outline', (b) => void (b.bubble.strokeWidth = w))}
        />
        {shape !== 'caption' && (
          <NumberField
            label="Tail width"
            value={el.tail.width}
            min={4}
            max={200}
            onCommit={(w) => set('Tail width', (b) => void (b.tail.width = w))}
          />
        )}
      </div>

      {single && shape !== 'caption' && (
        <Field label="Tail points at">
          <Select
            value={single.tail.targetId ?? FREE}
            onValueChange={(v) =>
              v === FREE
                ? setFreeTail(single.id, undefined, 'Detach tail')
                : attachBubbleTo(single.id, v)
            }
          >
            <SelectTrigger className="h-8 w-full" aria-label="Tail points at">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={FREE}>Nothing — drag the tail freely</SelectItem>
              {single.tail.targetId && !targets.some((t) => t.id === single.tail.targetId) && (
                <SelectItem value={single.tail.targetId}>{nameOf(single.tail.targetId)}</SelectItem>
              )}
              {targets.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {nameOf(t.id)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      )}

      {single && (
        <Field label="Speaker (read aloud as “… says”)">
          <Select
            value={single.speakerId ?? NONE}
            onValueChange={(v) =>
              set('Bubble speaker', (b) => {
                if (v === NONE) delete b.speakerId;
                else b.speakerId = v;
              })
            }
          >
            <SelectTrigger className="h-8 w-full" aria-label="Speaker">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>No one (narration)</SelectItem>
              {characters.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      )}

      {shape !== 'caption' && (
        <label className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
          Move with speaker
          <Switch
            checked={el.moveWithSpeaker}
            disabled={single ? !attached : false}
            onCheckedChange={(on) => set('Move with speaker', (b) => void (b.moveWithSpeaker = on))}
            aria-label="Move with speaker"
          />
        </label>
      )}
      {single && attached && (
        <label className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
          Show when {speakerName} is tapped
          <Switch
            checked={onTap}
            onCheckedChange={(on) => setShowOnTap(single.id, on)}
            aria-label="Show when the speaker is tapped"
          />
        </label>
      )}
      {single && (
        <div className="grid gap-1.5">
          <h4 className="text-xs font-medium">Voice (heard when the bubble appears)</h4>
          {project.voiceover.languages.length ? (
            <VoiceSlots
              target={{ kind: 'bubble', pageId: page.id, elementId: single.id }}
              line={single.voice}
              what={single.name}
            />
          ) : (
            <p className="text-[11px] text-muted-foreground">
              Add a language in the Audio tab to give this bubble a voice.
            </p>
          )}
        </div>
      )}
      {single && shape !== 'caption' && (
        <p className="text-[11px] text-muted-foreground">
          {attached
            ? 'When the speaker walks or hops, the bubble travels with them.'
            : 'Drag the pink dot at the tail’s tip onto a character to attach it.'}
        </p>
      )}
    </Section>
  );
}

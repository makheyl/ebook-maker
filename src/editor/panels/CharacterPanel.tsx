import { Footprints, Hand, Smile, Unlink } from 'lucide-react';
import { useId } from 'react';
import { IDLE_MOTIONS } from '@/core/animation';
import type { ImageElement } from '@/core/schema';
import { Button } from '@/ui/button';
import { Input } from '@/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/ui/select';
import { Switch } from '@/ui/switch';
import { ToggleGroup, ToggleGroupItem } from '@/ui/toggle-group';
import {
  addTapReaction,
  editCharacter,
  makeCharacter,
  OPAQUE_WARNING,
  setCharacterIdle,
  setInstanceIdle,
  unlinkCharacter,
} from '../character/actions';
import { useProject } from '../store/selectors';
import { useUiStore } from '../store/ui-store';
import { Field, Section, SliderField } from './controls';

const NONE = 'none';
const FOLLOW = 'follow';

/** Character settings for a selected image (or the button that makes it a character). */
export function CharacterPanel({ element }: { element: ImageElement }) {
  const project = useProject();
  const editingPivot = useUiStore((s) => s.editingPivot);
  const character = element.characterId ? project.characters[element.characterId] : undefined;
  const asset = project.assets[element.assetId];
  const nameId = useId();

  if (!character) {
    return (
      <Section title="Character">
        <p className="text-xs text-muted-foreground">
          Turn this picture into a character that can walk, hop, wave and react to taps.
        </p>
        {asset?.hasAlpha === false && (
          <p className="rounded-md bg-amber-500/10 p-2 text-xs text-amber-800 dark:text-amber-200">
            {OPAQUE_WARNING}
          </p>
        )}
        <Button size="sm" onClick={() => void makeCharacter(element.id)} disabled={element.locked}>
          <Smile /> Make it a character
        </Button>
      </Section>
    );
  }

  const hasTapReaction = !!element.interactions?.some((i) =>
    i.actions.some((a) => a.type === 'playStep'),
  );
  const pageIdle = element.idleOverride ?? FOLLOW;
  const edit = (label: string, recipe: Parameters<typeof editCharacter>[1], key?: string) =>
    editCharacter(character.id, recipe, { label, coalesceKey: key });

  return (
    <Section title="Character">
      <Field label="Name" htmlFor={nameId}>
        <Input
          id={nameId}
          key={character.id}
          defaultValue={character.name}
          maxLength={60}
          className="h-8"
          onBlur={(e) => {
            const name = e.target.value.trim() || 'Character';
            if (name !== character.name) edit('Rename character', (c) => void (c.name = name));
          }}
          onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
        />
      </Field>
      <p className="-mt-1 text-[11px] text-muted-foreground">
        Settings here apply to {character.name} on every page.
      </p>

      <Field label="The artwork faces">
        <ToggleGroup
          type="single"
          size="sm"
          variant="outline"
          value={character.facing}
          onValueChange={(v) => v && edit('Facing', (c) => void (c.facing = v as 'left' | 'right'))}
          className="w-full"
        >
          <ToggleGroupItem value="left" className="flex-1">
            Left
          </ToggleGroupItem>
          <ToggleGroupItem value="right" className="flex-1">
            Right
          </ToggleGroupItem>
        </ToggleGroup>
      </Field>

      <Button
        variant={editingPivot ? 'default' : 'outline'}
        size="sm"
        aria-pressed={editingPivot}
        onClick={() => useUiStore.getState().setEditingPivot(!editingPivot)}
      >
        <Footprints /> {editingPivot ? 'Done adjusting feet' : 'Adjust feet position'}
      </Button>
      {editingPivot && (
        <p className="-mt-1 text-[11px] text-muted-foreground">
          Drag the dot on the canvas to where the character stands. Hops, squashes and the shadow
          use this point.
        </p>
      )}

      <Field label="Idle motion (always playing)">
        <Select
          value={character.idle?.preset ?? NONE}
          onValueChange={(v) => setCharacterIdle(character.id, v === NONE ? null : v)}
        >
          <SelectTrigger className="h-8 w-full" aria-label="Idle motion">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>None</SelectItem>
            {IDLE_MOTIONS.map((m) => (
              <SelectItem key={m.id} value={m.id}>
                {m.label}
                {m.warp ? ' (bendy)' : ''}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      {character.idle && (
        <SliderField
          label="Idle strength"
          value={character.idle.intensity}
          min={0.25}
          max={2}
          step={0.05}
          format={(v) => `${Math.round(v * 100)}%`}
          gestureLabel="Idle strength"
          onChange={(v) =>
            edit(
              'Idle strength',
              (c) => void (c.idle && (c.idle.intensity = v)),
              `idle:${character.id}`,
            )
          }
        />
      )}
      <Field label="On this page">
        <Select
          value={pageIdle}
          onValueChange={(v) => setInstanceIdle(element.id, v === FOLLOW ? undefined : v)}
        >
          <SelectTrigger className="h-8 w-full" aria-label="Idle motion on this page">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={FOLLOW}>Same as everywhere</SelectItem>
            <SelectItem value={NONE}>Keep still</SelectItem>
            {IDLE_MOTIONS.map((m) => (
              <SelectItem key={m.id} value={m.id}>
                {m.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      <label className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
        Ground shadow
        <Switch
          checked={character.shadow.enabled}
          onCheckedChange={(on) => edit('Shadow', (c) => void (c.shadow.enabled = on))}
          aria-label="Ground shadow"
        />
      </label>
      {character.shadow.enabled && (
        <>
          <SliderField
            label="Shadow darkness"
            value={character.shadow.opacity}
            min={0}
            max={1}
            step={0.01}
            format={(v) => `${Math.round(v * 100)}%`}
            gestureLabel="Shadow"
            onChange={(v) =>
              edit('Shadow', (c) => void (c.shadow.opacity = v), `shadow:${character.id}`)
            }
          />
          <SliderField
            label="Shadow size"
            value={character.shadow.size}
            min={0.2}
            max={2}
            step={0.05}
            format={(v) => `${Math.round(v * 100)}%`}
            gestureLabel="Shadow"
            onChange={(v) =>
              edit('Shadow', (c) => void (c.shadow.size = v), `shadow:${character.id}`)
            }
          />
        </>
      )}
      <label className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>
          Bendy body
          <span className="block text-[11px]">Needed for Sway and bending moves</span>
        </span>
        <Switch
          checked={character.warp}
          onCheckedChange={(on) => edit('Bendy body', (c) => void (c.warp = on))}
          aria-label="Bendy body"
        />
      </label>

      <div className="flex flex-wrap gap-1.5">
        {!hasTapReaction && (
          <Button variant="outline" size="sm" onClick={() => addTapReaction(element.id)}>
            <Hand /> Wiggle when tapped
          </Button>
        )}
        <Button variant="ghost" size="sm" onClick={() => unlinkCharacter(element.id)}>
          <Unlink /> Stop being a character
        </Button>
      </div>
    </Section>
  );
}

import { Clock, Mic, Music, Plus, Timer, Trash2 } from 'lucide-react';
import { entranceStepOf } from '@/core/audio';
import type { AudioClip, Page, PageElement } from '@/core/schema';
import { Button } from '@/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/ui/dropdown-menu';
import { Section } from '../panels/controls';
import { uploadSound } from '../sound/actions';
import { useActivePage, useProject } from '../store/selectors';
import { useUiStore } from '../store/ui-store';
import {
  addElementClip,
  addTapSound,
  removeTimedClip,
  setClipLoop,
  startAtPlayhead,
  startWhenAppears,
  updateClipMix,
  updateTapMix,
} from './actions';
import { AdjustPopover } from './AdjustPopover';
import { PreviewButton } from './PreviewButton';
import { SpeakWhenTapped } from './SpeakWhenTapped';
import { VoiceSlots } from './VoiceSlots';

const seconds = (ms: number) => `${(ms / 1000).toFixed(1)} s`;

/** "Add sound": pick one of the book's sounds, or upload a new one. */
function SoundMenu({ label, onPick }: { label: string; onPick: (soundId: string) => void }) {
  const project = useProject();
  const sounds = Object.values(project.sounds);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="h-7 px-2 text-xs">
          <Music /> {label}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {sounds.map((s) => (
          <DropdownMenuItem key={s.id} onSelect={() => onPick(s.id)}>
            {s.name ?? 'Sound'}
          </DropdownMenuItem>
        ))}
        {sounds.length > 0 && <DropdownMenuSeparator />}
        <DropdownMenuItem onSelect={() => void uploadSound().then((snd) => snd && onPick(snd.id))}>
          <Plus /> Upload a sound…
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** One timed clip: what it is, when it starts, adjust and remove. */
export function ClipRow({ clip, page, what }: { clip: AudioClip; page: Page; what: string }) {
  const project = useProject();
  const sound = clip.source.kind === 'sound' ? project.sounds[clip.source.soundId] : undefined;
  const label = sound?.name ?? (clip.source.kind === 'voice' ? 'Voice line' : 'Sound');
  const when =
    clip.start.kind === 'time'
      ? `${clip.start.group ? `Click ${clip.start.group}, ` : ''}${seconds(clip.start.at)}`
      : clip.start.offset
        ? `${clip.start.offset > 0 ? '+' : ''}${seconds(clip.start.offset)}`
        : 'as it appears';
  const fileMs = sound?.duration !== undefined ? sound.duration * 1000 : undefined;
  return (
    <li className="grid gap-1 rounded-md border p-1.5" data-testid="audio-clip">
      <div className="flex items-center gap-1">
        {clip.source.kind === 'voice' ? (
          <Mic className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
        ) : (
          <Music className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
        )}
        <span className="min-w-0 flex-1 truncate text-xs">{label}</span>
        <span className="shrink-0 text-[11px] text-muted-foreground tabular-nums">{when}</span>
        {sound && <PreviewButton assetId={sound.id} label={label} />}
        <AdjustPopover
          label={label}
          mix={clip.mix}
          trim={clip.source.kind === 'sound'}
          fileMs={fileMs}
          onChange={(patch) => updateClipMix(clip.id, patch)}
          {...(clip.source.kind === 'sound'
            ? { loop: clip.loop, onLoop: (on: boolean) => setClipLoop(clip.id, on) }
            : {})}
        />
        <Button
          variant="ghost"
          size="icon"
          className="size-7 shrink-0"
          aria-label={`Remove ${label}`}
          onClick={() => removeTimedClip(clip.id)}
        >
          <Trash2 />
        </Button>
      </div>
      {clip.source.kind === 'voice' && project.voiceover.languages.length > 0 && (
        <VoiceSlots
          target={{ kind: 'clip', pageId: page.id, clipId: clip.id, elementId: clip.elementId }}
          line={clip.source.line}
          what={what}
        />
      )}
    </li>
  );
}

/**
 * Audio for the selected element: sounds and voice lines when it appears, when it's tapped,
 * and at set times (placed on the timeline).
 */
export function ElementAudioSection({ element }: { element: PageElement }) {
  const project = useProject();
  const page = useActivePage();
  const clips = (page.audio ?? []).filter((c) => c.elementId === element.id);
  const entrance = entranceStepOf(page, element.id);
  const appears = clips.filter(
    (c) =>
      (c.start.kind === 'withStep' && c.start.stepId === entrance) ||
      (!entrance && c.start.kind === 'time' && c.start.group === 0 && c.start.at === 0),
  );
  const timed = clips.filter((c) => !appears.includes(c));
  const hasVoice = project.voiceover.languages.length > 0;
  const tapSounds = (element.interactions ?? []).flatMap((i) =>
    i.actions.flatMap((a, index) => (a.type === 'playSound' ? [{ i, a, index }] : [])),
  );
  const addVoice = (start: AudioClip['start']) =>
    addElementClip({ kind: 'voice', line: {} }, start, element.id);

  return (
    <Section title="Audio">
      <div className="grid gap-1.5">
        <h4 className="flex items-center gap-1 text-xs font-medium">
          When it appears
          {!entrance && (
            <span className="font-normal text-muted-foreground">(no entrance: page opens)</span>
          )}
        </h4>
        {appears.length > 0 && (
          <ul className="grid gap-1">
            {appears.map((c) => (
              <ClipRow key={c.id} clip={c} page={page} what={element.name} />
            ))}
          </ul>
        )}
        <div className="flex flex-wrap gap-1">
          <SoundMenu
            label="Add sound"
            onPick={(soundId) =>
              addElementClip({ kind: 'sound', soundId }, startWhenAppears(element.id), element.id)
            }
          />
          {hasVoice && (
            <Button
              variant="outline"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => addVoice(startWhenAppears(element.id))}
            >
              <Mic /> Add voice
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-1.5">
        <h4 className="text-xs font-medium">When tapped</h4>
        {tapSounds.length > 0 && (
          <ul className="grid gap-1">
            {tapSounds.map(({ i, a, index }) => {
              if (a.type !== 'playSound') return null;
              const sound = project.sounds[a.soundId];
              const name = sound?.name ?? 'Sound';
              return (
                <li key={`${i.id}:${index}`} className="flex items-center gap-1 text-xs">
                  <Music className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                  <span className="min-w-0 flex-1 truncate">{name}</span>
                  {sound && <PreviewButton assetId={sound.id} label={name} />}
                  <AdjustPopover
                    label={name}
                    mix={a.mix}
                    trim
                    fileMs={sound?.duration !== undefined ? sound.duration * 1000 : undefined}
                    onChange={(patch) => updateTapMix(element.id, i.id, index, patch)}
                  />
                </li>
              );
            })}
          </ul>
        )}
        <div className="flex flex-wrap gap-1">
          <SoundMenu label="Add tap sound" onPick={(soundId) => addTapSound(element.id, soundId)} />
        </div>
        {hasVoice &&
          element.type !== 'group' &&
          !(element.type === 'image' && element.characterId) && (
            <SpeakWhenTapped element={element} name={element.name} />
          )}
      </div>

      <div className="grid gap-1.5">
        <h4 className="flex items-center gap-1 text-xs font-medium">
          <Clock className="size-3.5" aria-hidden /> At a set time
        </h4>
        {timed.length > 0 && (
          <ul className="grid gap-1">
            {timed.map((c) => (
              <ClipRow key={c.id} clip={c} page={page} what={element.name} />
            ))}
          </ul>
        )}
        <div className="flex flex-wrap gap-1">
          <SoundMenu
            label="Sound at the playhead"
            onPick={(soundId) => {
              addElementClip({ kind: 'sound', soundId }, startAtPlayhead(), element.id);
              useUiStore.getState().setTimelineOpen(true);
            }}
          />
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={() => useUiStore.getState().setTimelineOpen(true)}
          >
            <Timer /> Open timeline
          </Button>
        </div>
      </div>
    </Section>
  );
}

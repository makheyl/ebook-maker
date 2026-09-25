import { SlidersHorizontal } from 'lucide-react';
import { DEFAULT_MIX } from '@/core/audio';
import type { AudioMix } from '@/core/schema';
import { Button } from '@/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/ui/popover';
import { Switch } from '@/ui/switch';
import { NumberField, SliderField } from '../panels/controls';

/**
 * Volume, fades and (for sounds) trim — non-destructive settings, like the audio options of
 * presentation and video editors. `fileMs` bounds the trim.
 */
export function AdjustPopover({
  mix,
  label,
  onChange,
  trim,
  fileMs,
  loop,
  onLoop,
}: {
  mix: AudioMix | undefined;
  label: string;
  onChange: (patch: Partial<AudioMix>) => void;
  /** Sounds and music can be trimmed; voice lines can't (each language is its own file). */
  trim?: boolean;
  fileMs?: number;
  loop?: boolean;
  onLoop?: (loop: boolean) => void;
}) {
  const m = mix ?? DEFAULT_MIX;
  const sec = (ms: number) => Math.round(ms) / 1000;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="size-7 shrink-0"
          aria-label={`Adjust ${label}`}
          title="Volume, fades and trim"
        >
          <SlidersHorizontal />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="grid w-64 gap-3" align="end">
        <SliderField
          label="Volume"
          value={Math.round(m.volume * 100)}
          min={0}
          max={100}
          format={(v) => `${v}%`}
          gestureLabel="Volume"
          onChange={(v) => onChange({ volume: v / 100 })}
        />
        <div className="grid grid-cols-2 gap-2">
          <NumberField
            label="Fade in"
            value={sec(m.fadeInMs)}
            min={0}
            max={10}
            step={0.1}
            precision={1}
            suffix="s"
            onCommit={(v) => onChange({ fadeInMs: Math.round(v * 1000) })}
          />
          <NumberField
            label="Fade out"
            value={sec(m.fadeOutMs)}
            min={0}
            max={10}
            step={0.1}
            precision={1}
            suffix="s"
            onCommit={(v) => onChange({ fadeOutMs: Math.round(v * 1000) })}
          />
        </div>
        {trim && (
          <div className="grid grid-cols-2 gap-2">
            <NumberField
              label="Start at"
              value={sec(m.trimStartMs)}
              min={0}
              max={fileMs ? fileMs / 1000 : 3600}
              step={0.1}
              precision={2}
              suffix="s"
              onCommit={(v) => onChange({ trimStartMs: Math.round(v * 1000) })}
            />
            <NumberField
              label="End at"
              value={sec(m.trimEndMs ?? fileMs ?? 0)}
              min={0}
              max={fileMs ? fileMs / 1000 : 3600}
              step={0.1}
              precision={2}
              suffix="s"
              onCommit={(v) => onChange({ trimEndMs: Math.round(v * 1000) })}
            />
          </div>
        )}
        {onLoop && (
          <label className="flex items-center justify-between text-xs text-muted-foreground">
            Loop until the page turns
            <Switch checked={!!loop} onCheckedChange={onLoop} aria-label="Loop" />
          </label>
        )}
      </PopoverContent>
    </Popover>
  );
}

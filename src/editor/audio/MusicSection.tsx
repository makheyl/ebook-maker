import { Music2, Trash2, Upload } from 'lucide-react';
import { musicSectionAt } from '@/core/audio';
import type { Page } from '@/core/schema';
import { Button } from '@/ui/button';
import { Input } from '@/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/ui/select';
import { Switch } from '@/ui/switch';
import { Field, NumberField, Section, SliderField } from '../panels/controls';
import { useProject } from '../store/selectors';
import {
  removeMusic,
  renameMusic,
  setMusicOptions,
  setPageMusic,
  setPageMusicVolume,
  uploadMusic,
} from './actions';
import { PreviewButton } from './PreviewButton';

const CARRY_ON = '__carry';
const STOP = '__stop';
const UPLOAD = '__upload';
const minutes = (s?: number) =>
  s === undefined ? '' : `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;

/** Background music: the book's tracks, what plays from this page on, and how it mixes. */
export function MusicSection({ page }: { page: Page }) {
  const project = useProject();
  const tracks = Object.values(project.music.tracks);
  const index = project.pages.findIndex((p) => p.id === page.id);
  const here = project.music.sections.find((s) => s.fromPageId === page.id);
  const before = index > 0 ? musicSectionAt(project, index - 1) : null;
  const carryLabel = before?.trackId
    ? `Keep playing “${project.music.tracks[before.trackId]?.name ?? 'music'}”`
    : 'No music (as before)';
  const value = here ? (here.trackId ?? STOP) : CARRY_ON;
  return (
    <Section title="Background music">
      {!tracks.length ? (
        <p className="text-xs text-muted-foreground">
          Music that plays across pages — separate from voiceover and sound effects. MP3 or M4A up
          to 15 MB. It gets quieter while the voiceover speaks, and readers can turn it off.
        </p>
      ) : (
        <ul className="grid gap-1.5" aria-label="Music tracks">
          {tracks.map((t) => (
            <li key={t.id} className="flex items-center gap-1">
              <Music2 className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              <Input
                key={t.id + t.name}
                defaultValue={t.name ?? 'Music'}
                aria-label="Music name"
                maxLength={200}
                className="h-7 min-w-0 flex-1 text-xs"
                onBlur={(e) =>
                  e.target.value.trim() &&
                  e.target.value.trim() !== t.name &&
                  renameMusic(t.id, e.target.value)
                }
                onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
              />
              <span className="shrink-0 text-[11px] text-muted-foreground tabular-nums">
                {minutes(t.duration)}
              </span>
              <PreviewButton assetId={t.id} label={t.name ?? 'music'} />
              <Button
                variant="ghost"
                size="icon"
                className="size-7 shrink-0"
                aria-label={`Remove ${t.name ?? 'music'}`}
                onClick={() => removeMusic(t.id)}
              >
                <Trash2 />
              </Button>
            </li>
          ))}
        </ul>
      )}
      <Button
        variant="outline"
        size="sm"
        className="justify-self-start"
        onClick={() => void uploadMusic()}
      >
        <Upload /> Upload music
      </Button>
      <Field label="Music from this page">
        <Select
          value={value}
          onValueChange={(v) => {
            if (v === UPLOAD) {
              void uploadMusic().then((added) => added[0] && setPageMusic(page.id, added[0].id));
            } else setPageMusic(page.id, v === CARRY_ON ? undefined : v === STOP ? null : v);
          }}
        >
          <SelectTrigger className="h-8 w-full" aria-label="Music from this page">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={CARRY_ON}>{carryLabel}</SelectItem>
            {tracks.map((t) => (
              <SelectItem key={t.id} value={t.id}>
                {t.name ?? 'Music'}
              </SelectItem>
            ))}
            <SelectItem value={STOP}>Stop the music</SelectItem>
            <SelectItem value={UPLOAD}>Upload music…</SelectItem>
          </SelectContent>
        </Select>
      </Field>
      {here?.trackId && (
        <SliderField
          label="Music volume"
          value={Math.round(here.volume * 100)}
          min={0}
          max={100}
          format={(v) => `${v}%`}
          gestureLabel="Music volume"
          onChange={(v) => setPageMusicVolume(page.id, v / 100)}
        />
      )}
      {tracks.length > 0 && (
        <>
          <label className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
            Quieter while the voiceover speaks
            <Switch
              checked={project.music.ducking}
              onCheckedChange={(ducking) => setMusicOptions({ ducking })}
              aria-label="Duck music under the voiceover"
            />
          </label>
          <NumberField
            label="Crossfade between tracks"
            value={project.music.crossfadeMs / 1000}
            min={0}
            max={8}
            step={0.5}
            precision={1}
            suffix="s"
            onCommit={(v) => setMusicOptions({ crossfadeMs: Math.round(v * 1000) })}
          />
        </>
      )}
    </Section>
  );
}

import { Music, Trash2, Upload } from 'lucide-react';
import { openSoundClipId } from '@/core/audio';
import type { Page } from '@/core/schema';
import { Button } from '@/ui/button';
import { Input } from '@/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/ui/select';
import { Field, Section } from '../panels/controls';
import { deleteSound, setPageTurnSound, setSoundName, uploadSound } from '../sound/actions';
import { useProject } from '../store/selectors';
import { setOpenSound } from './actions';
import { PreviewButton } from './PreviewButton';

/** Select items can't trigger uploads directly; these values stand for "none" / "upload". */
const UPLOAD = '__upload';
const NO_SOUND = '__none';

/** Sound effects: the book's library, the page-turn sound, and this page's opening sound. */
export function SoundEffectsSection({ page }: { page: Page }) {
  const project = useProject();
  const sounds = Object.values(project.sounds);
  const picker = (
    label: string,
    value: string | undefined,
    set: (id: string | undefined) => void,
  ) => (
    <Field label={label}>
      <Select
        value={value ?? NO_SOUND}
        onValueChange={(v) => {
          if (v === UPLOAD) void uploadSound().then((snd) => snd && set(snd.id));
          else set(v === NO_SOUND ? undefined : v);
        }}
      >
        <SelectTrigger className="h-8 w-full" aria-label={label}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NO_SOUND}>None</SelectItem>
          {sounds.map((snd) => (
            <SelectItem key={snd.id} value={snd.id}>
              {snd.name ?? 'Sound'}
            </SelectItem>
          ))}
          <SelectItem value={UPLOAD}>Upload a sound…</SelectItem>
        </SelectContent>
      </Select>
    </Field>
  );
  return (
    <Section title="Sound effects">
      {!sounds.length ? (
        <p className="text-xs text-muted-foreground">
          MP3, OGG, WAV or M4A up to 2 MB. Play them when something is tapped, when a page turns or
          when a page opens. Readers can turn them off separately from the voiceover.
        </p>
      ) : (
        <ul className="grid gap-1.5" aria-label="Sound effects">
          {sounds.map((snd) => (
            <li key={snd.id} className="flex items-center gap-1">
              <Music className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              <Input
                key={snd.id + snd.name}
                defaultValue={snd.name ?? 'Sound'}
                aria-label="Sound name"
                maxLength={200}
                className="h-7 min-w-0 flex-1 text-xs"
                onBlur={(e) =>
                  e.target.value.trim() &&
                  e.target.value.trim() !== snd.name &&
                  setSoundName(snd.id, e.target.value)
                }
                onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
              />
              <span className="shrink-0 text-[11px] text-muted-foreground tabular-nums">
                {snd.duration !== undefined && `${snd.duration.toFixed(1)} s`}
              </span>
              <PreviewButton assetId={snd.id} label={snd.name ?? 'sound'} />
              <Button
                variant="ghost"
                size="icon"
                className="size-7 shrink-0"
                aria-label={`Remove ${snd.name ?? 'sound'}`}
                onClick={() => deleteSound(snd.id)}
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
        onClick={() => void uploadSound()}
      >
        <Upload /> Upload sound
      </Button>
      {picker('Page-turn sound', project.reader.pageTurnSound, setPageTurnSound)}
      {picker(
        'When this page opens',
        (() => {
          const open = page.audio?.find((c) => c.id === openSoundClipId(page.id));
          return open?.source.kind === 'sound' ? open.source.soundId : undefined;
        })(),
        (id) => setOpenSound(page.id, id),
      )}
    </Section>
  );
}

import { Mic, RefreshCw, Trash2, Upload } from 'lucide-react';
import { useState } from 'react';
import type { VoiceLine } from '@/core/schema';
import { defaultLanguageOf, lineStatus, type VoiceTarget } from '@/core/voice';
import { Button } from '@/ui/button';
import { cn } from '@/ui/utils';
import { useProject } from '../store/selectors';
import { removeVoice, uploadVoice } from './actions';
import { PreviewButton } from './PreviewButton';

const seconds = (d?: number) => (d !== undefined ? `${d.toFixed(1)} s` : '');

/**
 * One upload slot per language for a voice line: drop a file or upload; play, replace,
 * remove. An empty slot says what the reader will hear instead (the default language).
 */
export function VoiceSlots({
  target,
  line,
  what,
}: {
  target: VoiceTarget;
  line: VoiceLine | undefined;
  /** "page 3", "Pip", "the bubble" — for button names. */
  what: string;
}) {
  const project = useProject();
  const languages = project.voiceover.languages;
  const fallback = defaultLanguageOf(project);
  const fallbackName = languages.find((l) => l.code === fallback)?.name;
  const [over, setOver] = useState<string | null>(null);
  return (
    <ul className="grid gap-1.5" aria-label={`Voiceover for ${what}`}>
      {languages.map((lang) => {
        const clip = line?.[lang.code];
        const status = lineStatus(line, lang.code, fallback);
        return (
          <li
            key={lang.code}
            data-testid={`voice-slot-${lang.code}`}
            className={cn(
              'flex items-center gap-1 rounded-md border px-2 py-1',
              over === lang.code && 'border-primary bg-accent',
              !clip && 'border-dashed',
            )}
            onDragOver={(e) => {
              if (!e.dataTransfer.types.includes('Files')) return;
              e.preventDefault();
              setOver(lang.code);
            }}
            onDragLeave={() => setOver(null)}
            onDrop={(e) => {
              e.preventDefault();
              setOver(null);
              void uploadVoice(target, lang.code, [...e.dataTransfer.files]);
            }}
          >
            <span className="w-16 shrink-0 truncate text-xs font-medium" title={lang.name}>
              {lang.name}
            </span>
            {clip ? (
              <>
                <Mic className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                <span className="min-w-0 flex-1 truncate text-xs" title={clip.name}>
                  {clip.name ?? 'Recording'}
                </span>
                <span className="shrink-0 text-[11px] text-muted-foreground tabular-nums">
                  {seconds(clip.duration)}
                </span>
                <PreviewButton assetId={clip.id} label={`${lang.name} voiceover for ${what}`} />
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7 shrink-0"
                  aria-label={`Replace ${lang.name} voiceover for ${what}`}
                  title="Replace"
                  onClick={() => void uploadVoice(target, lang.code)}
                >
                  <RefreshCw />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7 shrink-0"
                  aria-label={`Remove ${lang.name} voiceover for ${what}`}
                  title="Remove"
                  onClick={() => removeVoice(target, lang.code)}
                >
                  <Trash2 />
                </Button>
              </>
            ) : (
              <>
                <span className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground">
                  {status === 'fallback' ? `Uses ${fallbackName}` : 'Drop a file or'}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 shrink-0 px-2 text-xs"
                  aria-label={`Upload ${lang.name} voiceover for ${what}`}
                  onClick={() => void uploadVoice(target, lang.code)}
                >
                  <Upload /> Upload
                </Button>
              </>
            )}
          </li>
        );
      })}
    </ul>
  );
}

import { Play, Square } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '@/ui/button';
import { assetUrls } from '../assets/asset-urls';

let current: { audio: HTMLAudioElement; stop: () => void } | null = null;

/** Plays a sound or recording in the editor; starting one stops any other. */
export function PreviewButton({ assetId, label }: { assetId: string; label: string }) {
  const [playing, setPlaying] = useState(false);
  useEffect(() => () => current?.stop(), []);
  return (
    <Button
      variant="ghost"
      size="icon"
      className="size-7 shrink-0"
      aria-label={playing ? `Stop ${label}` : `Play ${label}`}
      title={playing ? 'Stop' : 'Play'}
      onClick={() => {
        if (playing) return current?.stop();
        current?.stop();
        const src = assetUrls.resolve(assetId);
        if (!src) return;
        const audio = new Audio(src);
        const stop = () => {
          audio.pause();
          setPlaying(false);
          if (current?.audio === audio) current = null;
        };
        audio.onended = stop;
        current = { audio, stop };
        setPlaying(true);
        void audio.play().catch(stop);
      }}
    >
      {playing ? <Square /> : <Play />}
    </Button>
  );
}

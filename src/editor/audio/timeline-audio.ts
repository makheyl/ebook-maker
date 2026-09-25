import type { Project, Page } from '@/core/schema';
import { Mixer } from '../../player/mixer';
import { assetUrls } from '../assets/asset-urls';
import { buildAudioLanes } from '../timeline/audio-model';

/**
 * Audio while the timeline plays: every clip of the group starts at its time (or part-way
 * through, when playback starts in the middle of it), through the reader's own mixer, so what
 * the author hears is what the book plays. Scrubbing without playing stays silent.
 */
const mixer = new Mixer();
let playing: HTMLAudioElement[] = [];
let timers: ReturnType<typeof setTimeout>[] = [];

export function startTimelineAudio(
  page: Page,
  project: Project,
  group: number,
  fromMs: number,
  speed: number,
  lang: string,
): void {
  stopTimelineAudio();
  mixer.start();
  for (const lane of buildAudioLanes(page, project, lang)) {
    for (const bar of lane.bars) {
      if (!bar.assetId) continue;
      const src = assetUrls.resolve(bar.assetId);
      if (!src) continue;
      const isMusic = bar.kind === 'music';
      if (!isMusic && (bar.group !== group || bar.start + bar.length <= fromMs)) continue;
      const offset = isMusic ? fromMs : Math.max(0, fromMs - bar.start);
      const wait = isMusic ? 0 : Math.max(0, bar.start - fromMs) / speed;
      timers.push(
        setTimeout(() => {
          const el = new Audio(src);
          el.playbackRate = speed;
          el.loop = isMusic || !!bar.loop;
          try {
            el.currentTime = (bar.mix.trimStartMs + offset) / 1000;
          } catch {
            // Starts from the beginning.
          }
          const channel = isMusic ? 'music' : bar.kind === 'sound' ? 'effects' : 'voice';
          const left = isMusic || bar.loop ? undefined : bar.length - offset;
          mixer.playMix(el, channel, offset > 0 ? { ...bar.mix, fadeInMs: 0 } : bar.mix, left);
          void el.play().catch(() => undefined);
          playing.push(el);
          if (left !== undefined) timers.push(setTimeout(() => el.pause(), left / speed + 30));
        }, wait),
      );
    }
  }
}

export function stopTimelineAudio(): void {
  for (const t of timers) clearTimeout(t);
  for (const el of playing) el.pause();
  timers = [];
  playing = [];
}

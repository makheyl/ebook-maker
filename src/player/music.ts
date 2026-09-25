import type { MusicSection } from '../core/audio/music';
import type { Mixer } from './mixer';
import { SILENCE } from './voice';

/** How much quieter the music gets while the voiceover speaks, and on The End. */
const DUCK = 1 / 3;
const END = 0.5;

/**
 * Background music: a track loops across pages until a section changes it. Two <audio>
 * elements take turns so tracks crossfade; both are primed in the reader's first tap (iOS).
 * The channel level combines the reader's on/off and volume, ducking, and The End.
 */
export class MusicPlayer {
  private readonly a: HTMLAudioElement;
  private readonly b: HTMLAudioElement;
  private current: { el: HTMLAudioElement; trackId: string; volume: number } | null = null;
  private enabled = true;
  private volume = 1;
  private ducked = false;
  private ended = false;
  private hidden = false;
  private primed = false;
  private stopTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(
    private readonly resolve: (id: string) => string | undefined,
    private readonly mixer: Mixer,
    private readonly opts: { crossfadeMs: number; ducking: boolean },
  ) {
    this.a = this.make();
    this.b = this.make();
  }

  private make(): HTMLAudioElement {
    const el = new Audio();
    el.preload = 'auto';
    el.loop = true;
    el.dataset.folio = 'music';
    return el;
  }

  /** Call inside the reader's first tap. */
  prime(): void {
    if (this.primed) return;
    this.primed = true;
    for (const el of [this.a, this.b]) {
      if (el === this.current?.el) continue;
      el.src = SILENCE;
      void el.play()?.catch(() => undefined);
    }
  }

  /** Follows the page's section: keep playing, crossfade to another track, or fade out. */
  update(section: MusicSection | null, restart = false): void {
    const target = section?.trackId ?? null;
    const fade = this.opts.crossfadeMs;
    if (this.current && target === this.current.trackId) {
      if (restart) this.current.el.currentTime = 0;
      this.current.volume = section!.volume;
      this.mixer.set(this.current.el, 'music', section!.volume, 400);
      return;
    }
    const old = this.current;
    if (old) {
      this.mixer.set(old.el, 'music', 0, fade);
      clearTimeout(this.stopTimer);
      this.stopTimer = setTimeout(() => {
        if (this.current?.el !== old.el) old.el.pause();
      }, fade + 50);
    }
    this.current = null;
    if (!target || !section) return;
    const src = this.resolve(target);
    if (!src) return;
    const el = old?.el === this.a ? this.b : this.a;
    if (el.getAttribute('src') !== src) el.src = src;
    try {
      el.currentTime = 0;
    } catch {
      // Not seekable yet.
    }
    this.current = { el, trackId: target, volume: section.volume };
    this.mixer.set(el, 'music', 0);
    this.mixer.set(el, 'music', section.volume, old ? fade : 600);
    this.applyLevel(0);
    if (this.enabled && !this.hidden) void el.play()?.catch(() => undefined);
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
    this.applyLevel(300);
    const el = this.current?.el;
    if (!el) return;
    if (on && !this.hidden) void el.play()?.catch(() => undefined);
    else setTimeout(() => !this.enabled && el.pause(), 320);
  }

  setVolume(v: number): void {
    this.volume = Math.min(1, Math.max(0, v));
    this.applyLevel(150);
  }

  /** Quieter while the voiceover speaks (if the book allows it). */
  duck(on: boolean): void {
    if (!this.opts.ducking || on === this.ducked) return;
    this.ducked = on;
    this.applyLevel(on ? 300 : 600);
  }

  setEndScreen(on: boolean): void {
    this.ended = on;
    this.applyLevel(600);
  }

  /** Pauses while the book's tab is hidden, and carries on when it's back. */
  setHidden(hidden: boolean): void {
    this.hidden = hidden;
    const el = this.current?.el;
    if (!el) return;
    if (hidden) el.pause();
    else if (this.enabled) void el.play()?.catch(() => undefined);
  }

  /** For tests: what's playing and how loud. */
  debug(): { trackId: string | null; level: number; gain: number } {
    return {
      trackId: this.current?.trackId ?? null,
      level: this.mixer.channelLevel('music'),
      gain: this.current ? this.mixer.gainOf(this.current.el) : 0,
    };
  }

  destroy(): void {
    clearTimeout(this.stopTimer);
    for (const el of [this.a, this.b]) {
      el.pause();
      el.removeAttribute('src');
    }
    this.current = null;
  }

  private level(): number {
    if (!this.enabled) return 0;
    return this.volume * (this.ducked ? DUCK : 1) * (this.ended ? END : 1);
  }

  private applyLevel(ms: number): void {
    this.mixer.setChannel('music', this.level(), ms);
    // Elements that play without Web Audio follow the level through their own volume.
    if (this.current) this.mixer.set(this.current.el, 'music', this.current.volume, ms);
  }
}

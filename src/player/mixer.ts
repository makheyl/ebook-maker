import { gainAt } from '../core/audio/mix';
import type { AudioMix } from '../core/schema';

export type Channel = 'voice' | 'effects' | 'music';

type WebkitWindow = Window & { webkitAudioContext?: typeof AudioContext };

/**
 * Volume for the reader's audio. Each <audio> element feeds a GainNode (through
 * createMediaElementSource: no decoding and no fetch, so the export's CSP is fine), into one
 * gain per channel. iOS ignores element.volume, so this is how fades and ducking work there.
 *
 * Where Web Audio can't take an element — no AudioContext, not started yet, or a file://
 * source (Chrome treats file:// as a foreign origin and would output silence) — it falls back
 * to element.volume.
 */
export class Mixer {
  private ctx: AudioContext | null = null;
  private readonly channels = new Map<Channel, GainNode>();
  private readonly nodes = new WeakMap<HTMLMediaElement, GainNode>();
  private readonly levels: Record<Channel, number> = { voice: 1, effects: 1, music: 1 };

  /** Call inside the reader's first tap (browsers only let audio start there). */
  start(): void {
    if (!this.ctx) {
      const Ctor =
        typeof window !== 'undefined'
          ? (window.AudioContext ?? (window as WebkitWindow).webkitAudioContext)
          : undefined;
      if (!Ctor) return;
      try {
        this.ctx = new Ctor();
      } catch {
        return;
      }
      for (const channel of ['voice', 'effects', 'music'] as const) {
        const gain = this.ctx.createGain();
        gain.gain.value = this.levels[channel];
        gain.connect(this.ctx.destination);
        this.channels.set(channel, gain);
      }
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume().catch(() => undefined);
  }

  private canRoute(el: HTMLMediaElement): boolean {
    if (!this.ctx) return false;
    const src = el.getAttribute('src') ?? '';
    return (
      src.startsWith('data:') ||
      src.startsWith('blob:') ||
      (typeof location !== 'undefined' && location.protocol.startsWith('http'))
    );
  }

  /** The element's own gain node (routed once), or null to use element.volume. */
  private node(el: HTMLMediaElement, channel: Channel): GainNode | null {
    const existing = this.nodes.get(el);
    if (existing) return existing;
    if (!this.canRoute(el)) return null;
    try {
      const source = this.ctx!.createMediaElementSource(el);
      const gain = this.ctx!.createGain();
      source.connect(gain);
      gain.connect(this.channels.get(channel)!);
      this.nodes.set(el, gain);
      return gain;
    } catch {
      return null;
    }
  }

  /** Sets an element's gain now, or ramps to it over `ms`. */
  set(el: HTMLMediaElement, channel: Channel, value: number, ms = 0): void {
    const v = Math.min(1, Math.max(0, value));
    const gain = this.node(el, channel);
    if (gain && this.ctx) {
      const now = this.ctx.currentTime;
      gain.gain.cancelScheduledValues(now);
      if (ms > 0) {
        gain.gain.setValueAtTime(gain.gain.value, now);
        gain.gain.linearRampToValueAtTime(v, now + ms / 1000);
      } else {
        // Setting .value takes effect at once (a scheduled value waits for the audio thread).
        gain.gain.value = v;
      }
      return;
    }
    const level = this.levels[channel];
    try {
      el.volume = Math.min(1, v * level);
    } catch {
      // Read-only (iOS): nothing to do.
    }
  }

  /**
   * Applies a clip's volume and fades from the moment it starts (`length` ms long). The fade
   * out is scheduled ahead, so it happens even if nothing else runs.
   */
  playMix(el: HTMLMediaElement, channel: Channel, mix: AudioMix, length?: number): void {
    const gain = this.node(el, channel);
    if (gain && this.ctx) {
      const now = this.ctx.currentTime;
      const g = gain.gain;
      g.cancelScheduledValues(now);
      g.value = mix.fadeInMs > 0 ? 0 : mix.volume;
      g.setValueAtTime(g.value, now);
      if (mix.fadeInMs > 0) g.linearRampToValueAtTime(mix.volume, now + mix.fadeInMs / 1000);
      if (length !== undefined && mix.fadeOutMs > 0 && length > mix.fadeOutMs) {
        const outAt = now + (length - mix.fadeOutMs) / 1000;
        g.setValueAtTime(mix.volume, Math.max(outAt, now + mix.fadeInMs / 1000));
        g.linearRampToValueAtTime(0, now + length / 1000);
      }
      return;
    }
    this.set(el, channel, gainAt(mix, 0, length));
  }

  /** A whole channel's level (reader settings, ducking), ramped over `ms`. */
  setChannel(channel: Channel, value: number, ms = 0): void {
    this.levels[channel] = value;
    const gain = this.channels.get(channel);
    if (!gain || !this.ctx) return;
    const now = this.ctx.currentTime;
    gain.gain.cancelScheduledValues(now);
    gain.gain.setValueAtTime(gain.gain.value, now);
    if (ms > 0) gain.gain.linearRampToValueAtTime(value, now + ms / 1000);
    else gain.gain.setValueAtTime(value, now);
  }

  channelLevel(channel: Channel): number {
    return this.levels[channel];
  }

  /** For tests: the current gain of an element (or its volume). */
  gainOf(el: HTMLMediaElement): number {
    return this.nodes.get(el)?.gain.value ?? el.volume;
  }

  destroy(): void {
    void this.ctx?.close().catch(() => undefined);
    this.ctx = null;
  }
}

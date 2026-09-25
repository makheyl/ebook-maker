import type { VoiceClip } from '../core/schema';
import type { VoiceCue } from '../core/voice/cues';

/** A fraction of a second of silence, to give the voice element its first play inside a tap. */
const SILENCE =
  'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=';

type Item = { clip: VoiceClip; key: string };

/**
 * The reader's voice: one voice at a time, on exactly one reused <audio> element (iOS lets an
 * element play later, outside a tap, only if it already played inside one — `prime()`).
 * Lines queue after each other; `interrupt` stops the current line and the queue first. A clip
 * that errors, stalls or never ends (a watchdog) is skipped, so nothing ever hangs.
 */
export class VoicePlayer {
  readonly el: HTMLAudioElement;
  private queue: Item[] = [];
  private current: Item | null = null;
  private watchdog: ReturnType<typeof setTimeout> | undefined;
  private primed = false;
  /** A line the browser refused to start (no gesture yet); the next tap plays it. */
  private blocked: Item | null = null;
  /** Called when nothing is playing and nothing is queued. */
  onIdle: () => void = () => undefined;
  /** Called when playback was refused (show "Tap to listen"). */
  onBlocked: () => void = () => undefined;

  constructor(
    private readonly resolve: (id: string) => string | undefined,
    host: HTMLElement,
  ) {
    this.el = document.createElement('audio');
    this.el.dataset.folio = 'voice';
    this.el.preload = 'auto';
    this.el.hidden = true;
    host.appendChild(this.el);
    const next = () => this.advance();
    this.el.addEventListener('ended', next);
    this.el.addEventListener('error', () => this.current && next());
    this.el.addEventListener('stalled', () => this.current && this.armWatchdog(4000));
  }

  get busy(): boolean {
    return !!this.current || this.queue.length > 0;
  }

  get isBlocked(): boolean {
    return !!this.blocked;
  }

  /** Call inside the reader's tap: lets later lines start on their own (iOS). */
  prime(): void {
    if (this.primed) return;
    this.primed = true;
    if (this.current || this.blocked) return;
    this.el.src = SILENCE;
    void this.el.play()?.catch(() => undefined);
  }

  /** Plays a line now (interrupting) or after what's queued. */
  say(clip: VoiceClip, mode: 'interrupt' | 'queue', key = clip.id): void {
    const item = { clip, key };
    if (mode === 'interrupt') {
      this.queue = [item];
      this.stopCurrent();
      this.advance();
      return;
    }
    this.queue.push(item);
    if (!this.current && !this.blocked) this.advance();
  }

  /** Drops what's waiting, keeping the line that's playing (carry-over across a page turn). */
  clearQueue(): void {
    this.queue = [];
  }

  stop(): void {
    this.queue = [];
    this.blocked = null;
    this.stopCurrent();
  }

  /** After "Tap to listen": plays the line that was refused. */
  resumeBlocked(): void {
    const item = this.blocked;
    if (!item) return;
    this.blocked = null;
    this.primed = true;
    this.start(item);
  }

  destroy(): void {
    this.stop();
    this.el.removeAttribute('src');
    this.el.remove();
  }

  private stopCurrent(): void {
    clearTimeout(this.watchdog);
    this.current = null;
    this.el.pause();
  }

  private advance(): void {
    clearTimeout(this.watchdog);
    this.current = null;
    const item = this.queue.shift();
    if (!item) {
      this.el.pause();
      this.onIdle();
      return;
    }
    this.start(item);
  }

  private start(item: Item): void {
    const src = this.resolve(item.clip.id);
    if (!src) return this.advance();
    this.current = item;
    if (this.el.getAttribute('src') !== src) this.el.src = src;
    try {
      this.el.currentTime = 0;
    } catch {
      // Not seekable yet: it starts from the beginning anyway.
    }
    this.armWatchdog((item.clip.duration ?? 60) * 1000 + 2000);
    const playing = this.el.play();
    void playing?.catch((err: unknown) => {
      if (this.current !== item) return;
      if (err instanceof DOMException && err.name === 'NotAllowedError') {
        clearTimeout(this.watchdog);
        this.current = null;
        this.blocked = item;
        this.onBlocked();
      } else {
        this.advance();
      }
    });
  }

  private armWatchdog(ms: number): void {
    clearTimeout(this.watchdog);
    const item = this.current;
    this.watchdog = setTimeout(() => {
      if (this.current === item) this.advance();
    }, ms);
  }
}

/**
 * Timers for speech-bubble lines: when a click group plays, each of its voiced bubbles is
 * heard at its entrance time. Finishing a group early says the rest at once, in order.
 */
export class CueClock {
  private timers = new Map<VoiceCue, ReturnType<typeof setTimeout>>();

  constructor(private readonly fire: (cue: VoiceCue) => void) {}

  schedule(cues: readonly VoiceCue[], group: number): void {
    for (const cue of cues) {
      if (cue.group !== group || this.timers.has(cue)) continue;
      this.timers.set(
        cue,
        setTimeout(() => {
          this.timers.delete(cue);
          this.fire(cue);
        }, cue.at),
      );
    }
  }

  /** Says a group's remaining lines now (the reader skipped ahead). */
  flush(group: number): void {
    const due = [...this.timers.keys()]
      .filter((c) => c.group === group)
      .sort((a, b) => a.at - b.at);
    for (const cue of due) {
      clearTimeout(this.timers.get(cue));
      this.timers.delete(cue);
      this.fire(cue);
    }
  }

  get pending(): boolean {
    return this.timers.size > 0;
  }

  clear(): void {
    for (const t of this.timers.values()) clearTimeout(t);
    this.timers.clear();
  }
}

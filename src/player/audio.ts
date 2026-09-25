import { flattenElements } from '../core/schema/tree';
import { DEFAULT_MIX, playLength } from '../core/audio/mix';
import type { AudioMix, Project } from '../core/schema';
import type { Mixer } from './mixer';

const MUTE_KEY = 'folio:muted';

/** Whether the book has sound effects (decides if the reader shows the effects button). */
export function bookHasEffects(project: Project): boolean {
  if (project.reader.pageTurnSound && project.sounds?.[project.reader.pageTurnSound]) return true;
  const soundClip = (p: Project['pages'][number]) =>
    p.audio?.some((c) => c.source.kind === 'sound' && project.sounds?.[c.source.soundId]);
  if (project.pages.some(soundClip)) return true;
  return project.pages.some((page) =>
    flattenElements(page.elements).some(
      (el) =>
        !el.hidden && el.interactions?.some((i) => i.actions.some((a) => a.type === 'playSound')),
    ),
  );
}

function loadMuted(): boolean {
  try {
    return localStorage.getItem(MUTE_KEY) === '1';
  } catch {
    return false;
  }
}

function saveMuted(muted: boolean): void {
  try {
    if (muted) localStorage.setItem(MUTE_KEY, '1');
    else localStorage.removeItem(MUTE_KEY);
  } catch {
    // Not remembered: the book still works.
  }
}

/** At most this many sound effects play at once (mobile browsers limit media elements). */
const POOL_SIZE = 6;

type Playing = {
  el: HTMLAudioElement;
  key: string;
  timer?: ReturnType<typeof setTimeout>;
  onTime?: () => void;
};

export type PlayOptions = {
  mix?: AudioMix;
  /** Keep looping (between the trim points) until stopped. */
  loop?: boolean;
  /** Groups sounds so they can be stopped together (e.g. 'page:' for a page's clips). */
  key?: string;
  /** The file's length in ms, when known (for trim and fade out). */
  fileMs?: number;
};

/**
 * The reader's sound effects. Nothing plays until the reader has tapped or pressed a key
 * (browsers block autoplay, and a book shouldn't start making noise on its own). Sounds come
 * from a small pool of <audio> elements; each plays with its own volume, fades and trim
 * through the mixer. Mute is remembered.
 */
export class SoundBoard {
  private readonly pool: HTMLAudioElement[] = [];
  private readonly playing: Playing[] = [];
  private unlocked = false;
  private mutedValue = loadMuted();

  constructor(
    private readonly resolve: (id: string) => string | undefined,
    private readonly mixer: Mixer,
  ) {}

  get muted(): boolean {
    return this.mutedValue;
  }

  /** Call on the reader's first tap or key press. */
  unlock(): void {
    this.unlocked = true;
  }

  play(soundId: string, opts: PlayOptions = {}): void {
    if (!this.unlocked || this.mutedValue) return;
    const src = this.resolve(soundId);
    if (!src) return;
    const mix = opts.mix ?? DEFAULT_MIX;
    const el = this.take();
    if (el.getAttribute('src') !== src) el.src = src;
    try {
      el.currentTime = mix.trimStartMs / 1000;
    } catch {
      // Not seekable yet: it plays from the start.
    }
    const length = playLength(mix, opts.fileMs);
    const trimmed = mix.trimStartMs > 0 || mix.trimEndMs !== undefined;
    el.loop = !!opts.loop && !trimmed;
    const entry: Playing = { el, key: opts.key ?? '' };
    if (opts.loop && trimmed) {
      // Loop between the trim points.
      const end = (mix.trimEndMs ?? Infinity) / 1000;
      entry.onTime = () => {
        if (el.currentTime >= end) el.currentTime = mix.trimStartMs / 1000;
      };
      el.addEventListener('timeupdate', entry.onTime);
    } else if (!opts.loop && length !== undefined) {
      entry.timer = setTimeout(() => this.release(entry), length + 50);
    }
    this.playing.push(entry);
    this.mixer.playMix(el, 'effects', mix, opts.loop ? undefined : length);
    void el.play()?.catch(() => this.release(entry));
    el.onended = () => !el.loop && this.release(entry);
  }

  /** Stops the sounds with this key (fading them out over `fadeMs`). */
  stopKey(key: string, fadeMs = 0): void {
    for (const entry of this.playing.filter((p) => p.key === key)) this.fadeOut(entry, fadeMs);
  }

  /** Stops every sound whose key starts with `prefix` (e.g. a page's clips). */
  stopPrefix(prefix: string, fadeMs = 0): void {
    for (const entry of this.playing.filter((p) => p.key.startsWith(prefix))) {
      this.fadeOut(entry, fadeMs);
    }
  }

  setMuted(muted: boolean): void {
    this.mutedValue = muted;
    saveMuted(muted);
    if (muted) this.stopAll();
  }

  stopAll(): void {
    for (const entry of [...this.playing]) this.release(entry);
  }

  /** For tests: what's playing and how loud. */
  debug(): { src: string; key: string; gain: number }[] {
    return this.playing.map((p) => ({
      src: p.el.getAttribute('src') ?? '',
      key: p.key,
      gain: this.mixer.gainOf(p.el),
    }));
  }

  destroy(): void {
    this.stopAll();
    for (const el of this.pool) el.removeAttribute('src');
    this.pool.length = 0;
  }

  private take(): HTMLAudioElement {
    const busy = new Set(this.playing.map((p) => p.el));
    const free = this.pool.find((el) => !busy.has(el));
    if (free) return free;
    if (this.pool.length < POOL_SIZE) {
      const el = new Audio();
      el.preload = 'auto';
      this.pool.push(el);
      return el;
    }
    // All busy: the oldest sound makes room.
    const oldest = this.playing[0]!;
    this.release(oldest);
    return oldest.el;
  }

  private fadeOut(entry: Playing, ms: number): void {
    if (ms <= 0) return this.release(entry);
    this.mixer.set(entry.el, 'effects', 0, ms);
    clearTimeout(entry.timer);
    entry.timer = setTimeout(() => this.release(entry), ms + 20);
  }

  private release(entry: Playing): void {
    const i = this.playing.indexOf(entry);
    if (i < 0) return;
    this.playing.splice(i, 1);
    clearTimeout(entry.timer);
    if (entry.onTime) entry.el.removeEventListener('timeupdate', entry.onTime);
    entry.el.onended = null;
    entry.el.loop = false;
    entry.el.pause();
  }
}

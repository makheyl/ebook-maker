import { flattenElements } from '../core/schema/tree';
import type { Project } from '../core/schema';

const MUTE_KEY = 'folio:muted';

/** Whether the book has sound effects (decides if the reader shows the effects button). */
export function bookHasEffects(project: Project): boolean {
  if (project.reader.pageTurnSound && project.sounds?.[project.reader.pageTurnSound]) return true;
  if (project.pages.some((p) => p.openSound && project.sounds?.[p.openSound])) return true;
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

/**
 * The reader's sounds. Nothing plays until the reader has tapped or pressed a key (browsers
 * block autoplay, and a book shouldn't start making noise on its own). Mute is remembered.
 */
export class SoundBoard {
  private readonly players = new Map<string, HTMLAudioElement>();
  private unlocked = false;
  private mutedValue = loadMuted();

  constructor(private readonly resolve: (id: string) => string | undefined) {}

  get muted(): boolean {
    return this.mutedValue;
  }

  /** Call on the reader's first tap or key press. */
  unlock(): void {
    this.unlocked = true;
  }

  play(soundId: string): void {
    if (!this.unlocked || this.mutedValue) return;
    let audio = this.players.get(soundId);
    if (!audio) {
      const src = this.resolve(soundId);
      if (!src) return;
      audio = new Audio(src);
      audio.preload = 'auto';
      this.players.set(soundId, audio);
    }
    try {
      audio.currentTime = 0;
    } catch {
      // Not seekable yet; it plays from wherever it is.
    }
    void audio.play()?.catch(() => undefined);
  }

  setMuted(muted: boolean): void {
    this.mutedValue = muted;
    saveMuted(muted);
    if (muted) this.stopAll();
  }

  stopAll(): void {
    for (const audio of this.players.values()) audio.pause();
  }

  destroy(): void {
    this.stopAll();
    for (const audio of this.players.values()) audio.removeAttribute('src');
    this.players.clear();
  }
}

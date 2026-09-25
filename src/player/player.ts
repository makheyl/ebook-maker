import { flattenElements } from '../core/schema/tree';
import {
  createPageTimeline,
  elementsNeedingCharSplit,
  getTransition,
  type PageTimeline,
} from '../core/animation';
import { MADE_WITH_LABEL } from '../core/brand';
import {
  autoTurnStep,
  initialReaderState,
  isNextLocked,
  nextTarget,
  reduce,
  type ReaderEffect,
  type ReaderEvent,
  type ReaderState,
} from '../core/interaction/runtime';
import { createPageView, type PageView } from '../core/render';
import type { AudioMix, BurstEffect, Page, Project, VoiceLine } from '../core/schema';
import { bookHasVoice } from '../core/voice/lines';
import { bubbleVoiceCues, type VoiceCue } from '../core/voice/cues';
import { defaultLanguageOf, resolveClip, type VoiceChoice } from '../core/voice/resolve';
import { bookHasEffects, SoundBoard } from './audio';
import { Curl } from './curl';
import { AudioMenu, buildListenCard } from './listen-card';
import { loadAudioPrefs, saveAudioPrefs, type AudioPrefs } from './audio-prefs';
import { MusicPlayer } from './music';
import { bookHasMusic, musicSectionAt } from '../core/audio/music';
import { CueClock, VoicePlayer } from './voice';
import { AudioClock } from './audio-clock';
import { Mixer } from './mixer';
import { audioSchedule, type ScheduledClip } from '../core/audio/schedule';
import { DEFAULT_MIX } from '../core/audio/mix';
import { burst } from './burst';
import { el, icon, type IconName } from './dom';
import { buildEnd } from './end';
import { PageMenu } from './menu';
import { loadPosition, savePosition } from './resume';

/**
 * The reader runtime. Framework-free so the exported book stays tiny; it only uses the same
 * core/render and core/animation modules as the editor, which is what makes the preview and
 * the exported file look and behave identically.
 */
export type PlayerOptions = {
  mount: HTMLElement;
  project: Project;
  resolveAsset: (assetId: string) => string | undefined;
  showBadge?: boolean;
  startPage?: number;
  /** In-app preview only: shows a close button and handles Escape. */
  onExit?: () => void;
  reducedMotion?: boolean;
  /** Exported books: continue where the reader left off (if the book allows it). */
  resume?: boolean;
  /**
   * Voiceover. Exported books ask "Listen in…" on the first page and remember the choice;
   * the in-app preview doesn't ask (the author's click to open it counts as the gesture),
   * doesn't remember, and keeps its language in the editor.
   */
  audio?: {
    prompt?: boolean;
    remember?: boolean;
    language?: string;
    onLanguage?: (choice: string) => void;
  };
};

/** How long a locked page waits for the reader before hinting what to tap. */
const IDLE_HINT_MS = 4000;

type Mounted = {
  page: Page;
  view: PageView;
  layer: HTMLElement;
  timeline: PageTimeline | null;
  /** When the page's voiced speech bubbles are heard. */
  cues: VoiceCue[];
  /** The page's timed audio (and its voice, as a clip at its start time). */
  clips: ScheduledClip[];
};

/** A page turn drawn as a curl; `complete` jumps it to its end and runs what follows. */
type Turning = { curl: Curl; complete: () => void };

/** The reader dragging a page's corner (forward: bottom-right; back: bottom-left). */
type CornerDrag = {
  pointerId: number;
  forward: boolean;
  startX: number;
  startY: number;
  /** Where the turn leads (null: the page is locked, so the corner only resists). */
  target: number | null;
  duration: number;
  curl: Curl | null;
  mounted: Mounted | null;
  samples: { x: number; t: number }[];
};

/** Past this share of a turn, letting go completes it; before, the page springs back. */
const TURN_THRESHOLD = 0.35;
/** A flick at this speed (px/ms) turns the page however little it was dragged. */
const FLING_SPEED = 0.6;

export class Player {
  private readonly root: HTMLElement;
  private readonly bookEl: HTMLElement;
  private readonly indicator: HTMLElement;
  private readonly progress: HTMLElement;
  private readonly live: HTMLElement;
  private readonly prevBtn: HTMLButtonElement;
  private readonly nextBtn: HTMLButtonElement;
  private readonly fsBtn: HTMLButtonElement;
  private readonly pages: Page[];
  private readonly endEl: HTMLElement;
  private readonly fxLayer: HTMLElement;
  private readonly goalEl: HTMLElement;
  private readonly menu: PageMenu | null;
  private readonly menuBtn: HTMLButtonElement | null;
  private readonly resumeEnabled: boolean;
  private readonly sounds: SoundBoard;
  private readonly muteBtn: HTMLButtonElement | null;
  /** Everything behind the page menu (made inert while it is open). */
  private readonly behindMenu: HTMLElement[];
  private state: ReaderState;
  /** Index of the page on screen (can lag `state.page` only inside `showPage`). */
  private index = -1;
  private current: Mounted | null = null;
  private outgoing: Mounted | null = null;
  private transitionAnims: Animation[] = [];
  private turning: Turning | null = null;
  private cornerDrag: CornerDrag | null = null;
  /** A page already mounted by a corner drag, taken over by showPage when the turn commits. */
  private adopt: { index: number; mounted: Mounted } | null = null;
  private scale = 1;
  private idleTimer: ReturnType<typeof setTimeout> | undefined;
  private hintTimer: ReturnType<typeof setTimeout> | undefined;
  private idleHintTimer: ReturnType<typeof setTimeout> | undefined;
  private toastTimer: ReturnType<typeof setTimeout> | undefined;
  private readonly cleanups: (() => void)[] = [];
  private readonly reducedMotion: boolean;
  private destroyed = false;

  // ─── Voiceover ───
  private readonly voice: VoicePlayer | null = null;
  private readonly cueClock: CueClock;
  private readonly mixer = new Mixer();
  private readonly clipClock: AudioClock<ScheduledClip>;
  private readonly voiceBtn: HTMLButtonElement | null = null;
  private readonly music: MusicPlayer | null = null;
  private musicOn = true;
  private musicVolume = 1;
  /** What this reader chose for this book before (null in the preview, or the first time). */
  private readonly prefs: AudioPrefs | null;
  private readonly audioMenu: AudioMenu | null = null;
  private voiceChoice: VoiceChoice = 'off';
  /** The last language chosen (what V switches back to). */
  private lastLanguage: string | undefined;
  private readToMe = false;
  /** Page 1 waits for the reader's first gesture before it plays and speaks. */
  private holding = false;
  private listenCard: HTMLElement | null = null;
  private listenPill: HTMLButtonElement | null = null;
  /** The next tap only started the book; it doesn't also turn the page. */
  private swallowTap = false;
  /** Bubble lines already heard on this page (for Listen again). */
  private saidCues: VoiceCue[] = [];
  private dispatchCount = 0;
  private dispatching = 0;
  /** The dispatch in which a tap started a voice line (it carries over a page turn). */
  private tapVoiceDispatch = -1;
  /** The page shown while the book is being built speaks too (the preview; after the card). */
  private firstShow = true;
  /** Read to me: the page said something, so it may turn by itself when it's done. */
  private pageSpoke = false;
  private autoTurnTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(private readonly opts: PlayerOptions) {
    const { project, mount } = opts;
    this.pages = project.pages;
    this.reducedMotion =
      opts.reducedMotion ??
      (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches);

    this.root = el('div', 'fp-root');
    this.root.tabIndex = 0;
    this.root.setAttribute('role', 'region');
    this.root.setAttribute('aria-roledescription', 'book');
    this.root.setAttribute('aria-label', project.title || 'Book');

    const stage = el('div', 'fp-stage');
    this.bookEl = el('div', 'fp-book');
    this.fxLayer = el('div', 'fp-fx');
    this.fxLayer.setAttribute('aria-hidden', 'true');
    this.bookEl.appendChild(this.fxLayer);
    stage.appendChild(this.bookEl);
    this.goalEl = el('div', 'fp-goal');
    this.goalEl.hidden = true;
    this.goalEl.setAttribute('role', 'status');

    const controls = el('div', 'fp-controls');
    controls.setAttribute('role', 'toolbar');
    controls.setAttribute('aria-label', 'Book navigation');
    this.prevBtn = this.button('Previous page', 'prev', () => this.prev());
    this.prevBtn.classList.add('fp-prev');
    if (!project.reader.showNavButtons) controls.classList.add('fp-minimal');
    this.nextBtn = this.button('Next', 'next', () => this.next());
    this.nextBtn.classList.add('fp-next');
    this.indicator = el('span', 'fp-indicator');
    this.fsBtn = this.button('Enter full screen', 'fullscreen', () => this.toggleFullscreen());
    controls.append(this.prevBtn, this.indicator, this.nextBtn);
    if (project.reader.showPageMenu && project.pages.length > 1) {
      this.menu = new PageMenu({
        project,
        resolveAsset: opts.resolveAsset,
        onPick: (i) => {
          this.closeMenu(false);
          this.goTo(i);
        },
        onClose: () => this.closeMenu(),
      });
      this.menuBtn = this.button('All pages', 'grid', () => this.openMenu());
      this.menuBtn.setAttribute('aria-haspopup', 'dialog');
      controls.append(this.menuBtn);
    } else {
      this.menu = null;
      this.menuBtn = null;
    }
    this.sounds = new SoundBoard(opts.resolveAsset, this.mixer);
    this.clipClock = new AudioClock((item) => this.playClip(item));
    // The preview opens from the author's click, so audio may start right away.
    if (opts.audio?.prompt === false) this.mixer.start();
    this.cueClock = new CueClock((cue) => {
      this.saidCues.push(cue);
      this.sayLine(cue.line, 'queue');
    });
    this.prefs = opts.audio?.remember !== false ? loadAudioPrefs(project.id) : null;
    const languages = project.voiceover?.languages ?? [];
    if (languages.length && bookHasVoice(project)) {
      this.voice = new VoicePlayer(opts.resolveAsset, this.root, this.mixer);
      this.voice.onBlocked = () => this.showPill('Tap to listen');
      this.voice.onIdle = () => this.armAutoTurn();
      this.voice.onBusyChange = (busy) => this.music?.duck(busy);
      this.voiceChoice = this.initialVoiceChoice();
      this.lastLanguage =
        this.voiceChoice !== 'off' ? this.voiceChoice : defaultLanguageOf(project);
    }
    if (bookHasMusic(project)) {
      this.music = new MusicPlayer(opts.resolveAsset, this.mixer, {
        crossfadeMs: project.music.crossfadeMs,
        ducking: project.music.ducking,
      });
      this.musicOn = this.prefs?.music ?? true;
      this.musicVolume = this.prefs?.musicVolume ?? 1;
      this.music.setVolume(this.musicVolume);
      this.music.setEnabled(this.musicOn);
    }
    if (this.voice || this.music) {
      this.voiceBtn = this.button('Audio', this.voice ? 'voice' : 'music', () =>
        this.openAudioMenu(),
      );
      this.voiceBtn.setAttribute('aria-haspopup', 'dialog');
      this.voiceBtn.classList.add('fp-voice-btn');
      controls.append(this.voiceBtn);
      this.audioMenu = new AudioMenu({
        languages: this.voice ? languages : [],
        music: !!this.music,
        onLanguage: (choice) => {
          this.setVoiceChoice(choice);
          this.closeAudioMenu();
        },
        onReadToMe: (on) => this.setReadToMe(on),
        onListenAgain: () => {
          this.closeAudioMenu();
          this.listenAgain();
        },
        onMusic: (on) => this.setMusic(on),
        onMusicVolume: (v) => this.setMusicVolume(v),
        onClose: () => this.closeAudioMenu(),
      });
    }
    // Page 1 waits for the reader's first tap when the book would make sound on its own
    // (voiceover, or timed sounds): browsers only let audio start after a tap.
    const timedAudio = project.pages.some((p) => p.audio?.length);
    this.holding = (!!this.voice || !!this.music || timedAudio) && opts.audio?.prompt !== false;
    if (bookHasEffects(project)) {
      this.muteBtn = this.button('Mute sound effects', 'soundOn', () => this.toggleMute());
      controls.append(this.muteBtn);
      this.updateMute();
    } else {
      this.muteBtn = null;
    }
    controls.append(this.fsBtn);
    if (opts.onExit) {
      const close = this.button('Close preview', 'close', () => opts.onExit?.());
      close.classList.add('fp-close');
      this.root.appendChild(close);
    }

    const bar = el('div', 'fp-progress');
    this.progress = el('div', 'fp-progress-bar');
    bar.appendChild(this.progress);
    bar.setAttribute('aria-hidden', 'true');

    this.live = el('div', 'fl-sr-only');
    this.live.setAttribute('aria-live', 'polite');

    this.endEl = buildEnd({
      onRestart: () => this.restart(),
      onBack: () => this.prev(),
      onPages: this.menu ? () => this.openMenu() : undefined,
    });
    this.root.append(stage, this.goalEl, controls, bar, this.endEl, this.live);
    this.behindMenu = [stage, this.goalEl, controls, this.endEl];
    if (this.menu) this.root.appendChild(this.menu.el);
    if (this.audioMenu) this.root.appendChild(this.audioMenu.el);
    if (opts.showBadge) {
      const badge = el('div', 'fp-badge', MADE_WITH_LABEL);
      this.root.appendChild(badge);
    }
    mount.replaceChildren(this.root);

    this.bindEvents(stage);
    this.layout();
    this.resumeEnabled = !!opts.resume && project.reader.rememberPosition;
    const saved =
      this.resumeEnabled && opts.startPage === undefined
        ? loadPosition(project.id, this.pages.length)
        : null;
    const start = Math.max(0, Math.min(saved?.page ?? opts.startPage ?? 0, this.pages.length - 1));
    this.state = { ...initialReaderState(start), history: saved?.history ?? [] };
    this.showPage(start, 0);
    this.firstShow = false;
    this.updateVoiceButton();
    this.root.focus({ preventScroll: true });
    if (this.holding) this.askToListen();
    if (saved) this.welcomeBack(start);
  }

  // ─── Public API ──────────────────────────────────────────────────────────────

  get pageIndex(): number {
    return this.index;
  }

  get pageCount(): number {
    return this.pages.length;
  }

  /** For tests: the sound effects playing now and their gains. */
  debugAudio(): {
    effects: { src: string; key: string; gain: number }[];
    music: { trackId: string | null; level: number; gain: number } | null;
  } {
    return { effects: this.sounds.debug(), music: this.music?.debug() ?? null };
  }

  /** Freezes the current page at a moment (used by tests to compare with the editor). */
  seek(group: number, ms: number): void {
    this.finishTransition();
    this.current?.timeline?.seek(group, ms);
  }

  /** Advances the next click group on this page, or turns to the next page. */
  next(): void {
    if (this.finishTransition()) return;
    this.dispatch({ type: 'next', groupRunning: this.groupRunning() });
  }

  /** Goes back: to the page the reader came from (after a choice), else the previous page. */
  prev(): void {
    this.finishTransition();
    this.dispatch({ type: 'prev' });
  }

  /** Jumps to page `i`. direction 1/-1 animates the page transition; 0 shows it immediately. */
  goTo(i: number, direction?: 1 | -1 | 0): void {
    this.finishTransition();
    this.dispatch({ type: 'goto', page: i, direction });
  }

  /** Starts the book again from the first page. */
  restart(): void {
    this.finishTransition();
    this.dispatch({ type: 'restart' });
  }

  /** Reader state (for tests and the in-app preview). */
  get readerState(): Readonly<ReaderState> {
    return this.state;
  }

  // ─── State machine ───────────────────────────────────────────────────────────

  private groupRunning(): boolean {
    return !!this.current?.timeline?.isRunning(this.state.group);
  }

  private dispatch(event: ReaderEvent): void {
    if (this.destroyed) return;
    this.dispatching = ++this.dispatchCount;
    const { state, effects } = reduce(this.opts.project, this.state, event);
    this.state = state;
    for (const effect of effects) this.apply(effect);
    this.updateChrome();
    this.armIdleHint();
    if (this.resumeEnabled) {
      savePosition(
        this.opts.project.id,
        state.ended ? null : { page: state.page, history: state.history },
      );
    }
  }

  private apply(effect: ReaderEffect): void {
    const tl = this.current?.timeline;
    switch (effect.type) {
      case 'showPage':
        this.showPage(effect.page, effect.direction);
        break;
      case 'playGroup':
        void tl?.play(effect.group).then(() => this.armAutoTurn());
        if (this.current) {
          this.clipClock.schedule(this.current.clips, effect.group);
          this.cueClock.schedule(this.current.cues, effect.group);
        }
        break;
      case 'finishGroup':
        tl?.finish(effect.group);
        // Skipping ahead: voice lines still queue, a burst of sound effects would be noise.
        this.clipClock.flush(effect.group, (i) => i.clip.source.kind === 'voice');
        this.cueClock.flush(effect.group);
        break;
      case 'playStep': {
        void tl?.playStep(effect.stepId);
        // A tap that shows a voiced bubble says its line, like any tap line.
        const cue = this.current?.cues.find((c) => c.stepId === effect.stepId);
        if (cue) {
          this.saidCues.push(cue);
          this.sayTapLine(cue.line);
        }
        if (this.current) this.clipClock.fireStep(this.current.clips, effect.stepId);
        break;
      }
      case 'playVoice':
        this.sayTapLine(effect.line, effect.mix);
        break;
      case 'hint':
        this.hint();
        break;
      case 'unlocked':
        this.say('The next page is unlocked.');
        this.updateGoal();
        break;
      case 'showEnd':
        this.showEnd(true);
        break;
      case 'hideEnd':
        this.showEnd(false);
        break;
      case 'burst':
        this.burstAt(effect.elementId, effect.effect);
        break;
      case 'playSound':
        this.sounds.play(effect.soundId, {
          ...(effect.mix ? { mix: effect.mix } : {}),
          fileMs: this.fileMs(effect.soundId),
        });
        break;
      case 'collect':
        this.markCollected(effect.elementId, true);
        this.updateGoal();
        this.say(
          effect.goal ? `Found ${effect.count} of ${effect.goal}.` : `Collected ${effect.count}.`,
        );
        break;
    }
  }

  private tap(elementId: string): void {
    this.finishTransition();
    this.dispatch({ type: 'tap', elementId, groupRunning: this.groupRunning() });
  }

  /** Shows the reader where to tap when the page can't be turned yet. */
  private hint(): void {
    if (!this.opts.project.reader.hints) return;
    this.say('Tap something on the page to continue.');
    this.root.classList.remove('fp-hinting');
    void this.root.offsetWidth;
    this.root.classList.add('fp-hinting');
    clearTimeout(this.hintTimer);
    this.hintTimer = setTimeout(() => this.root.classList.remove('fp-hinting'), 1600);
  }

  private toggleMute(): void {
    this.sounds.setMuted(!this.sounds.muted);
    this.updateMute();
    this.say(this.sounds.muted ? 'Sound effects off.' : 'Sound effects on.');
  }

  private updateMute(): void {
    if (!this.muteBtn) return;
    const muted = this.sounds.muted;
    this.muteBtn.replaceChildren(icon(muted ? 'soundOff' : 'soundOn'));
    this.muteBtn.setAttribute('aria-pressed', String(muted));
    const label = muted ? 'Unmute sound effects' : 'Mute sound effects';
    this.muteBtn.setAttribute('aria-label', label);
    this.muteBtn.title = label;
  }

  private say(text: string): void {
    this.live.textContent = text;
  }

  /** On a locked page, hint after the reader has been idle for a while. */
  private armIdleHint(): void {
    clearTimeout(this.idleHintTimer);
    if (!this.opts.project.reader.hints || this.state.ended || this.menu?.isOpen) return;
    if (!isNextLocked(this.opts.project, this.state)) return;
    this.idleHintTimer = setTimeout(() => this.hint(), IDLE_HINT_MS);
  }

  private burstAt(elementId: string, effect: BurstEffect): void {
    if (this.reducedMotion || !this.current) return;
    const nodes = this.current.view.getNodes(elementId);
    const book = this.bookEl.getBoundingClientRect();
    const r = (nodes?.anim ?? nodes?.frame)?.getBoundingClientRect();
    const x = r ? r.left + r.width / 2 - book.left : book.width / 2;
    const y = r ? r.top + r.height / 2 - book.top : book.height / 2;
    const spread = Math.max(80, Math.min(book.width, book.height) * 0.28);
    void burst(this.fxLayer, x, y, effect, spread);
  }

  /** Dims a collected item and gives it a check mark (it stays tappable but counts once). */
  private markCollected(elementId: string, animate: boolean): void {
    const nodes = this.current?.view.getNodes(elementId);
    if (!nodes) return;
    nodes.frame.setAttribute('data-collected', '');
    if (animate && !this.reducedMotion) {
      nodes.anim.animate(
        [{ transform: 'scale(1)' }, { transform: 'scale(1.25)' }, { transform: 'scale(1)' }],
        { duration: 420, easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)', composite: 'add' },
      );
      this.burstAt(elementId, 'sparkles');
    }
  }

  /** The "Find 3 stars · 1/3" badge for pages with a goal. */
  private updateGoal(): void {
    const page = this.pages[this.index];
    const goal = page?.goal;
    if (!page || !goal || goal.count <= 0) {
      this.goalEl.hidden = true;
      return;
    }
    const count = this.state.collected[page.id]?.length ?? 0;
    const done = count >= goal.count;
    this.goalEl.hidden = false;
    this.goalEl.classList.toggle('fp-goal-done', done);
    this.goalEl.replaceChildren(
      icon('star'),
      el('span', 'fp-goal-label', goal.label || 'Find them all'),
      el('span', 'fp-goal-count', `${Math.min(count, goal.count)} / ${goal.count}`),
    );
    this.goalEl.setAttribute(
      'aria-label',
      `${goal.label || 'Find them all'}: ${Math.min(count, goal.count)} of ${goal.count}${done ? ', done' : ''}`,
    );
  }

  private openMenu(): void {
    if (!this.menu) return;
    this.finishTransition();
    clearTimeout(this.idleHintTimer);
    this.root.classList.add('fp-menu-open');
    // A modal menu: keyboard and screen-reader focus stay inside it.
    for (const node of this.behindMenu) node.inert = true;
    const back = this.state.ended
      ? this.endEl.querySelector<HTMLElement>('.fp-end-primary')
      : this.menuBtn;
    this.menu.open(this.index, back);
  }

  private closeMenu(restoreFocus = true): void {
    if (!this.menu?.isOpen) return;
    this.root.classList.remove('fp-menu-open');
    for (const node of this.behindMenu) node.inert = false;
    this.menu.close();
    if (!restoreFocus) this.root.focus({ preventScroll: true });
    this.armIdleHint();
  }

  /** A small note after resuming, with a way to start from the beginning instead. */
  private welcomeBack(page: number): void {
    const toast = el('div', 'fp-toast');
    toast.setAttribute('role', 'status');
    const text = el('span', '', `Welcome back! Continuing on page ${page + 1}.`);
    const again = el('button', 'fp-toast-btn', 'Start over');
    again.type = 'button';
    const dismiss = () => {
      clearTimeout(this.toastTimer);
      toast.remove();
    };
    again.addEventListener('click', (e) => {
      e.stopPropagation();
      dismiss();
      this.restart();
    });
    toast.append(text, again);
    this.root.appendChild(toast);
    this.toastTimer = setTimeout(dismiss, 7000);
  }

  private showEnd(show: boolean): void {
    if (show) {
      this.voice?.stop();
      this.cueClock.clear();
      this.clipClock.clear();
    }
    this.music?.setEndScreen(show);
    this.endEl.hidden = !show;
    this.root.classList.toggle('fp-ended', show);
    if (this.current) this.current.layer.inert = show;
    if (show) {
      this.say('The End.');
      this.endEl
        .querySelector<HTMLButtonElement>('.fp-end-primary')
        ?.focus({ preventScroll: true });
    } else if (this.endEl.contains(document.activeElement)) {
      this.root.focus({ preventScroll: true });
    }
  }

  /** Shows page `i` (effect of the state machine). */
  private showPage(i: number, direction: 1 | -1 | 0): void {
    if (i < 0 || i >= this.pages.length || this.destroyed) return;
    if (i === this.index) {
      // Restarting on the same page: replay it from the start.
      if (this.current?.timeline) {
        if (document.activeElement && this.current.layer.contains(document.activeElement)) {
          this.root.focus({ preventScroll: true });
        }
        this.current.timeline.cancel();
        this.unmountPage(this.current);
        this.current = null;
        this.index = -1;
      } else return;
    }
    const adopted = this.adopt?.index === i ? this.adopt.mounted : null;
    this.adopt = null;
    this.finishTransition();
    // Leaving a page stops its voice — except a line a tap just started while turning the
    // page (it finishes; the new page's voice waits behind it).
    if (this.tapVoiceDispatch === this.dispatching) this.voice?.clearQueue();
    else this.voice?.stop();
    this.cueClock.clear();
    this.clipClock.clear();
    this.sounds.stopPrefix('page:', 150);
    this.saidCues = [];
    this.cancelAutoTurn();
    this.pageSpoke = false;
    const speak = direction === 1 || this.firstShow;
    const restartMusic = direction === 0 && !this.firstShow;
    // A story button that turned the page is about to disappear: keep keyboard focus in the book.
    const active = document.activeElement;
    const hadFocus = !!active && !!this.current?.layer.contains(active);
    const page = this.pages[i]!;
    const incoming = adopted ?? this.prepare(i, direction);
    incoming.layer.removeAttribute('aria-hidden');
    incoming.layer.inert = false;
    const previous = this.current;
    this.current = incoming;
    this.index = i;

    const transition = getTransition(
      direction === -1 ? (this.pages[i + 1]?.transition.preset ?? 'none') : page.transition.preset,
    );
    const duration =
      direction === -1 ? (this.pages[i + 1]?.transition.duration ?? 0) : page.transition.duration;
    const animated =
      !adopted && previous && direction !== 0 && transition.id !== 'none' && duration > 0;

    if (hadFocus) this.root.focus({ preventScroll: true });
    if (previous) {
      previous.layer.setAttribute('aria-hidden', 'true');
      previous.layer.inert = true;
      this.outgoing = previous;
    }

    const afterTransition = () => {
      this.transitionAnims = [];
      if (this.outgoing) this.unmountPage(this.outgoing);
      this.outgoing = null;
      if (direction !== -1 && this.current === incoming && !this.holding) {
        this.startPage(incoming, speak);
      }
    };

    if (animated && transition.curl && !this.reducedMotion) {
      // Forward: the page on screen curls away. Back: the previous page uncurls over it.
      const forward = direction === 1;
      const curl = new Curl(
        this.bookEl,
        forward ? previous.layer : incoming.layer,
        forward ? incoming.layer : previous.layer,
        forward ? 0 : 1,
      );
      let settled = false;
      const complete = () => {
        if (settled) return;
        settled = true;
        if (this.turning?.curl === curl) this.turning = null;
        curl.destroy();
        afterTransition();
      };
      this.turning = { curl, complete };
      void curl.run(forward ? 1 : 0, duration).then(complete);
    } else if (animated) {
      const kf = transition.build(direction as 1 | -1);
      const d = this.reducedMotion ? Math.min(duration, 200) : duration;
      const easing = 'cubic-bezier(0.65, 0, 0.35, 1)';
      this.bookEl.classList.toggle('fp-3d', !!kf.perspective);
      const opts: KeyframeAnimationOptions = { duration: d, easing, fill: 'both' };
      const inKf = this.reducedMotion ? [{ opacity: 0 }, { opacity: 1 }] : kf.in;
      const outKf = this.reducedMotion ? [{ opacity: 1 }, { opacity: 0 }] : kf.out;
      this.transitionAnims = [
        ...(inKf ? [incoming.layer.animate(inKf, opts)] : []),
        ...(outKf && previous ? [previous.layer.animate(outKf, opts)] : []),
      ];
      const done = this.transitionAnims.map((a) => a.finished.catch(() => undefined));
      void Promise.all(done).then(() => {
        for (const a of this.transitionAnims) a.cancel();
        afterTransition();
      });
    } else {
      afterTransition();
    }

    // Music follows the page (once the reader's first tap has let audio start).
    if (!this.holding) this.updateMusic(restartMusic);
    for (const id of this.state.collected[page.id] ?? []) this.markCollected(id, false);
    const turn = this.opts.project.reader.pageTurnSound;
    if (turn && direction !== 0) this.sounds.play(turn);
    this.preloadAround(i);
    this.updateChrome();
    this.updateGoal();
    this.armIdleHint();
    this.say(`Page ${i + 1} of ${this.pages.length}`);
  }

  destroy(): void {
    this.destroyed = true;
    this.cleanups.forEach((fn) => fn());
    clearTimeout(this.idleTimer);
    clearTimeout(this.hintTimer);
    clearTimeout(this.idleHintTimer);
    clearTimeout(this.toastTimer);
    this.menu?.close();
    this.sounds.destroy();
    this.voice?.destroy();
    this.cueClock.clear();
    this.clipClock.clear();
    this.music?.destroy();
    this.mixer.destroy();
    this.cancelAutoTurn();
    for (const a of this.transitionAnims) a.cancel();
    this.turning?.curl.destroy();
    this.cancelCornerDrag();
    if (this.outgoing) this.unmountPage(this.outgoing);
    if (this.current) this.unmountPage(this.current);
    this.root.remove();
  }

  // ─── Pages ───────────────────────────────────────────────────────────────────

  /** Mounts page `i` with its timeline ready (entrances hidden until it plays). */
  private prepare(i: number, direction: 1 | -1 | 0): Mounted {
    const page = this.pages[i]!;
    const mounted = this.mountPage(page);
    mounted.timeline = createPageTimeline(page, (id) => mounted.view.getNodes(id), {
      pageSize: this.opts.project.pageSize,
      reducedMotion: this.reducedMotion,
    });
    mounted.timeline.startIdle();
    // Going back shows the page as it ends; going forward plays it.
    if (direction === -1) mounted.timeline.finishAll();
    mounted.cues = bubbleVoiceCues(page, mounted.timeline.entrances);
    mounted.clips = audioSchedule(page, mounted.timeline.starts);
    if (page.voiceover) {
      // The page's voice is a clip at its start time, in the same clock as the rest.
      mounted.clips.unshift({
        clip: {
          id: 'page-voice',
          source: { kind: 'voice', line: page.voiceover },
          start: { kind: 'time', group: 0, at: page.voiceoverAt ?? 0 },
          mix: DEFAULT_MIX,
          loop: false,
        },
        group: 0,
        at: page.voiceoverAt ?? 0,
      });
    }
    return mounted;
  }

  private mountPage(page: Page): Mounted {
    const view = createPageView({
      pageSize: this.opts.project.pageSize,
      mode: 'player',
      resolveAsset: this.opts.resolveAsset,
      splitTextFor: elementsNeedingCharSplit,
      lang: this.opts.project.language,
    });
    view.update(page, this.opts.project.assets, this.opts.project.characters);
    const layer = el('div', 'fp-page');
    layer.setAttribute('role', 'group');
    layer.setAttribute('aria-roledescription', 'page');
    const index = this.pages.indexOf(page);
    layer.setAttribute('aria-label', `Page ${index + 1} of ${this.pages.length}`);
    const scaler = el('div', 'fp-scaler');
    scaler.style.transform = `scale(${this.scale})`;
    scaler.appendChild(view.root);
    layer.appendChild(scaler);
    this.bookEl.appendChild(layer);
    return { page, view, layer, timeline: null, cues: [], clips: [] };
  }

  private unmountPage(m: Mounted): void {
    m.timeline?.cancel();
    m.view.destroy();
    m.layer.remove();
  }

  private finishTransition(): boolean {
    // A corner still held by the reader is let go (springs back) when something else turns.
    if (this.cornerDrag) this.cancelCornerDrag();
    if (this.turning) {
      this.turning.complete();
      return true;
    }
    if (!this.transitionAnims.length) return false;
    for (const a of this.transitionAnims) {
      try {
        a.finish();
      } catch {
        a.cancel();
      }
    }
    return true;
  }

  /** Warms the next pages' images (decoded) so turning feels instant. */
  private preloadAround(i: number): void {
    for (const page of this.pages.slice(i + 1, i + 3)) {
      const ids = flattenElements(page.elements).flatMap((e) =>
        e.type === 'image' ? [e.assetId] : [],
      );
      if (page.background.type === 'image') ids.push(page.background.assetId);
      for (const id of ids) {
        const src = this.opts.resolveAsset(id);
        if (!src) continue;
        const img = new Image();
        img.decoding = 'async';
        img.src = src;
        void img.decode?.().catch(() => undefined);
      }
    }
  }

  // ─── Layout & chrome ─────────────────────────────────────────────────────────

  private layout(): void {
    const { width: W, height: H } = this.opts.project.pageSize;
    const rect = this.root.getBoundingClientRect();
    const availW = Math.max(1, rect.width - 24);
    const availH = Math.max(1, rect.height - 88);
    this.scale = Math.min(availW / W, availH / H);
    this.bookEl.style.width = `${W * this.scale}px`;
    this.bookEl.style.height = `${H * this.scale}px`;
    for (const scaler of this.bookEl.querySelectorAll<HTMLElement>('.fp-scaler')) {
      scaler.style.transform = `scale(${this.scale})`;
    }
  }

  private updateChrome(): void {
    if (this.index < 0) return;
    const n = this.pages.length;
    const { ended, history, group } = this.state;
    this.indicator.textContent = `${this.index + 1} / ${n}`;
    this.progress.style.width = `${(ended ? 1 : (this.index + 1) / n) * 100}%`;
    this.prevBtn.disabled = this.index === 0 && !history.length && !ended;
    const tl = this.current?.timeline;
    const moreOnPage = !!tl && group + 1 < tl.groupCount;
    const locked = !moreOnPage && isNextLocked(this.opts.project, this.state);
    const toEnd = !moreOnPage && nextTarget(this.opts.project, this.index) === 'end';
    this.nextBtn.disabled = ended;
    this.nextBtn.classList.toggle('fp-locked', locked);
    this.nextBtn.replaceChildren(icon(locked ? 'lock' : 'next'));
    const label = moreOnPage
      ? 'Next animation'
      : locked
        ? 'Next page (locked — finish this page first)'
        : toEnd
          ? 'Finish the book'
          : 'Next page';
    this.nextBtn.setAttribute('aria-label', label);
    this.nextBtn.title = label;
  }

  private button(label: string, name: IconName, onClick: () => void): HTMLButtonElement {
    const b = el('button', 'fp-btn');
    b.type = 'button';
    b.setAttribute('aria-label', label);
    b.title = label;
    b.appendChild(icon(name));
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      onClick();
    });
    return b;
  }

  private toggleFullscreen(): void {
    if (document.fullscreenElement) void document.exitFullscreen?.();
    else void this.root.requestFullscreen?.().catch(() => undefined);
  }

  // ─── Voiceover ───────────────────────────────────────────────────────────────

  /** Remembered choice → the editor's (preview) → the reader's browser language → default. */
  private initialVoiceChoice(): VoiceChoice {
    const { project } = this.opts;
    const codes = project.voiceover.languages.map((l) => l.code);
    const valid = (c: string | undefined): c is string => !!c && (c === 'off' || codes.includes(c));
    const saved = this.prefs;
    if (saved) this.readToMe = saved.readToMe;
    if (valid(saved?.lang)) return saved.lang;
    if (valid(this.opts.audio?.language)) return this.opts.audio.language;
    const browser = (typeof navigator !== 'undefined' ? navigator.languages : []) ?? [];
    for (const tag of browser) {
      const lower = tag.toLowerCase();
      const hit = codes.find((c) => lower === c.toLowerCase() || lower.split('-')[0] === c);
      if (hit) return hit;
    }
    return defaultLanguageOf(project) ?? 'off';
  }

  private savePrefs(): void {
    if (this.opts.audio?.remember === false) return;
    saveAudioPrefs(this.opts.project.id, {
      ...(this.voice ? { lang: this.voiceChoice } : {}),
      readToMe: this.readToMe,
      music: this.musicOn,
      musicVolume: this.musicVolume,
    });
  }

  private setMusic(on: boolean): void {
    this.musicOn = on;
    this.music?.setEnabled(on);
    this.savePrefs();
    this.updateVoiceButton();
    this.say(on ? 'Music on.' : 'Music off.');
  }

  private setMusicVolume(v: number): void {
    this.musicVolume = v;
    this.music?.setVolume(v);
    this.savePrefs();
  }

  /** The music for the page on screen (keeps playing, crossfades, or fades out). */
  private updateMusic(restart: boolean): void {
    this.music?.update(musicSectionAt(this.opts.project, this.index), restart);
  }

  /** A page arrives and starts: its animations, its voice (going forward), its bubble lines. */
  private startPage(m: Mounted, speak: boolean): void {
    void m.timeline?.play(0).then(() => this.armAutoTurn());
    if (!speak) return;
    this.pageSpoke = !!resolveClip(
      m.page.voiceover,
      this.voice ? this.voiceChoice : 'off',
      defaultLanguageOf(this.opts.project),
    );
    this.clipClock.schedule(m.clips, 0);
    this.cueClock.schedule(m.cues, 0);
  }

  /** One of the page's timed sounds or voice lines, at its moment. */
  private playClip({ clip, group }: ScheduledClip): void {
    if (clip.source.kind === 'sound') {
      this.sounds.play(clip.source.soundId, {
        mix: clip.mix,
        loop: clip.loop,
        key: `page:${clip.id}`,
        fileMs: this.fileMs(clip.source.soundId),
      });
    } else if (group === null) {
      this.sayTapLine(clip.source.line, clip.mix);
    } else {
      this.sayLine(clip.source.line, 'queue', clip.mix);
    }
  }

  private fileMs(soundId: string): number | undefined {
    const d = this.opts.project.sounds[soundId]?.duration;
    return d !== undefined ? d * 1000 : undefined;
  }

  /**
   * Read to me: once the page has finished (its voice, its bubble lines, its animations), the
   * book goes on after a short pause — unless it has to wait for the reader (see autoTurnStep).
   * A page with nothing to say waits for the reader too.
   */
  private armAutoTurn(): void {
    clearTimeout(this.autoTurnTimer);
    const ready = () =>
      this.readToMe &&
      this.voiceChoice !== 'off' &&
      this.pageSpoke &&
      !this.holding &&
      !this.destroyed &&
      !this.menu?.isOpen &&
      !this.audioMenu?.isOpen &&
      !this.turning &&
      !this.transitionAnims.length &&
      !this.voice?.busy &&
      !this.cueClock.pending &&
      !this.clipClock.pending((i) => i.clip.source.kind === 'voice') &&
      !this.groupRunning() &&
      autoTurnStep(this.opts.project, this.state) === 'next';
    if (!ready()) return;
    this.autoTurnTimer = setTimeout(() => {
      if (!ready()) return;
      // The next page (or click group) keeps reading: it speaks and arms again.
      this.dispatch({ type: 'next', groupRunning: false });
    }, 1000);
  }

  private cancelAutoTurn(): void {
    clearTimeout(this.autoTurnTimer);
  }

  /** Says a line in the reader's language (or the default); false if there's nothing to say. */
  private sayLine(
    line: VoiceLine | undefined,
    mode: 'interrupt' | 'queue',
    mix?: AudioMix,
  ): boolean {
    if (!this.voice || this.holding) return false;
    const clip = resolveClip(line, this.voiceChoice, defaultLanguageOf(this.opts.project));
    if (clip) this.voice.say(clip, mode, mix);
    return !!clip;
  }

  /** A tap's line interrupts whatever is being said. */
  private sayTapLine(line: VoiceLine, mix?: AudioMix): void {
    this.tapVoiceDispatch = this.dispatching;
    this.sayLine(line, 'interrupt', mix);
  }

  private setVoiceChoice(choice: VoiceChoice): void {
    const { languages } = this.opts.project.voiceover;
    if (choice !== 'off' && !languages.some((l) => l.code === choice)) return;
    this.voiceChoice = choice;
    if (choice !== 'off') this.lastLanguage = choice;
    // The new language is used from the next line on ("Listen again" replays this page).
    this.voice?.stop();
    this.savePrefs();
    this.updateVoiceButton();
    this.opts.audio?.onLanguage?.(choice);
    const name = languages.find((l) => l.code === choice)?.name;
    this.say(name ? `Voiceover: ${name}.` : 'Voiceover off.');
  }

  private toggleVoice(): void {
    if (!this.voice) return;
    this.setVoiceChoice(this.voiceChoice === 'off' ? (this.lastLanguage ?? 'off') : 'off');
  }

  private setReadToMe(on: boolean): void {
    this.readToMe = on;
    this.savePrefs();
    this.updateVoiceButton();
    if (on) this.armAutoTurn();
    else this.cancelAutoTurn();
    this.say(on ? 'The pages will turn by themselves.' : 'You turn the pages.');
  }

  /** Replays this page's voice and the bubble lines heard so far, in the current language. */
  private listenAgain(): void {
    const page = this.current?.page;
    if (!this.voice || !page) return;
    this.release();
    this.voice.stop();
    this.sayLine(page.voiceover, 'interrupt');
    for (const cue of this.saidCues) this.sayLine(cue.line, 'queue');
  }

  private updateVoiceButton(): void {
    const btn = this.voiceBtn;
    if (!btn) return;
    this.audioMenu?.update({
      choice: this.voiceChoice,
      readToMe: this.readToMe,
      music: this.musicOn,
      musicVolume: this.musicVolume,
    });
    if (!this.voice) {
      btn.replaceChildren(icon('music'));
      const label = this.musicOn ? 'Audio: music on. Change' : 'Audio: music off. Change';
      btn.setAttribute('aria-label', label);
      btn.title = label;
      return;
    }
    const { languages } = this.opts.project.voiceover;
    const off = this.voiceChoice === 'off';
    const name = languages.find((l) => l.code === this.voiceChoice)?.name;
    btn.replaceChildren(icon(off ? 'voiceOff' : 'voice'));
    if (!off) btn.appendChild(el('span', 'fp-voice-code', this.voiceChoice.toUpperCase()));
    const label = off ? 'Voiceover off. Change language' : `Voiceover: ${name}. Change language`;
    btn.setAttribute('aria-label', label);
    btn.title = label;
  }

  private openAudioMenu(): void {
    if (!this.audioMenu) return;
    this.release();
    this.updateVoiceButton();
    this.root.classList.add('fp-audio-open');
    this.audioMenu.open(this.voiceBtn);
  }

  private closeAudioMenu(): void {
    this.root.classList.remove('fp-audio-open');
    this.audioMenu?.close();
  }

  /** "Listen in: English · Tagalog · Read it myself" — or, with a remembered choice, a pill. */
  private askToListen(): void {
    const { project } = this.opts;
    if (!this.voice) {
      this.showPill('Tap to start');
      return;
    }
    const remembered = !!this.prefs?.lang;
    if (remembered) {
      this.showPill(this.voiceChoice === 'off' ? 'Tap to start' : 'Tap to listen');
      return;
    }
    const card = buildListenCard({
      title: project.title || 'Book',
      languages: project.voiceover.languages,
      preselected: this.voiceChoice,
      onPick: (choice) => {
        this.setVoiceChoice(choice);
        this.release();
      },
    });
    this.listenCard = card.el;
    this.root.classList.add('fp-listening');
    this.root.appendChild(card.el);
    card.focus();
  }

  private showPill(text: string): void {
    if (!this.listenPill) {
      const pill = el('button', 'fp-listen-pill');
      pill.type = 'button';
      pill.addEventListener('click', (e) => {
        e.stopPropagation();
        this.release();
      });
      this.root.appendChild(pill);
      this.listenPill = pill;
    }
    this.listenPill.textContent = text;
    this.voiceBtn?.classList.add('fp-pulse');
  }

  /**
   * The reader's first gesture: audio may play from now on (it also primes the voice element
   * for iOS). A held first page starts now; a line the browser refused plays now.
   */
  private release(): void {
    this.sounds.unlock();
    this.mixer.start();
    this.voice?.prime();
    this.music?.prime();
    this.listenPill?.remove();
    this.listenPill = null;
    this.voiceBtn?.classList.remove('fp-pulse');
    if (this.listenCard) {
      this.listenCard.remove();
      this.listenCard = null;
      this.root.classList.remove('fp-listening');
      this.root.focus({ preventScroll: true });
    }
    if (this.voice?.isBlocked) this.voice.resumeBlocked();
    if (!this.holding) return;
    this.holding = false;
    if (this.current && !this.state.ended) this.startPage(this.current, true);
    this.updateMusic(false);
  }

  // ─── Dragging the corner (page curl) ─────────────────────────────────────────

  /**
   * Whether a pointer going down here grabs a page corner: bottom-right turns forward,
   * bottom-left back — only when that turn would use the curl. The target comes from the pure
   * reducer, so the reader's state doesn't change until the turn completes.
   */
  private grabCorner(e: PointerEvent): CornerDrag | null {
    if (this.reducedMotion || this.state.ended || this.menu?.isOpen || this.holding) return null;
    if (e.button !== 0 || this.turning || this.transitionAnims.length) return null;
    const box = this.bookEl.getBoundingClientRect();
    const zone = Math.max(44, Math.min(box.width, box.height) * 0.18);
    const x = e.clientX - box.left;
    const y = e.clientY - box.top;
    if (y < box.height - zone || y > box.height) return null;
    const forward = x > box.width - zone && x <= box.width;
    if (!forward && !(x >= 0 && x < zone)) return null;
    // Grabbing the corner means "turn": animations still playing are finished first.
    const { effects } = reduce(
      this.opts.project,
      this.state,
      forward ? { type: 'next', groupRunning: false } : { type: 'prev' },
    );
    const show = effects.find((f) => f.type === 'showPage');
    const locked = forward && !show && effects.some((f) => f.type === 'hint');
    if (!show && !locked) return null;
    if (show && show.direction !== (forward ? 1 : -1)) return null;
    const target = show ? show.page : null;
    // The transition of the page being arrived at (forward) or left (back).
    const transition = locked
      ? this.pages[this.index + 1]?.transition
      : this.pages[forward ? target! : this.index]?.transition;
    if (transition?.preset !== 'curl' || (!locked && !(transition.duration > 0))) return null;
    return {
      pointerId: e.pointerId,
      forward,
      startX: e.clientX,
      startY: e.clientY,
      target,
      duration: transition?.duration ?? 600,
      curl: null,
      mounted: null,
      samples: [{ x: e.clientX, t: e.timeStamp }],
    };
  }

  /** Starts drawing once the pointer really moves (a tap in the corner stays a tap). */
  private beginCornerDrag(drag: CornerDrag): void {
    const current = this.current;
    if (!current) return;
    if (this.groupRunning()) current.timeline?.finish(this.state.group);
    if (drag.target === null) {
      drag.curl = new Curl(this.bookEl, current.layer, null, 0);
    } else {
      const mounted = this.prepare(drag.target, drag.forward ? 1 : -1);
      mounted.layer.setAttribute('aria-hidden', 'true');
      mounted.layer.inert = true;
      drag.mounted = mounted;
      drag.curl = drag.forward
        ? new Curl(this.bookEl, current.layer, mounted.layer, 0)
        : new Curl(this.bookEl, mounted.layer, current.layer, 1);
    }
  }

  private moveCornerDrag(drag: CornerDrag, e: PointerEvent): void {
    const curl = drag.curl;
    if (!curl) return;
    const { width: W, height: H } = curl.size;
    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;
    drag.samples.push({ x: e.clientX, t: e.timeStamp });
    if (drag.samples.length > 6) drag.samples.shift();
    if (drag.target === null) {
      // Locked: the corner lifts a little and resists, like a page held down.
      const pull = (v: number) => Math.sign(v) * Math.min(W * 0.12, Math.sqrt(Math.abs(v)) * 4);
      curl.draw({ x: W + pull(Math.min(0, dx)), y: H + pull(Math.min(0, dy)) });
    } else if (drag.forward) {
      curl.draw({ x: W + dx, y: H + dy });
    } else {
      // Coming back, the page's corner travels twice as far as the hand (from over the spine).
      curl.draw({ x: -W + dx * 2, y: H + dy });
    }
  }

  private releaseCornerDrag(drag: CornerDrag, e: PointerEvent | null): void {
    this.cornerDrag = null;
    const curl = drag.curl;
    if (!curl) return;
    const first = drag.samples[0]!;
    const last = e ? { x: e.clientX, t: e.timeStamp } : first;
    const speed = last.t > first.t ? (last.x - first.x) / (last.t - first.t) : 0;
    const p = curl.progress;
    const complete =
      !!e &&
      drag.target !== null &&
      (drag.forward
        ? p > TURN_THRESHOLD || (speed < -FLING_SPEED && p > 0.01)
        : p < 1 - TURN_THRESHOLD || (speed > FLING_SPEED && p < 0.99));
    const to: 0 | 1 = drag.forward === complete ? 1 : 0;
    const remaining = Math.abs(to - p);
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      if (this.turning?.curl === curl) this.turning = null;
      curl.destroy();
      if (complete && drag.mounted && drag.target !== null) {
        this.adopt = { index: drag.target, mounted: drag.mounted };
        if (drag.forward) this.dispatch({ type: 'next', groupRunning: false });
        else this.dispatch({ type: 'prev' });
        // The reducer went somewhere else after all: drop the page mounted for the drag.
        if (this.adopt) {
          this.unmountPage(this.adopt.mounted);
          this.adopt = null;
        }
      } else {
        if (drag.mounted) this.unmountPage(drag.mounted);
        // Letting go of a locked corner shows what to tap.
        if (drag.target === null && e) this.dispatch({ type: 'next', groupRunning: false });
      }
    };
    this.turning = { curl, complete: finish };
    const ms = Math.max(140, drag.duration * remaining * (complete ? 1 : 0.7));
    void curl.run(to, ms, 'out').then(finish);
  }

  private cancelCornerDrag(): void {
    const drag = this.cornerDrag;
    this.cornerDrag = null;
    if (!drag) return;
    drag.curl?.destroy();
    if (drag.mounted) this.unmountPage(drag.mounted);
  }

  private bindEvents(stage: HTMLElement): void {
    const on = <K extends keyof HTMLElementEventMap>(
      target: HTMLElement | Window | Document,
      type: K,
      fn: (e: HTMLElementEventMap[K]) => void,
      options?: AddEventListenerOptions,
    ) => {
      target.addEventListener(type, fn as EventListener, options);
      this.cleanups.push(() => target.removeEventListener(type, fn as EventListener, options));
    };

    // Sounds may play only after the reader's first tap or key press (capture: before any
    // handler below runs the action that plays one).
    const unlock = () => {
      this.sounds.unlock();
      this.mixer.start();
    };
    on(this.root, 'pointerdown', unlock, { capture: true });
    on(this.root, 'keydown', unlock, { capture: true });
    // Voiceover: the first tap or key starts a held first page (and only that), and a line
    // the browser refused plays on the next tap.
    const inCard = (t: EventTarget | null) => t instanceof Node && !!this.listenCard?.contains(t);
    on(
      this.root,
      'pointerdown',
      (e) => {
        this.swallowTap = false;
        if (inCard(e.target)) return;
        if (this.holding) {
          const onStage = e.target instanceof Node && stage.contains(e.target);
          this.release();
          if (onStage) this.swallowTap = true;
        } else if (this.voice?.isBlocked) {
          this.release();
        }
      },
      { capture: true },
    );
    on(
      this.root,
      'keydown',
      (e) => {
        if (inCard(e.target) || !this.holding) return;
        if (['Tab', 'Shift', 'Alt', 'Control', 'Meta'].includes(e.key)) return;
        e.preventDefault();
        e.stopPropagation();
        this.release();
      },
      { capture: true },
    );

    const interactiveOf = (target: EventTarget | null) =>
      target instanceof Element ? target.closest<HTMLElement>('.fp-page [data-interactive]') : null;
    const elementIdOf = (node: HTMLElement) => node.dataset.elementId;

    on(this.root, 'keydown', (e) => {
      if (e.altKey || e.ctrlKey || e.metaKey || this.menu?.isOpen || this.audioMenu?.isOpen) return;
      const key = e.key;
      const target = e.target as HTMLElement;
      if (key === ' ' || key === 'Enter') {
        // Buttons (story buttons and the reader's own) handle these keys with a click.
        if (target.closest('button')) return;
        const interactive = interactiveOf(target);
        if (interactive) {
          e.preventDefault();
          const id = elementIdOf(interactive);
          if (id) this.tap(id);
          return;
        }
      }
      if (this.state.ended && key !== 'ArrowLeft' && key !== 'PageUp' && key !== 'Backspace') {
        if (key === 'Home') {
          e.preventDefault();
          this.restart();
        }
        return;
      }
      if (['ArrowRight', 'PageDown', ' ', 'Enter'].includes(key)) {
        e.preventDefault();
        this.next();
      } else if (['ArrowLeft', 'PageUp', 'Backspace'].includes(key)) {
        e.preventDefault();
        this.prev();
      } else if (key === 'Home') {
        e.preventDefault();
        this.goTo(0, -1);
      } else if (key === 'End' && !this.opts.project.pages.some((p) => p.flow)) {
        // Only for straight-through books: in a branching one "the last page" means nothing.
        e.preventDefault();
        this.goTo(this.pages.length - 1, 1);
      } else if (key === 'f' || key === 'F') {
        this.toggleFullscreen();
      } else if ((key === 'b' || key === 'B') && this.music) {
        this.setMusic(!this.musicOn);
      } else if ((key === 'v' || key === 'V') && this.voice) {
        this.toggleVoice();
      } else if ((key === 'l' || key === 'L') && this.audioMenu) {
        e.preventDefault();
        this.openAudioMenu();
      } else if ((key === 'm' || key === 'M') && this.muteBtn) {
        this.toggleMute();
      } else if (key === 'Escape' && this.opts.onExit && !document.fullscreenElement) {
        this.opts.onExit();
      }
    });

    // Taps on story buttons, hotspots and characters run their actions (never turn the page).
    on(stage, 'click', (e) => {
      if (this.swallowTap) {
        // That tap only started the book.
        this.swallowTap = false;
        e.stopPropagation();
        return;
      }
      const interactive = interactiveOf(e.target);
      const id = interactive && elementIdOf(interactive);
      if (id) {
        e.stopPropagation();
        this.tap(id);
      }
    });

    // Drag a page's corner to turn it (pages with the curl transition).
    let cornerHandled = false;
    on(stage, 'pointerdown', (e) => {
      cornerHandled = false;
      if (interactiveOf(e.target)) return;
      this.cornerDrag = this.grabCorner(e);
    });
    on(stage, 'pointermove', (e) => {
      const drag = this.cornerDrag;
      if (!drag || e.pointerId !== drag.pointerId) return;
      if (!drag.curl) {
        if (Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY) < 6) return;
        stage.setPointerCapture?.(e.pointerId);
        this.beginCornerDrag(drag);
      }
      e.preventDefault();
      this.moveCornerDrag(drag, e);
    });
    on(stage, 'pointerup', (e) => {
      const drag = this.cornerDrag;
      if (!drag || e.pointerId !== drag.pointerId) return;
      if (!drag.curl) {
        // Just a tap in the corner: the usual tap handling below turns the page.
        this.cornerDrag = null;
        return;
      }
      cornerHandled = true;
      this.releaseCornerDrag(drag, e);
    });
    on(stage, 'pointercancel', (e) => {
      const drag = this.cornerDrag;
      if (!drag || e.pointerId !== drag.pointerId) return;
      cornerHandled = true;
      this.releaseCornerDrag(drag, null);
    });

    // Click / tap the page to advance; swipe to turn.
    let start: { x: number; y: number; t: number; interactive: boolean } | null = null;
    on(stage, 'pointerdown', (e) => {
      start = {
        x: e.clientX,
        y: e.clientY,
        t: Date.now(),
        interactive: !!interactiveOf(e.target),
      };
    });
    on(stage, 'pointerup', (e) => {
      if (!start) return;
      if (cornerHandled || this.swallowTap) {
        start = null;
        return;
      }
      const dx = e.clientX - start.x;
      const dy = e.clientY - start.y;
      const { interactive } = start;
      start = null;
      if (this.state.ended) return;
      if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) {
        if (dx < 0) this.next();
        else this.prev();
      } else if (Math.abs(dx) < 8 && Math.abs(dy) < 8) {
        if (interactive || !this.opts.project.reader.tapToAdvance) return;
        if (window.getSelection()?.toString()) return;
        this.next();
      }
    });

    // Music pauses while the book's tab is hidden.
    const onVisibility = () => this.music?.setHidden(document.hidden);
    document.addEventListener('visibilitychange', onVisibility);
    this.cleanups.push(() => document.removeEventListener('visibilitychange', onVisibility));

    const onResize = () => this.layout();
    on(window, 'resize', onResize);
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(onResize) : null;
    ro?.observe(this.root);
    this.cleanups.push(() => ro?.disconnect());

    on(document, 'fullscreenchange', () => {
      const fs = !!document.fullscreenElement;
      this.fsBtn.replaceChildren(icon(fs ? 'exitFullscreen' : 'fullscreen'));
      this.fsBtn.setAttribute('aria-label', fs ? 'Exit full screen' : 'Enter full screen');
      this.fsBtn.title = fs ? 'Exit full screen' : 'Enter full screen';
    });

    // Controls fade out while reading and come back on any movement.
    const wake = () => {
      this.root.classList.remove('fp-idle');
      clearTimeout(this.idleTimer);
      this.idleTimer = setTimeout(() => this.root.classList.add('fp-idle'), 2800);
    };
    on(this.root, 'pointermove', wake);
    on(this.root, 'keydown', wake);
    on(this.root, 'focusin', wake);
    wake();

    // Read to me waits for the reader whenever they do something themselves.
    on(this.root, 'pointerdown', () => this.cancelAutoTurn(), { capture: true });
    on(this.root, 'keydown', () => this.cancelAutoTurn(), { capture: true });

    // Any reader activity postpones the idle hint on locked pages.
    const active = () => this.armIdleHint();
    on(this.root, 'pointerdown', active);
    on(this.root, 'keydown', active);
  }
}

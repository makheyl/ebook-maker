import { flattenElements } from '../core/schema/tree';
import {
  createPageTimeline,
  elementsNeedingCharSplit,
  getTransition,
  type PageTimeline,
} from '../core/animation';
import { MADE_WITH_LABEL } from '../core/brand';
import {
  initialReaderState,
  isNextLocked,
  nextTarget,
  reduce,
  type ReaderEffect,
  type ReaderEvent,
  type ReaderState,
} from '../core/interaction/runtime';
import { createPageView, type PageView } from '../core/render';
import type { BurstEffect, Page, Project } from '../core/schema';
import { bookHasEffects, SoundBoard } from './audio';
import { Curl } from './curl';
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
};

/** How long a locked page waits for the reader before hinting what to tap. */
const IDLE_HINT_MS = 4000;

type Mounted = { page: Page; view: PageView; layer: HTMLElement; timeline: PageTimeline | null };

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
    this.sounds = new SoundBoard(opts.resolveAsset);
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
    this.root.focus({ preventScroll: true });
    if (saved) this.welcomeBack(start);
  }

  // ─── Public API ──────────────────────────────────────────────────────────────

  get pageIndex(): number {
    return this.index;
  }

  get pageCount(): number {
    return this.pages.length;
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
        void tl?.play(effect.group);
        break;
      case 'finishGroup':
        tl?.finish(effect.group);
        break;
      case 'playStep':
        void tl?.playStep(effect.stepId);
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
        this.sounds.play(effect.soundId);
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
      if (direction !== -1 && this.current === incoming) void incoming.timeline?.play(0);
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

    for (const id of this.state.collected[page.id] ?? []) this.markCollected(id, false);
    const turn = this.opts.project.reader.pageTurnSound;
    if (turn && direction !== 0) this.sounds.play(turn);
    if (page.openSound) this.sounds.play(page.openSound);
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
    return mounted;
  }

  private mountPage(page: Page): Mounted {
    const view = createPageView({
      pageSize: this.opts.project.pageSize,
      mode: 'player',
      resolveAsset: this.opts.resolveAsset,
      splitTextFor: elementsNeedingCharSplit,
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
    return { page, view, layer, timeline: null };
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

  // ─── Dragging the corner (page curl) ─────────────────────────────────────────

  /**
   * Whether a pointer going down here grabs a page corner: bottom-right turns forward,
   * bottom-left back — only when that turn would use the curl. The target comes from the pure
   * reducer, so the reader's state doesn't change until the turn completes.
   */
  private grabCorner(e: PointerEvent): CornerDrag | null {
    if (this.reducedMotion || this.state.ended || this.menu?.isOpen) return null;
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
    const unlock = () => this.sounds.unlock();
    on(this.root, 'pointerdown', unlock, { capture: true });
    on(this.root, 'keydown', unlock, { capture: true });

    const interactiveOf = (target: EventTarget | null) =>
      target instanceof Element ? target.closest<HTMLElement>('.fp-page [data-interactive]') : null;
    const elementIdOf = (node: HTMLElement) => node.dataset.elementId;

    on(this.root, 'keydown', (e) => {
      if (e.altKey || e.ctrlKey || e.metaKey || this.menu?.isOpen) return;
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
      } else if ((key === 'm' || key === 'M') && this.muteBtn) {
        this.toggleMute();
      } else if (key === 'Escape' && this.opts.onExit && !document.fullscreenElement) {
        this.opts.onExit();
      }
    });

    // Taps on story buttons, hotspots and characters run their actions (never turn the page).
    on(stage, 'click', (e) => {
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
      if (cornerHandled) {
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

    // Any reader activity postpones the idle hint on locked pages.
    const active = () => this.armIdleHint();
    on(this.root, 'pointerdown', active);
    on(this.root, 'keydown', active);
  }
}

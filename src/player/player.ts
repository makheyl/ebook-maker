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
import { bookHasSound, SoundBoard } from './audio';
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
    if (bookHasSound(project)) {
      this.muteBtn = this.button('Mute sounds', 'soundOn', () => this.toggleMute());
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
    this.say(this.sounds.muted ? 'Sounds off.' : 'Sounds on.');
  }

  private updateMute(): void {
    if (!this.muteBtn) return;
    const muted = this.sounds.muted;
    this.muteBtn.replaceChildren(icon(muted ? 'soundOff' : 'soundOn'));
    this.muteBtn.setAttribute('aria-pressed', String(muted));
    const label = muted ? 'Unmute sounds' : 'Mute sounds';
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
    this.finishTransition();
    // A story button that turned the page is about to disappear: keep keyboard focus in the book.
    const active = document.activeElement;
    const hadFocus = !!active && !!this.current?.layer.contains(active);
    const page = this.pages[i]!;
    const incoming = this.mountPage(page);
    const previous = this.current;
    this.current = incoming;
    this.index = i;

    // Timeline built before the page is revealed so entrances start hidden.
    incoming.timeline = createPageTimeline(page, (id) => incoming.view.getNodes(id), {
      pageSize: this.opts.project.pageSize,
      reducedMotion: this.reducedMotion,
    });
    incoming.timeline.startIdle();
    // Going back shows the page as it ends; going forward plays it.
    if (direction === -1) incoming.timeline.finishAll();

    const transition = getTransition(
      direction === -1 ? (this.pages[i + 1]?.transition.preset ?? 'none') : page.transition.preset,
    );
    const duration =
      direction === -1 ? (this.pages[i + 1]?.transition.duration ?? 0) : page.transition.duration;
    const animated = previous && direction !== 0 && transition.id !== 'none' && duration > 0;

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

    if (animated) {
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
    if (this.outgoing) this.unmountPage(this.outgoing);
    if (this.current) this.unmountPage(this.current);
    this.root.remove();
  }

  // ─── Pages ───────────────────────────────────────────────────────────────────

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

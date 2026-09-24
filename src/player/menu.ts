import { createPageView, type PageView } from '../core/render';
import type { Project } from '../core/schema';

type MenuOptions = {
  project: Project;
  resolveAsset: (assetId: string) => string | undefined;
  onPick: (index: number) => void;
  onClose: () => void;
};

/**
 * The reader's page menu: a grid of page thumbnails. Thumbnails are real PageViews rendered
 * lazily as they scroll into view, and all of them are destroyed when the menu closes.
 */
export class PageMenu {
  readonly el: HTMLElement;
  private readonly grid: HTMLElement;
  private views: PageView[] = [];
  private observer: IntersectionObserver | null = null;
  private returnFocus: HTMLElement | null = null;

  constructor(private readonly opts: MenuOptions) {
    this.el = document.createElement('div');
    this.el.className = 'fp-menu';
    this.el.hidden = true;
    this.el.setAttribute('role', 'dialog');
    this.el.setAttribute('aria-modal', 'true');
    this.el.setAttribute('aria-label', 'Pages');
    const head = document.createElement('div');
    head.className = 'fp-menu-head';
    const title = document.createElement('h2');
    title.className = 'fp-menu-title';
    title.textContent = 'Pages';
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'fp-end-btn';
    close.textContent = 'Close';
    close.addEventListener('click', (e) => {
      e.stopPropagation();
      this.opts.onClose();
    });
    head.append(title, close);
    this.grid = document.createElement('div');
    this.grid.className = 'fp-menu-grid';
    this.el.append(head, this.grid);
    this.el.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        this.opts.onClose();
      } else if (e.key === 'Tab') {
        // Keep Tab cycling inside the dialog.
        const items = [...this.el.querySelectorAll<HTMLElement>('button')];
        const first = items[0];
        const last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    });
  }

  get isOpen(): boolean {
    return !this.el.hidden;
  }

  open(current: number, returnFocus: HTMLElement | null): void {
    if (this.isOpen) return;
    this.returnFocus = returnFocus;
    const { project } = this.opts;
    const { width: W, height: H } = project.pageSize;
    this.grid.replaceChildren();
    this.el.hidden = false;
    this.observer =
      typeof IntersectionObserver !== 'undefined'
        ? new IntersectionObserver(
            (entries) => {
              for (const entry of entries) {
                if (!entry.isIntersecting) continue;
                this.observer?.unobserve(entry.target);
                this.render(entry.target as HTMLElement);
              }
            },
            { root: this.grid, rootMargin: '200px' },
          )
        : null;
    project.pages.forEach((_, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'fp-thumb';
      b.dataset.index = String(i);
      b.setAttribute('aria-label', `Page ${i + 1}`);
      if (i === current) b.setAttribute('aria-current', 'page');
      const frame = document.createElement('div');
      frame.className = 'fp-thumb-page';
      frame.style.aspectRatio = `${W} / ${H}`;
      const n = document.createElement('span');
      n.className = 'fp-thumb-n';
      n.textContent = String(i + 1);
      b.append(frame, n);
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        this.opts.onPick(i);
      });
      this.grid.appendChild(b);
      if (this.observer) this.observer.observe(b);
      else this.render(b);
    });
    const currentThumb = this.grid.children[current] as HTMLElement | undefined;
    currentThumb?.scrollIntoView?.({ block: 'nearest' });
    currentThumb?.focus({ preventScroll: true });
  }

  close(): void {
    if (!this.isOpen) return;
    this.el.hidden = true;
    this.observer?.disconnect();
    this.observer = null;
    for (const v of this.views) v.destroy();
    this.views = [];
    this.grid.replaceChildren();
    this.returnFocus?.focus({ preventScroll: true });
    this.returnFocus = null;
  }

  private render(button: HTMLElement): void {
    const i = Number(button.dataset.index);
    const page = this.opts.project.pages[i];
    const frame = button.querySelector<HTMLElement>('.fp-thumb-page');
    if (!page || !frame) return;
    const { project } = this.opts;
    const view = createPageView({
      pageSize: project.pageSize,
      mode: 'thumbnail',
      resolveAsset: this.opts.resolveAsset,
    });
    view.update(page, project.assets, project.characters);
    const scaler = document.createElement('div');
    scaler.className = 'fp-scaler';
    const scale = (frame.clientWidth || 160) / project.pageSize.width;
    scaler.style.transform = `scale(${scale})`;
    scaler.appendChild(view.root);
    frame.appendChild(scaler);
    this.views.push(view);
  }
}

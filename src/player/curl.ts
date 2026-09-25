import {
  bendRadius,
  cornerAt,
  curlFrame,
  foldGradient,
  polygonCss,
  progressOf,
  type Pt,
  type Size,
} from '../core/animation/curl/geometry';
import { el } from './dom';

/** The back of a page: plain paper. */
const PAPER = '#f7f3ea';

const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

/**
 * A page curl between two page layers, drawn by clipping (no WebGL, no canvas): `top` is the
 * page being turned — the current page going forward, the previous one coming back — and
 * `under` the page beneath it. Frames are drawn with requestAnimationFrame only while a turn
 * runs; nothing is scheduled when the page is at rest.
 */
export class Curl {
  private readonly flapWrap = el('div', 'fp-curl-flap-wrap');
  private readonly flap = el('div', 'fp-curl-flap');
  private readonly shade = el('div', 'fp-curl-shade');
  private raf = 0;
  private finishRun: (() => void) | null = null;
  /** Where the corner is now (book px). */
  corner: Pt;

  constructor(
    private readonly book: HTMLElement,
    private readonly top: HTMLElement,
    private readonly under: HTMLElement | null,
    start: number,
  ) {
    this.flapWrap.setAttribute('aria-hidden', 'true');
    this.shade.setAttribute('aria-hidden', 'true');
    this.flapWrap.appendChild(this.flap);
    book.classList.add('fp-curling');
    if (under) under.style.zIndex = '1';
    top.style.zIndex = '2';
    book.append(this.shade, this.flapWrap);
    this.corner = cornerAt(this.size, start);
    this.draw(this.corner);
  }

  get size(): Size {
    return { width: this.book.clientWidth, height: this.book.clientHeight };
  }

  get progress(): number {
    return progressOf(this.size, this.corner);
  }

  /** Draws the page with its corner at `p` (book px, clamped to what a page can do). */
  draw(p: Pt): void {
    const size = this.size;
    const f = curlFrame(size, p);
    this.corner = f.corner;
    const W = size.width;
    this.top.style.clipPath = polygonCss(f.front);
    // The flap is the lifted part of the page, mirrored over the fold. Its back is shaded like
    // a rolled sheet: a dark crease where it bends, a bright band where the roll faces the
    // light, then a soft falloff onto flat paper. The roll is widest mid-turn.
    this.flap.style.clipPath = polygonCss(f.lifted);
    this.flap.style.transform = `matrix(${f.mirror.join(', ')})`;
    const r = bendRadius(size, f.progress);
    this.flap.style.background = `${foldGradient(size, f, [
      [0, 'rgba(0, 0, 0, 0.3)'],
      [r * 0.18, 'rgba(0, 0, 0, 0.12)'],
      [r * 0.45, 'rgba(255, 255, 255, 0.55)'],
      [r * 0.8, 'rgba(255, 255, 255, 0.2)'],
      [r * 1.6, 'rgba(0, 0, 0, 0.1)'],
      [r * 3, 'rgba(0, 0, 0, 0.02)'],
      [W, 'rgba(0, 0, 0, 0.07)'],
    ])}, ${PAPER}`;
    // The lifted page casts a soft shadow on the page underneath, strongest mid-turn.
    const reach = 10 + r * 1.4;
    this.shade.style.clipPath = polygonCss(f.lifted);
    this.shade.style.background = foldGradient(size, f, [
      [0, 'rgba(0, 0, 0, 0.32)'],
      [reach * 0.35, 'rgba(0, 0, 0, 0.14)'],
      [reach, 'rgba(0, 0, 0, 0)'],
    ]);
    const hidden = f.progress <= 0;
    this.flapWrap.style.visibility = hidden ? 'hidden' : '';
    this.shade.style.visibility = hidden ? 'hidden' : '';
  }

  /** Draws the automatic path at t (0 = flat, 1 = turned over). */
  drawAt(t: number): void {
    this.draw(cornerAt(this.size, t));
  }

  /**
   * Animates to `to` (0 = back to flat, 1 = turned over) in `ms`, blending from wherever the
   * corner is (a hand letting go of a page) onto the automatic path.
   */
  run(to: 0 | 1, ms: number, ease: 'inOut' | 'out' = 'inOut'): Promise<void> {
    this.stop();
    const size = this.size;
    const from = this.corner;
    const t0 = this.progress;
    const offset = { x: from.x - cornerAt(size, t0).x, y: from.y - cornerAt(size, t0).y };
    const easing = ease === 'out' ? easeOut : easeInOut;
    const began = performance.now();
    return new Promise((resolve) => {
      const done = () => {
        this.raf = 0;
        this.finishRun = null;
        this.draw(cornerAt(size, to));
        resolve();
      };
      this.finishRun = done;
      const frame = (now: number) => {
        const s = ms > 0 ? Math.min(1, (now - began) / ms) : 1;
        const k = easing(s);
        const base = cornerAt(size, t0 + (to - t0) * k);
        this.draw({ x: base.x + offset.x * (1 - k), y: base.y + offset.y * (1 - k) });
        if (s < 1) this.raf = requestAnimationFrame(frame);
        else done();
      };
      this.raf = requestAnimationFrame(frame);
    });
  }

  /** Jumps a running animation to its end. */
  finish(): void {
    cancelAnimationFrame(this.raf);
    this.finishRun?.();
  }

  private stop(): void {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.finishRun = null;
  }

  /** Removes the curl, leaving both layers as they were. */
  destroy(): void {
    this.finish();
    this.stop();
    this.flapWrap.remove();
    this.shade.remove();
    this.book.classList.remove('fp-curling');
    for (const layer of [this.top, this.under]) {
      if (!layer) continue;
      layer.style.clipPath = '';
      layer.style.zIndex = '';
    }
  }
}

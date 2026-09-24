import { describe, expect, it, vi } from 'vitest';
import { createAnimationStep } from '../animation/factory';
import {
  createPageTimeline,
  elementsNeedingCharSplit,
  type AnimateFn,
} from '../animation/timeline';
import { createPageView } from '../render/page-view';
import { createPage, createTextElement, type Page, type TextElement } from '../schema';
import { effectiveFontSize, findFitScale, growHeight, MIN_FIT_SCALE, offPage } from './autofit';
import { MAX_REVEAL_UNITS, splitModeFor, splitRun, wordsPerChunk } from './split';

const text = (s: string) => createTextElement(s, { x: 0, y: 0, width: 800, height: 400 });
const words = (n: number) => Array.from({ length: n }, (_, i) => `word${i}`).join(' ');

describe('reveal units', () => {
  it('reveals short texts by letter and long ones by word, capped at 800 units', () => {
    expect(splitModeFor(text('Hello there'))).toBe('chars');
    expect(splitModeFor(text('x'.repeat(700)))).toBe('words'); // auto: letters up to 600
    expect(splitModeFor(text('x'.repeat(700)), 'letter')).toBe('chars'); // up to the 800 cap
    expect(splitModeFor(text('x '.repeat(500)), 'letter')).toBe('words'); // 1,000 chars > cap
    expect(splitModeFor(text('Hello there'), 'word')).toBe('words');
    expect(splitModeFor(text(words(2000)))).toBe('chunks');
  });

  it('keeps every character when splitting (words carry their spaces)', () => {
    const s = 'Once  upon\\na time ';
    for (const mode of ['chars', 'words', 'chunks'] as const) {
      expect(splitRun(s, mode, 2).join('')).toBe(s);
    }
    expect(splitRun('a bb  c', 'words')).toEqual(['a ', 'bb  ', 'c']);
    expect(splitRun('a b c d e', 'chunks', 2)).toEqual(['a b ', 'c d ', 'e']);
  });

  it('chunks a very long text into at most 800 units', () => {
    const el = text(words(5000));
    const per = wordsPerChunk(el);
    const units = splitRun(words(5000), 'chunks', per);
    expect(units.length).toBeLessThanOrEqual(MAX_REVEAL_UNITS);
  });
});

describe('typewriter on long text (regression: letters stayed hidden in preview/export)', () => {
  function build(el: TextElement, by?: string) {
    const page: Page = { ...createPage(), elements: [el] };
    const step = createAnimationStep(el.id, 'typewriter');
    page.animations = [{ ...step, params: by ? { by } : step.params }];
    const view = createPageView({
      pageSize: { width: 1600, height: 1200 },
      mode: 'player',
      resolveAsset: () => undefined,
      splitTextFor: elementsNeedingCharSplit,
    });
    view.update(page, {});
    const calls: { keyframes: Keyframe[]; options: KeyframeAnimationOptions }[] = [];
    const animate: AnimateFn = (_t, keyframes, options) => {
      calls.push({ keyframes, options });
      return {
        pause: vi.fn(),
        play: vi.fn(),
        finish: vi.fn(),
        cancel: vi.fn(),
        currentTime: 0,
        playState: 'paused',
        finished: Promise.resolve(),
      } as unknown as Animation;
    };
    createPageTimeline(page, (id) => view.getNodes(id), {
      pageSize: { width: 1600, height: 1200 },
      animate,
    });
    return { calls, view };
  }

  it('uses whole-millisecond timings and keyframes that always end visible', () => {
    const el = text('The quick brown fox jumps over the lazy dog. '.repeat(13)); // ~590 chars
    const { calls, view } = build(el, 'letter');
    expect(calls.length).toBe(view.root.querySelectorAll('.fl-char').length);
    expect(calls.length).toBeGreaterThan(500);
    for (const { keyframes, options } of calls) {
      expect(Number.isInteger(options.delay)).toBe(true);
      expect(Number.isInteger(options.duration)).toBe(true);
      expect(keyframes.at(-1)!.opacity).toBe(1);
      // Visible almost immediately after its turn: no rounding at the end can hide it.
      expect(keyframes[1]).toMatchObject({ opacity: 1, offset: 0.001 });
      expect(options.easing).toBe('linear');
    }
  });

  it('reveals a 2,000-character text word by word, and every unit is animated', () => {
    const el = text('Sentence number tells a little more of the story. '.repeat(40));
    const { calls, view } = build(el);
    const units = view.root.querySelectorAll('.fl-char');
    expect(units.length).toBeLessThanOrEqual(MAX_REVEAL_UNITS);
    expect(calls).toHaveLength(units.length);
    expect([...units].map((u) => u.textContent).join('')).toBe(
      'Sentence number tells a little more of the story. '.repeat(40),
    );
  });
});

describe('auto-fit rules', () => {
  // Text height grows with the square of its scale (more lines, each taller).
  const measure = (full: number) => (scale: number) => full * scale * scale;

  it('finds the largest scale that fits, or the minimum when nothing fits', () => {
    expect(findFitScale(measure(300), 400)).toBe(1);
    const s = findFitScale(measure(1600), 400);
    expect(measure(1600)(s)).toBeLessThanOrEqual(400.5);
    expect(s).toBeGreaterThan(0.49);
    expect(findFitScale(measure(100_000), 400)).toBe(MIN_FIT_SCALE);
  });

  it('grows boxes but stops at the page bottom', () => {
    expect(growHeight(300, 100, 1200)).toEqual({ height: 300, capped: false });
    expect(growHeight(4680, 561, 1200)).toEqual({ height: 639, capped: true });
    expect(growHeight(10, 0, 1200).height).toBe(20);
  });

  it('draws shrunk text at its fitted size, and flags boxes off the page', () => {
    const el = text('Hi');
    expect(effectiveFontSize(el.style)).toBe(el.style.fontSize);
    expect(effectiveFontSize({ ...el.style, autofit: 'shrink', fitScale: 0.5 })).toBe(
      el.style.fontSize / 2,
    );
    expect(effectiveFontSize({ ...el.style, autofit: 'none', fitScale: 0.5 })).toBe(
      el.style.fontSize,
    );
    expect(offPage({ x: 0, y: 1000, width: 100, height: 300 }, { width: 1600, height: 1200 })).toBe(
      true,
    );
    expect(offPage({ x: 0, y: 0, width: 1600, height: 1200 }, { width: 1600, height: 1200 })).toBe(
      false,
    );
  });
});

describe('splitting rich text for "continue on a new page"', () => {
  it('cuts at a plain-text offset and keeps formatting on both sides', async () => {
    const { splitParagraphsAt, plainText } = await import('../schema');
    const content = [
      { runs: [{ text: 'Once upon ' }, { text: 'a time', bold: true }] },
      { runs: [{ text: 'there was Pip.' }] },
    ];
    const [head, tail] = splitParagraphsAt(content, 12); // inside the bold run
    expect(plainText(head)).toBe('Once upon a ');
    expect(plainText(tail)).toBe('time\nthere was Pip.');
    expect(head[0]!.runs[1]).toEqual({ text: 'a ', bold: true });
    expect(tail[0]!.runs[0]).toEqual({ text: 'time', bold: true });
    const [a, b] = splitParagraphsAt(content, 17); // exactly at the paragraph break
    expect(plainText(a)).toBe('Once upon a time');
    expect(plainText(b)).toBe('there was Pip.');
  });
});

import {
  autofitOf,
  findFitScale,
  growHeight,
  MIN_FIT_SCALE,
  MIN_TEXT_HEIGHT,
  offPage,
} from '@/core/text/autofit';
import type { PageSize, TextElement, TextStyle } from '@/core/schema';
import { measureTextHeight } from './measure';

export type FitResult = {
  height: number;
  style: TextStyle;
  /** A growing box hit the page bottom and now shrinks its text instead. */
  switchedToShrink: boolean;
  /** The text still doesn't fit (fixed box, or already at the smallest size). */
  overflows: boolean;
};

const withStyle = (el: TextElement, style: TextStyle, height = el.height): TextElement => ({
  ...el,
  height,
  style,
});

function withoutScale(style: TextStyle): TextStyle {
  const { fitScale: _unused, ...rest } = style;
  void _unused;
  return rest;
}

/**
 * Applies a text box's auto-fit rule with real measurements (the result is stored, so the
 * reader draws exactly the same thing without measuring):
 * - grow: the box takes its text's height, stopping at the page bottom — then it shrinks instead
 * - shrink: the box keeps its size and the text scales down to fit
 * - none: nothing changes; `overflows` tells whether the text spills out
 */
export function fitText(el: TextElement, pageSize: PageSize): FitResult {
  const mode = autofitOf(el.style);
  if (mode === 'none') {
    const style = withoutScale(el.style);
    return {
      height: el.height,
      style,
      switchedToShrink: false,
      overflows: measureTextHeight(withStyle(el, style)) > el.height + 1,
    };
  }
  let height = el.height;
  let switchedToShrink = false;
  if (mode === 'grow') {
    const style = withoutScale(el.style);
    const grown = growHeight(measureTextHeight(withStyle(el, style)), el.y, pageSize.height);
    if (!grown.capped) return { height: grown.height, style, switchedToShrink, overflows: false };
    height = grown.height;
    switchedToShrink = true;
  }
  height = Math.max(MIN_TEXT_HEIGHT, height);
  const shrinkStyle = (scale: number): TextStyle => ({
    ...el.style,
    autofit: 'shrink',
    fitScale: scale,
  });
  const scale = findFitScale(
    (s) => measureTextHeight(withStyle(el, shrinkStyle(s), height)),
    height,
  );
  const style = scale >= 1 ? withoutScale({ ...el.style, autofit: 'shrink' }) : shrinkStyle(scale);
  const overflows =
    scale <= MIN_FIT_SCALE && measureTextHeight(withStyle(el, style, height)) > height + 1;
  return { height, style, switchedToShrink, overflows };
}

export type TextProblems = { overflow: boolean; offPage: boolean };

const problemCache = new WeakMap<TextElement, { key: string; value: TextProblems }>();

/** Whether a text box's content doesn't fit, or the box leaves the page (memoised per element). */
export function textProblems(el: TextElement, pageSize: PageSize): TextProblems {
  const key = `${pageSize.width}x${pageSize.height}`;
  const hit = problemCache.get(el);
  if (hit?.key === key) return hit.value;
  const value = {
    // Measured at the size the text is drawn (shrunk text uses its fitted size).
    overflow: measureTextHeight(el) > el.height + 1,
    offPage: offPage(el, pageSize),
  };
  problemCache.set(el, { key, value });
  return value;
}

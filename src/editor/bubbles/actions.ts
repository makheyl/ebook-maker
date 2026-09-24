import { rotatedBounds } from '@/core/geometry';
import {
  addElements,
  alwaysShowBubble,
  attachTail,
  defaultTailAnchor,
  detachTail,
  showBubbleOnTap,
  updateElement,
} from '@/core/ops';
import { bubbleToPage, tailTip } from '@/core/render/bubble-geometry';
import {
  BUBBLE_LOOKS,
  createBubbleElement,
  findElement,
  type BubbleElement,
  type BubbleShape,
  type PageElement,
} from '@/core/schema';
import { docStore } from '../store/doc-store';
import { getActivePage, getSelectedElements } from '../store/selectors';
import { useUiStore } from '../store/ui-store';
import { fitText } from '../text/fit';

type Point = { x: number; y: number };

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * Adds a speech bubble. With a picture (a character, usually) selected, the bubble goes above
 * its head with the tail attached, so it's that character's line; otherwise it's centred.
 */
export function insertBubble(shape: BubbleShape = 'speech'): void {
  const project = docStore.project();
  const page = getActivePage();
  if (!project || !page) return;
  const { width: W, height: H } = project.pageSize;
  const width = Math.round(Math.min(W * 0.36, 560));
  const height = Math.round(width * (shape === 'caption' ? 0.34 : 0.56));
  const selected = getSelectedElements();
  const speaker =
    selected.length === 1 && selected[0]!.type === 'image' && page.elements.includes(selected[0]!)
      ? selected[0]!
      : undefined;

  let x = (W - width) / 2;
  let y = (H - height) / 2;
  let anchor: Point | undefined;
  if (speaker && shape !== 'caption') {
    const asset = speaker.type === 'image' ? project.assets[speaker.assetId] : undefined;
    anchor = defaultTailAnchor(speaker, asset);
    const b = rotatedBounds(speaker);
    const head = {
      x: speaker.x + anchor.x * speaker.width,
      y: speaker.y + anchor.y * speaker.height,
    };
    const gap = height * 0.6;
    // Above the head and a little to the side, or beside it when there's no room above.
    x = head.x + width * 0.1 > W - width ? head.x - width * 1.1 : head.x - width * 0.3;
    y = head.y - gap - height;
    if (y < 16) {
      y = clamp(b.y, 16, H - height - 16);
      x = b.x + b.width + 24 + width <= W ? b.x + b.width + 24 : b.x - width - 24;
    }
  }
  x = Math.round(clamp(x, 16, W - width - 16));
  y = Math.round(clamp(y, 16, H - height - 16));
  const fontSize = Math.max(18, Math.round(Math.min(W, H) * 0.036));
  let el = createBubbleElement('Hello!', { x, y, width, height }, shape, {
    style: { fontFamily: project.theme.fontFamily, fontSize },
  });
  const fit = fitText(el, project.pageSize);
  el = { ...el, style: fit.style };
  docStore.change(
    (d) => {
      addElements(d, page.id, [el]);
      if (speaker && anchor) attachTail(d, page.id, el.id, speaker.id, anchor);
    },
    { label: 'Add speech bubble' },
  );
  const ui = useUiStore.getState();
  ui.enterGroup(null, [el.id]);
  ui.setEditingText(el.id);
}

function selectedBubbles(): BubbleElement[] {
  return getSelectedElements().filter((e): e is BubbleElement => e.type === 'bubble');
}

/** Changes the balloon's shape (keeping its colours) and re-fits its text to the new inset. */
export function setBubbleShape(shape: BubbleShape): void {
  const project = docStore.project();
  const page = getActivePage();
  const bubbles = selectedBubbles();
  if (!project || !page || !bubbles.length) return;
  const fits = bubbles.map(
    (b) => [b.id, fitText({ ...b, bubble: { ...b.bubble, shape } }, project.pageSize)] as const,
  );
  docStore.change(
    (d) =>
      fits.forEach(([id, fit]) =>
        updateElement(d, page.id, id, (el) => {
          if (el.type !== 'bubble') return;
          el.bubble.shape = shape;
          // A whisper needs an outline to show its dashes.
          if (shape === 'whisper' && (!el.bubble.stroke || el.bubble.strokeWidth === 0)) {
            el.bubble.stroke = BUBBLE_LOOKS.whisper.bubble.stroke;
            el.bubble.strokeWidth = BUBBLE_LOOKS.whisper.bubble.strokeWidth;
          }
          el.style = fit.style;
          el.height = fit.height;
        }),
      ),
    { label: 'Bubble shape' },
  );
}

/** Points the tail at an element on the page (a character's head, by default). */
export function attachBubbleTo(bubbleId: string, targetId: string, anchor?: Point): void {
  const page = getActivePage();
  if (!page) return;
  docStore.change((d) => attachTail(d, page.id, bubbleId, targetId, anchor), {
    label: 'Attach tail',
  });
}

/** Frees the tail (it keeps pointing where it did), or moves a free tail to `tip`. */
export function setFreeTail(bubbleId: string, tip?: Point, label = 'Move tail'): void {
  const page = getActivePage();
  if (!page) return;
  docStore.change((d) => detachTail(d, page.id, bubbleId, tip), { label });
}

/** The tail's tip on the page (for overlays). */
export function tailTipOnPage(elements: readonly PageElement[], bubble: BubbleElement): Point {
  return bubbleToPage(elements, bubble, tailTip(elements, bubble));
}

/** Where the "attach to" list offers to point: pictures on the page, characters first. */
export function tailTargets(elements: readonly PageElement[], bubbleId: string): PageElement[] {
  const found = findElement(elements, bubbleId);
  if (!found) return [];
  const images = elements.filter((e) => e.type === 'image' && !e.hidden);
  return [...images].sort(
    (a, b) =>
      Number(b.type === 'image' && !!b.characterId) - Number(a.type === 'image' && !!a.characterId),
  );
}

/** Hides the bubble until its speaker is tapped (or, with `on` false, shows it all the time). */
export function setShowOnTap(bubbleId: string, on: boolean): void {
  const page = getActivePage();
  if (!page) return;
  docStore.change(
    (d) => (on ? showBubbleOnTap(d, page.id, bubbleId) : alwaysShowBubble(d, page.id, bubbleId)),
    { label: on ? 'Show bubble on tap' : 'Always show bubble' },
  );
}

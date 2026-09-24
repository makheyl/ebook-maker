import { toast } from 'sonner';
import { newId } from '@/core/ids';
import { addPage, updateElement } from '@/core/ops';
import {
  createPage,
  plainText,
  splitParagraphsAt,
  type PageSize,
  type TextElement,
} from '@/core/schema';
import type { Autofit } from '@/core/text/autofit';
import { docStore } from '../store/doc-store';
import { getActivePage, getSelectedElements } from '../store/selectors';
import { useUiStore } from '../store/ui-store';
import { fitText } from './fit';
import { measureTextHeight } from './measure';

const pageSize = (): PageSize | undefined => docStore.project()?.pageSize;

function noteShrunk(switched: boolean) {
  if (switched) toast.info('Text shrunk to fit the page', { duration: 4000 });
}

/** Grow / Shrink / Fixed for the selected text boxes. */
export function setAutofit(mode: Autofit): void {
  const page = getActivePage();
  const size = pageSize();
  const texts = getSelectedElements().filter((e): e is TextElement => e.type === 'text');
  if (!page || !size || !texts.length) return;
  let switched = false;
  const fits = texts.map((t) => {
    const fit = fitText({ ...t, style: { ...t.style, autofit: mode } }, size);
    switched ||= fit.switchedToShrink;
    return [t.id, fit] as const;
  });
  docStore.change(
    (d) =>
      fits.forEach(([id, fit]) =>
        updateElement(d, page.id, id, (el) => {
          if (el.type !== 'text') return;
          el.style = fit.style;
          el.height = fit.height;
        }),
      ),
    { label: 'Text fit' },
  );
  noteShrunk(switched);
}

/** Moves a text box back inside the page (shrinking its text if the box is taller than the page). */
export function moveOntoPage(elementId: string): void {
  const page = getActivePage();
  const size = pageSize();
  const el = page?.elements.find((e): e is TextElement => e.id === elementId && e.type === 'text');
  if (!page || !size || !el) return;
  const width = Math.min(el.width, size.width);
  const height = Math.min(el.height, size.height);
  const x = Math.min(Math.max(0, el.x), size.width - width);
  const y = Math.min(Math.max(0, el.y), size.height - height);
  const moved = { ...el, x, y, width, height };
  const fit =
    height < el.height || width < el.width
      ? fitText({ ...moved, style: { ...moved.style, autofit: 'shrink' } }, size)
      : fitText(moved, size);
  docStore.change(
    (d) =>
      updateElement(d, page.id, el.id, (t) => {
        if (t.type !== 'text') return;
        Object.assign(t, { x, y, width, height: fit.height });
        t.style = fit.style;
      }),
    { label: 'Move onto the page' },
  );
}

/**
 * Keeps as much text as fits in the box and moves the rest into the same box on a new page
 * right after this one (like "continue on the next page" in page-layout apps).
 */
export function continueOnNewPage(elementId: string): void {
  const project = docStore.project();
  const page = getActivePage();
  const el = page?.elements.find((e): e is TextElement => e.id === elementId && e.type === 'text');
  if (!project || !page || !el) return;
  const text = plainText(el.content);
  // Word boundaries where the text may be cut.
  const cuts = [...text.matchAll(/\s+/g)].map((m) => m.index! + m[0].length);
  const fits = (offset: number) =>
    measureTextHeight({ ...el, content: splitParagraphsAt(el.content, offset)[0] }) <=
    el.height + 1;
  let lo = 0;
  let hi = cuts.length - 1;
  let best = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (fits(cuts[mid]!)) {
      best = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  if (best < 0) {
    toast.error('Even the first words don’t fit this box — make it bigger first.');
    return;
  }
  const [head, tail] = splitParagraphsAt(el.content, cuts[best]!);
  const index = project.pages.findIndex((p) => p.id === page.id);
  const copy: TextElement = { ...structuredClone(el), id: newId('el'), content: tail };
  const steps = page.animations
    .filter((s) => s.elementId === el.id)
    .map((s) => ({
      ...structuredClone(s),
      id: newId('an'),
      elementId: copy.id,
    }));
  const next = createPage(undefined, {
    background: structuredClone(page.background),
    transition: { ...page.transition },
    elements: [copy],
    animations: steps,
  });
  docStore.change(
    (d) => {
      updateElement(d, page.id, el.id, (t) => {
        if (t.type === 'text') t.content = head;
      });
      addPage(d, next, index + 1);
    },
    { label: 'Continue on a new page' },
  );
  useUiStore.getState().setActivePage(next.id);
  useUiStore.getState().select([copy.id]);
}

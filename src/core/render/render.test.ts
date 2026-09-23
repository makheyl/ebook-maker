import { describe, expect, it } from 'vitest';
import {
  createImageElement,
  createPage,
  createShapeElement,
  createTextElement,
  type AssetRef,
  type Page,
} from '../schema';
import { imageLayout } from './image-geometry';
import { createPageView } from './page-view';
import { filterCss } from './styles';

const asset: AssetRef = {
  id: 'a1',
  kind: 'image',
  mime: 'image/webp',
  width: 1000,
  height: 500,
  bytes: 1,
};
const assets = { a1: asset };

function view() {
  return createPageView({
    pageSize: { width: 1000, height: 800 },
    mode: 'player',
    resolveAsset: (id) => `blob:test/${id}`,
  });
}

function pageWith(...elements: Page['elements']): Page {
  return { ...createPage(), elements };
}

describe('PageView', () => {
  it('renders elements as absolutely positioned DOM in z-order', () => {
    const text = createTextElement('Hello', { x: 10, y: 20, width: 300, height: 100 });
    const shape = createShapeElement('rect', { x: 0, y: 0, width: 50, height: 50 });
    const v = view();
    v.update(pageWith(shape, text), assets);
    const frames = v.root.querySelectorAll<HTMLElement>('.fl-el');
    expect(frames).toHaveLength(2);
    expect(frames[0]!.dataset.elementId).toBe(shape.id);
    expect(frames[1]!.style.left).toBe('10px');
    expect(frames[1]!.style.top).toBe('20px');
    expect(frames[1]!.textContent).toBe('Hello');
    expect(v.root.style.width).toBe('1000px');
  });

  it('never parses user text as HTML', () => {
    const payload = '<img src=x onerror="alert(1)"><script>alert(1)</script>';
    const text = createTextElement(payload, { x: 0, y: 0, width: 100, height: 100 });
    text.content[0]!.runs.push({ text: '<b>bold?</b>', bold: true });
    const v = view();
    v.update(pageWith(text), assets);
    expect(v.root.querySelector('script')).toBeNull();
    expect(v.root.querySelector('.fl-text img')).toBeNull();
    expect(v.root.querySelector('b')).toBeNull();
    expect(v.root.textContent).toContain(payload);
  });

  it('keeps nodes for unchanged elements and patches moved ones in place', () => {
    const a = createTextElement('A', { x: 0, y: 0, width: 10, height: 10 });
    const b = createTextElement('B', { x: 0, y: 0, width: 10, height: 10 });
    const v = view();
    v.update(pageWith(a, b), assets);
    const aNodes = v.getNodes(a.id)!;
    const bContent = v.getNodes(b.id)!.anim.firstChild;
    const movedB = { ...b, x: 99 };
    v.update(pageWith(a, movedB), assets);
    expect(v.getNodes(a.id)!.frame).toBe(aNodes.frame);
    expect(v.getNodes(b.id)!.frame.style.left).toBe('99px');
    // Moving does not rebuild the text content.
    expect(v.getNodes(b.id)!.anim.firstChild).toBe(bContent);
  });

  it('reorders DOM when z-order changes and removes deleted elements', () => {
    const a = createShapeElement('rect', { x: 0, y: 0, width: 10, height: 10 });
    const b = createShapeElement('ellipse', { x: 0, y: 0, width: 10, height: 10 });
    const c = createShapeElement('line', { x: 0, y: 0, width: 10, height: 10 });
    const v = view();
    v.update(pageWith(a, b, c), assets);
    v.update(pageWith(c, a), assets);
    const ids = [...v.root.querySelectorAll<HTMLElement>('.fl-el')].map((n) => n.dataset.elementId);
    expect(ids).toEqual([c.id, a.id]);
  });

  it('hides hidden elements and applies rotation and opacity on the frame', () => {
    const t = createTextElement(
      'x',
      { x: 0, y: 0, width: 10, height: 10 },
      { rotation: 15, opacity: 0.5 },
    );
    const h = createTextElement('y', { x: 0, y: 0, width: 10, height: 10 }, { hidden: true });
    const v = view();
    v.update(pageWith(t, h), assets);
    expect(v.getNodes(t.id)!.frame.style.transform).toBe('rotate(15deg)');
    expect(v.getNodes(t.id)!.frame.style.opacity).toBe('0.5');
    expect(v.getNodes(h.id)!.frame.style.display).toBe('none');
  });

  it('renders images non-destructively with crop, flip and filters', () => {
    const img = createImageElement(asset, { x: 0, y: 0, width: 200, height: 200 }, {}, 'exact');
    img.crop = { x: 0.25, y: 0, width: 0.5, height: 1 };
    img.flipX = true;
    img.filters = { ...img.filters, grayscale: 1 };
    const v = view();
    v.update(pageWith(img), assets);
    const el = v.root.querySelector<HTMLImageElement>('.fl-img')!;
    expect(el.getAttribute('src')).toBe('blob:test/a1');
    expect(el.style.filter).toBe('grayscale(1)');
    expect(v.root.querySelector<HTMLElement>('.fl-image-flip')!.style.transform).toBe(
      'scale(-1, 1)',
    );
  });

  it('shows a placeholder when an image asset is missing', () => {
    const img = createImageElement({ ...asset, id: 'gone' }, { x: 0, y: 0, width: 10, height: 10 });
    const v = view();
    v.update(pageWith(img), {});
    expect(v.root.querySelector('.fl-missing')).not.toBeNull();
  });

  it('splits text into characters when asked, keeping an accessible copy', () => {
    const t = createTextElement('Hi!', { x: 0, y: 0, width: 10, height: 10 });
    const v = createPageView({
      pageSize: { width: 100, height: 100 },
      mode: 'player',
      resolveAsset: () => undefined,
      splitTextFor: () => new Set([t.id]),
    });
    v.update(pageWith(t), {});
    expect(v.root.querySelectorAll('.fl-char')).toHaveLength(3);
    expect(v.root.querySelector('.fl-sr-only')!.textContent).toBe('Hi!');
    expect(v.root.querySelector('.fl-text-inner')!.getAttribute('aria-hidden')).toBe('true');
  });
});

describe('image geometry', () => {
  it('fills the box with the whole image when the crop is full and aspects match', () => {
    expect(
      imageLayout(
        { width: 1000, height: 500 },
        { x: 0, y: 0, width: 1, height: 1 },
        { width: 200, height: 100 },
      ),
    ).toEqual({
      left: 0,
      top: 0,
      width: 200,
      height: 100,
    });
  });

  it('maps a crop region onto the box', () => {
    // Right half of a 1000×500 image into a 100×100 box: scale 0.2 → image 200×100, shifted left by 100.
    const layout = imageLayout(
      { width: 1000, height: 500 },
      { x: 0.5, y: 0, width: 0.5, height: 1 },
      { width: 100, height: 100 },
    );
    expect(layout).toEqual({ left: -100, top: 0, width: 200, height: 100 });
  });

  it('covers (and centers) when the box aspect differs from the crop', () => {
    const layout = imageLayout(
      { width: 1000, height: 500 },
      { x: 0, y: 0, width: 1, height: 1 },
      { width: 100, height: 100 },
    );
    expect(layout.height).toBe(100);
    expect(layout.width).toBe(200);
    expect(layout.left).toBe(-50);
  });
});

describe('filterCss', () => {
  it('omits identity values', () => {
    expect(
      filterCss({
        brightness: 1,
        contrast: 1,
        saturate: 1,
        blur: 0,
        grayscale: 0,
        sepia: 0,
        hueRotate: 0,
      }),
    ).toBe('');
    expect(
      filterCss({
        brightness: 1.2,
        contrast: 1,
        saturate: 0,
        blur: 2,
        grayscale: 0,
        sepia: 0.5,
        hueRotate: 90,
      }),
    ).toBe('brightness(1.2) saturate(0) sepia(0.5) hue-rotate(90deg) blur(2px)');
  });
});

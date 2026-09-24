import { produce } from 'immer';
import { describe, expect, it } from 'vitest';
import { createAnimationStep } from '../animation/factory';
import { PatchHistory } from '../history/patch-history';
import {
  createImageElement,
  createPage,
  createProject,
  createShapeElement,
  createTextElement,
  type AssetRef,
  type PageElement,
  type Project,
} from '../schema';
import { fitWholePicture, replaceElement, stepFits } from './replace';

const asset = (id: string, width = 400, height = 400): AssetRef => ({
  id,
  kind: 'image',
  mime: 'image/png',
  width,
  height,
  bytes: 1,
  name: `${id}.png`,
});

function book(el: PageElement, presets: string[]) {
  const page = createPage();
  page.elements.push(el);
  page.animations = presets.map((p) => createAnimationStep(el.id, p));
  const project = createProject({ pages: [page] });
  if (el.type === 'image') project.assets[el.assetId] = asset(el.assetId);
  return project;
}

describe('replace, keeping the animation', () => {
  it('a new picture keeps the id, box, animations, tap actions and filters', () => {
    const img = createImageElement(
      asset('old'),
      { x: 10, y: 20, width: 300, height: 200 },
      {
        rotation: 12,
        a11yLabel: 'A fox',
        interactions: [
          { id: 'ia', trigger: 'tap', once: false, actions: [{ type: 'burst', effect: 'hearts' }] },
        ],
        filters: {
          brightness: 1.2,
          contrast: 1,
          saturate: 1,
          blur: 0,
          grayscale: 0,
          sepia: 0,
          hueRotate: 0,
        },
      },
      'exact',
    );
    const project = book(img, ['fadeIn', 'kenBurns']);
    const history = new PatchHistory<Project>();
    let removed: unknown[] = [];
    const after = history.apply(project, (d) => {
      removed = replaceElement(d, d.pages[0]!.id, img.id, {
        kind: 'image',
        asset: asset('new', 800, 400),
      }).removed;
    });
    const el = after.pages[0]!.elements[0]!;
    expect(removed).toEqual([]);
    expect(el).toMatchObject({
      id: img.id,
      x: 10,
      y: 20,
      width: 300,
      height: 200,
      rotation: 12,
      assetId: 'new',
      a11yLabel: 'A fox',
    });
    expect(el.type === 'image' && el.filters.brightness).toBe(1.2);
    expect(el.interactions).toEqual(img.interactions);
    expect(after.pages[0]!.animations.map((s) => s.preset)).toEqual(['fadeIn', 'kenBurns']);
    expect(after.assets.new).toBeDefined();
    expect(history.undo(after)).toEqual(project);
  });

  it('across types: keeps what still works, removes what cannot', () => {
    const text = createTextElement('Hello', { x: 0, y: 0, width: 300, height: 100 });
    const project = book(text, ['fadeIn', 'typewriter', 'pulse']);
    let removed: { preset: string }[] = [];
    const after = produce(project, (d) => {
      removed = replaceElement(d, d.pages[0]!.id, text.id, {
        kind: 'shape',
        shape: 'ellipse',
      }).removed;
    });
    expect(removed.map((s) => s.preset)).toEqual(['typewriter']);
    expect(after.pages[0]!.elements[0]).toMatchObject({
      id: text.id,
      type: 'shape',
      shape: 'ellipse',
    });
    expect(after.pages[0]!.animations.map((s) => s.preset)).toEqual(['fadeIn', 'pulse']);

    const shape = createShapeElement('rect', { x: 0, y: 0, width: 300, height: 100 });
    const back = produce(
      book(shape, ['kenBurns', 'popIn']),
      (d) => void replaceElement(d, d.pages[0]!.id, shape.id, { kind: 'text', text: 'Now text' }),
    );
    expect(back.pages[0]!.elements[0]).toMatchObject({ type: 'text', id: shape.id });
    expect(back.pages[0]!.animations.map((s) => s.preset)).toEqual(['popIn']);
  });

  it('knows which animations fit which elements', () => {
    expect(stepFits({ preset: 'typewriter' }, 'text', false)).toBe(true);
    expect(stepFits({ preset: 'typewriter' }, 'image', false)).toBe(false);
    expect(stepFits({ preset: 'walkIn' }, 'image', true)).toBe(true);
    expect(stepFits({ preset: 'walkIn' }, 'image', false)).toBe(false);
    expect(stepFits({ preset: 'kenBurns' }, 'shape', false)).toBe(false);
    expect(stepFits({ preset: 'fadeIn' }, 'group', false)).toBe(true);
  });

  it('"fit whole picture" gives the box the picture’s shape, centred, inside the old box', () => {
    const img = createImageElement(
      asset('wide', 800, 400),
      { x: 100, y: 100, width: 400, height: 400 },
      {},
      'exact',
    );
    const project = book(img, []);
    project.assets.wide = asset('wide', 800, 400);
    const after = produce(project, (d) => fitWholePicture(d, d.pages[0]!.id, img.id));
    expect(after.pages[0]!.elements[0]).toMatchObject({ x: 100, y: 200, width: 400, height: 200 });
  });
});

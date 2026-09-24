import { describe, expect, it } from 'vitest';
import {
  createButtonElement,
  createHotspotElement,
  createImageElement,
  createPage,
  createShapeElement,
  type Character,
  type Page,
} from '../schema';
import { createPageView, type RenderMode } from './page-view';

const view = (mode: RenderMode) =>
  createPageView({ pageSize: { width: 1000, height: 800 }, mode, resolveAsset: () => 'blob:x' });

const pageWith = (...elements: Page['elements']): Page => ({ ...createPage(), elements });

const EVIL = '<img src=x onerror="alert(1)"><script>alert(1)</script>';

describe('buttons', () => {
  it('are real <button>s in the reader and inert look-alikes in the editor', () => {
    const button = createButtonElement(
      'Next →',
      { x: 0, y: 0, width: 300, height: 90 },
      { icon: 'arrowRight' },
    );
    const player = view('player');
    player.update(pageWith(button), {});
    const b = player.root.querySelector('.fl-button')!;
    expect(b.tagName).toBe('BUTTON');
    expect(b.getAttribute('type')).toBe('button');
    expect(b.textContent).toBe('Next →');
    expect(b.querySelector('svg')).not.toBeNull();
    expect(player.getNodes(button.id)!.frame.hasAttribute('data-interactive')).toBe(true);

    const editor = view('editor');
    editor.update(pageWith(button), {});
    expect(editor.root.querySelector('.fl-button')!.tagName).toBe('DIV');
    expect(editor.root.querySelector('[data-interactive]')).toBeNull();
  });

  it('never parse the label as HTML', () => {
    const button = createButtonElement(EVIL.slice(0, 60), { x: 0, y: 0, width: 300, height: 90 });
    const v = view('player');
    v.update(pageWith(button), {});
    expect(v.root.querySelector('script')).toBeNull();
    expect(v.root.querySelector('.fl-button img')).toBeNull();
    expect(v.root.querySelector('.fl-button')!.textContent).toBe(EVIL.slice(0, 60));
  });

  it('icon-only buttons get an accessible name', () => {
    const button = createButtonElement(
      '',
      { x: 0, y: 0, width: 90, height: 90 },
      {
        icon: 'star',
        iconPosition: 'only',
        a11yLabel: 'Collect the star',
      },
    );
    const v = view('player');
    v.update(pageWith(button), {});
    expect(v.root.querySelector('.fl-button')!.getAttribute('aria-label')).toBe('Collect the star');
  });
});

describe('interactive elements', () => {
  it('hotspots and elements with interactions become focusable buttons in the reader only', () => {
    const hotspot = createHotspotElement(
      { x: 0, y: 0, width: 100, height: 100 },
      { a11yLabel: 'The tree' },
    );
    const shape = createShapeElement(
      'rect',
      { x: 0, y: 0, width: 50, height: 50 },
      {
        interactions: [{ id: 'i', trigger: 'tap', once: false, actions: [{ type: 'next' }] }],
      },
    );
    const plain = createShapeElement('rect', { x: 0, y: 0, width: 50, height: 50 });
    const v = view('player');
    v.update(pageWith(hotspot, shape, plain), {});
    const frame = (id: string) => v.getNodes(id)!.frame;
    expect(frame(hotspot.id).getAttribute('role')).toBe('button');
    expect(frame(hotspot.id).tabIndex).toBe(0);
    expect(frame(hotspot.id).getAttribute('aria-label')).toBe('The tree');
    expect(frame(shape.id).getAttribute('role')).toBe('button');
    expect(frame(plain.id).hasAttribute('role')).toBe(false);
    expect(frame(plain.id).hasAttribute('data-interactive')).toBe(false);

    const e = view('editor');
    e.update(pageWith(hotspot, shape), {});
    expect(e.root.querySelector('[role=button]')).toBeNull();
    expect(e.root.querySelector('.fl-hotspot')!.textContent).toBe('The tree');
  });
});

describe('button names', () => {
  it('an explicit screen-reader name is used for story buttons', () => {
    const flap = createButtonElement(
      'Who is there?',
      { x: 0, y: 0, width: 200, height: 200 },
      { a11yLabel: 'Lift the flap: who is there?' },
    );
    const v = view('player');
    v.update(pageWith(flap), {});
    const b = v.root.querySelector('.fl-button')!;
    expect(b.getAttribute('aria-label')).toBe('Lift the flap: who is there?');
    expect(b.textContent).toContain('Who is there?');
  });
});

describe('character layers', () => {
  const asset = {
    id: 'art',
    kind: 'image' as const,
    mime: 'image/png',
    width: 400,
    height: 400,
    bytes: 1,
  };
  const character: Character = {
    id: 'pip',
    name: 'Pip',
    assetId: 'art',
    pivot: { x: 0.5, y: 0.9 },
    facing: 'right',
    shadow: { enabled: true, opacity: 0.4, size: 1 },
    idle: null,
    warp: false,
    poses: [],
  };

  it('adds an idle layer and a ground shadow, both pivoting on the feet', () => {
    const img = createImageElement(
      asset,
      { x: 0, y: 0, width: 200, height: 200 },
      { characterId: 'pip' },
      'exact',
    );
    const v = view('player');
    v.update(pageWith(img), { art: asset }, { pip: character });
    const nodes = v.getNodes(img.id)!;
    expect(nodes.character).toBe(character);
    expect(nodes.idle!.parentElement).toBe(nodes.anim);
    expect(nodes.idle!.querySelector('.fl-img')).not.toBeNull();
    expect(nodes.anim.style.transformOrigin).toBe('50% 90%');
    expect(nodes.shadow!.parentElement).toBe(nodes.frame);
    expect(nodes.shadow!.style.opacity).toBe('0.4');
  });

  it('rebuilds when the character changes and stays plain without one', () => {
    const img = createImageElement(
      asset,
      { x: 0, y: 0, width: 200, height: 200 },
      { characterId: 'pip' },
      'exact',
    );
    const v = view('player');
    v.update(pageWith(img), { art: asset }, { pip: character });
    const before = v.getNodes(img.id)!.frame;
    v.update(
      pageWith(img),
      { art: asset },
      { pip: { ...character, shadow: { ...character.shadow, enabled: false } } },
    );
    expect(v.getNodes(img.id)!.frame).not.toBe(before);
    expect(v.getNodes(img.id)!.shadow).toBeUndefined();

    const plain = createImageElement(asset, { x: 0, y: 0, width: 200, height: 200 });
    const p = view('player');
    p.update(pageWith(plain), { art: asset });
    expect(p.getNodes(plain.id)!.idle).toBeUndefined();
    expect(p.root.querySelector('.fl-shadow')).toBeNull();
  });

  it("stacks one hidden layer per pose over the artwork, in the character's order", () => {
    const img = createImageElement(
      asset,
      { x: 0, y: 0, width: 200, height: 200 },
      { characterId: 'pip' },
      'exact',
    );
    const posed: Character = {
      ...character,
      poses: [
        { id: 'po1', name: 'talk', assetId: 'talk-art' },
        { id: 'po2', name: 'blink', assetId: 'blink-art' },
      ],
    };
    const v = view('player');
    v.update(pageWith(img), { art: asset }, { pip: posed });
    const anim = v.getNodes(img.id)!.anim;
    const poses = [...anim.querySelectorAll<HTMLImageElement>('.fl-pose')];
    expect(poses.map((p) => p.dataset.poseId)).toEqual(['po1', 'po2']);
    expect(poses.every((p) => p.getAttribute('aria-hidden') === 'true' && !p.alt)).toBe(true);
    // Poses are not "media" (Ken Burns) targets; the artwork stays the only .fl-img.
    expect(anim.querySelectorAll('.fl-img')).toHaveLength(1);
    expect(poses[0]!.previousElementSibling?.classList.contains('fl-img')).toBe(true);
  });

  it('a tappable character is announced by its name (or its own label)', () => {
    const img = createImageElement(
      asset,
      { x: 0, y: 0, width: 200, height: 200 },
      { characterId: 'pip', name: 'pip.png' },
      'exact',
    );
    img.interactions = [
      { id: 'ia', trigger: 'tap', once: false, actions: [{ type: 'burst', effect: 'hearts' }] },
    ];
    const v = view('player');
    v.update(pageWith(img), { art: asset }, { pip: character });
    expect(v.getNodes(img.id)!.frame.getAttribute('aria-label')).toBe('Pip');
    const labelled = { ...img, a11yLabel: 'Tickle Pip' };
    const w = view('player');
    w.update(pageWith(labelled), { art: asset }, { pip: character });
    expect(w.getNodes(img.id)!.frame.getAttribute('aria-label')).toBe('Tickle Pip');
  });
});

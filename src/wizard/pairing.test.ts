import { describe, expect, it } from 'vitest';
import { generatePages, LAYOUT_TEMPLATES, PALETTES } from '@/core/templates';
import { fitFontSize } from '@/core/templates/text-fit';
import { projectSchema } from '@/core/schema/project';
import { createProject } from '@/core/schema';
import { mergeIntoRows, pairByOrder, splitLines, swapImages, type WizardImage } from './pairing';

const img = (id: string): WizardImage => ({
  name: `${id}.png`,
  asset: { id, kind: 'image', mime: 'image/png', width: 800, height: 600, bytes: 10 },
});

describe('pairing', () => {
  it('splits pasted text into non-empty trimmed lines', () => {
    expect(splitLines('  one \r\n\ntwo\n  \nthree')).toEqual(['one', 'two', 'three']);
  });

  it('pairs images and lines by order without dropping extras', () => {
    const rows = pairByOrder([img('a'), img('b'), img('c')], ['first', 'second']);
    expect(rows.map((r) => [r.image?.asset.id ?? null, r.text])).toEqual([
      ['a', 'first'],
      ['b', 'second'],
      ['c', ''],
    ]);
  });

  it('fills gaps before appending new rows', () => {
    const rows = pairByOrder([img('a')], ['one', 'two']);
    const merged = mergeIntoRows(rows, [img('b'), img('c')], ['three']);
    expect(merged.map((r) => [r.image?.asset.id ?? null, r.text])).toEqual([
      ['a', 'one'],
      ['b', 'two'],
      ['c', 'three'],
    ]);
  });

  it('swaps images between rows', () => {
    const rows = pairByOrder([img('a'), img('b')], ['x', 'y']);
    const swapped = swapImages(rows, 0, 1);
    expect(swapped.map((r) => r.image?.asset.id)).toEqual(['b', 'a']);
    expect(swapped.map((r) => r.text)).toEqual(['x', 'y']);
  });
});

describe('layout templates', () => {
  const pageSize = { width: 1600, height: 1200 };

  it('every template generates valid, editable pages (text-only fallback without an image)', () => {
    for (const template of LAYOUT_TEMPLATES) {
      const pages = generatePages(
        [
          { text: 'Once upon a time there was a very curious fox.', asset: img('a').asset },
          { text: 'No picture on this page.' },
        ],
        { templateId: template.id, pageSize, palette: PALETTES[0]!, fontId: 'lora', animate: true },
      );
      expect(pages).toHaveLength(2);
      const project = createProject({ pageSize, pages });
      project.assets.a = img('a').asset;
      const result = projectSchema.safeParse(project);
      expect(result.success, `${template.id}: ${JSON.stringify(result.error?.issues[0])}`).toBe(true);
      expect(pages[1]!.elements.every((e) => e.type === 'text')).toBe(true);
      for (const page of pages) {
        for (const a of page.animations) expect(page.elements.some((e) => e.id === a.elementId)).toBe(true);
      }
    }
  });

  it('can skip animations', () => {
    const [page] = generatePages([{ text: 'Hi', asset: img('a').asset }], {
      templateId: 'image-top',
      pageSize,
      palette: PALETTES[1]!,
      fontId: 'inter',
      animate: false,
    });
    expect(page!.animations).toEqual([]);
  });

  it('shrinks fonts for long text', () => {
    const box = { width: 800, height: 200 };
    const short = fitFontSize('Hello', box, { min: 16, max: 80, lineHeight: 1.3 });
    const long = fitFontSize('word '.repeat(80), box, { min: 16, max: 80, lineHeight: 1.3 });
    expect(short).toBe(80);
    expect(long).toBeLessThan(short);
  });
});

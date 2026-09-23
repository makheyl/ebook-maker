import { pathToFileURL } from 'node:url';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { createBlankBook, insertShape, makeMascotPng, stageElements } from './helpers';

const startOf = async (bar: Locator) => {
  const label = (await bar.getAttribute('aria-label')) ?? '';
  return Number(/starts at ([\d.]+) s/.exec(label)![1]) * 1000;
};

async function mascotBook(page: Page) {
  await page.goto('/#/new');
  await page.getByLabel('Title').fill('Timeline book');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByLabel('Paste your text').fill('Pip arrived.\nPip jumped for joy!\nThe end.');
  await page.getByRole('button', { name: 'Add 3 lines' }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page
    .getByTestId('wizard-character-input')
    .setInputFiles({ name: 'pip.png', mimeType: 'image/png', buffer: await makeMascotPng(page) });
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('radio', { name: 'Words only' }).click();
  await page.getByRole('button', { name: 'Create 3-page book' }).click();
  await expect(page.getByTestId('page-item')).toHaveCount(3);
  await page.getByRole('button', { name: 'Page 2', exact: true }).click();
}

const seekEditor = async (page: Page, seconds: number) => {
  const input = page.getByLabel('Playhead time');
  await input.fill(String(seconds));
  await input.press('Enter');
};

test('dragging a bar changes its delay by the dragged time, and one undo reverts it', async ({
  page,
}) => {
  await createBlankBook(page, 'Drag bars');
  await insertShape(page, 'Ellipse');
  await stageElements(page, 'shape').click();
  await page.getByRole('tab', { name: 'Animate' }).click();
  await page.getByRole('button', { name: /Add animation/ }).click();
  await page.getByRole('menuitem', { name: 'Fade in', exact: true }).click();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Timeline' }).click();

  const bar = page.getByTestId('timeline-bar').first();
  await expect(bar).toBeVisible();
  const box = (await bar.boundingBox())!;
  const pxPerMs = box.width / 700; // Fade in lasts 700 ms
  const before = await startOf(bar);
  await page.keyboard.down('Shift'); // no snapping: exact time
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  for (let i = 1; i <= 8; i++)
    await page.mouse.move(box.x + box.width / 2 + i * 15, box.y + box.height / 2);
  await page.mouse.up();
  await page.keyboard.up('Shift');
  const expected = before + 120 / pxPerMs;
  await expect.poll(() => startOf(bar)).toBeGreaterThan(before);
  expect(Math.abs((await startOf(bar)) - expected)).toBeLessThan(20);

  await page.getByRole('button', { name: 'Undo' }).click();
  await expect.poll(() => startOf(bar)).toBe(before);
});

test('keyboard nudges a bar in 0.1 s steps', async ({ page }) => {
  await createBlankBook(page, 'Nudge bars');
  await insertShape(page, 'Rectangle');
  await stageElements(page, 'shape').click();
  await page.getByRole('tab', { name: 'Animate' }).click();
  await page.getByRole('button', { name: /Add animation/ }).click();
  await page.getByRole('menuitem', { name: 'Fade in', exact: true }).click();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Timeline' }).click();
  const bar = page.getByTestId('timeline-bar').first();
  await bar.focus();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await expect.poll(() => startOf(bar)).toBe(200);
});

test('a character move becomes editable keyframes, and editing one changes playback', async ({
  page,
}) => {
  await mascotBook(page);
  await page.getByRole('tab', { name: 'Animate' }).click();
  await page
    .getByTestId('animation-step')
    .filter({ hasText: 'Hop' })
    .getByRole('button', { name: /Hop/ })
    .click();
  await page.getByRole('button', { name: 'Edit as keyframes' }).click();
  await expect(page.getByTestId('timeline')).toBeVisible();
  await expect(page.getByTestId('animation-step').filter({ hasText: 'Custom move' })).toHaveCount(
    1,
  );
  await expect(page.getByTestId('keyframe').first()).toBeVisible();

  // The apex of the hop is the y keyframe at 55%.
  const apex = page.getByRole('button', { name: /Move ↕ keyframe at 55%/ });
  await apex.click();
  const value = page.getByLabel('Keyframe value');
  await value.fill('-300');
  await value.press('Enter');
  await expect(apex).toHaveAccessibleName(/: -300$/);

  const bar = page.getByTestId('timeline-bar').filter({ hasText: 'Custom move' });
  const start = await startOf(bar);
  await seekEditor(page, (start + 0.55 * 900) / 1000);
  const anim = page.locator('.fl-mode-editor .fl-el[data-character-id] .fl-anim');
  await expect
    .poll(() => anim.evaluate((el) => new DOMMatrixReadOnly(getComputedStyle(el).transform).m42))
    .toBeCloseTo(-300, 0);

  // The move's path is drawn on the page; dragging its end point moves where it ends.
  await page.keyboard.press('Escape');
  const end = page.getByTestId('path-point').last();
  await expect(end).toBeVisible();
  const box = (await end.boundingBox())!;
  const scale =
    Number(
      (await page.getByRole('button', { name: 'Zoom level' }).textContent())!.replace('%', ''),
    ) / 100;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 60, box.y + box.height / 2, { steps: 5 });
  await page.mouse.up();
  const endKey = page.getByRole('button', { name: /Move ↔ keyframe at 100%/ });
  await expect
    .poll(async () => Number(/: (-?[\d.]+)$/.exec((await endKey.getAttribute('aria-label'))!)![1]))
    .toBeCloseTo(60 / scale, -1);
});

test('parity: the editor timeline and the exported book show the same frame at the same time', async ({
  page,
  browser,
}) => {
  await mascotBook(page);
  await page.keyboard.press('t');
  await expect(page.getByTestId('timeline')).toBeVisible();
  await seekEditor(page, 1);

  const read = (root: Page, scope: string) =>
    root.evaluate((scope) => {
      const el = document.querySelector(`${scope} .fl-el[data-character-id]`)!;
      const m = (sel: string) => {
        const node = el.querySelector(sel) as HTMLElement | null;
        if (!node) return null;
        const t = new DOMMatrixReadOnly(getComputedStyle(node).transform);
        return [t.a, t.b, t.c, t.d, t.e, t.f].map((v) => Math.round(v * 100) / 100);
      };
      return { anim: m('.fl-anim'), idle: m('.fl-idle'), shadow: m('.fl-shadow') };
    }, scope);

  const editor = await read(page, '.fl-mode-editor');
  expect(editor.anim![5]).toBeLessThan(-10); // mid-hop: in the air

  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Export' }).click();
  await expect(page.getByTestId('export-estimate')).toContainText('Estimated size');
  const [dl] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Download HTML' }).click(),
  ]);
  const file = test.info().outputPath('parity.html');
  await dl.saveAs(file);

  const context = await browser.newContext();
  const book = await context.newPage();
  await book.goto(pathToFileURL(file).href);
  await expect(book.locator('.fp-indicator')).toHaveText('1 / 3');
  await book.evaluate(() => {
    const player = (
      window as unknown as {
        folioPlayer: { goTo(i: number, d: number): void; seek(g: number, ms: number): void };
      }
    ).folioPlayer;
    player.goTo(1, 0);
    player.seek(0, 1000);
  });
  const exported = await read(book, '.fp-page:not([aria-hidden])');
  expect(exported).toEqual(editor);
  await context.close();
});

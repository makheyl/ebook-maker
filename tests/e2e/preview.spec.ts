import { expect, test, type Page } from '@playwright/test';
import { createBlankBook, insertShape, insertText, stageElements } from './helpers';

async function addAnimation(
  page: Page,
  element: ReturnType<typeof stageElements>,
  effect: string,
  start?: string,
) {
  await element.click();
  await page.getByRole('tab', { name: 'Animate' }).click();
  await page.getByRole('button', { name: /Add animation/ }).click();
  await page.getByRole('menuitem', { name: effect, exact: true }).click();
  if (start) {
    await page.getByRole('combobox', { name: 'Start' }).click();
    await page.getByRole('option', { name: start }).click();
  }
  await page.getByRole('tab', { name: 'Design' }).click();
}

async function buildTwoPageBook(page: Page) {
  await createBlankBook(page, 'Reader test');
  await insertText(page, 'First page');
  await addAnimation(page, stageElements(page, 'text'), 'Fade in');
  await insertShape(page, 'Ellipse');
  await addAnimation(page, stageElements(page, 'shape'), 'Pop in', 'On click');
  await page.getByRole('button', { name: 'Add page', exact: true }).first().click();
  await insertText(page, 'Second page');
  await page.getByRole('button', { name: 'Page 1', exact: true }).click();
}

const reader = (page: Page) => page.getByTestId('preview');
const animOpacity = (page: Page, type: string) =>
  reader(page)
    .locator(`.fp-page:not([aria-hidden]) .fl-el[data-type=${type}] .fl-anim`)
    .evaluate((el) => Number(getComputedStyle(el).opacity));

test('reader: click groups, keyboard, click and swipe navigation, letterboxing', async ({
  page,
}) => {
  await buildTwoPageBook(page);
  await page.getByRole('button', { name: 'Preview' }).click();
  await expect(reader(page).locator('.fp-indicator')).toHaveText('1 / 2');
  await expect(reader(page)).toContainText('First page');

  // The on-click entrance waits: the shape stays hidden until "next".
  await expect.poll(() => animOpacity(page, 'text')).toBe(1);
  expect(await animOpacity(page, 'shape')).toBe(0);
  await expect(reader(page).getByRole('button', { name: 'Next animation' })).toBeVisible();

  await page.keyboard.press('ArrowRight');
  await expect.poll(() => animOpacity(page, 'shape')).toBe(1);
  await expect(reader(page).locator('.fp-indicator')).toHaveText('1 / 2');
  // Like PowerPoint, "next" during a running animation completes it; wait for it to settle.
  await expect
    .poll(() =>
      page.evaluate(() => document.getAnimations().every((a) => a.playState !== 'running')),
    )
    .toBe(true);

  await page.keyboard.press('ArrowRight');
  await expect(reader(page).locator('.fp-indicator')).toHaveText('2 / 2');
  await expect(reader(page).locator('.fp-page:not([aria-hidden])')).toContainText('Second page');

  // Going back shows the page in its finished state.
  await page.keyboard.press('ArrowLeft');
  await expect(reader(page).locator('.fp-indicator')).toHaveText('1 / 2');
  await expect.poll(() => animOpacity(page, 'shape')).toBe(1);

  // Click advances; swipe left turns the page.
  const book = reader(page).locator('.fp-book');
  const box = (await book.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 - 200, box.y + box.height / 2, { steps: 5 });
  await page.mouse.up();
  await expect(reader(page).locator('.fp-indicator')).toHaveText('2 / 2');

  // Letterboxed at the book's aspect ratio (4:3 by default).
  const b = (await book.boundingBox())!;
  expect(b.width / b.height).toBeCloseTo(1600 / 1200, 1);
  await page.setViewportSize({ width: 600, height: 900 });
  // The reader re-lays out on its resize observer; wait for it.
  await expect.poll(async () => (await book.boundingBox())!.width).toBeLessThanOrEqual(600);
  const narrow = (await book.boundingBox())!;
  expect(narrow.width / narrow.height).toBeCloseTo(1600 / 1200, 1);

  await page.keyboard.press('Escape');
  await expect(reader(page)).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Page 2', exact: true })).toHaveAttribute(
    'aria-current',
    'page',
  );
});

test.describe('reduced motion', () => {
  test.use({ reducedMotion: 'reduce' });

  test('entrances resolve almost instantly', async ({ page }) => {
    await buildTwoPageBook(page);
    await page.getByRole('button', { name: 'Preview' }).click();
    await expect(reader(page).locator('.fp-indicator')).toHaveText('1 / 2');
    await page.waitForTimeout(400);
    expect(await animOpacity(page, 'text')).toBe(1);
  });
});

import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import { createBlankBook, makeMascotPng, stageElements } from './helpers';

const characterOnStage = (page: Page) => page.locator('.fl-mode-editor .fl-el[data-character-id]');

test('a transparent PNG becomes a character standing on its feet, and Walk in plays everywhere', async ({
  page,
  browser,
}) => {
  await createBlankBook(page, 'Mascot book');
  const png = await makeMascotPng(page);
  await page
    .getByTestId('insert-character-input')
    .setInputFiles({ name: 'pip.png', mimeType: 'image/png', buffer: png });
  await expect(characterOnStage(page)).toHaveCount(1);
  await expect(page.getByLabel('Name')).toHaveValue('pip');

  // Pivot = bottom centre of the visible pixels (the body ends at 90% of the image).
  const origin = await characterOnStage(page)
    .locator('.fl-anim')
    .evaluate((el) => (el as HTMLElement).style.transformOrigin);
  const [ox, oy] = origin.split(' ').map((v) => Number.parseFloat(v));
  expect(ox).toBeCloseTo(50, 0);
  expect(Math.abs(oy! - 90)).toBeLessThan(2);
  await expect(characterOnStage(page).locator('.fl-shadow')).toHaveCount(1);

  // Add a character motion from the Animate tab.
  await page.getByRole('tab', { name: 'Animate' }).click();
  await page.getByRole('button', { name: /Add animation/ }).click();
  await page.getByRole('menuitem', { name: /Walk in/ }).click();
  // New characters come with a wiggle tap reaction; Walk in is the one story step.
  await expect(page.getByTestId('animation-step')).toHaveCount(2);
  await expect(page.getByTestId('animation-step').filter({ hasText: 'Walk in' })).toHaveCount(1);

  // Reader preview: the character starts off the page and walks in; the idle loop runs.
  await page.getByRole('banner').getByRole('button', { name: 'Preview' }).click();
  const reader = page.getByTestId('preview');
  const readerAnim = reader.locator(
    '.fp-page:not([aria-hidden]) .fl-el[data-character-id] .fl-anim',
  );
  await expect(readerAnim).toHaveCount(1);
  await expect
    .poll(() =>
      readerAnim.evaluate((el) => new DOMMatrixReadOnly(getComputedStyle(el).transform).m41),
    )
    .toBeCloseTo(0, 0);
  expect(
    await page.evaluate(() =>
      document.getAnimations().some((a) => a.effect?.getTiming().iterations === Infinity),
    ),
  ).toBe(true);
  await page.keyboard.press('Escape');

  // Exported book (file://): same character, same motion, zero network.
  await page.getByRole('button', { name: 'Export' }).click();
  await expect(page.getByTestId('export-estimate')).toContainText('Estimated size');
  const [dl] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Download HTML' }).click(),
  ]);
  const file = test.info().outputPath('mascot.html');
  await dl.saveAs(file);
  expect(await readFile(file, 'utf8')).toContain('"characters"');

  const context = await browser.newContext();
  const requests: string[] = [];
  context.on('request', (r) => requests.push(r.url()));
  const book = await context.newPage();
  const errors: string[] = [];
  book.on('pageerror', (e) => errors.push(e.message));
  await book.goto(pathToFileURL(file).href);
  const anim = book.locator('.fp-page:not([aria-hidden]) .fl-el[data-character-id] .fl-anim');
  await expect(anim).toHaveCount(1);
  await expect(book.locator('.fl-el[data-character-id] .fl-idle')).toHaveCount(1);
  await expect
    .poll(() => anim.evaluate((el) => new DOMMatrixReadOnly(getComputedStyle(el).transform).m41))
    .toBeCloseTo(0, 0);
  expect(requests.filter((u) => !/^(file|data|blob):/.test(u))).toEqual([]);
  expect(errors).toEqual([]);
  await context.close();
});

test('an image with a solid background still works, with a warning', async ({ page }) => {
  await createBlankBook(page, 'Opaque');
  const png = await makeMascotPng(page, true);
  await page
    .getByTestId('insert-character-input')
    .setInputFiles({ name: 'box.png', mimeType: 'image/png', buffer: png });
  await expect(characterOnStage(page)).toHaveCount(1);
  await expect(page.getByText(/solid background/).first()).toBeVisible();
});

test('Animate my story places and animates the character on every page, reverted by one undo', async ({
  page,
}) => {
  await page.goto('/#/new');
  await page.getByLabel('Title').fill('Five pages');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page
    .getByLabel('Paste your text')
    .fill(
      'Pip arrived at the park.\nPip jumped over a puddle!\nPip was so happy.\nPip said goodbye.\nThe end.',
    );
  await page.getByRole('button', { name: 'Add 5 lines' }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Continue' }).click(); // no character in the wizard
  await page.getByRole('radio', { name: 'Words only' }).click();
  await page.getByRole('button', { name: 'Create 5-page book' }).click();
  await expect(page.getByTestId('page-item')).toHaveCount(5);

  const png = await makeMascotPng(page);
  await page
    .getByTestId('insert-character-input')
    .setInputFiles({ name: 'pip.png', mimeType: 'image/png', buffer: png });
  await expect(characterOnStage(page)).toHaveCount(1);

  await page.getByRole('tab', { name: 'Animate' }).click();
  await page.getByRole('button', { name: 'Animate my story' }).click();
  const rows = page.getByTestId('story-row');
  await expect(rows).toHaveCount(5);
  await expect(rows.nth(1)).toContainText('matched "jumped"');
  await page.getByRole('button', { name: 'Apply to 5 pages' }).click();

  for (let i = 1; i <= 5; i++) {
    await page.getByRole('button', { name: `Page ${i}`, exact: true }).click();
    await expect(characterOnStage(page), `page ${i}`).toHaveCount(1);
  }
  await page.getByRole('button', { name: 'Page 2', exact: true }).click();
  await expect(page.getByTestId('animation-step').filter({ hasText: 'Hop' })).toHaveCount(1);

  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(characterOnStage(page)).toHaveCount(0); // page 2 had no character before
  await page.getByRole('button', { name: 'Page 1', exact: true }).click();
  await expect(characterOnStage(page)).toHaveCount(1);
  await expect(page.getByTestId('animation-step').filter({ hasText: 'Walk in' })).toHaveCount(0);
});

test('the wizard can add a mascot that is animated on every page', async ({ page }) => {
  await page.goto('/#/new');
  await page.getByLabel('Title').fill('Wizard mascot');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByLabel('Paste your text').fill('Pip woke up.\nPip jumped out of bed!\nThe end.');
  await page.getByRole('button', { name: 'Add 3 lines' }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  const png = await makeMascotPng(page);
  await page
    .getByTestId('wizard-character-input')
    .setInputFiles({ name: 'pip.png', mimeType: 'image/png', buffer: png });
  await expect(page.getByLabel("Character's name")).toHaveValue('pip');
  await page.getByLabel("Character's name").fill('Pip');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Create 3-page book' }).click();
  await expect(page.getByTestId('page-item')).toHaveCount(3);
  await expect(characterOnStage(page)).toHaveCount(1);
  await stageElements(page, 'image').first().click();
  await expect(page.getByLabel('Name')).toHaveValue('Pip');
  await page.getByRole('button', { name: 'Page 2', exact: true }).click();
  await page.getByRole('tab', { name: 'Animate' }).click();
  await expect(page.getByTestId('animation-step').filter({ hasText: 'Hop' })).toHaveCount(1);
});

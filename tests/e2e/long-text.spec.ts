import { pathToFileURL } from 'node:url';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { createBlankBook, stageElements, waitForSaved } from './helpers';

const LONG = Array.from(
  { length: 40 },
  (_, i) => `Sentence number ${i + 1} tells a little more of the story.`,
).join(' '); // ~2,300 characters

async function pasteLongText(page: Page, text = LONG) {
  await page.getByRole('toolbar', { name: 'Insert' }).getByRole('button', { name: 'Text' }).click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.insertText(text);
  await page.keyboard.press('Escape');
}

/** Every reveal unit of the text is fully visible, and nothing is outside the page. */
async function everyUnitVisible(scope: Locator) {
  return scope.evaluate((root) => {
    const units = [...root.querySelectorAll('.fl-el[data-type=text] .fl-char')];
    const hidden = units.filter((u) => Number(getComputedStyle(u).opacity) < 0.99).length;
    const page = root.querySelector('.fl-page')!.getBoundingClientRect();
    const inner = root
      .querySelector('.fl-el[data-type=text] .fl-text-inner')!
      .getBoundingClientRect();
    return {
      units: units.length,
      hidden,
      inside: inner.bottom <= page.bottom + 1 && inner.top >= page.top - 1,
    };
  });
}

test('a long pasted passage stays on the page: the box stops at the page bottom and shrinks', async ({
  page,
}) => {
  await createBlankBook(page, 'Long text');
  await pasteLongText(page);
  await expect(page.getByText('Text shrunk to fit the page')).toBeVisible();
  // The canvas never scrolls away from the real page.
  expect(await page.locator('[data-testid=stage-page] .fl-page').evaluate((p) => p.scrollTop)).toBe(
    0,
  );
  const text = stageElements(page, 'text');
  await text.click();
  const [y, h] = await Promise.all([
    page.getByRole('textbox', { name: 'Y', exact: true }).inputValue(),
    page.getByRole('textbox', { name: 'Height', exact: true }).inputValue(),
  ]);
  expect(Number(y) + Number(h)).toBeLessThanOrEqual(1200);
  await expect(page.getByRole('radio', { name: 'Shrink text' })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await expect(page.getByTestId('overflow-badge')).toHaveCount(0);
});

test('Typewriter on long text shows every word in the preview and the exported book', async ({
  page,
  browser,
}) => {
  await createBlankBook(page, 'Typewriter');
  await pasteLongText(page);
  await stageElements(page, 'text').click();
  await page.getByRole('tab', { name: 'Animate' }).click();
  await page.getByRole('button', { name: /Add animation/ }).click();
  await page.getByRole('menuitem', { name: 'Typewriter', exact: true }).click();
  await waitForSaved(page);

  await page.getByRole('banner').getByRole('button', { name: 'Preview' }).click();
  const reader = page.getByTestId('preview').locator('.fp-page:not([aria-hidden])');
  await expect
    .poll(async () => (await everyUnitVisible(reader)).hidden, { timeout: 10_000 })
    .toBe(0);
  const inPreview = await everyUnitVisible(reader);
  expect(inPreview.units).toBeGreaterThan(300); // revealed word by word
  expect(inPreview.inside).toBe(true);
  await page.keyboard.press('Escape');

  await page.getByRole('button', { name: 'Export' }).click();
  await expect(page.getByTestId('export-estimate')).toContainText('Estimated size');
  const [dl] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Download HTML' }).click(),
  ]);
  const file = test.info().outputPath('long.html');
  await dl.saveAs(file);
  const context = await browser.newContext();
  const book = await context.newPage();
  await book.goto(pathToFileURL(file).href);
  const exported = book.locator('.fp-page:not([aria-hidden])');
  await expect
    .poll(async () => (await everyUnitVisible(exported)).hidden, { timeout: 10_000 })
    .toBe(0);
  expect((await everyUnitVisible(exported)).inside).toBe(true);
  await context.close();
});

test('text that does not fit is flagged, and can continue on a new page', async ({ page }) => {
  await createBlankBook(page, 'Overflow');
  await page.getByRole('toolbar', { name: 'Insert' }).getByRole('button', { name: 'Text' }).click();
  await page.keyboard.insertText('Short');
  await page.keyboard.press('Escape');
  const text = stageElements(page, 'text');
  await text.click();
  await page.getByRole('radio', { name: 'Fixed' }).click();
  // Type a long passage into the fixed box: it can't grow.
  await text.dblclick();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.insertText(LONG);
  await page.keyboard.press('Escape');

  const badge = page.getByTestId('overflow-badge');
  await expect(badge).toHaveText(/Text doesn’t fit/);
  await page.getByRole('tab', { name: 'Interact' }).click();
  await page.locator('.fl-mode-editor').click({ position: { x: 5, y: 5 } });
  await expect(page.getByRole('list', { name: 'Problems' })).toContainText('doesn’t fit its box');

  await badge.click();
  await page.getByRole('menuitem', { name: 'Continue on a new page' }).click();
  await expect(page.getByTestId('page-item')).toHaveCount(2);
  await expect(stageElements(page, 'text')).toContainText('Sentence number');
});

test('Quick create with long lines makes pages with nothing cut off', async ({ page }) => {
  await page.goto('/#/new');
  await page.getByLabel('Title').fill('Long lines');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByLabel('Paste your text').fill(`${LONG.slice(0, 900)}\nShort line.`);
  await page.getByRole('button', { name: 'Add 2 lines' }).click();
  await expect(page.getByText('Long: shrinks to fit')).toHaveCount(1);
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('radio', { name: 'Words only' }).click();
  await page.getByRole('button', { name: 'Create 2-page book' }).click();
  await expect(page.getByTestId('page-item')).toHaveCount(2);
  await expect(page.getByTestId('overflow-badge')).toHaveCount(0);
  await page.getByRole('tab', { name: 'Interact' }).click();
  await expect(page.getByText('No problems found.')).toBeVisible();
});

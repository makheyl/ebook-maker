import { pathToFileURL } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import { createBlankBook, stageElements, waitForSaved } from './helpers';

const STORY =
  'Every morning the little fox climbed the red hill behind the old farmhouse to watch the sun ' +
  'come up over the valley, counting the extraordinarily colourful birds that woke before ' +
  'everyone else and sang their unbelievably complicated songs to the sleepy countryside.';

/** Lines of a text box: distinct line tops of its text, and its natural height. */
const measure = (root: Page, scope: string) =>
  root.evaluate((scope) => {
    const inner = document.querySelector<HTMLElement>(`${scope} .fl-text-inner`)!;
    const range = document.createRange();
    range.selectNodeContents(inner);
    const tops = new Set([...range.getClientRects()].map((r) => Math.round(r.top / 2)));
    const box = inner.parentElement!;
    return {
      lines: tops.size,
      height: inner.offsetHeight,
      align: getComputedStyle(box).textAlign,
      hyphens: getComputedStyle(box).hyphens,
      lang: document
        .querySelector<HTMLElement>(`${scope}`)!
        .closest('[lang]')
        ?.getAttribute('lang'),
    };
  }, scope);

test('justified text wraps the same in the editor and the exported book', async ({
  page,
  browser,
}) => {
  await createBlankBook(page, 'Justified');
  await page.getByRole('toolbar', { name: 'Insert' }).getByRole('button', { name: 'Text' }).click();
  await page.keyboard.insertText(STORY);
  await page.keyboard.press('Escape');
  await expect(stageElements(page, 'text')).toHaveCount(1);
  await stageElements(page, 'text').click();

  // Mod+Shift+J justifies; Mod+Shift+L and E switch back and forth.
  await page.keyboard.press('ControlOrMeta+Shift+E');
  await expect(page.getByRole('radio', { name: 'Center text' })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await page.keyboard.press('ControlOrMeta+Shift+J');
  await expect(page.getByRole('radio', { name: 'Justify text' })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await expect(page.getByRole('switch', { name: 'Hyphenate' })).toBeChecked();

  // The book's language (Filipino here) reaches the page and the exported file.
  await page.getByTestId('stage-page').click({ position: { x: 4, y: 4 } });
  await page.getByRole('tab', { name: 'Design' }).click();
  await page.getByRole('combobox', { name: 'Book language' }).click();
  await page.getByRole('option', { name: 'Filipino' }).click();
  await waitForSaved(page);

  const editor = await measure(page, '.fl-page.fl-mode-editor');
  expect(editor.align).toBe('justify');
  expect(editor.hyphens).toBe('auto');
  expect(editor.lang).toBe('fil');
  expect(editor.lines).toBeGreaterThan(1);

  await page.getByRole('button', { name: 'Export' }).click();
  await expect(page.getByTestId('export-estimate')).toContainText('Estimated size');
  const [dl] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Download HTML' }).click(),
  ]);
  const file = test.info().outputPath('justified.html');
  await dl.saveAs(file);
  const context = await browser.newContext();
  const book = await context.newPage();
  await book.goto(pathToFileURL(file).href);
  expect(await book.evaluate(() => document.documentElement.lang)).toBe('fil');
  await expect(book.locator('.fp-page .fl-text-inner')).toBeVisible();
  const exported = await measure(book, '.fp-page:not([aria-hidden]) .fl-page');
  expect(exported).toEqual(editor);
  await context.close();
});

import { pathToFileURL } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import { createBlankBook, insertText } from './helpers';

const insertButton = async (page: Page, preset: RegExp) => {
  await page
    .getByRole('toolbar', { name: 'Insert' })
    .getByRole('button', { name: 'Button' })
    .click();
  await page.getByRole('menuitem', { name: preset }).click();
  await expect(page.getByRole('menu')).toBeHidden();
};

const clickEmpty = (page: Page) =>
  page.getByTestId('stage-page').click({ position: { x: 8, y: 8 } });

const pageThumb = (page: Page, n: number) =>
  page.getByRole('button', { name: `Page ${n}`, exact: true });

/** A "Tap me!" button at x whose tap collects it. */
async function collectible(page: Page, x: number) {
  await insertButton(page, /Tap me!/);
  await page.getByRole('tab', { name: 'Design' }).click();
  const field = page.getByRole('textbox', { name: 'X', exact: true });
  await field.fill(String(x));
  await field.press('Enter');
  await page.getByRole('tab', { name: 'Interact' }).click();
  await page.getByRole('combobox', { name: 'Action 1' }).click();
  await page.getByRole('option', { name: 'Collect it' }).click();
}

test('collecting items fills the goal badge, unlocks the page, and bursts clean up', async ({
  page,
}) => {
  await createBlankBook(page, 'Star hunt');
  await page.getByRole('button', { name: 'Add page', exact: true }).first().click();
  await insertText(page, 'All found');
  await pageThumb(page, 1).click();
  await collectible(page, 100);
  await collectible(page, 700);
  await clickEmpty(page);
  const items = page.getByRole('textbox', { name: 'Items', exact: true });
  await items.fill('2');
  await items.press('Enter');
  await page.getByRole('textbox', { name: 'Shown to readers' }).fill('Find the stars');
  await page.getByRole('textbox', { name: 'Shown to readers' }).press('Enter');
  await expect(page.getByRole('switch', { name: /Tap something to continue/ })).toBeChecked();
  await expect(page.getByText('No problems found.')).toBeVisible();

  await page.getByRole('banner').getByRole('button', { name: 'Preview' }).click();
  const reader = page.getByTestId('preview');
  const badge = reader.locator('.fp-goal');
  const indicator = reader.locator('.fp-indicator');
  await expect(badge).toContainText('Find the stars');
  await expect(badge).toContainText('0 / 2');
  await page.keyboard.press('ArrowRight');
  await expect(indicator).toHaveText('1 / 2');

  const stars = reader.getByRole('button', { name: 'Tap me!' });
  await stars.nth(0).click();
  await expect(badge).toContainText('1 / 2');
  await expect(reader.locator('.fp-particle').first()).toBeAttached();
  // Particles are removed once they finish.
  await expect(reader.locator('.fp-burst')).toHaveCount(0, { timeout: 5000 });
  await stars.nth(0).click(); // counts once
  await expect(badge).toContainText('1 / 2');
  await stars.nth(1).click();
  await expect(badge).toContainText('2 / 2');
  await expect(badge).toHaveClass(/fp-goal-done/);
  await expect(reader.locator('.fp-burst')).toHaveCount(0, { timeout: 5000 });

  await page.keyboard.press('ArrowRight');
  await expect(indicator).toHaveText('2 / 2');
  await expect(badge).toBeHidden();
});

test('a locked page hints after the reader is idle; the hint is static with reduced motion', async ({
  page,
}) => {
  await createBlankBook(page, 'Hints');
  await page.getByRole('button', { name: 'Add page', exact: true }).first().click();
  await page.getByRole('button', { name: 'Add page', exact: true }).first().click();
  await pageThumb(page, 1).click();
  await insertButton(page, /Choice/);

  await page.getByRole('banner').getByRole('button', { name: 'Preview' }).click();
  const reader = page.getByTestId('preview');
  const root = reader.locator('.fp-root');
  const choice = reader.locator('.fp-page:not([aria-hidden]) [data-interactive]').first();
  await expect(root).not.toHaveClass(/fp-hinting/);
  // No input for 4 s → the choices glow (a pulse).
  await expect(root).toHaveClass(/fp-hinting/, { timeout: 7000 });
  expect(await choice.evaluate((e) => getComputedStyle(e).animationName)).toBe('fp-hint');
  await page.keyboard.press('Escape');

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.getByRole('banner').getByRole('button', { name: 'Preview' }).click();
  await page.keyboard.press('ArrowRight');
  await expect(root).toHaveClass(/fp-hinting/);
  const style = await choice.evaluate((e) => {
    const s = getComputedStyle(e);
    return { animation: s.animationName, filter: s.filter };
  });
  expect(style.animation).toBe('none');
  expect(style.filter).toContain('drop-shadow');
});

test('exported book: page menu, resume where you left off, and start over', async ({
  page,
  browser,
}) => {
  await createBlankBook(page, 'Three pages');
  await insertText(page, 'One');
  const addPage = page.getByRole('button', { name: 'Add page', exact: true }).first();
  await addPage.click();
  await insertText(page, 'Two');
  await addPage.click();
  await insertText(page, 'Three');

  await page.getByRole('button', { name: 'Export' }).click();
  await expect(page.getByTestId('export-estimate')).toContainText('Estimated size');
  const [dl] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Download HTML' }).click(),
  ]);
  const file = test.info().outputPath('three.html');
  await dl.saveAs(file);

  const context = await browser.newContext();
  const requests: string[] = [];
  context.on('request', (r) => requests.push(r.url()));
  const book = await context.newPage();
  const errors: string[] = [];
  book.on('pageerror', (e) => errors.push(e.message));
  await book.goto(pathToFileURL(file).href);
  const indicator = book.locator('.fp-indicator');
  const visible = book.locator('.fp-page:not([aria-hidden])');
  await expect(indicator).toHaveText('1 / 3');
  await expect(book.locator('.fp-toast')).toHaveCount(0);

  // Page menu: lazy thumbnails of every page; pick page 3.
  const menuButton = book.getByRole('button', { name: 'All pages' });
  await menuButton.click();
  const menu = book.getByRole('dialog', { name: 'Pages' });
  await expect(menu).toBeVisible();
  await expect(menu.getByRole('button', { name: /^Page \d$/ })).toHaveCount(3);
  await expect(menu.locator('.fl-page')).toHaveCount(3);
  await expect(menu.getByRole('button', { name: 'Page 1' })).toHaveAttribute(
    'aria-current',
    'page',
  );
  // Focus stays inside the menu (everything behind it is inert).
  for (let i = 0; i < 6; i++) await book.keyboard.press('Tab');
  expect(await book.evaluate(() => !!document.activeElement?.closest('.fp-menu'))).toBe(true);
  await book.keyboard.press('Escape');
  await expect(menu).toBeHidden();
  await expect(menuButton).toBeFocused();
  await menuButton.click();
  await menu.getByRole('button', { name: 'Page 3' }).click();
  await expect(menu).toBeHidden();
  await expect(indicator).toHaveText('3 / 3');
  await expect(visible).toContainText('Three');
  await expect(menu.locator('.fl-page')).toHaveCount(0);

  // Reopening continues on page 3, with a way to start over.
  await book.reload();
  await expect(indicator).toHaveText('3 / 3');
  const toast = book.locator('.fp-toast');
  await expect(toast).toContainText('Continuing on page 3');
  await toast.getByRole('button', { name: 'Start over' }).click();
  await expect(indicator).toHaveText('1 / 3');
  await expect(toast).toHaveCount(0);

  // Back at the start there is nothing to resume.
  await book.reload();
  await expect(indicator).toHaveText('1 / 3');
  await expect(book.locator('.fp-toast')).toHaveCount(0);

  // A deep link wins over the saved position.
  await book.goto('about:blank');
  await book.goto(`${pathToFileURL(file).href}#page=2`);
  await expect(indicator).toHaveText('2 / 3');

  expect(requests.filter((u) => !/^(file|data|blob):/.test(u))).toEqual([]);
  expect(errors).toEqual([]);
  await context.close();
});

import { pathToFileURL } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import { createBlankBook, insertText, makeMascotPng } from './helpers';

const insertButton = async (page: Page, preset: RegExp) => {
  await page
    .getByRole('toolbar', { name: 'Insert' })
    .getByRole('button', { name: 'Button' })
    .click();
  await page.getByRole('menuitem', { name: preset }).click();
  await expect(page.getByRole('menu')).toBeHidden();
};

const pageThumb = (page: Page, n: number) =>
  page.getByRole('button', { name: `Page ${n}`, exact: true });

const buttonsOnStage = (page: Page) => page.locator('.fl-mode-editor .fl-el[data-type=button]');

/** Clears the selection by clicking an empty corner of the page. */
const clickEmpty = (page: Page) =>
  page.getByTestId('stage-page').click({ position: { x: 8, y: 8 } });

async function renameButton(page: Page, index: number, label: string) {
  await clickEmpty(page);
  await buttonsOnStage(page).nth(index).click();
  await page.getByRole('tab', { name: 'Design' }).click();
  await page.getByRole('textbox', { name: 'Label', exact: true }).fill(label);
}

test('a branching book, exported and read with the keyboard only, reaches both endings offline', async ({
  page,
  browser,
}) => {
  await createBlankBook(page, 'Two paths');
  await insertText(page, 'Where should Pip go?');
  const addPage = page.getByRole('button', { name: 'Add page', exact: true }).first();
  await addPage.click();
  await insertText(page, 'Into the forest');
  await addPage.click();
  await insertText(page, 'Out to sea');

  // Page 1: a choice (Forest → page 2, Sea → page 3); it locks "next" by itself.
  await pageThumb(page, 1).click();
  await insertButton(page, /Choice/);
  await expect(buttonsOnStage(page)).toHaveCount(2);
  await renameButton(page, 0, 'Forest');
  await renameButton(page, 1, 'Sea');
  await buttonsOnStage(page).nth(1).click();
  await page.getByRole('tab', { name: 'Interact' }).click();
  await page.getByRole('combobox', { name: 'Page to jump to' }).click();
  await page.getByRole('option', { name: 'Page 3' }).click();

  // Page 2 (the forest) ends the book instead of continuing to the sea.
  await pageThumb(page, 2).click();
  await clickEmpty(page);
  await page.getByRole('combobox', { name: 'After this page' }).click();
  await page.getByRole('option', { name: 'The end of the book' }).click();
  await expect(page.getByText('No problems found.')).toBeVisible();

  await page.getByRole('button', { name: 'Export' }).click();
  await expect(page.getByTestId('export-estimate')).toContainText('Estimated size');
  const [dl] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Download HTML' }).click(),
  ]);
  const file = test.info().outputPath('branching.html');
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
  const end = book.getByRole('dialog', { name: 'The End' });
  // The first key press during a page turn only finishes the turn; wait for it to settle.
  const settled = () => expect(book.locator('.fp-page')).toHaveCount(1);
  await expect(indicator).toHaveText('1 / 3');

  // The choice can't be skipped: next only hints.
  await book.keyboard.press('ArrowRight');
  await expect(indicator).toHaveText('1 / 3');
  await expect(book.locator('.fl-sr-only[aria-live]')).toHaveText(/Tap something/);

  // Ending 1: Tab to "Forest", Enter.
  await book.keyboard.press('Tab');
  await expect(book.getByRole('button', { name: 'Forest' })).toBeFocused();
  await book.keyboard.press('Enter');
  await expect(visible).toContainText('Into the forest');
  await settled();
  await book.keyboard.press('ArrowRight');
  await expect(end).toBeVisible();
  await expect(book.getByRole('button', { name: 'Read again' })).toBeFocused();
  await book.keyboard.press('Enter');
  await expect(end).toBeHidden();
  await expect(indicator).toHaveText('1 / 3');
  await settled();

  // Ending 2: Tab, Tab to "Sea", Space.
  await book.keyboard.press('Tab');
  await book.keyboard.press('Tab');
  await expect(book.getByRole('button', { name: 'Sea' })).toBeFocused();
  await book.keyboard.press('Space');
  await expect(visible).toContainText('Out to sea');
  await expect(indicator).toHaveText('3 / 3');
  await settled();
  await book.keyboard.press('ArrowRight');
  await expect(end).toBeVisible();

  // Back closes The End, then returns to the choice (not the forest page).
  await book.keyboard.press('ArrowLeft');
  await expect(end).toBeHidden();
  await book.keyboard.press('ArrowLeft');
  await expect(indicator).toHaveText('1 / 3');
  await expect(visible).toContainText('Where should Pip go?');

  expect(requests.filter((u) => !/^(file|data|blob):/.test(u))).toEqual([]);
  expect(errors).toEqual([]);
  await context.close();
});

test('tapping the mascot plays its reaction without turning the page', async ({ page }) => {
  await createBlankBook(page, 'Tap the mascot');
  const png = await makeMascotPng(page);
  await page
    .getByTestId('insert-character-input')
    .setInputFiles({ name: 'pip.png', mimeType: 'image/png', buffer: png });
  await page.getByRole('button', { name: 'Wiggle when tapped' }).click();
  await page.getByRole('button', { name: 'Add page', exact: true }).first().click();
  await pageThumb(page, 1).click();

  await page.getByRole('banner').getByRole('button', { name: 'Preview' }).click();
  const reader = page.getByTestId('preview');
  const mascot = reader.locator('.fp-page:not([aria-hidden]) .fl-el[data-character-id]');
  await expect(mascot).toHaveAttribute('data-interactive', '');
  await expect(mascot).toHaveAttribute('role', 'button');
  const reacting = () =>
    mascot.evaluate((el) =>
      el
        .querySelector('.fl-anim')!
        .getAnimations()
        .some((a) => a.playState === 'running' && a.effect?.getTiming().iterations !== Infinity),
    );
  await expect.poll(reacting).toBe(false);

  await mascot.click();
  await expect.poll(reacting).toBe(true);
  await expect(reader.locator('.fp-indicator')).toHaveText('1 / 2');

  // Tapping anywhere else still turns the page.
  await reader.locator('.fp-page:not([aria-hidden])').click({ position: { x: 20, y: 20 } });
  await expect(reader.locator('.fp-indicator')).toHaveText('2 / 2');
});

test('a locked page cannot be skipped until its button unlocks it', async ({ page }) => {
  await createBlankBook(page, 'Locked');
  await insertText(page, 'Find the key');
  await page.getByRole('button', { name: 'Add page', exact: true }).first().click();
  await insertText(page, 'The door opens');
  await pageThumb(page, 1).click();

  await insertButton(page, /Tap me!/);
  await page.getByRole('tab', { name: 'Interact' }).click();
  await page.getByRole('combobox', { name: 'Action 1' }).click();
  await page.getByRole('option', { name: 'Unlock the next page' }).click();
  await clickEmpty(page);
  await page.getByRole('switch', { name: /Tap something to continue/ }).click();
  await expect(page.getByText('No problems found.')).toBeVisible();

  await page.getByRole('banner').getByRole('button', { name: 'Preview' }).click();
  const reader = page.getByTestId('preview');
  const indicator = reader.locator('.fp-indicator');
  const visiblePage = reader.locator('.fp-page:not([aria-hidden])');
  await expect(indicator).toHaveText('1 / 2');

  // Keys, the next button, taps on the page and swipes all refuse to leave.
  await page.keyboard.press('ArrowRight');
  await reader.getByRole('button', { name: /Next page \(locked/ }).click();
  await visiblePage.click({ position: { x: 20, y: 20 } });
  await expect(indicator).toHaveText('1 / 2');
  await expect(reader.locator('.fp-root')).toHaveClass(/fp-hinting/);

  await reader.getByRole('button', { name: 'Tap me!' }).click();
  await expect(reader.getByRole('button', { name: 'Next page', exact: true })).toBeVisible();
  await page.keyboard.press('ArrowRight');
  await expect(indicator).toHaveText('2 / 2');
  await expect(reader.locator('.fp-page:not([aria-hidden])')).toContainText('The door opens');
});

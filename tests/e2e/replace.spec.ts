import { pathToFileURL } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import { createBlankBook, insertText, makeMascotPng, makePng, stageElements } from './helpers';

/** Drops a generated file onto the stage at the centre of `target`. */
async function dropFileOn(page: Page, target: string, name: string, bytes: Buffer) {
  const box = (await page.locator(target).boundingBox())!;
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  const dt = await page.evaluateHandle(
    ({ name, data }) => {
      const t = new DataTransfer();
      t.items.add(new File([new Uint8Array(data)], name, { type: 'image/png' }));
      return t;
    },
    { name, data: [...bytes] },
  );
  const viewport = page.getByTestId('stage-viewport');
  await viewport.dispatchEvent('dragover', { dataTransfer: dt, clientX: x, clientY: y });
  await expect(page.getByText('Drop to replace this picture')).toBeVisible();
  await viewport.dispatchEvent('drop', { dataTransfer: dt, clientX: x, clientY: y });
}

const imageSrc = (page: Page) =>
  stageElements(page, 'image').first().locator('img').first().getAttribute('src');

test('dropping a picture onto a picture replaces it and keeps its animation and tap action', async ({
  page,
  browser,
}) => {
  await createBlankBook(page, 'Replace');
  await page.getByTestId('insert-image-input').setInputFiles({
    name: 'red.png',
    mimeType: 'image/png',
    buffer: await makePng(page, '#e11d48', 320, 240),
  });
  const image = stageElements(page, 'image');
  await expect(image).toHaveCount(1);
  const id = await image.getAttribute('data-element-id');
  await image.click();
  await page.getByRole('tab', { name: 'Animate' }).click();
  await page.getByRole('button', { name: /Add animation/ }).click();
  await page.getByRole('menuitem', { name: 'Fade in', exact: true }).click();
  await page.getByRole('tab', { name: 'Interact' }).click();
  await page.getByRole('button', { name: 'Add tap action' }).click();
  await page.getByRole('menuitem', { name: 'Burst of fun' }).click();

  const before = await imageSrc(page);
  await dropFileOn(
    page,
    `.fl-mode-editor .fl-el[data-element-id="${id}"]`,
    'blue.png',
    await makePng(page, '#2563eb', 200, 200),
  );
  await expect.poll(() => imageSrc(page)).not.toBe(before);
  await expect(image).toHaveCount(1);
  await expect(image).toHaveAttribute('data-element-id', id!);
  await page.getByRole('tab', { name: 'Animate' }).click();
  await expect(page.getByTestId('animation-step')).toContainText('Fade in');
  await page.getByRole('tab', { name: 'Design' }).click();
  await expect(page.getByRole('button', { name: 'Fit whole picture' })).toBeVisible();

  // The exported book: new picture, same animation and tap action.
  await page.getByRole('button', { name: 'Export' }).click();
  await expect(page.getByTestId('export-estimate')).toContainText('Estimated size');
  const [dl] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Download HTML' }).click(),
  ]);
  const file = test.info().outputPath('replaced.html');
  await dl.saveAs(file);
  const context = await browser.newContext();
  const book = await context.newPage();
  await book.goto(pathToFileURL(file).href);
  const pic = book.locator('.fp-page:not([aria-hidden]) .fl-el[data-type=image]');
  await expect(pic).toHaveAttribute('data-interactive', '');
  await expect
    .poll(() => pic.locator('.fl-anim').evaluate((el) => Number(getComputedStyle(el).opacity)))
    .toBe(1);
  await pic.click();
  await expect(book.locator('.fp-particle').first()).toBeAttached();
  await context.close();
});

test('replace with another kind of element keeps what still works, with an Undo', async ({
  page,
}) => {
  await createBlankBook(page, 'Replace types');
  await insertText(page, 'Hello there');
  const text = stageElements(page, 'text');
  await text.click();
  await page.getByRole('tab', { name: 'Animate' }).click();
  for (const name of ['Typewriter', 'Pulse']) {
    await page.getByRole('button', { name: /Add animation/ }).click();
    await page.getByRole('menuitem', { name, exact: true }).click();
  }
  await expect(page.getByTestId('animation-step')).toHaveCount(2);

  await text.click({ button: 'right' });
  const menu = page.getByTestId('context-menu');
  await menu.getByRole('menuitem', { name: /Replace with/ }).click();
  await page.getByRole('menuitem', { name: 'Rectangle' }).click();
  await expect(stageElements(page, 'shape')).toHaveCount(1);
  await expect(
    page.getByText(/Removed animations that don’t work on a shape: Typewriter/),
  ).toBeVisible();
  await expect(page.getByTestId('animation-step')).toHaveCount(1);
  await expect(page.getByTestId('animation-step')).toContainText('Pulse');

  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(stageElements(page, 'text')).toHaveCount(1);
  await expect(page.getByTestId('animation-step')).toHaveCount(2);
});

test('replacing a character’s picture can update the character on every page', async ({ page }) => {
  await createBlankBook(page, 'Replace Pip');
  await page
    .getByTestId('insert-character-input')
    .setInputFiles({ name: 'pip.png', mimeType: 'image/png', buffer: await makeMascotPng(page) });
  const pip = page.locator('.fl-mode-editor .fl-el[data-character-id]');
  await expect(pip).toHaveCount(1);
  await page.getByRole('tab', { name: 'Animate' }).click();
  await page.getByRole('button', { name: /Add animation/ }).click();
  await page.getByRole('menuitem', { name: /Walk in/ }).click();
  const steps = page.getByTestId('animation-step');
  const count = await steps.count();

  const id = await pip.getAttribute('data-element-id');
  const before = await pip.locator('img').first().getAttribute('src');
  await dropFileOn(
    page,
    `.fl-mode-editor .fl-el[data-element-id="${id}"]`,
    'pip2.png',
    await makeMascotPng(page, true),
  );
  const dialog = page.getByRole('alertdialog');
  await expect(dialog).toContainText('Change pip everywhere?');
  await dialog.getByRole('button', { name: 'Update pip on every page' }).click();
  await expect.poll(() => pip.locator('img').first().getAttribute('src')).not.toBe(before);
  await expect(pip).toHaveCount(1); // still a character
  await expect(steps).toHaveCount(count);
  await expect(steps.filter({ hasText: 'Walk in' })).toHaveCount(1);
});

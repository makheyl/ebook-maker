import { pathToFileURL } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import { createBlankBook, makeMascotPng } from './helpers';

const characterOnStage = (page: Page) => page.locator('.fl-mode-editor .fl-el[data-character-id]');
const bubbleOnStage = (page: Page) => page.locator('.fl-mode-editor .fl-el[data-type=bubble]');

async function addPip(page: Page) {
  const png = await makeMascotPng(page);
  await page
    .getByTestId('insert-character-input')
    .setInputFiles({ name: 'pip.png', mimeType: 'image/png', buffer: png });
  await expect(characterOnStage(page)).toHaveCount(1);
}

async function insertBubble(page: Page, text: string) {
  await page
    .getByRole('toolbar', { name: 'Insert' })
    .getByRole('button', { name: 'Bubble' })
    .click();
  await page.getByRole('menuitem', { name: 'Speech' }).click();
  // The new bubble opens for typing with its placeholder words selected.
  await expect(page.locator('[contenteditable=true]')).toBeFocused();
  await page.keyboard.type(text);
  await page.keyboard.press('Escape');
  await expect(bubbleOnStage(page)).toContainText(text);
}

test('a bubble attached to a walking character moves with it, the same in the exported book', async ({
  page,
  browser,
}) => {
  await createBlankBook(page, 'Talking Pip');
  await addPip(page);
  await page.getByRole('tab', { name: 'Animate' }).click();
  await page.getByRole('button', { name: /Add animation/ }).click();
  await page.getByRole('menuitem', { name: /Walk in/ }).click();

  // With Pip selected, the bubble goes above Pip with its tail on Pip's head.
  await insertBubble(page, 'Hi, I am Pip!');
  await expect(page.getByTestId('bubble-tail-handle')).toHaveAttribute(
    'aria-valuetext',
    'Tail attached to pip',
  );
  await expect(bubbleOnStage(page).locator('.fl-sr-only')).toHaveText('pip says:');
  await expect(bubbleOnStage(page).locator('.fl-bubble-shape path')).toHaveCount(3);

  await page.getByTitle('Timeline (T)').click();
  const input = page.getByLabel('Playhead time');
  await input.fill('0.5');
  await input.press('Enter');
  const read = (root: Page, scope: string) =>
    root.evaluate((scope) => {
      const m = (sel: string) =>
        new DOMMatrixReadOnly(
          getComputedStyle(document.querySelector(`${scope} ${sel}`)!).transform,
        );
      const bubble = m('.fl-el[data-type=bubble] > .fl-follow');
      const pip = m('.fl-el[data-character-id] > .fl-anim');
      return {
        bubble: [bubble.m41.toFixed(1), bubble.m42.toFixed(1)],
        pip: [pip.m41.toFixed(1), pip.m42.toFixed(1)],
      };
    }, scope);
  const editor = await read(page, '.fl-mode-editor');
  expect(Number(editor.pip[0])).not.toBe(0); // mid-walk
  expect(editor.bubble).toEqual(editor.pip); // the bubble travels with Pip

  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Export' }).click();
  await expect(page.getByTestId('export-estimate')).toContainText('Estimated size');
  const [dl] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Download HTML' }).click(),
  ]);
  const file = test.info().outputPath('bubble.html');
  await dl.saveAs(file);
  const context = await browser.newContext();
  const book = await context.newPage();
  await book.goto(pathToFileURL(file).href);
  const reader = book.locator('.fp-page:not([aria-hidden]) .fl-el[data-type=bubble]');
  await expect(reader).toContainText('Hi, I am Pip!');
  await expect(reader.locator('.fl-sr-only')).toHaveText('pip says:');
  await book.evaluate(() => {
    (window as unknown as { folioPlayer: { seek(g: number, ms: number): void } }).folioPlayer.seek(
      0,
      500,
    );
  });
  expect(await read(book, '.fp-page:not([aria-hidden])')).toEqual(editor);
  await context.close();
});

test('a bubble can wait for its speaker to be tapped', async ({ page }) => {
  await createBlankBook(page, 'Tap Pip');
  await addPip(page);
  await insertBubble(page, 'You found me!');
  await page.getByRole('tab', { name: 'Design' }).click();
  await page.getByRole('switch', { name: 'Show when the speaker is tapped' }).click();
  await expect(page.getByRole('switch', { name: 'Show when the speaker is tapped' })).toBeChecked();

  await page.getByRole('banner').getByRole('button', { name: 'Preview' }).click();
  const reader = page.getByTestId('preview');
  const current = reader.locator('.fp-page:not([aria-hidden])');
  const bubbleOpacity = () =>
    current
      .locator('.fl-el[data-type=bubble] .fl-anim')
      .evaluate((el) => Number(getComputedStyle(el).opacity));
  await expect.poll(bubbleOpacity).toBe(0);
  await current.locator('.fl-el[data-character-id]').click();
  await expect.poll(bubbleOpacity).toBe(1);
});

test('dragging the tail tip onto a character attaches it; the panel can free it again', async ({
  page,
}) => {
  await createBlankBook(page, 'Point at Pip');
  await addPip(page);
  // Nothing selected: the bubble is centred with a free tail.
  await page.getByTestId('stage-page').click({ position: { x: 8, y: 8 } });
  await insertBubble(page, 'Who said that?');
  const handle = page.getByTestId('bubble-tail-handle');
  await expect(handle).toHaveAttribute('aria-valuetext', 'Tail free');

  const from = (await handle.boundingBox())!;
  const pip = (await characterOnStage(page).boundingBox())!;
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(pip.x + pip.width / 2, pip.y + pip.height / 2, { steps: 8 });
  await page.mouse.up();
  await expect(handle).toHaveAttribute('aria-valuetext', 'Tail attached to pip');
  await expect(bubbleOnStage(page).locator('.fl-sr-only')).toHaveText('pip says:');

  await page.getByRole('combobox', { name: 'Tail points at' }).click();
  await page.getByRole('option', { name: /Nothing/ }).click();
  await expect(handle).toHaveAttribute('aria-valuetext', 'Tail free');
  // One undo brings the attachment back.
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(handle).toHaveAttribute('aria-valuetext', 'Tail attached to pip');
});

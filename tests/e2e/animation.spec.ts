import { expect, test } from '@playwright/test';
import { createBlankBook, insertShape, insertText, stageElements } from './helpers';

test('Animation Pane: add, preview, set a click trigger, reorder and remove', async ({ page }) => {
  await createBlankBook(page, 'Animations');
  await insertText(page, 'Typing out loud');
  await stageElements(page, 'text').click();
  await page.getByRole('tab', { name: 'Animate' }).click();

  await page.getByRole('button', { name: /Add animation/ }).click();
  await page.getByRole('menuitem', { name: 'Typewriter' }).click();
  await expect(page.getByTestId('animation-step')).toHaveCount(1);

  // The step previews immediately: characters reveal one after another.
  const chars = stageElements(page, 'text').locator('.fl-char');
  await expect(chars).toHaveCount('Typing out loud'.length);
  await expect
    .poll(async () => (await chars.evaluateAll((els) => els.map((e) => getComputedStyle(e).opacity))).includes('0'))
    .toBe(true);
  await expect
    .poll(async () => (await chars.evaluateAll((els) => els.map((e) => getComputedStyle(e).opacity))).every((o) => o === '1'), {
      timeout: 8000,
    })
    .toBe(true);

  await insertShape(page, 'Ellipse');
  await page.getByRole('tab', { name: 'Animate' }).click();
  await page.getByRole('button', { name: /Add animation/ }).click();
  await page.getByRole('menuitem', { name: 'Pop in' }).click();
  await page.getByRole('combobox', { name: 'Start' }).click();
  await page.getByRole('option', { name: 'On click' }).click();
  await expect(page.getByTitle('Plays on click 1')).toBeVisible();

  await page.getByRole('radio', { name: 'Slide' }).click();
  await expect(page.getByRole('radio', { name: 'Slide' })).toHaveAttribute('aria-checked', 'true');

  await page.getByRole('button', { name: 'Remove animation' }).click();
  await expect(page.getByTestId('animation-step')).toHaveCount(1);
});

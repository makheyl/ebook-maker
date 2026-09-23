import { expect, test } from '@playwright/test';
import { makePng, stageElements, waitForSaved } from './helpers';

test('quick-create a 3-page book from bulk images + text, then edit it', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'Quick create' }).first().click();
  await expect(page.getByRole('heading', { name: 'Let’s start your book' })).toBeVisible();

  await page.getByLabel('Title').fill('The Curious Fox');
  await page.getByRole('radio', { name: /Portrait book/ }).click();
  await page.getByRole('button', { name: 'Continue' }).click();

  // Bulk: three images + three lines, paired by order.
  const files = await Promise.all(
    ['#ff8a00', '#3aa0ff', '#4cc38a'].map(async (color, i) => ({
      name: `page-${i + 1}.png`,
      mimeType: 'image/png',
      buffer: await makePng(page, color, 400 + i, 300),
    })),
  );
  await page.getByTestId('bulk-images-input').setInputFiles(files);
  await expect(page.getByTestId('wizard-row')).toHaveCount(3);
  await page
    .getByLabel('Paste your text')
    .fill('Once upon a time\n\nA fox found a door\nAnd opened it');
  await page.getByRole('button', { name: 'Add 3 lines' }).click();
  await expect(page.getByLabel('Text for page 1')).toHaveValue('Once upon a time');
  await expect(page.getByLabel('Text for page 3')).toHaveValue('And opened it');

  // Re-pair: swap the images of pages 1 and 2.
  await page.getByRole('button', { name: 'Move image of page 1 down' }).click();

  await page.getByRole('button', { name: 'Continue' }).click();
  // Skip the optional character step.
  await expect(page.getByRole('heading', { name: 'Add a character (optional)' })).toBeVisible();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('radio', { name: 'Full-page picture' }).click();
  await page.getByRole('radio', { name: 'Cream' }).click();
  await page.getByRole('button', { name: 'Create 3-page book' }).click();

  // Lands in the editor with three generated pages.
  await expect(page.getByTestId('page-item')).toHaveCount(3);
  await expect(stageElements(page, 'image')).toHaveCount(1);
  await expect(stageElements(page, 'text')).toContainText('Once upon a time');
  await expect(page.getByRole('textbox', { name: 'Book title' })).toHaveValue('The Curious Fox');

  // Generated elements are ordinary, editable elements.
  await stageElements(page, 'text').click();
  const size = page.getByLabel('Size');
  await size.fill('72');
  await size.press('Enter');
  await expect(stageElements(page, 'text').locator('.fl-text')).toHaveCSS('font-size', '72px');

  // Template animations were added.
  await page.getByRole('tab', { name: 'Animate' }).click();
  await expect(page.getByTestId('animation-step')).toHaveCount(2);

  await page.getByRole('button', { name: 'Page 3', exact: true }).click();
  await expect(stageElements(page, 'text')).toContainText('And opened it');
  await waitForSaved(page);
});

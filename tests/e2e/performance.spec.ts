import { expect, test } from '@playwright/test';
import { insertShape, stageElements, waitForSaved } from './helpers';

test('a 100-page book stays responsive (virtualized sidebar, fast page switches)', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.goto('/#/new');
  await page.getByLabel('Title').fill('Hundred pages');
  await page.getByRole('button', { name: 'Continue' }).click();
  const lines = Array.from({ length: 100 }, (_, i) => `Page number ${i + 1}`).join('\n');
  await page.getByLabel('Paste your text').fill(lines);
  await page.getByRole('button', { name: 'Add 100 lines' }).click();
  await expect(page.getByTestId('wizard-row')).toHaveCount(100);
  await page.getByRole('button', { name: 'Continue' }).click();

  const started = Date.now();
  await page.getByRole('button', { name: 'Create 100-page book' }).click();
  await expect(page.getByText('100 pages')).toBeVisible();
  expect(Date.now() - started).toBeLessThan(10_000);

  // Only a window of thumbnails is in the DOM.
  const rendered = await page.getByTestId('page-item').count();
  expect(rendered).toBeGreaterThan(0);
  expect(rendered).toBeLessThan(40);

  // Step through pages with the keyboard; the stage follows quickly.
  await page.getByRole('button', { name: 'Page 1', exact: true }).focus();
  const t0 = Date.now();
  for (let i = 0; i < 5; i++) await page.keyboard.press('ArrowDown');
  await expect(stageElements(page, 'text')).toContainText('Page number 6');
  expect(Date.now() - t0).toBeLessThan(3000);

  // End jumps to the last page; the virtualized list scrolls it into view.
  await page.keyboard.press('End');
  await expect(stageElements(page, 'text')).toContainText('Page number 100');
  await expect(page.getByRole('button', { name: 'Page 100', exact: true })).toHaveAttribute(
    'aria-current',
    'page',
  );
  await page.keyboard.press('Home');
  await expect(stageElements(page, 'text')).toContainText('Page number 1');
  await page
    .getByRole('navigation', { name: 'Pages' })
    .locator('.overflow-y-auto')
    .evaluate((el) => el.scrollTo(0, el.scrollHeight));
  await page.getByRole('button', { name: 'Page 100', exact: true }).click();
  await expect(stageElements(page, 'text')).toContainText('Page number 100');

  // Editing still works and autosaves.
  await insertShape(page, 'Rectangle');
  await expect(stageElements(page, 'shape')).toHaveCount(1);
  await waitForSaved(page);

  // The reader handles it too.
  await page.getByRole('button', { name: 'Preview' }).click();
  await expect(page.getByTestId('preview').locator('.fp-indicator')).toHaveText('100 / 100');
  await page.keyboard.press('Home');
  await expect(page.getByTestId('preview').locator('.fp-indicator')).toHaveText('1 / 100');
});

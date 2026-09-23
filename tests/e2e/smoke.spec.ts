import { expect, test } from '@playwright/test';

test('app boots to the dashboard', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Your books' })).toBeVisible();
  expect(errors).toEqual([]);
});

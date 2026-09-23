import { expect, test } from '@playwright/test';

test('create, rename, duplicate and delete books; changes survive a reload', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Make your first book' })).toBeVisible();

  // Create
  await page.getByRole('button', { name: 'Blank book' }).click();
  await page.getByLabel('Title').fill('Moon Story');
  await page.getByRole('radio', { name: /Square/ }).click();
  await page.getByRole('button', { name: 'Create book' }).click();
  await expect(page).toHaveURL(/#\/p\/bk_/);

  // Back to dashboard; persisted after reload
  await page.goto('/');
  await page.reload();
  const cards = page.getByTestId('project-card');
  await expect(cards).toHaveCount(1);
  await expect(cards.first()).toContainText('Moon Story');

  // Rename
  await page.getByRole('button', { name: 'More actions for Moon Story' }).click();
  await page.getByRole('menuitem', { name: 'Rename' }).click();
  await page.getByLabel('Title').fill('Sun Story');
  await page.getByRole('button', { name: 'Rename' }).click();
  await expect(cards.first()).toContainText('Sun Story');

  // Duplicate
  await page.getByRole('button', { name: 'More actions for Sun Story' }).click();
  await page.getByRole('menuitem', { name: 'Duplicate' }).click();
  await expect(cards).toHaveCount(2);
  await expect(page.getByText('Sun Story (copy)')).toBeVisible();

  // Delete (with confirmation)
  await page.getByRole('button', { name: 'More actions for Sun Story (copy)' }).click();
  await page.getByRole('menuitem', { name: 'Delete' }).click();
  await page.getByRole('button', { name: 'Delete' }).click();
  await expect(cards).toHaveCount(1);

  await page.reload();
  await expect(cards).toHaveCount(1);
  await expect(cards.first()).toContainText('Sun Story');
});

test('shows a friendly screen for a missing book', async ({ page }) => {
  await page.goto('/#/p/does-not-exist');
  await expect(page.getByRole('heading', { name: 'This book doesn’t exist' })).toBeVisible();
});

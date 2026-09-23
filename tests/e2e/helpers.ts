import { expect, type Page } from '@playwright/test';

/** Creates a blank book from the dashboard and waits for the editor. */
export async function createBlankBook(page: Page, title = 'Test book') {
  await page.goto('/');
  await page.getByRole('button', { name: 'Blank book' }).first().click();
  await page.getByLabel('Title').fill(title);
  await page.getByRole('button', { name: 'Create book' }).click();
  await expect(page.locator('[data-testid=stage-page] .fl-page')).toBeVisible();
}

export const stageElements = (page: Page, type?: 'text' | 'image' | 'shape') =>
  page.locator(`.fl-mode-editor .fl-el${type ? `[data-type=${type}]` : ''}`);

export async function waitForSaved(page: Page) {
  await expect(page.getByTestId('save-status')).toHaveText(/Saved/, { timeout: 10_000 });
}

export async function insertShape(page: Page, name: 'Rectangle' | 'Ellipse' | 'Line') {
  await page
    .getByRole('toolbar', { name: 'Insert' })
    .getByRole('button', { name: 'Shape' })
    .click();
  await page.getByRole('menuitem', { name }).click();
  await expect(page.getByRole('menu')).toBeHidden();
}

export async function insertText(page: Page, text: string) {
  await page.getByRole('toolbar', { name: 'Insert' }).getByRole('button', { name: 'Text' }).click();
  await page.keyboard.type(text);
  await page.keyboard.press('Escape');
}

/** A tiny PNG generated in the browser, for upload tests. */
export async function makePng(page: Page, color: string, w = 64, h = 48): Promise<Buffer> {
  const base64 = await page.evaluate(
    async ({ color, w, h }) => {
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      const ctx = c.getContext('2d')!;
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, w, h);
      return c.toDataURL('image/png').split(',')[1]!;
    },
    { color, w, h },
  );
  return Buffer.from(base64, 'base64');
}

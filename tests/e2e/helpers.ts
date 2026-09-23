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

/**
 * A transparent-background mascot drawn in the browser: a round body with ears and eyes,
 * standing on its feet at 90% of the image height, with empty padding around it.
 */
export async function makeMascotPng(page: Page, opaque = false): Promise<Buffer> {
  const base64 = await page.evaluate((opaque) => {
    const c = document.createElement('canvas');
    c.width = 400;
    c.height = 500;
    const g = c.getContext('2d')!;
    if (opaque) {
      g.fillStyle = '#ffffff';
      g.fillRect(0, 0, 400, 500);
    }
    g.fillStyle = '#ff8a3d';
    g.beginPath();
    g.moveTo(130, 120);
    g.lineTo(150, 40);
    g.lineTo(190, 110);
    g.moveTo(210, 110);
    g.lineTo(250, 40);
    g.lineTo(270, 120);
    g.fill();
    g.beginPath();
    g.ellipse(200, 280, 120, 170, 0, 0, Math.PI * 2); // body: y 110 → 450 (90% of 500)
    g.fill();
    g.fillStyle = '#1f1d2b';
    g.beginPath();
    g.arc(160, 230, 14, 0, Math.PI * 2);
    g.arc(240, 230, 14, 0, Math.PI * 2);
    g.fill();
    return c.toDataURL('image/png').split(',')[1]!;
  }, opaque);
  return Buffer.from(base64, 'base64');
}

/** Parses "50% 90%"-style transform origins. */
export function parseOrigin(origin: string): { x: number; y: number } {
  const [x, y] = origin.split(' ').map((v) => Number.parseFloat(v));
  return { x: x!, y: y! };
}

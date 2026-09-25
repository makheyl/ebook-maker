import { expect, test } from '@playwright/test';

test('Inkbug: title, favicons and the logo', async ({ page, request }) => {
  await page.goto('/');
  await expect(page).toHaveTitle('Inkbug');
  const icons = await page
    .locator('link[rel="icon"], link[rel="apple-touch-icon"], link[rel="manifest"]')
    .evaluateAll((links) => links.map((l) => (l as HTMLLinkElement).href));
  expect(icons.length).toBeGreaterThanOrEqual(4);
  for (const href of icons) {
    const res = await request.get(href);
    expect(res.status(), href).toBe(200);
    expect(res.headers()['content-type'], href).toMatch(/image\/|json|manifest/);
  }
  const mark = page.getByRole('banner').locator('img').first();
  await expect(mark).toBeVisible();
  expect(await mark.evaluate((img) => (img as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  await expect(page.getByRole('banner')).toContainText('Inkbug');
});

test('glass panels turn solid for readers who ask for less transparency', async ({ page }) => {
  await page.goto('/');
  const header = page.getByRole('banner');
  await expect(header).toBeVisible();
  const blur = () => header.evaluate((el) => getComputedStyle(el).backdropFilter);
  expect(await blur()).toContain('blur');
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-reduced-transparency', value: 'reduce' }],
  });
  await expect.poll(blur).toBe('none');
});

import { pathToFileURL } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import { createBlankBook, insertShape, stageElements } from './helpers';

const layerRows = (page: Page) => page.getByRole('list', { name: 'Layers' }).getByRole('listitem');
const selectedIds = (page: Page) =>
  page.evaluate(() => [...document.querySelectorAll('.moveable-control-box')].length);

async function twoShapes(page: Page) {
  await insertShape(page, 'Rectangle');
  await insertShape(page, 'Ellipse');
  // Move the ellipse away so both can be clicked.
  for (let i = 0; i < 20; i++) await page.keyboard.press('Shift+ArrowRight');
  await page.getByTestId('stage-page').click({ position: { x: 5, y: 5 } });
}

test('group with Mod+G, select as one, double-click inside, resize, ungroup, undo', async ({
  page,
}) => {
  await createBlankBook(page, 'Groups');
  await twoShapes(page);
  await page.getByRole('tab', { name: 'Layers' }).click();
  await expect(layerRows(page)).toHaveCount(2);

  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.press('ControlOrMeta+g');
  await expect(layerRows(page)).toHaveCount(3);
  await expect(layerRows(page).first()).toContainText('Group');
  await expect(layerRows(page).nth(1)).toHaveAttribute('data-depth', '1');
  const group = page.locator('.fl-page.fl-mode-editor > .fl-el[data-type=group]');
  await expect(group).toHaveCount(1);
  await expect(group.locator('.fl-el[data-type=shape]')).toHaveCount(2);

  // A click on an item selects the whole group…
  await page.getByTestId('stage-page').click({ position: { x: 5, y: 5 } });
  await stageElements(page, 'shape').first().click();
  await page.getByRole('tab', { name: 'Design' }).click();
  await expect(page.getByRole('button', { name: 'Ungroup' })).toBeVisible();
  // …a double-click edits the item inside.
  await stageElements(page, 'shape').first().dblclick();
  await expect(page.getByRole('button', { name: 'Ungroup' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Shape', exact: true })).toBeVisible(); // its own panel
  await page.keyboard.press('Escape'); // back up to the group
  await expect(page.getByRole('button', { name: 'Ungroup' })).toBeVisible();

  // Resizing the group scales its items.
  const itemWidth = () =>
    stageElements(page, 'shape')
      .first()
      .evaluate((el) => (el as HTMLElement).offsetWidth);
  const before = await itemWidth();
  const w = page.getByRole('textbox', { name: 'Width', exact: true });
  const groupWidth = Number(await w.inputValue());
  await w.fill(String(groupWidth * 2));
  await w.press('Enter');
  await expect.poll(itemWidth).toBeCloseTo(before * 2, -1);

  // Ungroup: items back on the page; each action undoes in one step.
  await page.getByRole('button', { name: 'Ungroup' }).click();
  await page.getByRole('tab', { name: 'Layers' }).click();
  await expect(layerRows(page)).toHaveCount(2);
  await expect(group).toHaveCount(0);
  await page.keyboard.press('ControlOrMeta+z');
  await expect(layerRows(page)).toHaveCount(3);
  await page.keyboard.press('ControlOrMeta+z'); // the resize
  await expect.poll(itemWidth).toBeCloseTo(before, -1);
  await page.keyboard.press('ControlOrMeta+z'); // the grouping
  await expect(layerRows(page)).toHaveCount(2);
  void selectedIds;
});

test('the right-click menu groups, and a group animation matches in the exported book', async ({
  page,
  browser,
}) => {
  await createBlankBook(page, 'Group parity');
  await twoShapes(page);
  await page.keyboard.press('ControlOrMeta+a');
  // With several items selected the selection box covers them; right-click on it.
  await stageElements(page, 'shape').first().click({ button: 'right', force: true });
  await page
    .getByTestId('context-menu')
    .getByRole('menuitem', { name: /^Group/ })
    .click();
  const group = page.locator('.fl-page.fl-mode-editor > .fl-el[data-type=group]');
  await expect(group).toHaveCount(1);

  // Animate the group as one.
  await page.getByRole('tab', { name: 'Animate' }).click();
  await page.getByRole('button', { name: /Add animation/ }).click();
  await page.getByRole('menuitem', { name: 'Slide up', exact: true }).click();
  await expect(page.getByTestId('animation-step')).toHaveCount(1);

  await page.getByTitle('Timeline (T)').click();
  const input = page.getByLabel('Playhead time');
  await input.fill('0.3');
  await input.press('Enter');
  const read = (root: Page, scope: string) =>
    root.evaluate((scope) => {
      const anim = document.querySelector(`${scope} .fl-el[data-type=group] > .fl-anim`)!;
      const s = getComputedStyle(anim);
      return { transform: s.transform, opacity: Number(s.opacity).toFixed(2) };
    }, scope);
  const editor = await read(page, '.fl-mode-editor');
  expect(editor.transform).not.toBe('none'); // mid-slide

  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Export' }).click();
  await expect(page.getByTestId('export-estimate')).toContainText('Estimated size');
  const [dl] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Download HTML' }).click(),
  ]);
  const file = test.info().outputPath('group.html');
  await dl.saveAs(file);
  const context = await browser.newContext();
  const book = await context.newPage();
  await book.goto(pathToFileURL(file).href);
  await expect(
    book.locator('.fp-page .fl-el[data-type=group] .fl-el[data-type=shape]'),
  ).toHaveCount(2);
  await book.evaluate(() => {
    (window as unknown as { folioPlayer: { seek(g: number, ms: number): void } }).folioPlayer.seek(
      0,
      300,
    );
  });
  expect(await read(book, '.fp-page:not([aria-hidden])')).toEqual(editor);
  await context.close();
});

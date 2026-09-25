import { expect, test } from '@playwright/test';
import {
  addLanguages,
  createBlankBook,
  insertText,
  makeMascotPng,
  makeWav,
  uploadVoiceClip,
  waitForSaved,
} from './helpers';

test('voiceover in two languages survives export and import; sound effects stay separate', async ({
  page,
}) => {
  await createBlankBook(page, 'Two voices');
  await insertText(page, 'Once upon a time');
  await addLanguages(page, ['English', 'Tagalog']);
  await expect(page.getByText('Default', { exact: true })).toBeVisible();

  // One slot per language for this page.
  await uploadVoiceClip(page, /Upload English voiceover for page 1/, makeWav(300), 'p1-en.wav');
  await expect(page.getByTestId('voice-slot-en')).toContainText('p1-en.wav');
  // Tagalog has no clip yet: the reader will hear English there.
  await expect(page.getByTestId('voice-slot-tl')).toContainText('Uses English');
  await uploadVoiceClip(page, /Upload Tagalog voiceover for page 1/, makeWav(400), 'p1-tl.wav');
  await expect(page.getByTestId('voice-slot-tl')).toContainText('p1-tl.wav');

  // Sound effects are their own section.
  const effects = page.getByRole('list', { name: 'Sound effects' });
  await expect(effects).toHaveCount(0);
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByRole('button', { name: 'Upload sound' }).click(),
  ]);
  await chooser.setFiles({ name: 'birds.wav', mimeType: 'audio/wav', buffer: makeWav(200, 2) });
  await expect(effects.getByRole('listitem')).toHaveCount(1);
  await page.getByRole('combobox', { name: 'When this page opens' }).click();
  await page.getByRole('option', { name: 'birds' }).click();
  await waitForSaved(page);

  // Export, then import the export: both recordings come back.
  await page.getByRole('button', { name: 'Export' }).click();
  await expect(page.getByTestId('export-estimate')).toContainText('voiceover');
  const [dl] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Download HTML' }).click(),
  ]);
  const file = test.info().outputPath('two-voices.html');
  await dl.saveAs(file);
  await page.keyboard.press('Escape');

  await page.goto('/');
  await page.getByTestId('import-input').setInputFiles(file);
  const dialog = page.getByTestId('import-dialog');
  await expect(dialog).toContainText('2 voice recordings');
  await expect(dialog.getByRole('alert')).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Import book' }).click();
  await expect(page.locator('[data-testid=stage-page] .fl-page')).toBeVisible();
  await page.getByTestId('stage-page').click({ position: { x: 8, y: 8 } });
  await page.getByRole('tab', { name: 'Audio' }).click();
  await expect(page.getByTestId('voice-slot-en')).toContainText('p1-en.wav');
  await expect(page.getByTestId('voice-slot-tl')).toContainText('p1-tl.wav');
  await expect(page.getByRole('combobox', { name: 'When this page opens' })).toHaveText('birds');
  // The recordings still play in the editor.
  await page.getByRole('button', { name: 'Play Tagalog voiceover for page 1' }).click();
  await expect(
    page.getByRole('button', { name: 'Stop Tagalog voiceover for page 1' }),
  ).toBeVisible();
});

test('removing a language removes its recordings, with Undo', async ({ page }) => {
  await createBlankBook(page, 'Remove a language');
  await addLanguages(page, ['English', 'Tagalog']);
  await uploadVoiceClip(page, /Upload Tagalog voiceover for page 1/, makeWav(300), 'tl.wav');
  await page.getByRole('button', { name: 'Remove Tagalog' }).click();
  await expect(page.getByText('Removed Tagalog and 1 recording.')).toBeVisible();
  await expect(page.getByTestId('voice-slot-tl')).toHaveCount(0);
  await page.getByRole('button', { name: 'Undo' }).last().click();
  await expect(page.getByTestId('voice-slot-tl')).toContainText('tl.wav');
});

test('bulk upload by file name fills the overview; checks list what falls back', async ({
  page,
}) => {
  await createBlankBook(page, 'Bulk voices');
  await insertText(page, 'One');
  await page.getByRole('button', { name: 'Add page', exact: true }).first().click();
  await insertText(page, 'Two');
  await addLanguages(page, ['English', 'Tagalog']);

  await page.getByRole('button', { name: 'Voiceover overview' }).click();
  const dialog = page.getByTestId('voice-overview');
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    dialog.getByRole('button', { name: 'Upload many files…' }).click(),
  ]);
  await chooser.setFiles([
    { name: 'page-01-en.wav', mimeType: 'audio/wav', buffer: makeWav(200) },
    { name: 'page-01-tl.wav', mimeType: 'audio/wav', buffer: makeWav(260) },
    { name: 'page-02-en.wav', mimeType: 'audio/wav', buffer: makeWav(320) },
    { name: 'cover.wav', mimeType: 'audio/wav', buffer: makeWav(380) },
  ]);
  await expect(dialog.getByTestId('bulk-row')).toHaveCount(4);
  await expect(dialog.getByTestId('bulk-row').nth(3)).toContainText('Skipped');
  await dialog.getByRole('button', { name: 'Add 3 recordings' }).click();
  await expect(dialog.getByTestId('cell-Page 1-en').getByLabel('Recorded')).toBeVisible();
  await expect(dialog.getByTestId('cell-Page 1-tl').getByLabel('Recorded')).toBeVisible();
  await expect(dialog.getByTestId('cell-Page 2-en').getByLabel('Recorded')).toBeVisible();
  await expect(dialog.getByTestId('cell-Page 2-tl')).toContainText('↩ EN');
  await page.keyboard.press('Escape');

  // One undo removes the whole bulk upload.
  await expect(page.getByRole('list', { name: 'Voiceover checks' })).toContainText(
    'No Tagalog recording for Page 2 — English plays there instead.',
  );
  await page.getByRole('tab', { name: 'Interact' }).click();
  await expect(page.getByRole('list', { name: 'Problems' })).toContainText(
    'No Tagalog recording for Page 2',
  );
  await page.getByRole('button', { name: 'Undo' }).click();
  await page.getByRole('tab', { name: 'Audio' }).click();
  await expect(page.getByTestId('voice-slot-en')).toContainText('Drop a file or');
});

test('a character can speak when tapped, keeping its wiggle', async ({ page }) => {
  await createBlankBook(page, 'Speaking Pip');
  await addLanguages(page, ['English']);
  await page
    .getByTestId('insert-character-input')
    .setInputFiles({ name: 'pip.png', mimeType: 'image/png', buffer: await makeMascotPng(page) });
  await page.getByRole('tab', { name: 'Design' }).click();
  await page.getByRole('button', { name: 'Speak when tapped' }).click();
  await expect(page.getByText('What pip says when tapped')).toBeVisible();
  await uploadVoiceClip(page, /Upload English voiceover for pip/, makeWav(300), 'hello.wav');
  await expect(page.getByTestId('voice-slot-en')).toContainText('hello.wav');

  // The tap still wiggles, then speaks.
  await page.getByRole('tab', { name: 'Interact' }).click();
  await expect(page.getByRole('combobox', { name: 'Action 1' })).toHaveText('Play an animation');
  await expect(page.getByRole('combobox', { name: 'Action 2' })).toHaveText('Play voiceover');
  // And the Audio tab lists it among this page's voice lines.
  await page.getByRole('tab', { name: 'Audio' }).click();
  await expect(page.getByText('pip (when tapped)')).toBeVisible();
});

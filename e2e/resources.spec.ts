import { expect } from '@playwright/test';
import { test } from './fixtures/test';
import { openApp } from './fixtures/sheetsMock';

test('uploads a native PDF to Drive and stores its metadata in Resources', async ({ page, sheets }) => {
  await openApp(page, '#/resources');
  await page.getByRole('button', { name: '+ Add', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Upload PDF').setInputFiles({ name: 'academy-guide.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n%%EOF') });
  await dialog.getByLabel('Allow anyone with the link to view this PDF').check();
  await dialog.getByLabel('Description').fill('Academy training guide');
  await dialog.getByRole('button', { name: 'Add Resource', exact: true }).click();

  await expect(page.getByText('academy-guide', { exact: true })).toBeVisible();
  expect(sheets.driveUploads).toHaveLength(1);
  await expect.poll(() => sheets.workbook.Resources.some(row => row[0] === 'academy-guide')).toBe(true);
  const resource = sheets.workbook.Resources.find(row => row[0] === 'academy-guide');
  expect(resource?.[2]).toBe('https://drive.google.com/file/d/drive-file-1/view');
  expect(resource?.[6]).toBe('drive-file-1');
  const card = page.locator('div.surface-card').filter({ hasText: 'academy-guide' });
  await expect(card.getByRole('link', { name: 'View' })).toHaveAttribute('href', 'https://drive.google.com/file/d/drive-file-1/view');
  await expect(card.getByRole('link', { name: 'Download' })).toHaveAttribute('href', 'https://drive.google.com/uc?export=download&id=drive-file-1');
  await expect(card.getByRole('button', { name: 'Share' })).toBeVisible();
  await expect(card.getByRole('button', { name: 'Delete academy-guide' })).toBeVisible();
});

test('keeps an uploaded PDF when public sharing is blocked and supports deletion', async ({ page, sheets }) => {
  sheets.failPublicSharing = true;
  await openApp(page, '#/resources');
  await page.getByRole('button', { name: '+ Add', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Upload PDF').setInputFiles({ name: 'private-guide.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n%%EOF') });
  await dialog.getByLabel('Allow anyone with the link to view this PDF').check();
  await dialog.getByRole('button', { name: 'Add Resource', exact: true }).click();

  await expect(page.getByText('private-guide', { exact: true })).toBeVisible();
  await expect(page.getByText(/does not allow public link sharing/)).toBeVisible();
  expect(sheets.workbook.Resources.some(row => row[0] === 'private-guide')).toBe(true);

  page.once('dialog', confirmation => confirmation.accept());
  await page.getByRole('button', { name: 'Delete private-guide' }).click();
  await expect(page.getByText('private-guide', { exact: true })).toHaveCount(0);
  expect(sheets.driveDeletes.some(url => url.endsWith('/drive-file-1'))).toBe(true);
  expect(sheets.workbook.Resources.some(row => row[0] === 'private-guide')).toBe(false);
});
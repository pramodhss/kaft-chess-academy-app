import { expect } from '@playwright/test';
import { test } from './fixtures/test';
import { openApp } from './fixtures/sheetsMock';

async function selectAugust(page: import('@playwright/test').Page) {
  await page.getByLabel('Fee month').fill('2026-08');
  await expect(page.getByRole('button', { name: 'Edit fee for Aarav Kumar' })).toBeVisible();
}

async function editAarav(page: import('@playwright/test').Page, amountPaid: string, status: string) {
  await page.getByRole('button', { name: 'Edit fee for Aarav Kumar' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Amount Paid').fill(amountPaid);
  await dialog.getByLabel('Payment Status').selectOption(status);
  await dialog.getByRole('button', { name: 'Update Payment' }).click();
  await expect(dialog).not.toBeVisible();
}

test('recognizes legacy months and supports repeated conflict-safe edits', async ({ page, sheets }) => {
  await openApp(page, '#/fees');
  await selectAugust(page);

  const aaravRow = page.getByText('Aarav Kumar', { exact: true }).locator('xpath=ancestor::div[contains(@class,"overflow-hidden")]');
  await expect(aaravRow.getByText('Partial', { exact: true })).toBeVisible();
  await expect(aaravRow.getByLabel('Aarav Kumar paid amount')).not.toBeVisible();
  await aaravRow.getByRole('button', { expanded: false }).click();
  await expect(aaravRow.getByLabel('Aarav Kumar paid amount')).toHaveValue('1000');

  await editAarav(page, '1200', 'Partial');
  await editAarav(page, '1300', 'Partial');

  await expect.poll(() => sheets.workbook['Fee Register'][1][6]).toBe('1300');
  await expect(page.getByText(/changed on another device/i)).toHaveCount(0);
});

test('waiving a fee clears balance without inflating collected revenue', async ({ page, sheets }) => {
  await openApp(page, '#/fees');
  await selectAugust(page);
  await editAarav(page, '0', 'Waived');

  await expect.poll(() => sheets.workbook['Fee Register'][1][11]).toBe('Waived');
  expect(sheets.workbook['Fee Register'][1][6]).toBe('0');
  expect(sheets.workbook['Fee Register'][1][7]).toBe('0');
  await expect(page.getByText('₹ 2,000', { exact: true }).first()).toBeVisible();
});

test('validates fee status against entered amounts before saving', async ({ page, sheets }) => {
  await openApp(page, '#/fees');
  await page.getByRole('button', { name: 'Add special fee' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Student *').selectOption('Aarav Kumar');
  await dialog.getByLabel('Fee Type').selectOption('Admission');
  await dialog.getByLabel('Amount Due *').fill('1500');
  await dialog.getByLabel('Payment Status').selectOption('Paid');
  await expect(dialog.getByRole('alert')).toContainText('full amount');
  const writesBefore = sheets.writes.length;
  await dialog.getByRole('button', { name: 'Save Payment' }).click();
  expect(sheets.writes).toHaveLength(writesBefore);

  await dialog.getByLabel('Amount Paid').fill('1500');
  await expect(dialog.getByRole('alert')).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Save Payment' }).click();
  await expect(dialog).not.toBeVisible();
  await expect.poll(() => sheets.workbook['Fee Register'].some(row => row[1] === 'Aarav Kumar' && row[4] === 'Admission')).toBe(true);
});

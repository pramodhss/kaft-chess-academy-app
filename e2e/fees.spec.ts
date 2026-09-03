import { expect } from '@playwright/test';
import { test } from './fixtures/test';
import { openApp } from './fixtures/sheetsMock';

async function selectAugust(page: import('@playwright/test').Page) {
  // Navigate to August 2026 using the month arrows
  const target = new Date(2026, 7, 1); // August 2026
  const heading = page.getByTestId('fee-month-heading');
  await expect(heading).toBeVisible();
  for (let attempts = 0; attempts < 24; attempts++) {
    const text = await heading.textContent();
    if (!text) break;
    const [mon, yr] = text.trim().split(' ');
    const current = new Date(`${mon} 1, ${yr}`);
    const diff = (target.getFullYear() - current.getFullYear()) * 12 + (target.getMonth() - current.getMonth());
    if (diff === 0) break;
    await page.getByLabel(diff > 0 ? 'Next month' : 'Previous month').click();
  }
  await expect(page.locator('[aria-controls="fee-details-Aarav Kumar"]')).toBeVisible();
}

async function editAarav(page: import('@playwright/test').Page, amountPaid: string, status: string) {
  const expandBtn = page.locator('[aria-controls="fee-details-Aarav Kumar"]');
  if ((await expandBtn.getAttribute('aria-expanded')) !== 'true') await expandBtn.click();
  await page.getByLabel('Edit all fields for Aarav Kumar').click();
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

test('marks a monthly fee as paid immediately on single tap', async ({ page, sheets }) => {
  await openApp(page, '#/fees');
  await selectAugust(page);

  await page.getByLabel('Mark Aarav Kumar as paid').click();
  await expect(page.locator('[aria-controls="fee-details-Aarav Kumar"]')).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByLabel('Aarav Kumar paid in full')).toBeChecked();
  // one-tap save — sheet is updated immediately without a second click
  await expect.poll(() => sheets.workbook['Fee Register'][1][6]).toBe('1500');
  expect(sheets.workbook['Fee Register'][1][7]).toBe('0');
  expect(sheets.workbook['Fee Register'][1][11]).toBe('Paid');
  await expect(page.getByText("Aarav Kumar's fee was updated and verified.")).toBeVisible();
});

test('requires confirmation and removes a fee only after Sheets succeeds', async ({ page, sheets }) => {
  await openApp(page, '#/fees');
  await selectAugust(page);
  await page.locator('[aria-controls="fee-details-Aarav Kumar"]').click();

  page.once('dialog', dialog => dialog.accept());
  await page.getByLabel('Remove monthly fee for Aarav Kumar').click();

  await expect(page.getByText('Receipt RCP-001 was removed.')).toBeVisible();
  const aaravRow = page.getByText('Aarav Kumar', { exact: true }).locator('xpath=ancestor::div[contains(@class,"overflow-hidden")]');
  await expect(aaravRow.getByText('Pending', { exact: true })).toBeVisible();
  expect(sheets.workbook['Fee Register'][1].every(value => value === '')).toBe(true);
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

test('marks all pending students as paid in one tap', async ({ page, sheets }) => {
  await openApp(page, '#/fees');
  await selectAugust(page);

  page.once('dialog', dialog => dialog.accept());
  await page.getByLabel('Mark all pending students as paid').click();

  await expect(page.getByText(/Successfully marked 1 student as Paid/i)).toBeVisible();
  await expect.poll(() => sheets.workbook['Fee Register'][1][11]).toBe('Paid');
  expect(sheets.workbook['Fee Register'][1][6]).toBe('1500');
  expect(sheets.workbook['Fee Register'][1][7]).toBe('0');
});

test('clears the selected month without leaving a balance', async ({ page, sheets }) => {
  await openApp(page, '#/fees');
  await selectAugust(page);

  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Open fee settings' }).click();
  await page.getByRole('button', { name: 'Remove fees for this month' }).click();

  await expect.poll(() => sheets.workbook['Fee Register'].slice(1)
    .filter(row => row[3] === 'August 2026' && row[4] === 'Monthly Tuition')).toHaveLength(0);
  await expect(page.getByText('₹ 0', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('₹ 0', { exact: true }).nth(1)).toBeVisible();
});

test('generates formatted sequential receipts in KAFT-YYYYMM-XXX format for special fees', async ({ page, sheets }) => {
  await openApp(page, '#/fees');
  await page.getByRole('button', { name: 'Add special fee' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Student *').selectOption('Diya Shah');
  await dialog.getByLabel('Fee Type').selectOption('Tournament');
  await dialog.getByLabel('Amount Due *').fill('800');
  await dialog.getByLabel('Amount Paid').fill('800');
  await dialog.getByLabel('Payment Status').selectOption('Paid');
  await dialog.getByRole('button', { name: 'Save Payment' }).click();
  await expect(dialog).not.toBeVisible();

  const savedFeeRow = sheets.workbook['Fee Register'].find(row => row[1] === 'Diya Shah' && row[4] === 'Tournament');
  expect(savedFeeRow).toBeDefined();
  expect(savedFeeRow?.[0]).toMatch(/^KAFT-\d{6}-\d{3}$/);
});

test('opens UPI payment QR modal from expanded fee card', async ({ page, sheets }) => {
  await openApp(page, '#/fees');
  await selectAugust(page);

  const expandBtn = page.locator('[aria-controls="fee-details-Aarav Kumar"]');
  if ((await expandBtn.getAttribute('aria-expanded')) !== 'true') await expandBtn.click();

  await page.getByLabel('Show UPI QR Code for Aarav Kumar').click();
  await expect(page.getByText('Scan & Pay via UPI')).toBeVisible();
  await expect(page.getByText('Aarav Kumar · 2026-08')).toBeVisible();
  await expect(page.getByText('Open in UPI App')).toBeVisible();

  await page.getByLabel('Close UPI payment dialog').click();
  await expect(page.getByText('Scan & Pay via UPI')).toHaveCount(0);
});

test('toggles UPI QR Pay feature on and off from Operations Center', async ({ page, sheets }) => {
  await openApp(page, '#/operations');
  const toggle = page.getByLabel('Toggle Dynamic UPI QR Code');
  await expect(toggle).toBeChecked();

  // Toggle OFF
  await toggle.uncheck({ force: true });
  await expect(toggle).not.toBeChecked();

  // Navigate to Fees and verify QR button is hidden
  await openApp(page, '#/fees');
  await selectAugust(page);
  const expandBtn = page.locator('[aria-controls="fee-details-Aarav Kumar"]');
  if ((await expandBtn.getAttribute('aria-expanded')) !== 'true') await expandBtn.click();
  await expect(page.getByLabel('Show UPI QR Code for Aarav Kumar')).toHaveCount(0);

  // Toggle back ON
  await openApp(page, '#/operations');
  const toggleOn = page.getByLabel('Toggle Dynamic UPI QR Code');
  await toggleOn.check({ force: true });
  await expect(toggleOn).toBeChecked();

  // Verify button appears again in Fees
  await openApp(page, '#/fees');
  await selectAugust(page);
  if ((await expandBtn.getAttribute('aria-expanded')) !== 'true') await expandBtn.click();
  await expect(page.getByLabel('Show UPI QR Code for Aarav Kumar')).toBeVisible();
});

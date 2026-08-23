import { expect } from '@playwright/test';
import { test } from './fixtures/test';
import { openApp } from './fixtures/sheetsMock';

test('saves attendance to the exact selected date cell', async ({ page, sheets }) => {
  await openApp(page, '#/attendance');
  const diya = page.getByRole('button').filter({ hasText: 'Diya Shah' });
  await expect(diya).toBeVisible();
  await diya.click();
  await page.getByRole('button', { name: /Save Attendance \(1 changes\)/ }).click();

  await expect(page.getByText(/Attendance saved for/i)).toBeVisible();
  await expect.poll(() => sheets.workbook['Weekend Attendance'][2][2]).toBe('true');
  expect(sheets.writes).toContainEqual({
    operation: 'update',
    range: "'Weekend Attendance'!C3",
    values: [[true]],
  });
});

test('dashboard totals parse formatted fee values correctly', async ({ page, sheets }) => {
  void sheets;
  await openApp(page);
  await expect(page.getByText('₹3,000', { exact: true })).toBeVisible();
  await expect(page.getByText('₹500', { exact: true })).toBeVisible();
  await expect(page.getByText('2', { exact: true }).first()).toBeVisible();
});

test('student progress joins monthly attendance and skill metrics', async ({ page, sheets }) => {
  void sheets;
  await openApp(page, '#/progress');
  await page.locator('select').selectOption({ label: 'Aarav Kumar' });
  await expect(page.getByText('75%', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('4.2/5', { exact: true })).toBeVisible();
});

test('dashboard and progress clamp invalid Sheet metrics', async ({ page, sheets }) => {
  sheets.workbook['Fee Register'][1][6] = '-100';
  sheets.workbook['Fee Register'][1][7] = '-500';
  sheets.workbook['Monthly Attendance'][1][4] = '175%';
  sheets.workbook['Monthly Metrics'][1][9] = '9';

  await openApp(page);
  await expect(page.getByText('₹2,000', { exact: true })).toBeVisible();
  await expect(page.getByText('₹0', { exact: true })).toBeVisible();
  await openApp(page, '#/progress');
  await page.locator('select').selectOption({ label: 'Aarav Kumar' });
  await expect(page.getByText('100%', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('5.0/5', { exact: true })).toBeVisible();
});

test('van flags malformed imported phone data', async ({ page, sheets }) => {
  sheets.workbook['Van Allotment'][1][9] = 'driver-phone';
  await openApp(page, '#/van');
  await expect(page.getByRole('alert')).toContainText('Driver phone must contain numbers only');
});

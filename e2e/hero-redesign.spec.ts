import { expect } from '@playwright/test';
import { test } from './fixtures/test';
import { openApp } from './fixtures/sheetsMock';

// Structural regression checks for the redesigned hero banners (Van, Students, Fees).
// Assertion-based rather than pixel screenshots to stay stable across OS/browser rendering.

test.describe('Redesigned hero banners stay intact', () => {
  test('Van: Tournament Hub banner and card actions render', async ({ page }) => {
    await openApp(page, '#/van');

    await expect(page.getByRole('heading', { name: 'Tournament Hub' })).toBeVisible();
    await expect(page.getByText('Live Ops')).toBeVisible();
    await expect(page.getByRole('button', { name: 'New Tournament' })).toBeVisible();

    await page.getByRole('button', { name: 'New Tournament' }).click();
    const createDialog = page.getByRole('dialog');
    await createDialog.getByLabel('Tournament name').fill('Regression Cup');
    await createDialog.getByLabel('Tournament date').fill('2026-09-20');
    await createDialog.getByRole('button', { name: 'Create tournament' }).click();
    await expect(page.getByText('Regression Cup', { exact: true })).toBeVisible();

    const card = page.locator('article', { has: page.getByText('Regression Cup', { exact: true }) });
    await expect(card.getByRole('button', { name: 'Notify' })).toBeVisible();
    await expect(card.getByRole('button', { name: 'Copy roster' })).toBeVisible();
    await expect(card.getByRole('button', { name: /^Edit/ })).toBeVisible();
    await expect(card.getByRole('button', { name: /^Remove/ })).toBeVisible();
  });

  test('Students: hero banner renders with student count', async ({ page }) => {
    await openApp(page, '#/students');

    await expect(page.getByRole('heading', { name: 'Student Roster' })).toBeVisible();
    await expect(page.getByText(/students · search, filter, and manage/)).toBeVisible();
  });

  test('Fees: hero banner renders with month context', async ({ page }) => {
    await openApp(page, '#/fees');

    await expect(page.getByRole('heading', { name: 'Fees Hub' })).toBeVisible();
    await expect(page.getByText(/Track collections, balances, and reminders for/)).toBeVisible();
  });
});

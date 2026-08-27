import { expect } from '@playwright/test';
import { test } from './fixtures/test';
import { openApp } from './fixtures/sheetsMock';

const routes = [
  ['Dashboard', '#/'],
  ['Students', '#/students'],
  ['Attendance', '#/attendance'],
  ['Fees', '#/fees'],
  ['Monthly Report', '#/monthly-report'],
  ['Student Progress', '#/progress'],
  ['Tournaments', '#/tournaments'],
  ['Tournament Management legacy route', '#/upcoming'],
  ['Tournament Management', '#/van'],
  ['Resources', '#/resources'],
  ['Timetable', '#/timetable'],
  ['Curriculum', '#/curriculum'],
  ['Leaderboard', '#/leaderboard'],
  ['Admin Settings', '#/admin-settings'],
  ['Operations Center', '#/operations'],
  ['Student Timeline', '#/timeline'],
  ['More', '#/more'],
] as const;

test.describe('route regression matrix', () => {
  for (const [name, hash] of routes) {
    test(`${name} renders without runtime errors or horizontal overflow`, async ({ page, sheets }) => {
      void sheets;
      const errors: string[] = [];
      page.on('pageerror', error => errors.push(error.message));
      page.on('console', message => {
        if (message.type() === 'error') errors.push(message.text());
      });

      await openApp(page, hash);
      await expect(page.locator('main')).toBeVisible();
      if (hash === '#/') await expect(page.getByRole('button', { name: 'Go back' })).toHaveCount(0);
      else await expect(page.getByRole('button', { name: 'Go back' })).toBeVisible();
      await expect.poll(() => errors).toEqual([]);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow).toBeLessThanOrEqual(1);
    });

  }

  test('reuses shared student data during in-app navigation', async ({ page, sheets }) => {
    void sheets;
    let studentReads = 0;
    page.on('request', request => {
      const url = decodeURIComponent(request.url());
      if (request.method() === 'GET' && url.includes("'Students & Parents'!A:AG")) studentReads += 1;
    });

    await openApp(page, '#/');
    await expect(page.getByText('Active Students')).toBeVisible();
    await page.getByRole('link', { name: 'Students', exact: true }).first().click();
    await expect(page.getByRole('button', { name: /Aarav Kumar/ })).toBeVisible();
    await page.getByRole('link', { name: 'Fees', exact: true }).first().click();
    await expect(page.getByText('Student fees')).toBeVisible();

    expect(studentReads).toBe(1);
  });

  test('dark mode persists and remains usable', async ({ page, sheets }) => {
    void sheets;
    await openApp(page, '#/more');
    const themeButton = page.getByText('Light mode').locator('..').getByRole('button');
    await themeButton.click();
    await expect(page.locator('html')).toHaveClass(/dark/);
    await page.reload();
    await expect(page.locator('html')).toHaveClass(/dark/);
  });
});

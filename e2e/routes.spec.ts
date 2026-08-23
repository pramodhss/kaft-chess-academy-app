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
  ['Upcoming Tournaments', '#/upcoming'],
  ['Van Allotment', '#/van'],
  ['Resources', '#/resources'],
  ['Timetable', '#/timetable'],
  ['Curriculum', '#/curriculum'],
  ['Leaderboard', '#/leaderboard'],
  ['Admin Settings', '#/admin-settings'],
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
      await expect.poll(() => errors).toEqual([]);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow).toBeLessThanOrEqual(1);
    });
  }

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

import { test as base } from '@playwright/test';
import { installSheetsMock } from './sheetsMock';
import type { SheetsMock } from './sheetsMock';

interface Fixtures {
  sheets: SheetsMock;
}

export const test = base.extend<Fixtures>({
  sheets: [async ({ context }, use) => {
    const sheets = await installSheetsMock(context);
    await use(sheets);
  }, { auto: true }],
});

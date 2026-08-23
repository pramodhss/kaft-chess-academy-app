import type { BrowserContext, Page, Request, Route } from '@playwright/test';

export type Workbook = Record<string, string[][]>;

export interface SheetWrite {
  operation: 'append' | 'update' | 'clear';
  range: string;
  values: string[][];
}

export interface SheetsMock {
  workbook: Workbook;
  writes: SheetWrite[];
}

const COLUMN_PATTERN = /^([A-Z]+)(\d*)$/;

function columnIndex(column: string): number {
  return [...column].reduce((value, character) => value * 26 + (character.codePointAt(0) ?? 64) - 64, 0) - 1;
}

function parseCell(cell: string, defaultRow: number) {
  const match = COLUMN_PATTERN.exec(cell.toUpperCase());
  if (!match) throw new Error(`Unsupported Sheets cell: ${cell}`);
  return { column: columnIndex(match[1]), row: match[2] ? Number(match[2]) - 1 : defaultRow };
}

function parseRange(a1Range: string) {
  const separator = a1Range.lastIndexOf('!');
  const rawSheet = separator >= 0 ? a1Range.slice(0, separator) : a1Range;
  const cells = separator >= 0 ? a1Range.slice(separator + 1) : 'A:ZZ';
  const sheet = rawSheet.replace(/^'|'$/g, '').replaceAll("''", "'");
  const [startCell, endCell = startCell] = cells.split(':');
  const start = parseCell(startCell, 0);
  const end = parseCell(endCell, Number.MAX_SAFE_INTEGER);
  return { sheet, start, end };
}

function trimRow(row: string[]): string[] {
  const copy = [...row];
  while (copy.at(-1) === '') copy.pop();
  return copy;
}

function readRange(workbook: Workbook, range: string): string[][] {
  const { sheet, start, end } = parseRange(range);
  const rows = workbook[sheet] ?? [];
  const lastRow = Math.min(end.row, rows.length - 1);
  if (lastRow < start.row) return [];
  const result = rows.slice(start.row, lastRow + 1).map(row =>
    trimRow(row.slice(start.column, end.column === Number.MAX_SAFE_INTEGER ? undefined : end.column + 1)),
  );
  while (result.length > 0 && result.at(-1)?.length === 0) result.pop();
  return result;
}

function writeRange(workbook: Workbook, range: string, values: string[][]) {
  const { sheet, start } = parseRange(range);
  const rows = workbook[sheet] ?? (workbook[sheet] = []);
  values.forEach((sourceRow, rowOffset) => {
    const targetRow = start.row + rowOffset;
    rows[targetRow] ??= [];
    sourceRow.forEach((value, columnOffset) => {
      rows[targetRow][start.column + columnOffset] = String(value ?? '');
    });
  });
}

function clearRange(workbook: Workbook, range: string) {
  const { sheet, start, end } = parseRange(range);
  const rows = workbook[sheet] ?? [];
  const lastRow = Math.min(end.row, rows.length - 1);
  for (let rowIndex = start.row; rowIndex <= lastRow; rowIndex += 1) {
    rows[rowIndex] ??= [];
    const lastColumn = Math.min(end.column, rows[rowIndex].length - 1);
    for (let columnIndexValue = start.column; columnIndexValue <= lastColumn; columnIndexValue += 1) {
      rows[rowIndex][columnIndexValue] = '';
    }
  }
}

function requestedRange(request: Request): string {
  const url = new URL(request.url());
  const marker = '/values/';
  const start = url.pathname.indexOf(marker);
  if (start < 0) return '';
  return decodeURIComponent(url.pathname.slice(start + marker.length).replace(/:(append|clear)$/, ''));
}

async function jsonBody(request: Request): Promise<Record<string, unknown>> {
  try {
    return JSON.parse(request.postData() ?? '{}') as Record<string, unknown>;
  } catch {
    return {};
  }
}

function columnName(index: number): string {
  let value = index + 1;
  let result = '';
  while (value > 0) {
    value -= 1;
    result = String.fromCodePoint(65 + (value % 26)) + result;
    value = Math.floor(value / 26);
  }
  return result;
}

async function fulfillMetadata(route: Route, mock: SheetsMock) {
  const sheets = Object.keys(mock.workbook).map((title, sheetId) => ({
    properties: { title, sheetId, gridProperties: { columnCount: 30, rowCount: 1_000 } },
  }));
  await route.fulfill({ json: { sheets } });
}

async function fulfillBatchValues(route: Route, mock: SheetsMock, request: Request) {
  const body = await jsonBody(request);
  const data = Array.isArray(body.data) ? body.data as Array<{ range: string; values: string[][] }> : [];
  data.forEach(item => {
    writeRange(mock.workbook, item.range, item.values);
    mock.writes.push({ operation: 'update', range: item.range, values: structuredClone(item.values) });
  });
  await route.fulfill({ json: { totalUpdatedRows: data.reduce((sum, item) => sum + item.values.length, 0) } });
}

async function fulfillUpdate(route: Route, mock: SheetsMock, request: Request, range: string) {
  const body = await jsonBody(request);
  const values = Array.isArray(body.values) ? body.values as string[][] : [];
  writeRange(mock.workbook, range, values);
  mock.writes.push({ operation: 'update', range, values: structuredClone(values) });
  await route.fulfill({ json: { updatedRange: range, updatedRows: values.length } });
}

async function fulfillAppend(route: Route, mock: SheetsMock, request: Request, range: string) {
  const body = await jsonBody(request);
  const values = Array.isArray(body.values) ? body.values as string[][] : [];
  const { sheet, start, end } = parseRange(range);
  const startRow = mock.workbook[sheet]?.length ?? 0;
  writeRange(mock.workbook, `'${sheet.replaceAll("'", "''")}'!A${startRow + 1}`, values);
  mock.writes.push({ operation: 'append', range, values: structuredClone(values) });
  const endColumn = end.column === Number.MAX_SAFE_INTEGER ? start.column + (values[0]?.length ?? 1) - 1 : end.column;
  const updatedRange = `'${sheet.replaceAll("'", "''")}'!${columnName(start.column)}${startRow + 1}:${columnName(endColumn)}${startRow + values.length}`;
  await route.fulfill({ json: { updates: { updatedRows: values.length, updatedRange } } });
}

async function fulfillClear(route: Route, mock: SheetsMock, range: string) {
  clearRange(mock.workbook, range);
  mock.writes.push({ operation: 'clear', range, values: [] });
  await route.fulfill({ json: { clearedRange: range } });
}

async function fulfillSheetsRequest(route: Route, mock: SheetsMock) {
  const request = route.request();
  const url = new URL(request.url());
  const method = request.method();
  const range = requestedRange(request);

  if (method === 'GET' && range) return route.fulfill({ json: { range, majorDimension: 'ROWS', values: readRange(mock.workbook, range) } });
  if (method === 'GET' && url.searchParams.get('fields') === 'sheets.properties') return fulfillMetadata(route, mock);
  if (method === 'POST' && url.pathname.endsWith('/values:batchUpdate')) return fulfillBatchValues(route, mock, request);
  if (method === 'PUT' && range) return fulfillUpdate(route, mock, request, range);
  if (method === 'POST' && url.pathname.endsWith(':append')) return fulfillAppend(route, mock, request, range);
  if (method === 'POST' && url.pathname.endsWith(':clear')) return fulfillClear(route, mock, range);
  if (method === 'POST' && url.pathname.endsWith(':batchUpdate')) return route.fulfill({ json: { replies: [] } });
  return route.fulfill({ status: 404, json: { error: { message: `Unhandled mock Sheets request: ${method} ${url.pathname}` } } });
}

function defaultWorkbook(): Workbook {
  return {
    'Students & Parents': [
      ['Full Name', 'DOB', 'Age', 'Gender', 'Grade / School', 'Batch', 'Level', 'Joining Date', 'Status', 'Parent Name', 'Parent Phone', 'Parent WhatsApp', 'Parent Email', 'Parent 2 Name', 'Parent 2 Phone', 'Emergency Contact', 'Emergency Phone', 'Address', 'Photo Consent', 'Notes', 'FIDE ID', 'TNSCA ID', 'Classical Rating', 'Rapid Rating', 'Blitz Rating', 'Attendance %', 'This Month Attended', 'This Month Total', 'School', 'Standard', 'Coach Name'],
      ['Aarav Kumar', '10/05/2014', '11', 'Male', '6th, Sunrise School', 'Beginner A', 'Beginner', '01/01/2026', 'Active', 'Priya Kumar', '9876543210', '9876543210', 'priya@example.com', '', '', '', '', 'Chennai', 'Yes', '', '1234567', 'TN100', '1200', '1100', '1000', '75%', '3', '4', 'Sunrise School', '6th', 'Coach Meera'],
      ['Diya Shah', '20/08/2013', '12', 'Female', '7th, Valley School', 'Intermediate', 'Intermediate', '01/02/2026', 'Active', 'Ravi Shah', '9123456780', '9123456780', '', '', '', '', '', '', 'Yes', '', '', '', '1150', '1080', '990', '100%', '4', '4', 'Valley School', '7th', 'Coach Meera'],
    ],
    'Weekend Attendance': [
      ['Student Name', 'Batch', '2026-08-02'],
      ['Aarav Kumar', 'Beginner A', 'TRUE'],
      ['Diya Shah', 'Intermediate', 'FALSE'],
    ],
    'Monthly Attendance': [
      ['Student Name', 'Month', 'Classes Attended', 'Total Classes', 'Attendance %'],
      ['Aarav Kumar', 'August 2026', '3', '4', '75%'],
      ['Diya Shah', 'August 2026', '4', '4', '100%'],
    ],
    'Fee Register': [
      ['Receipt No', 'Student Name', 'Batch', 'Fee Month', 'Fee Type', 'Amount Due', 'Amount Paid', 'Balance', 'Due Date', 'Payment Date', 'Payment Method', 'Payment Status', 'Reference No', 'Notes'],
      ['RCP-001', 'Aarav Kumar', 'Beginner A', 'August 2026', 'Monthly Tuition', '1,500', '1,000', '500', '05/08/2026', '03/08/2026', 'UPI', 'Partial', 'UPI-1', ''],
      ['RCP-002', 'Diya Shah', 'Intermediate', '2026-08', 'Monthly Tuition', '2,000', '2,000', '0', '05/08/2026', '02/08/2026', 'Cash', 'Paid', '', ''],
    ],
    'Van Allotment': [
      ['Student Name', 'Route', 'Pickup Point', 'Driver', 'Phone', 'Status'],
      ['Aarav Kumar', 'Route A', 'Central Park', 'Kumar', '9000000000', 'Active'],
    ],
    'Monthly Metrics': [
      ['Student Name', 'Month', 'Batch', 'Attendance %', 'Fees Paid', 'Tournaments', 'Rating Change', 'Notes', 'Coach', 'Overall Rating'],
      ['Aarav Kumar', 'August 2026', 'Beginner A', '75%', '1,000', '1', '+20', '', 'Coach Meera', '4.2'],
    ],
    'Tournament Achievements': [
      ['Student Name', 'Tournament', 'Date', 'Category', 'Position', 'Score', 'Rating Change', 'Notes'],
      ['Aarav Kumar', 'City Open', '15/08/2026', 'Under 12', '2', '5/6', '+20', ''],
    ],
    'App Settings': [
      ['Key', 'Values JSON', 'Version', 'Base Version', 'Updated By', 'Updated At'],
      ['student_batches', '["Beginner A","Intermediate"]', 'v1', '', 'Coach Meera', '2026-08-01T00:00:00.000Z'],
      ['student_levels', '["Beginner","Intermediate"]', 'v1', '', 'Coach Meera', '2026-08-01T00:00:00.000Z'],
    ],
    'Upcoming Tournaments': [['Name', 'Date', 'Venue', 'Registration Deadline', 'Category', 'Status']],
    Resources: [['Title', 'Type', 'URL', 'Description', 'Level']],
    Timetable: [['Day', 'Time', 'Batch', 'Coach', 'Location']],
  };
}

export async function installSheetsMock(context: BrowserContext, initial = defaultWorkbook()): Promise<SheetsMock> {
  const mock: SheetsMock = { workbook: structuredClone(initial), writes: [] };

  await context.addInitScript(() => {
    localStorage.setItem('chess_auth', JSON.stringify({ token: 'test-token', email: 'coach@example.com', expiresAt: Date.now() + 3_600_000 }));
    localStorage.setItem('chess_coach_name', 'Coach Meera');
  });

  await context.route('https://sheets.googleapis.com/**', route => fulfillSheetsRequest(route, mock));

  return mock;
}

export async function openApp(page: Page, hash = '#/') {
  await page.goto(`./${hash}`);
  await page.waitForLoadState('domcontentloaded');
}

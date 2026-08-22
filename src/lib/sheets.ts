const API = 'https://sheets.googleapis.com/v4/spreadsheets';
export type SheetValue = string | number | boolean;

export function colLetter(index: number): string {
  let col = '', n = index + 1;
  while (n > 0) { const r=(n-1)%26; col=String.fromCodePoint(65+r)+col; n=Math.floor((n-1)/26); }
  return col;
}

async function apiCall(token: string, url: string, options?: RequestInit) {
  const res = await fetch(url, {
    ...options,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...options?.headers },
  });
  if (res.status === 401) throw new Error('TOKEN_EXPIRED');
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    if (res.status === 403 && text.includes('SCOPE_INSUFFICIENT')) throw new Error('TOKEN_EXPIRED');
    throw new Error(`Sheets API ${res.status}: ${text}`);
  }
  return res.json();
}

export async function readSheet(token: string, sheetId: string, range: string): Promise<string[][]> {
  const data = await apiCall(token, `${API}/${sheetId}/values/${encodeURIComponent(range)}?valueRenderOption=FORMATTED_VALUE`);
  return (data.values ?? []) as string[][];
}

export async function readSheetUnformatted(token: string, sheetId: string, range: string): Promise<SheetValue[][]> {
  const data = await apiCall(token, `${API}/${sheetId}/values/${encodeURIComponent(range)}?valueRenderOption=UNFORMATTED_VALUE`);
  return (data.values ?? []) as SheetValue[][];
}

export async function writeRange(token: string, sheetId: string, range: string, values: SheetValue[][]) {
  return apiCall(token, `${API}/${sheetId}/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`,
    { method: 'PUT', body: JSON.stringify({ range, majorDimension: 'ROWS', values }) });
}

export async function appendRows(token: string, sheetId: string, range: string, rows: SheetValue[][]): Promise<number> {
  const data = await apiCall(token, `${API}/${sheetId}/values/${encodeURIComponent(range)}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
    { method: 'POST', body: JSON.stringify({ values: rows }) });
  const updatedRange = data.updates?.updatedRange;
  const rowMatch = typeof updatedRange === 'string' ? /![A-Z]+(\d+)(?::[A-Z]+\d+)?$/.exec(updatedRange) : null;
  if (!rowMatch) throw new Error('Sheets API append response did not include the saved row.');
  return Number(rowMatch[1]);
}

export async function batchWrite(token: string, sheetId: string, updates: { range: string; value: SheetValue }[]) {
  return apiCall(token, `${API}/${sheetId}/values:batchUpdate`, {
    method: 'POST',
    body: JSON.stringify({ valueInputOption: 'USER_ENTERED', data: updates.map(u => ({ range: u.range, majorDimension: 'ROWS', values: [[u.value]] })) }),
  });
}

/** Create a new sheet tab if it doesn't exist. */
export async function ensureSheet(token: string, sheetId: string, tabName: string, headers: string[]) {
  try {
    const rows = await readSheet(token, sheetId, `'${tabName}'!A1:A1`);
    if (rows.length === 0) await writeRange(token, sheetId, `'${tabName}'!A1`, [headers]);
  } catch {
    await apiCall(token, `${API}/${sheetId}:batchUpdate`, {
      method: 'POST', body: JSON.stringify({ requests: [{ addSheet: { properties: { title: tabName } } }] }),
    });
    await writeRange(token, sheetId, `'${tabName}'!A1`, [headers]);
  }
}

/** Extend a sheet to at least `neededCols` columns (auto-detects current size). */
export async function ensureSheetColumns(token: string, sheetId: string, tabName: string, neededCols: number) {
  const info = await apiCall(token, `${API}/${sheetId}?fields=sheets.properties`);
  const sheet = (info.sheets ?? []).find((s: any) => s.properties?.title === tabName);
  if (!sheet) return;
  const current = sheet.properties.gridProperties?.columnCount ?? 26;
  if (current >= neededCols) return;
  await apiCall(token, `${API}/${sheetId}:batchUpdate`, {
    method: 'POST',
    body: JSON.stringify({ requests: [{ appendDimension: { sheetId: sheet.properties.sheetId, dimension: 'COLUMNS', length: neededCols - current } }] }),
  });
}

export async function insertSheetColumnHeader(
  token: string,
  sheetId: string,
  tabName: string,
  columnIndex: number,
  header: string,
) {
  const info = await apiCall(token, `${API}/${sheetId}?fields=sheets.properties`);
  const sheet = (info.sheets ?? []).find((item: any) => item.properties?.title === tabName);
  if (!sheet) throw new Error(`Sheet tab not found: ${tabName}`);
  const tabId = sheet.properties.sheetId;
  return apiCall(token, `${API}/${sheetId}:batchUpdate`, {
    method: 'POST',
    body: JSON.stringify({
      requests: [
        {
          insertDimension: {
            range: { sheetId: tabId, dimension: 'COLUMNS', startIndex: columnIndex, endIndex: columnIndex + 1 },
            inheritFromBefore: false,
          },
        },
        {
          updateCells: {
            start: { sheetId: tabId, rowIndex: 0, columnIndex },
            rows: [{ values: [{ userEnteredValue: { stringValue: header } }] }],
            fields: 'userEnteredValue',
          },
        },
      ],
    }),
  });
}

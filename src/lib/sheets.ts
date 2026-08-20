const API = 'https://sheets.googleapis.com/v4/spreadsheets';

export function colLetter(index: number): string {
  let col = '', n = index + 1;
  while (n > 0) { const r=(n-1)%26; col=String.fromCharCode(65+r)+col; n=Math.floor((n-1)/26); }
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

export async function writeRange(token: string, sheetId: string, range: string, values: (string|number|boolean)[][]) {
  return apiCall(token, `${API}/${sheetId}/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`,
    { method: 'PUT', body: JSON.stringify({ range, majorDimension: 'ROWS', values }) });
}

export async function appendRows(token: string, sheetId: string, range: string, rows: (string|number|boolean)[][]) {
  return apiCall(token, `${API}/${sheetId}/values/${encodeURIComponent(range)}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
    { method: 'POST', body: JSON.stringify({ values: rows }) });
}

export async function batchWrite(token: string, sheetId: string, updates: { range: string; value: boolean|string|number }[]) {
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

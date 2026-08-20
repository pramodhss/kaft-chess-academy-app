const API = 'https://sheets.googleapis.com/v4/spreadsheets';

/** Convert 0-based column index to A1 letter (0→A, 26→AA, …) */
export function colLetter(index: number): string {
  let col = '';
  let n = index + 1;
  while (n > 0) {
    const rem = (n - 1) % 26;
    col = String.fromCharCode(65 + rem) + col;
    n = Math.floor((n - 1) / 26);
  }
  return col;
}

async function apiCall(token: string, url: string, options?: RequestInit) {
  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });
  if (res.status === 401) throw new Error('TOKEN_EXPIRED');
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    if (res.status === 403 && text.includes('SCOPE_INSUFFICIENT')) throw new Error('TOKEN_EXPIRED');
    throw new Error(`Sheets API ${res.status}: ${text}`);
  }
  return res.json();
}

/** Read a range; returns rows as string[][] */
export async function readSheet(
  token: string, sheetId: string, range: string
): Promise<string[][]> {
  const data = await apiCall(
    token,
    `${API}/${sheetId}/values/${encodeURIComponent(range)}?valueRenderOption=FORMATTED_VALUE`
  );
  return (data.values ?? []) as string[][];
}

/** Overwrite a rectangular range (use for updating existing rows). */
export async function writeRange(
  token: string, sheetId: string, range: string,
  values: (string | number | boolean)[][]
) {
  return apiCall(
    token,
    `${API}/${sheetId}/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`,
    { method: 'PUT', body: JSON.stringify({ range, majorDimension: 'ROWS', values }) }
  );
}

/** Append one or more rows after the last non-empty row. */
export async function appendRows(
  token: string, sheetId: string, range: string,
  rows: (string | number | boolean)[][]
) {
  return apiCall(
    token,
    `${API}/${sheetId}/values/${encodeURIComponent(range)}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
    { method: 'POST', body: JSON.stringify({ values: rows }) }
  );
}

/** Write multiple individual cells in one round-trip. */
export async function batchWrite(
  token: string, sheetId: string,
  updates: { range: string; value: boolean | string | number }[]
) {
  return apiCall(
    token,
    `${API}/${sheetId}/values:batchUpdate`,
    {
      method: 'POST',
      body: JSON.stringify({
        valueInputOption: 'USER_ENTERED',
        data: updates.map(u => ({
          range: u.range,
          majorDimension: 'ROWS',
          values: [[u.value]],
        })),
      }),
    }
  );
}

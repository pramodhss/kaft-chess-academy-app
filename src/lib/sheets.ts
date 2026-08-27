const API = 'https://sheets.googleapis.com/v4/spreadsheets';
export const SHEETS_READ_CACHE = 'sheets-read-cache-v1';
export type SheetValue = string | number | boolean;
const READ_CACHE_TTL_MS = 300_000; // 5 minutes — stable data rarely changes mid-session
type CachedRead = { data: any; expiresAt: number };
const recentReads = new Map<string, CachedRead>();
const pendingReads = new Map<string, Promise<any>>();

function sheetUrlFragment(sheetId: string): string {
  return `/spreadsheets/${encodeURIComponent(sheetId)}/`;
}

export function clearSheetReadCache(sheetId?: string): void {
  if (!sheetId) {
    recentReads.clear();
    pendingReads.clear();
    return;
  }
  const fragment = sheetUrlFragment(sheetId);
  for (const key of recentReads.keys()) if (key.includes(fragment)) recentReads.delete(key);
  for (const key of pendingReads.keys()) if (key.includes(fragment)) pendingReads.delete(key);
}

async function invalidateSheetReadCache(sheetId: string): Promise<void> {
  clearSheetReadCache(sheetId);
  if (!('caches' in globalThis)) return;
  try {
    const cache = await caches.open(SHEETS_READ_CACHE);
    const requests = await cache.keys();
    await Promise.all(requests
      .filter(request => request.url.includes(sheetUrlFragment(sheetId)))
      .map(request => cache.delete(request)));
  } catch { /* a successful write must not fail because browser caching is unavailable */ }
}

export function colLetter(index: number): string {
  let col = '', n = index + 1;
  while (n > 0) { const r=(n-1)%26; col=String.fromCodePoint(65+r)+col; n=Math.floor((n-1)/26); }
  return col;
}

async function apiCall(token: string, url: string, options?: RequestInit) {
  const method = (options?.method ?? 'GET').toUpperCase();
  if (method !== 'GET' && typeof navigator !== 'undefined' && !navigator.onLine) {
    throw new Error('You are offline. Reconnect before saving changes.');
  }
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
  const data = await res.json();
  if (method !== 'GET') {
    const sheetId = /\/spreadsheets\/([^/]+)/.exec(new URL(url).pathname)?.[1];
    if (sheetId) await invalidateSheetReadCache(decodeURIComponent(sheetId));
  }
  return data;
}

async function readWithCache(token: string, url: string) {
  const cacheKey = `${token}\n${url}`;
  const recent = recentReads.get(cacheKey);
  if (recent && recent.expiresAt > Date.now()) return recent.data;
  const pending = pendingReads.get(cacheKey);
  if (pending) return pending;

  const request = readOnlineOrOffline(token, url).then(data => {
    recentReads.set(cacheKey, { data, expiresAt: Date.now() + READ_CACHE_TTL_MS });
    return data;
  }).finally(() => pendingReads.delete(cacheKey));
  pendingReads.set(cacheKey, request);
  return request;
}

async function readOnlineOrOffline(token: string, url: string) {
  try {
    const data = await apiCall(token, url);
    if ('caches' in globalThis) {
      try {
        const cache = await caches.open(SHEETS_READ_CACHE);
        await cache.put(url, new Response(JSON.stringify(data), {
          headers: { 'Content-Type': 'application/json' },
        }));
      } catch { /* online data remains usable when browser caching is unavailable */ }
    }
    return data;
  } catch (error) {
    const isOffline = typeof navigator !== 'undefined' && !navigator.onLine;
    if (!isOffline && !(error instanceof TypeError)) throw error;
    if ('caches' in globalThis) {
      const cached = await (await caches.open(SHEETS_READ_CACHE)).match(url);
      if (cached) return cached.json();
    }
    throw new Error('No cached data is available. Reconnect to load this page.');
  }
}

export async function readSheet(token: string, sheetId: string, range: string): Promise<string[][]> {
  const data = await readWithCache(token, `${API}/${sheetId}/values/${encodeURIComponent(range)}?valueRenderOption=FORMATTED_VALUE`);
  return (data.values ?? []) as string[][];
}

export async function readSheetLive(token: string, sheetId: string, range: string): Promise<string[][]> {
  const data = await apiCall(token, `${API}/${sheetId}/values/${encodeURIComponent(range)}?valueRenderOption=FORMATTED_VALUE`);
  return (data.values ?? []) as string[][];
}

export async function readSheetUnformatted(token: string, sheetId: string, range: string): Promise<SheetValue[][]> {
  const data = await readWithCache(token, `${API}/${sheetId}/values/${encodeURIComponent(range)}?valueRenderOption=UNFORMATTED_VALUE`);
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

export async function batchWriteRanges(
  token: string,
  sheetId: string,
  updates: { range: string; values: SheetValue[][] }[],
) {
  return apiCall(token, `${API}/${sheetId}/values:batchUpdate`, {
    method: 'POST',
    body: JSON.stringify({
      valueInputOption: 'USER_ENTERED',
      data: updates.map(update => ({ range: update.range, majorDimension: 'ROWS', values: update.values })),
    }),
  });
}

export async function clearSheetRange(token: string, sheetId: string, range: string) {
  return apiCall(token, `${API}/${sheetId}/values/${encodeURIComponent(range)}:clear`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
}

export async function deleteSheetColumn(token: string, sheetId: string, tabName: string, columnIndex: number) {
  const info = await apiCall(token, `${API}/${sheetId}?fields=sheets.properties`);
  const sheet = (info.sheets ?? []).find((item: any) => item.properties?.title === tabName);
  if (!sheet) throw new Error(`Sheet tab not found: ${tabName}`);
  return apiCall(token, `${API}/${sheetId}:batchUpdate`, {
    method: 'POST',
    body: JSON.stringify({
      requests: [{
        deleteDimension: {
          range: {
            sheetId: sheet.properties.sheetId,
            dimension: 'COLUMNS',
            startIndex: columnIndex,
            endIndex: columnIndex + 1,
          },
        },
      }],
    }),
  });
}

/** Create a new sheet tab if it doesn't exist. */
export async function ensureSheet(token: string, sheetId: string, tabName: string, headers: string[]) {
  let rows: string[][] | undefined;
  try {
    rows = await readSheetLive(token, sheetId, `'${tabName}'!A1:A1`);
  } catch { /* create the missing tab below */ }

  if (!rows) {
    try {
      await apiCall(token, `${API}/${sheetId}:batchUpdate`, {
        method: 'POST', body: JSON.stringify({ requests: [{ addSheet: { properties: { title: tabName } } }] }),
      });
    } catch (addError) {
      try {
        rows = await readSheetLive(token, sheetId, `'${tabName}'!A1:A1`);
      } catch {
        throw addError;
      }
    }
    rows ??= await readSheetLive(token, sheetId, `'${tabName}'!A1:A1`);
  }

  if (rows.length === 0) {
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
  const columnCount = sheet.properties.gridProperties?.columnCount ?? 0;
  const dimensionRequest = columnIndex >= columnCount
    ? {
        appendDimension: {
          sheetId: tabId,
          dimension: 'COLUMNS',
          length: columnIndex - columnCount + 1,
        },
      }
    : {
        insertDimension: {
          range: { sheetId: tabId, dimension: 'COLUMNS', startIndex: columnIndex, endIndex: columnIndex + 1 },
          inheritFromBefore: false,
        },
      };
  return apiCall(token, `${API}/${sheetId}:batchUpdate`, {
    method: 'POST',
    body: JSON.stringify({
      requests: [
        dimensionRequest,
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

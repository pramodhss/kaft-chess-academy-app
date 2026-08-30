import { afterEach, describe, expect, it, vi } from 'vitest';
import { appendRows, clearSheetReadCache, ensureSheet, readSheet } from './sheets';

afterEach(() => {
  clearSheetReadCache();
  vi.restoreAllMocks();
});

describe('readSheet', () => {
  it('reuses a recent read for the same signed-in user and range', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ values: [['Aarav']] }), { status: 200 }),
    );

    await expect(readSheet('token', 'sheet-id', "'Students'!A:A")).resolves.toEqual([['Aarav']]);
    await expect(readSheet('token', 'sheet-id', "'Students'!A:A")).resolves.toEqual([['Aarav']]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('invalidates cached reads after a successful mutation', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (_input, options) => {
      const method = options?.method ?? 'GET';
      if (method === 'PUT') {
        return new Response(JSON.stringify({ updatedRange: "'Students'!A2:A2" }), { status: 200 });
      }
      return new Response(JSON.stringify({ values: [['Aarav']] }), { status: 200 });
    });

    await readSheet('token', 'sheet-id', "'Students'!A:A");
    await appendRows('token', 'sheet-id', "'Students'!A:A", [['Diya']]);
    await readSheet('token', 'sheet-id', "'Students'!A:A");

    expect(fetchMock).toHaveBeenCalledTimes(4);
  });
});

describe('ensureSheet', () => {

  it('recovers when another initializer creates the sheet first', async () => {
    let reads = 0;
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (_input, options) => {
      if ((options?.method ?? 'GET') === 'GET') {
        reads += 1;
        if (reads === 1) return new Response('Unable to parse range', { status: 400 });
        return new Response(JSON.stringify({ values: [] }), { status: 200 });
      }
      if (options?.method === 'POST') {
        return new Response(JSON.stringify({ error: { message: 'A sheet with this name already exists.' } }), { status: 400 });
      }
      return new Response(JSON.stringify({ updatedRows: 1 }), { status: 200 });
    });

    await expect(ensureSheet('token', 'sheet-id', 'Tournament Registrations', ['Tournament ID']))
      .resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it('preserves the original add error when the sheet still cannot be read', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (_input, options) => {
      if ((options?.method ?? 'GET') === 'GET') return new Response('Unable to parse range', { status: 400 });
      return new Response('Permission denied', { status: 403 });
    });

    await expect(ensureSheet('token', 'sheet-id', 'Restricted', ['Header']))
      .rejects.toThrow('Sheets API 403: Permission denied');
  });
});
import { useEffect, useState, useCallback } from 'react';
import { Layout } from '../components/Layout';
import { Spinner } from '../components/Spinner';
import { useAuth } from '../context/AuthContext';
import { readSheet, batchWrite, colLetter } from '../lib/sheets';
import { SHEET_ID, TABS, ATT_DATE_START, ATT_STUDENT_ROWS } from '../config';

interface AttRow { name: string; batch: string; present: boolean; sheetRow: number }

export function Attendance() {
  const { token, logout } = useAuth();
  const [dateHeaders, setDateHeaders] = useState<string[]>([]);
  const [selectedDateIdx, setSelectedDateIdx] = useState(0);
  const [rows, setRows] = useState<AttRow[]>([]);
  const [dirty, setDirty] = useState<Map<number, boolean>>(new Map()); // sheetRow → new value
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Load the full attendance grid once
  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true); setError('');
    try {
      // +2: header row + summary row
      const totalRows = ATT_STUDENT_ROWS + 2;
      const lastDateCol = colLetter(ATT_DATE_START + 37); // 38 dates
      const totalCol = colLetter(ATT_DATE_START + 38);
      const grid = await readSheet(token, SHEET_ID,
        `'${TABS.ATTENDANCE}'!A1:${totalCol}${totalRows}`);

      // Row 0 = headers; date values start at col ATT_DATE_START
      const headers = (grid[0] ?? []).slice(ATT_DATE_START, ATT_DATE_START + 38);
      setDateHeaders(headers);

      // Find nearest upcoming (or most recent past) weekend date
      const today = new Date(); today.setHours(0,0,0,0);
      let bestIdx = 0;
      let bestDiff = Infinity;
      headers.forEach((h, i) => {
        if (!h) return;
        // headers are formatted like "22-Aug\nSat" — extract the first line
        const line = h.split('\n')[0];
        const d = new Date(`${line} 2026`);
        const diff = Math.abs(d.getTime() - today.getTime());
        if (diff < bestDiff) { bestDiff = diff; bestIdx = i; }
      });
      setSelectedDateIdx(bestIdx);

      const studentRows = grid.slice(1, ATT_STUDENT_ROWS + 1);
      const parsed: AttRow[] = studentRows
        .filter(r => r[0]?.trim())
        .map((r, i) => ({
          name:     r[0] ?? '',
          batch:    r[1] ?? '',
          present:  (r[ATT_DATE_START + bestIdx] ?? '').toUpperCase() === 'TRUE',
          sheetRow: i + 2, // 1-based, row 1 = header
        }));
      setRows(parsed);
      setDirty(new Map());
    } catch (e: any) {
      if (e.message === 'TOKEN_EXPIRED') { logout(); return; }
      setError(e.message);
    } finally { setLoading(false); }
  }, [token, logout]);

  useEffect(() => { load(); }, [load]);

  // When date selection changes, re-load column values from stored grid
  // (simpler: just reload the full sheet — still fast enough)
  const changeDate = async (idx: number) => {
    setSelectedDateIdx(idx);
    setDirty(new Map());
    if (!token) return;
    setLoading(true);
    try {
      const totalRows = ATT_STUDENT_ROWS + 2;
      const totalCol = colLetter(ATT_DATE_START + 38);
      const grid = await readSheet(token, SHEET_ID,
        `'${TABS.ATTENDANCE}'!A1:${totalCol}${totalRows}`);
      const studentRows = grid.slice(1, ATT_STUDENT_ROWS + 1);
      setRows(studentRows.filter(r => r[0]?.trim()).map((r, i) => ({
        name:    r[0] ?? '', batch: r[1] ?? '',
        present: (r[ATT_DATE_START + idx] ?? '').toUpperCase() === 'TRUE',
        sheetRow: i + 2,
      })));
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  };

  const toggle = (sheetRow: number, current: boolean) => {
    const newVal = !current;
    setRows(prev => prev.map(r => r.sheetRow === sheetRow ? { ...r, present: newVal } : r));
    setDirty(prev => { const m = new Map(prev); m.set(sheetRow, newVal); return m; });
  };

  const save = async () => {
    if (!token || dirty.size === 0) return;
    setSaving(true);
    try {
      const dateCol = colLetter(ATT_DATE_START + selectedDateIdx);
      const updates = Array.from(dirty.entries()).map(([row, val]) => ({
        range: `'${TABS.ATTENDANCE}'!${dateCol}${row}`,
        value: val,
      }));
      await batchWrite(token, SHEET_ID, updates);
      setDirty(new Map());
    } catch (e: any) { alert('Save failed: ' + e.message); }
    finally { setSaving(false); }
  };

  const presentCount = rows.filter(r => {
    const d = dirty.get(r.sheetRow);
    return d !== undefined ? d : r.present;
  }).length;

  return (
    <Layout title="Attendance" action={
      dirty.size > 0 ? (
        <button onClick={save} disabled={saving}
          className="bg-white text-navy text-sm font-bold px-3 py-1 rounded-full disabled:opacity-50">
          {saving ? 'Saving…' : `Save (${dirty.size})`}
        </button>
      ) : undefined
    }>
      {loading ? <Spinner /> : (
        <div className="flex flex-col h-full">
          {error && <p className="px-4 py-2 text-red-600 text-sm">{error}</p>}

          {/* Date selector */}
          <div className="px-4 py-3 bg-white border-b border-gray-100">
            <p className="text-xs text-gray-500 mb-2">Select Weekend Date</p>
            <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
              {dateHeaders.map((h, i) => {
                const parts = h.split('\n');
                return (
                  <button key={i} onClick={() => changeDate(i)}
                    className={`flex-shrink-0 flex flex-col items-center px-3 py-2 rounded-xl text-xs font-medium transition-colors min-w-[52px]
                      ${i === selectedDateIdx ? 'bg-navy text-white' : 'bg-gray-100 text-gray-700'}`}>
                    <span className="text-base font-bold leading-none">{parts[0]?.split('-')[0]}</span>
                    <span className="opacity-80">{parts[0]?.split('-')[1]}</span>
                    <span className="opacity-60 text-[10px]">{parts[1]}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Summary bar */}
          <div className="px-4 py-2 bg-chess-light flex items-center justify-between text-sm">
            <span className="text-navy font-semibold">
              {presentCount} / {rows.filter(r => r.name).length} Present
            </span>
            <span className="text-gray-500 text-xs">{dateHeaders[selectedDateIdx]?.replace('\n', ' ')}</span>
          </div>

          {/* Student list */}
          <div className="flex-1 overflow-y-auto">
            {rows.filter(r => r.name).map(r => {
              const isPresent = dirty.get(r.sheetRow) ?? r.present;
              return (
                <button key={r.sheetRow} onClick={() => toggle(r.sheetRow, isPresent)}
                  className={`w-full flex items-center justify-between px-4 py-3.5 border-b border-gray-100 active:bg-gray-50 transition-colors
                    ${isPresent ? 'bg-green-50' : 'bg-white'}`}>
                  <div className="text-left">
                    <p className="font-medium text-gray-900">{r.name}</p>
                    <p className="text-xs text-gray-400">{r.batch}</p>
                  </div>
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-lg font-bold transition-colors
                    ${isPresent ? 'bg-green-500 text-white' : 'bg-gray-200 text-gray-400'}`}>
                    {isPresent ? '✓' : '○'}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </Layout>
  );
}

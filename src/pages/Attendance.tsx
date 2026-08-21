import { useEffect, useState, useCallback } from 'react';
import { Layout } from '../components/Layout';
import { Spinner } from '../components/Spinner';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { EmptyState, ErrorState } from '../components/EmptyState';
import { readSheet, batchWrite, colLetter } from '../lib/sheets';
import { SHEET_ID, TABS, ATT_DATE_START, ATT_STUDENT_ROWS } from '../config';

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const DAYS   = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

// Generate all remaining Saturday+Sunday dates in 2026 (same order as the sheet columns)
function buildWeekendDates(): Date[] {
  const dates: Date[] = [];
  const d = new Date(2026, 7, 18); // Aug 18 2026
  while (d.getDay() !== 6) d.setDate(d.getDate() + 1);
  const end = new Date(2026, 11, 31);
  while (d <= end) {
    dates.push(new Date(d));
    d.setDate(d.getDate() + 1);
    if (d.getDay() === 1) d.setDate(d.getDate() + 5); // skip Mon–Fri
  }
  return dates;
}

const WEEKEND_DATES = buildWeekendDates();

function nearestDateIdx(): number {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  let best = 0, bestDiff = Infinity;
  WEEKEND_DATES.forEach((d, i) => {
    const diff = Math.abs(d.getTime() - today.getTime());
    if (diff < bestDiff) { bestDiff = diff; best = i; }
  });
  return best;
}

interface AttRow { name: string; batch: string; present: boolean; sheetRow: number }

export function Attendance() {
  const { token, logout } = useAuth();
  const toast = useToast();
  const [selectedIdx, setSelectedIdx] = useState(nearestDateIdx);
  const [rows, setRows] = useState<AttRow[]>([]);
  const [dirty, setDirty] = useState<Map<number, boolean>>(new Map());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const coachName = localStorage.getItem('chess_coach_name') ?? 'Coach';

  const loadDate = useCallback(async (idx: number) => {
    if (!token) return;
    setLoading(true); setError('');
    try {
      const dateCol = colLetter(ATT_DATE_START + idx);
      // Read name (A), batch (B) and just the one date column
      const [nameRows, dateRows] = await Promise.all([
        readSheet(token, SHEET_ID, `'${TABS.ATTENDANCE}'!A2:B${ATT_STUDENT_ROWS + 1}`),
        readSheet(token, SHEET_ID, `'${TABS.ATTENDANCE}'!${dateCol}2:${dateCol}${ATT_STUDENT_ROWS + 1}`),
      ]);
      const parsed: AttRow[] = nameRows
        .filter(r => r[0]?.trim())
        .map((r, i) => ({
          name:     r[0] ?? '',
          batch:    r[1] ?? '',
          present:  (dateRows[i]?.[0] ?? '').toString().toUpperCase() === 'TRUE',
          sheetRow: i + 2,
        }));
      setRows(parsed);
      setDirty(new Map());
    } catch (e: any) {
      if (e.message === 'TOKEN_EXPIRED') { logout(); return; }
      setError(e.message);
    } finally { setLoading(false); }
  }, [token, logout]);

  useEffect(() => { loadDate(selectedIdx); }, [loadDate, selectedIdx]);

  const changeDate = (idx: number) => { setSelectedIdx(idx); };

  const toggle = (sheetRow: number, current: boolean) => {
    setRows(prev => prev.map(r => r.sheetRow === sheetRow ? { ...r, present: !current } : r));
    setDirty(prev => { const m = new Map(prev); m.set(sheetRow, !current); return m; });
  };

  const save = async () => {
    if (!token || dirty.size === 0) return;
    setSaving(true);
    try {
      const dateCol = colLetter(ATT_DATE_START + selectedIdx);
      const updates = Array.from(dirty.entries()).map(([row, val]) => ({
        range: `'${TABS.ATTENDANCE}'!${dateCol}${row}`, value: val,
      }));
      await batchWrite(token, SHEET_ID, updates);
      setDirty(new Map());
    } catch (e: any) { toast.error('Save failed: ' + e.message); }
    finally { setSaving(false); }
  };

  const presentCount = rows.filter(r => dirty.get(r.sheetRow) ?? r.present).length;
  const date = WEEKEND_DATES[selectedIdx];
  const batches = ['All', ...Array.from(new Set(rows.map(r => r.batch).filter(Boolean)))];
  const [batchFilter, setBatchFilter] = useState('All');
  const visibleRows = rows.filter(r => r.name && (batchFilter === 'All' || r.batch === batchFilter));

  const markAllPresent = () => {
    setRows(prev => prev.map(r =>
      visibleRows.some(v => v.sheetRow === r.sheetRow) ? { ...r, present: true } : r
    ));
    setDirty(prev => {
      const m = new Map(prev);
      visibleRows.forEach(r => m.set(r.sheetRow, true));
      return m;
    });
  };

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
          {error && <p className="px-4 py-2 text-red-600 text-sm bg-red-50">{error}</p>}

          {/* Date strip */}
          <div className="px-4 py-3 bg-white border-b border-gray-100">
            <p className="text-xs font-medium text-gray-500 mb-2">Select Date</p>
            <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
              {WEEKEND_DATES.map((d, i) => (
                <button key={i} onClick={() => changeDate(i)}
                  className={`flex-shrink-0 flex flex-col items-center px-2 py-2 rounded-xl min-w-[46px] transition-colors
                    ${i === selectedIdx ? 'bg-navy text-white' : 'bg-gray-100 text-gray-700'}`}>
                  <span className="text-lg font-bold leading-none">{d.getDate()}</span>
                  <span className="text-[10px] font-medium mt-0.5">{MONTHS[d.getMonth()]}</span>
                  <span className={`text-[10px] ${i === selectedIdx ? 'text-chess-light' : 'text-gray-400'}`}>{DAYS[d.getDay()]}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Batch filter + bulk action */}
          <div className="px-4 py-2 bg-white border-b border-gray-100 flex items-center gap-2">
            <select value={batchFilter} onChange={e => setBatchFilter(e.target.value)}
              className="flex-1 text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none">
              {batches.map(b => <option key={b}>{b}</option>)}
            </select>
            <button onClick={markAllPresent}
              className="flex-shrink-0 bg-green-500 text-white text-xs font-bold px-3 py-1.5 rounded-lg">
              ✓ All Present
            </button>
          </div>

          {/* Summary */}
          <div className="px-4 py-2 bg-chess-light flex items-center justify-between">
            <span className="text-navy font-semibold text-sm">
              {presentCount} / {rows.filter(r => r.name).length} Present
            </span>
            <span className="text-navy text-sm font-medium">
              {DAYS[date.getDay()]}, {date.getDate()} {MONTHS[date.getMonth()]} 2026
            </span>
          </div>

          {/* Student list */}
          <div className="flex-1 overflow-y-auto">
            {visibleRows.map(r => {
              const isPresent = dirty.get(r.sheetRow) ?? r.present;
              return (
                <button key={r.sheetRow} onClick={() => toggle(r.sheetRow, isPresent)}
                  className={`w-full flex items-center justify-between px-4 py-3.5 border-b border-gray-100 active:bg-gray-50
                    ${isPresent ? 'bg-green-50' : 'bg-white'}`}>
                  <div className="text-left">
                    <p className="font-medium text-gray-900">{r.name}</p>
                    <p className="text-xs text-gray-400">{r.batch}</p>
                  </div>
                  <div className={`w-9 h-9 rounded-full flex items-center justify-center text-lg font-bold transition-colors
                    ${isPresent ? 'bg-green-500 text-white' : 'bg-gray-200 text-gray-400'}`}>
                    {isPresent ? '✓' : '○'}
                  </div>
                </button>
              );
            })}
          </div>

          {dirty.size > 0 && (
            <div className="fixed bottom-16 left-0 right-0 bg-white border-t border-gray-200 p-4 z-50 shadow-lg">
              <button onClick={save} disabled={saving}
                className="w-full bg-navy text-white py-3 rounded-xl font-semibold disabled:opacity-50">
                {saving ? 'Saving…' : `💾 Save Attendance (${dirty.size} changes) — by ${coachName}`}
              </button>
            </div>
          )}
        </div>
      )}
    </Layout>
  );
}

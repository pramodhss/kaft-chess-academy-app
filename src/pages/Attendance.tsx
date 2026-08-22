import { useEffect, useState, useCallback } from 'react';
import { Trash2 } from 'lucide-react';
import { Layout } from '../components/Layout';
import { Spinner } from '../components/Spinner';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { readSheet, readSheetUnformatted, batchWrite, colLetter, deleteSheetColumn, insertSheetColumnHeader } from '../lib/sheets';
import { reconcileAttendanceRoster } from '../lib/studentSync';
import type { SheetValue } from '../lib/sheets';
import { SHEET_ID, TABS, ATT_DATE_START } from '../config';

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

interface AttendanceDate { date: Date; columnIndex: number }

function parseSheetDate(value: SheetValue): Date | null {
  if (typeof value === 'number') {
    const utcDate = new Date(Date.UTC(1899, 11, 30) + value * 86400000);
    return new Date(utcDate.getUTCFullYear(), utcDate.getUTCMonth(), utcDate.getUTCDate(), 12);
  }
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(trimmed);
  if (iso) return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]), 12);
  const slash = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(trimmed);
  if (slash) return new Date(Number(slash[3]), Number(slash[2]) - 1, Number(slash[1]), 12);
  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function dateKey(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

function nearestDateIdx(dates: AttendanceDate[]): number {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  let best = 0, bestDiff = Infinity;
  dates.forEach(({ date }, i) => {
    const diff = Math.abs(date.getTime() - today.getTime());
    if (diff < bestDiff) { bestDiff = diff; best = i; }
  });
  return best;
}

interface AttRow { name: string; batch: string; present: boolean; sheetRow: number }

export function Attendance() {
  const { token, logout } = useAuth();
  const toast = useToast();
  const [attendanceDates, setAttendanceDates] = useState<AttendanceDate[]>([]);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [nextDateColumn, setNextDateColumn] = useState(ATT_DATE_START + WEEKEND_DATES.length);
  const [rows, setRows] = useState<AttRow[]>([]);
  const [dirty, setDirty] = useState<Map<number, boolean>>(new Map());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showAddDate, setShowAddDate] = useState(false);
  const [newDate, setNewDate] = useState('');
  const [addingDate, setAddingDate] = useState(false);
  const [deletingDate, setDeletingDate] = useState(false);
  const [error, setError] = useState('');
  const coachName = localStorage.getItem('chess_coach_name') ?? 'Coach';

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    (async () => {
      try {
        if (navigator.onLine) await reconcileAttendanceRoster(token, SHEET_ID);
        const headerRows = await readSheetUnformatted(token, SHEET_ID, `'${TABS.ATTENDANCE}'!C1:ZZ1`);
        const headerCells = headerRows[0] ?? [];
        const parsed = headerCells.flatMap((value, index) => {
          const date = parseSheetDate(value ?? '');
          return date ? [{ date, columnIndex: ATT_DATE_START + index }] : [];
        });
        let dates = WEEKEND_DATES.map((date, index) => ({ date, columnIndex: ATT_DATE_START + index }));
        if (parsed.length > 0) {
          dates = [...parsed];
          dates.sort((a, b) => a.date.getTime() - b.date.getTime());
        }
        setNextDateColumn(ATT_DATE_START + Math.max(headerCells.length, WEEKEND_DATES.length));
        setAttendanceDates(dates);
        setSelectedIdx(nearestDateIdx(dates));
      } catch (e: any) {
        if (e.message === 'TOKEN_EXPIRED') { logout(); return; }
        setError(e.message);
        setLoading(false);
      }
    })();
  }, [token, logout]);

  const loadDate = useCallback(async (attendanceDate: AttendanceDate) => {
    if (!token) return;
    setLoading(true); setError('');
    try {
      const dateCol = colLetter(attendanceDate.columnIndex);
      // Read name (A), batch (B) and just the one date column
      const [nameRows, dateRows] = await Promise.all([
        readSheet(token, SHEET_ID, `'${TABS.ATTENDANCE}'!A2:B`),
        readSheet(token, SHEET_ID, `'${TABS.ATTENDANCE}'!${dateCol}2:${dateCol}`),
      ]);
      const parsed: AttRow[] = nameRows
        .map((r, i) => ({
          name:     r[0] ?? '',
          batch:    r[1] ?? '',
          present:  (dateRows[i]?.[0] ?? '').toString().toUpperCase() === 'TRUE',
          sheetRow: i + 2,
        }))
        .filter(r => r.name.trim());
      setRows(parsed);
      setDirty(new Map());
    } catch (e: any) {
      if (e.message === 'TOKEN_EXPIRED') { logout(); return; }
      setError(e.message);
    } finally { setLoading(false); }
  }, [token, logout]);

  useEffect(() => {
    const attendanceDate = attendanceDates[selectedIdx];
    if (attendanceDate) loadDate(attendanceDate);
  }, [attendanceDates, loadDate, selectedIdx]);

  const changeDate = (idx: number) => { setSelectedIdx(idx); };

  const toggle = (sheetRow: number, current: boolean) => {
    const desired = !current;
    const original = rows.find(row => row.sheetRow === sheetRow)?.present ?? false;
    setDirty(prev => {
      const next = new Map(prev);
      if (desired === original) next.delete(sheetRow);
      else next.set(sheetRow, desired);
      return next;
    });
  };

  const save = async () => {
    if (!token || dirty.size === 0 || !selectedDate) return;
    setSaving(true);
    try {
      const headerRows = await readSheetUnformatted(token, SHEET_ID, `'${TABS.ATTENDANCE}'!C1:ZZ1`);
      const currentHeaderIndex = (headerRows[0] ?? []).findIndex(value => {
        const parsed = parseSheetDate(value);
        return parsed ? dateKey(parsed) === dateKey(selectedDate.date) : false;
      });
      if (currentHeaderIndex < 0) throw new Error('The selected attendance date no longer exists. Reload and try again.');
      const currentColumnIndex = ATT_DATE_START + currentHeaderIndex;
      const dateCol = colLetter(currentColumnIndex);
      const currentValues = await readSheet(token, SHEET_ID, `'${TABS.ATTENDANCE}'!${dateCol}2:${dateCol}`);
      const hasConflict = Array.from(dirty.keys()).some(sheetRow => {
        const original = rows.find(row => row.sheetRow === sheetRow)?.present ?? false;
        const current = (currentValues[sheetRow - 2]?.[0] ?? '').toString().toUpperCase() === 'TRUE';
        return current !== original;
      });
      if (hasConflict) {
        toast.info('Attendance changed on another device. The latest values have been reloaded.');
        await loadDate({ date: selectedDate.date, columnIndex: currentColumnIndex });
        return;
      }
      const updates = Array.from(dirty.entries()).map(([row, val]) => ({
        range: `'${TABS.ATTENDANCE}'!${dateCol}${row}`, value: val,
      }));
      await batchWrite(token, SHEET_ID, updates);
      setRows(prev => prev.map(row => dirty.has(row.sheetRow)
        ? { ...row, present: dirty.get(row.sheetRow) ?? row.present }
        : row));
      setDirty(new Map());
      toast.success(`Attendance saved for ${DAYS[date.getDay()]}, ${date.getDate()} ${MONTHS[date.getMonth()]}.`);
    } catch (e: any) { toast.error('Save failed: ' + e.message); }
    finally { setSaving(false); }
  };

  const addAttendanceDate = async () => {
    if (!token || !newDate) return;
    const date = parseSheetDate(newDate);
    if (!date) { toast.error('Choose a valid class date.'); return; }
    if (attendanceDates.some(option => dateKey(option.date) === dateKey(date))) {
      toast.info('That date is already available in Attendance.');
      return;
    }
    setAddingDate(true);
    try {
      await insertSheetColumnHeader(token, SHEET_ID, TABS.ATTENDANCE, nextDateColumn, newDate);
      const headerRows = await readSheetUnformatted(token, SHEET_ID, `'${TABS.ATTENDANCE}'!C1:ZZ1`);
      const headerCells = headerRows[0] ?? [];
      const dates = headerCells.flatMap((value, index) => {
        const parsed = parseSheetDate(value);
        return parsed ? [{ date: parsed, columnIndex: ATT_DATE_START + index }] : [];
      }).sort((a, b) => a.date.getTime() - b.date.getTime());
      setAttendanceDates(dates);
      setSelectedIdx(dates.findIndex(option => dateKey(option.date) === dateKey(date)));
      setNextDateColumn(ATT_DATE_START + headerCells.length);
      setShowAddDate(false);
      setNewDate('');
      toast.success(`${DAYS[date.getDay()]}, ${date.getDate()} ${MONTHS[date.getMonth()]} was added for attendance.`);
    } catch (e: any) { toast.error('Could not add date: ' + e.message); }
    finally { setAddingDate(false); }
  };

  const removeAttendanceDate = async () => {
    if (!token || !selectedDate) return;
    const label = `${DAYS[selectedDate.date.getDay()]}, ${selectedDate.date.getDate()} ${MONTHS[selectedDate.date.getMonth()]} ${selectedDate.date.getFullYear()}`;
    if (!window.confirm(`Remove ${label}? All attendance marks saved for this class date will also be permanently removed.`)) return;
    setDeletingDate(true);
    try {
      const headerRows = await readSheetUnformatted(token, SHEET_ID, `'${TABS.ATTENDANCE}'!C1:ZZ1`);
      const currentHeaderIndex = (headerRows[0] ?? []).findIndex(value => {
        const parsed = parseSheetDate(value);
        return parsed ? dateKey(parsed) === dateKey(selectedDate.date) : false;
      });
      if (currentHeaderIndex < 0) {
        toast.info('This class date was already removed on another device. Reload Attendance.');
        return;
      }
      await deleteSheetColumn(token, SHEET_ID, TABS.ATTENDANCE, ATT_DATE_START + currentHeaderIndex);
      const updatedHeaderRows = await readSheetUnformatted(token, SHEET_ID, `'${TABS.ATTENDANCE}'!C1:ZZ1`);
      const headerCells = updatedHeaderRows[0] ?? [];
      const dates = headerCells.flatMap((value, index) => {
        const parsed = parseSheetDate(value);
        return parsed ? [{ date: parsed, columnIndex: ATT_DATE_START + index }] : [];
      }).sort((a, b) => a.date.getTime() - b.date.getTime());
      setAttendanceDates(dates);
      setSelectedIdx(nearestDateIdx(dates));
      setNextDateColumn(ATT_DATE_START + Math.max(headerCells.length, WEEKEND_DATES.length));
      setDirty(new Map());
      toast.success(`${label} was removed from Attendance.`);
    } catch (e: any) { toast.error('Could not remove date: ' + e.message); }
    finally { setDeletingDate(false); }
  };

  const presentCount = rows.filter(r => dirty.get(r.sheetRow) ?? r.present).length;
  const selectedDate = attendanceDates[selectedIdx];
  const date = selectedDate?.date ?? new Date();
  const batches = ['All', ...Array.from(new Set(rows.map(r => r.batch).filter(Boolean)))];
  const [batchFilter, setBatchFilter] = useState('All');
  const visibleRows = rows.filter(r => r.name && (batchFilter === 'All' || r.batch === batchFilter));

  const markAllPresent = () => {
    setDirty(prev => {
      const next = new Map(prev);
      visibleRows.forEach(row => {
        if (row.present) next.delete(row.sheetRow);
        else next.set(row.sheetRow, true);
      });
      return next;
    });
  };

  return (
    <Layout title="Attendance" action={
      dirty.size > 0 ? (
        <button type="button" onClick={save} disabled={saving}
          className="bg-white text-navy text-sm font-bold px-3 py-1 rounded-full disabled:opacity-50">
          {saving ? 'Saving…' : `Save ${dirty.size}`}
        </button>
      ) : undefined
    }>
      {loading ? <Spinner /> : (
        <div className="flex flex-col h-full">
          {error && <p className="px-4 py-2 text-red-600 text-sm bg-red-50">{error}</p>}

          {/* Date strip */}
          <div className="px-4 py-3 bg-white border-b border-gray-100">
            <div className="flex items-center justify-between gap-2 mb-2">
              <p className="text-xs font-medium text-gray-500">
                Select Date <span className="font-bold text-navy">· {date.getFullYear()}</span>
              </p>
              <div className="flex items-center gap-2">
                {selectedDate && (
                  <button type="button" onClick={removeAttendanceDate} disabled={deletingDate || dirty.size > 0}
                    aria-label="Remove selected class date" title={dirty.size > 0 ? 'Save or discard attendance changes first' : 'Remove selected class date'}
                    className="text-xs font-bold text-red-700 flex items-center gap-1 px-2 py-1 rounded-lg bg-red-50 disabled:opacity-40">
                    <Trash2 size={14} aria-hidden="true" /> Remove
                  </button>
                )}
                <button type="button" onClick={() => setShowAddDate(true)}
                  className="text-xs font-bold text-chess-blue flex items-center gap-1 px-2 py-1 rounded-lg bg-chess-light">
                  <span className="text-base leading-none">+</span> Add Date
                </button>
              </div>
            </div>
            <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
              {attendanceDates.map(({ date: d, columnIndex }, i) => (
                <button type="button" key={columnIndex} onClick={() => changeDate(i)}
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
            <button type="button" onClick={markAllPresent}
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
              {DAYS[date.getDay()]}, {date.getDate()} {MONTHS[date.getMonth()]} {date.getFullYear()}
            </span>
          </div>

          {/* Student list */}
          <div className="flex-1 overflow-y-auto">
            {visibleRows.map(r => {
              const isPresent = dirty.get(r.sheetRow) ?? r.present;
              return (
                <button type="button" key={r.sheetRow} onClick={() => toggle(r.sheetRow, isPresent)}
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
              <button type="button" onClick={save} disabled={saving}
                className="w-full bg-navy text-white py-3 rounded-xl font-semibold disabled:opacity-60 flex items-center justify-center gap-2">
                {saving && <span className="button-spinner" aria-hidden="true"/>}
                {saving ? 'Saving attendance…' : `Save Attendance (${dirty.size} changes) — by ${coachName}`}
              </button>
            </div>
          )}

          {showAddDate && (
            <dialog open aria-labelledby="add-date-title"
              onCancel={event => { event.preventDefault(); if (!addingDate) setShowAddDate(false); }}
              className="fixed inset-0 z-[60] m-0 p-0 w-full max-w-none h-full max-h-none bg-transparent flex items-end">
              <button type="button" aria-label="Close add date dialog" disabled={addingDate}
                className="absolute inset-0 w-full h-full bg-black/50 rounded-none" onClick={() => setShowAddDate(false)} />
              <div className="relative bg-white w-full rounded-t-2xl p-5">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 id="add-date-title" className="font-bold text-lg text-navy">Add Extra Class Date</h2>
                    <p className="text-xs text-gray-400 mt-0.5">The date will be available to every coach.</p>
                  </div>
                  <button type="button" onClick={() => setShowAddDate(false)} disabled={addingDate}
                    className="text-gray-400 text-2xl leading-none">×</button>
                </div>
                <label className="text-xs font-medium text-gray-500 mb-1 block" htmlFor="attendance-extra-date">Class date</label>
                <input id="attendance-extra-date" type="date" value={newDate}
                  onChange={event => setNewDate(event.target.value)} className="input" />
                <button type="button" onClick={addAttendanceDate} disabled={addingDate || !newDate}
                  className="w-full bg-navy text-white py-3 rounded-xl font-semibold mt-4 disabled:opacity-60 flex items-center justify-center gap-2">
                  {addingDate && <span className="button-spinner" aria-hidden="true"/>}
                  {addingDate ? 'Adding class date…' : 'Add Class Date'}
                </button>
              </div>
            </dialog>
          )}
        </div>
      )}
    </Layout>
  );
}

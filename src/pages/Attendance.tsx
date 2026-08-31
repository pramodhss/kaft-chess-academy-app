import { useEffect, useState, useCallback } from 'react';
import { CalendarDays, CalendarSearch, Check, ChevronLeft, ChevronRight, Copy, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { Layout } from '../components/Layout';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { readSheet, readSheetUnformatted, batchWrite, clearSheetReadCache, colLetter, deleteSheetColumn, insertSheetColumnHeader } from '../lib/sheets';
import { reconcileAttendanceRoster } from '../lib/studentSync';
import { useCoachName } from '../hooks/useCoachName';
import type { SheetValue } from '../lib/sheets';
import { SHEET_ID, TABS, ATT_DATE_START } from '../config';
import { useOnline } from '../hooks/useOnline';
import { flushAttendanceQueue, queueAttendance } from '../lib/offlineAttendance';
import { recordAudit } from '../lib/audit';
import { DEFAULT_BATCHES, loadStudentOptions } from '../lib/studentOptions';

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
  const { coachName: savedCoachName } = useCoachName();
  const toast = useToast();
  const [attendanceDates, setAttendanceDates] = useState<AttendanceDate[]>([]);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [nextDateColumn, setNextDateColumn] = useState(ATT_DATE_START + WEEKEND_DATES.length);
  const [rows, setRows] = useState<AttRow[]>([]);
  const [configuredBatches, setConfiguredBatches] = useState<string[]>([...DEFAULT_BATCHES]);
  const [dirty, setDirty] = useState<Map<number, boolean>>(new Map());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showAddDate, setShowAddDate] = useState(false);
  const [newDate, setNewDate] = useState('');
  const [addingDate, setAddingDate] = useState(false);
  const [deletingDate, setDeletingDate] = useState(false);
  const [error, setError] = useState('');
  const [syncing, setSyncing] = useState(false);
  const coachName = savedCoachName || 'Coach';
  const online = useOnline();

  useEffect(() => {
    if (!token || !online) return;
    void flushAttendanceQueue(token, SHEET_ID).then(result => {
      if (result.saved > 0) toast.success(`${result.saved} queued attendance change${result.saved === 1 ? '' : 's'} synced.`);
      if (result.conflicts > 0) toast.info(`${result.conflicts} offline change${result.conflicts === 1 ? '' : 's'} need review because Sheet data changed.`);
    }).catch(() => undefined);
  }, [token, online]);

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    (async () => {
      try {
        if (navigator.onLine) await reconcileAttendanceRoster(token, SHEET_ID);
        const [headerRows, options] = await Promise.all([
          readSheetUnformatted(token, SHEET_ID, `'${TABS.ATTENDANCE}'!C1:ZZ1`),
          loadStudentOptions(token, SHEET_ID),
        ]);
        setConfiguredBatches(options.batches.values);
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
      // Read name (A), batch (B), the date column, and student statuses to exclude inactive students
      const [nameRows, dateRows, studentRows] = await Promise.all([
        readSheet(token, SHEET_ID, `'${TABS.ATTENDANCE}'!A2:B`),
        readSheet(token, SHEET_ID, `'${TABS.ATTENDANCE}'!${dateCol}2:${dateCol}`),
        readSheet(token, SHEET_ID, `'${TABS.STUDENTS}'!A2:I`).catch(() => []),
      ]);
      const inactiveNames = new Set(
        studentRows
          .filter(row => (row[8] ?? 'Active').trim().toLowerCase() === 'inactive')
          .map(row => (row[0] ?? '').trim().toLowerCase())
      );
      const parsed: AttRow[] = nameRows
        .map((r, i) => ({
          name:     r[0] ?? '',
          batch:    r[1] ?? '',
          present:  (dateRows[i]?.[0] ?? '').toString().toUpperCase() === 'TRUE',
          sheetRow: i + 2,
        }))
        .filter(r => r.name.trim() && !inactiveNames.has(r.name.trim().toLowerCase()));
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

  // Sheets reads are cached briefly for performance, so another coach's edits
  // may not appear immediately — this forces a fresh fetch on demand.
  const sync = () => {
    clearSheetReadCache(SHEET_ID);
    const attendanceDate = attendanceDates[selectedIdx];
    if (!attendanceDate) return;
    setSyncing(true);
    void loadDate(attendanceDate).finally(() => setSyncing(false));
  };

  /* changeDate(idx) removed — goPrev/goNext are the only navigation paths */

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
    if (!online) {
      const dateCol = colLetter(selectedDate.columnIndex);
      try {
        queueAttendance(Array.from(dirty.entries()).map(([row, value]) => ({ range: `'${TABS.ATTENDANCE}'!${dateCol}${row}`, base: rows.find(item => item.sheetRow === row)?.present ?? false, value })));
        setRows(current => current.map(row => dirty.has(row.sheetRow) ? { ...row, present: dirty.get(row.sheetRow) ?? row.present } : row));
        setDirty(new Map());
        toast.info('Attendance saved offline and will sync after reconnection.');
      } catch (error: any) { toast.error(error.message); }
      return;
    }
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
      void recordAudit(token, 'UPDATE', 'Attendance', dateKey(selectedDate.date), `${updates.length} cells`).catch(() => undefined);
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
  const batches = ['All', ...configuredBatches];
  const [batchFilter, setBatchFilter] = useState('All');
  const visibleRows = rows.filter(r => {
    if (!r.name) return false;
    if (batchFilter === 'All') return true;
    const rb = r.batch.trim().toLowerCase();
    const fb = batchFilter.trim().toLowerCase();
    return rb === fb || rb.startsWith(fb);
  });
  const allVisiblePresent = visibleRows.length > 0 && visibleRows.every(r => dirty.get(r.sheetRow) ?? r.present);

  const toggleAllVisible = () => {
    setDirty(prev => {
      const next = new Map(prev);
      const targetState = !allVisiblePresent;
      visibleRows.forEach(row => {
        if (row.present === targetState) next.delete(row.sheetRow);
        else next.set(row.sheetRow, targetState);
      });
      return next;
    });
  };

  /* ─── helpers for prev/next navigation ────────────────────────────────── */
  const goPrev = () => setSelectedIdx(i => Math.max(0, i - 1));
  const goNext = () => setSelectedIdx(i => Math.min(attendanceDates.length - 1, i + 1));

  /* Jump to a date chosen from the calendar picker — finds nearest available date */
  const jumpToDate = (iso: string) => {
    if (!iso) return;
    const target = new Date(`${iso}T00:00:00`);
    let best = 0, bestDiff = Infinity;
    attendanceDates.forEach(({ date }, i) => {
      const diff = Math.abs(date.getTime() - target.getTime());
      if (diff < bestDiff) { bestDiff = diff; best = i; }
    });
    setSelectedIdx(best);
  };

  const dateLabel = `${DAYS[date.getDay()]}, ${date.getDate()} ${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
  const totalStudents = rows.filter(r => r.name).length;
  const absentCount = totalStudents - presentCount;

  const copyAttendanceReport = () => {
    const presentNames = rows.filter(r => dirty.get(r.sheetRow) ?? r.present).map(r => r.name);
    const absentNames  = rows.filter(r => !(dirty.get(r.sheetRow) ?? r.present)).map(r => r.name);
    const lines = [
      `*KAFT Chess Academy \u2013 Attendance*`,
      `*Date:* ${dateLabel}`,
      ``,
      `*Present (${presentNames.length}/${totalStudents})*`,
      ...presentNames.map(n => `\u2713 ${n}`),
      absentNames.length ? `` : null,
      absentNames.length ? `*Absent (${absentNames.length})*` : null,
      ...absentNames.map(n => `\u2717 ${n}`),
      ``,
      `\u2014 KAFT Chess Academy`,
    ].filter(l => l !== null) as string[];
    void navigator.clipboard.writeText(lines.join('\n')).then(
      () => toast.success('Attendance copied \u2014 ready to paste in WhatsApp.'),
      () => toast.error('Could not copy to clipboard.')
    );
  };

  /* ─── skeleton list while loading (shows structural chrome) ───────────── */
  const skeletonView = (
    <div className="flex-1 overflow-y-auto">
      {Array.from({ length: 8 }, (_, i) => (
        <div key={`att-skel-${i}`} className="flex items-center justify-between px-4 py-3.5 border-b border-gray-100">
          <div className="space-y-1.5">
            <div className="skeleton h-3.5 w-32 rounded" />
            <div className="skeleton h-2.5 w-20 rounded" />
          </div>
          <div className="skeleton h-9 w-9 rounded-full" />
        </div>
      ))}
    </div>
  );

  return (
    <Layout title="Attendance" action={
      dirty.size > 0 ? (
        <button type="button" onClick={save} disabled={saving} className="header-action disabled:opacity-50">
          {!saving && <Check size={15} aria-hidden="true" />}{saving ? 'Saving…' : `Save ${dirty.size}`}
        </button>
      ) : (
        <>
          <button type="button" onClick={sync} disabled={syncing} aria-label="Sync latest changes" title="Sync latest changes"
            className="icon-button"><RefreshCw size={16} className={syncing ? 'animate-spin' : ''} aria-hidden="true" /></button>
          <button type="button" onClick={() => setShowAddDate(true)} className="icon-button-add" aria-label="Add class date" title="Add a new class date">
            <Plus size={18} />
          </button>
        </>
      )
    }>
      <div className="attendance-workspace flex flex-col h-full">

        {/* ── Date navigation ──────────────────────────────────────────── */}
        <div className="attendance-date-bar bg-white border-b border-gray-100">
          <div className="flex items-center gap-2 px-3 py-3">
            <button type="button" onClick={goPrev} disabled={selectedIdx <= 0}
              className="icon-button disabled:opacity-30" aria-label="Previous date">
              <ChevronLeft size={18} />
            </button>
            <div className="flex-1 text-center">
              <p className="text-sm font-bold text-gray-900">{dateLabel}</p>
            </div>
            {/* Calendar picker — jumps to nearest available date */}
            <label className="icon-button cursor-pointer" aria-label="Pick a date">
              <CalendarSearch size={17} />
              <input type="date" className="sr-only" aria-hidden="true" tabIndex={-1}
                value={attendanceDates[selectedIdx] ? `${attendanceDates[selectedIdx].date.getFullYear()}-${String(attendanceDates[selectedIdx].date.getMonth()+1).padStart(2,'0')}-${String(attendanceDates[selectedIdx].date.getDate()).padStart(2,'0')}` : ''}
                onChange={e => jumpToDate(e.target.value)} />
            </label>
            <button type="button" onClick={goNext} disabled={selectedIdx >= attendanceDates.length - 1}
              className="icon-button disabled:opacity-30" aria-label="Next date">
              <ChevronRight size={18} />
            </button>
            {selectedDate && (
              <button type="button" onClick={removeAttendanceDate}
                disabled={deletingDate || dirty.size > 0}
                title={dirty.size > 0 ? 'Save changes first' : 'Remove this class date'}
                className="icon-button text-red-500 disabled:opacity-30" aria-label="Remove class date">
                {deletingDate ? <span className="button-spinner" aria-hidden="true"/> : <Trash2 size={17} />}
              </button>
            )}
          </div>
        </div>

        {/* ── Stats + filter + bulk action ─────────────────────────────── */}
        {!loading && (
          <div className="attendance-summary flex items-center gap-2 px-3 py-2 bg-white border-b border-gray-100">
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <span className="text-xs font-bold text-green-700">{presentCount} present</span>
              {absentCount > 0 && <span className="text-xs font-semibold text-red-600">{absentCount} absent</span>}
            </div>
            <select value={batchFilter} onChange={e => setBatchFilter(e.target.value)}
              className="text-xs border border-gray-200 rounded-lg px-2 py-1 focus:outline-none bg-white max-w-[110px]">
              {batches.map(b => <option key={b}>{b}</option>)}
            </select>
            <button type="button" onClick={toggleAllVisible}
              className="attendance-mark-all flex-shrink-0 flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-lg"
              aria-label={allVisiblePresent ? 'Clear attendance for all visible students' : 'Mark all visible students present'}
              title={allVisiblePresent ? 'Clear all visible' : 'Mark all visible present'}>
              <Check size={12} />{allVisiblePresent ? 'Clear All' : '✓ All'}
            </button>
            <button type="button" onClick={copyAttendanceReport}
              className="icon-button" aria-label="Copy attendance for WhatsApp" title="Copy attendance report">
              <Copy size={16} />
            </button>
          </div>
        )}

        {/* ── Error ────────────────────────────────────────────────────── */}
        {error && !loading && (
          <div className="mx-3 mt-3 rounded-xl border border-red-200 bg-red-50 p-4 text-center">
            <p className="text-sm font-semibold text-red-700 mb-1">{error}</p>
            <button type="button" onClick={() => { setError(''); if (selectedDate) void loadDate(selectedDate); }}
              className="text-xs font-bold text-red-600 underline">Retry</button>
          </div>
        )}

        {/* ── Student list / skeleton ───────────────────────────────────── */}
        {loading ? skeletonView : (
          <div className="flex-1 overflow-y-auto">
            {!error && visibleRows.length === 0 && (
              <div className="flex flex-col items-center gap-2 py-16 text-center text-gray-400">
                <CalendarDays size={28} className="opacity-50" />
                <p className="text-sm font-medium text-gray-500">No students for this date</p>
                <p className="text-xs text-gray-400">Add students in the Students section, or choose a different date.</p>
              </div>
            )}
            {visibleRows.map(r => {
              const isPresent = dirty.get(r.sheetRow) ?? r.present;
              const changed = dirty.has(r.sheetRow);
              return (
                <button type="button" key={r.sheetRow} onClick={() => toggle(r.sheetRow, isPresent)}
                  className={`attendance-row w-full flex items-center justify-between px-4 py-3.5 border-b border-gray-100 transition-colors
                    ${isPresent ? 'attendance-present-row' : 'bg-white'} ${changed ? 'ring-1 ring-inset ring-chess-blue/20' : ''}`}>
                  <div className="text-left">
                    <p className={`font-medium ${changed ? 'text-chess-blue' : 'text-gray-900'}`}>{r.name}</p>
                    {r.batch && <p className="text-xs text-gray-400 mt-0.5">{r.batch}</p>}
                  </div>
                  <div className={`w-9 h-9 rounded-full flex items-center justify-center text-base font-bold transition-all
                    ${isPresent ? 'attendance-present-dot text-white' : 'bg-gray-100 text-gray-400'}`}>
                    {isPresent ? '✓' : '○'}
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {/* ── Sticky save bar ──────────────────────────────────────────── */}
        {dirty.size > 0 && (
          <div className="attendance-save-bar sticky bottom-0 border-t border-gray-200 bg-white p-4 shadow-[0_-4px_16px_rgba(0,0,0,0.08)]">
            <button type="button" onClick={save} disabled={saving}
              className="primary-action w-full">
              {saving && <span className="button-spinner" aria-hidden="true"/>}
              {saving ? 'Saving attendance…' : `Save Attendance (${dirty.size} changes) — ${coachName}`}
            </button>
          </div>
        )}

        {/* ── Add Date dialog ──────────────────────────────────────────── */}
        {showAddDate && (
          <dialog open aria-labelledby="add-date-title"
            onCancel={event => { event.preventDefault(); if (!addingDate) setShowAddDate(false); }}
            className="fixed inset-0 z-[60] m-0 p-0 w-full max-w-none h-full max-h-none bg-transparent flex items-end">
            <button type="button" aria-label="Close" disabled={addingDate}
              className="absolute inset-0 w-full h-full bg-black/50 rounded-none" onClick={() => setShowAddDate(false)} />
            <div className="relative bg-white w-full rounded-t-2xl p-5">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 id="add-date-title" className="font-bold text-lg text-navy">Add Class Date</h2>
                  <p className="text-xs text-gray-400 mt-0.5">Visible to all coaches.</p>
                </div>
                <button type="button" onClick={() => setShowAddDate(false)} disabled={addingDate}
                  className="text-gray-400 text-2xl leading-none">×</button>
              </div>
              <label className="field-label" htmlFor="attendance-extra-date">Class date</label>
              <input id="attendance-extra-date" type="date" value={newDate}
                onChange={event => setNewDate(event.target.value)} className="input" />
              <button type="button" onClick={addAttendanceDate} disabled={addingDate || !newDate}
                className="primary-action mt-4 w-full">
                {addingDate && <span className="button-spinner" aria-hidden="true"/>}
                {addingDate ? 'Adding…' : 'Add Class Date'}
              </button>
            </div>
          </dialog>
        )}
      </div>
    </Layout>
  );
}

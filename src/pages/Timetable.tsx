import { useEffect, useState } from 'react';
import type { ChangeEvent } from 'react';
import { CalendarDays, Clock3, MapPin, Pencil, Plus, RefreshCw, Trash2, UserRound, UsersRound, X } from 'lucide-react';
import { Layout } from '../components/Layout';
import { PageSkeleton } from '../components/Skeleton';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useCoachName } from '../hooks/useCoachName';
import { appendRows, clearSheetRange, clearSheetReadCache, ensureSheet, readSheet, readSheetLive, writeRange } from '../lib/sheets';
import { recordAudit } from '../lib/audit';
import { DEFAULT_BATCHES, loadStudentOptions } from '../lib/studentOptions';
import {
  EMPTY_TIMETABLE, normalizeTimetableRows, timetableRow, timetableValidationError, timetableValues,
  TIMETABLE_HEADERS, WEEKDAYS, type TimetableDraft, type TimetableEntry,
} from '../lib/timetable';
import { SHEET_ID, TABS } from '../config';

export function Timetable() {
  const { token, logout } = useAuth();
  const { coachName } = useCoachName();
  const toast = useToast();
  const [rows, setRows] = useState<TimetableEntry[]>([]);
  const [batches, setBatches] = useState<string[]>([...DEFAULT_BATCHES]);
  const [levels, setLevels] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<TimetableEntry | null>(null);
  const [form, setForm] = useState<TimetableDraft>({ ...EMPTY_TIMETABLE });
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [deleting, setDeleting] = useState<number | null>(null);
  const [search, setSearch] = useState('');
  const [coachFilter, setCoachFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState('All');
  const [sort, setSort] = useState<'time' | 'batch'>('time');

  const load = async () => {
    if (!token) return;
    setLoading(true); setError('');
    try {
      await ensureSheet(token, SHEET_ID, TABS.TIMETABLE, TIMETABLE_HEADERS);
      const [timetableRows, studentRows, options] = await Promise.all([
        readSheet(token, SHEET_ID, `'${TABS.TIMETABLE}'!A:M`),
        readSheet(token, SHEET_ID, `'${TABS.STUDENTS}'!A:AG`),
        loadStudentOptions(token, SHEET_ID),
      ]);
      const normalized = normalizeTimetableRows(timetableRows);
      if (normalized.legacy) await writeRange(token, SHEET_ID, `'${TABS.TIMETABLE}'!A1:M${normalized.values.length + 1}`, [TIMETABLE_HEADERS, ...normalized.values]);
      setRows(normalized.entries);
      setBatches(options.batches.values.length > 0 ? options.batches.values : [...new Set(studentRows.slice(1).map(row => row[5]).filter(Boolean))]);
      setLevels([...new Set(studentRows.slice(1).map(row => row[6]).filter(Boolean))]);
    } catch (loadError: any) {
      if (loadError.message === 'TOKEN_EXPIRED') { logout(); return; }
      setError(loadError.message);
    } finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, [token]);

  const sync = () => {
    clearSheetReadCache(SHEET_ID);
    setSyncing(true);
    void load().finally(() => setSyncing(false));
  };

  const openCreate = () => {
    setEditing(null);
    setForm({ ...EMPTY_TIMETABLE, coach: coachName });
    setShowForm(true);
  };

  const openEdit = (entry: TimetableEntry) => {
    const { rowIndex: _rowIndex, ...draft } = entry;
    setEditing(entry); setForm(draft); setShowForm(true);
  };

  const update = (key: keyof TimetableDraft) => (event: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    setForm(current => ({ ...current, [key]: event.target.value }));
  };

  const save = async () => {
    if (!token) return;
    const validationError = timetableValidationError(form);
    if (validationError) { toast.error(validationError); return; }
    setSaving(true);
    try {
      if (editing) {
        const current = await readSheetLive(token, SHEET_ID, `'${TABS.TIMETABLE}'!A${editing.rowIndex}:M${editing.rowIndex}`);
        const live = timetableRow(current[0] ?? [], editing.rowIndex);
        if (JSON.stringify(live) !== JSON.stringify(editing)) {
          setRows(currentRows => currentRows.map(row => row.rowIndex === editing.rowIndex ? live : row));
          setEditing(live); setForm(live);
          toast.info('This class changed on another device. The latest values were loaded — review and save again.');
          return;
        }
        await writeRange(token, SHEET_ID, `'${TABS.TIMETABLE}'!A${editing.rowIndex}:M${editing.rowIndex}`, [timetableValues(form)]);
        setRows(currentRows => currentRows.map(row => row.rowIndex === editing.rowIndex ? { ...form, rowIndex: editing.rowIndex } : row));
        void recordAudit(token, 'UPDATE', 'Timetable', `${form.day} ${form.start}`, `${form.batch} · ${form.coach}`).catch(() => undefined);
        toast.success('Class schedule updated.');
      } else {
        const rowIndex = await appendRows(token, SHEET_ID, `'${TABS.TIMETABLE}'!A:M`, [timetableValues(form)]);
        setRows(currentRows => [...currentRows, { ...form, rowIndex }]);
        void recordAudit(token, 'CREATE', 'Timetable', `${form.day} ${form.start}`, `${form.batch} · ${form.coach}`).catch(() => undefined);
        toast.success('Weekly class added.');
      }
      setShowForm(false); setEditing(null);
    } catch (saveError: any) { toast.error(`Save failed: ${saveError.message}`); }
    finally { setSaving(false); }
  };

  const remove = async (entry: TimetableEntry) => {
    if (!token || !window.confirm(`Remove the ${entry.batch} class on ${entry.day}?`)) return;
    setDeleting(entry.rowIndex);
    try {
      const current = await readSheetLive(token, SHEET_ID, `'${TABS.TIMETABLE}'!A${entry.rowIndex}:M${entry.rowIndex}`);
      const live = timetableRow(current[0] ?? [], entry.rowIndex);
      if (JSON.stringify(live) !== JSON.stringify(entry)) {
        setRows(currentRows => currentRows.map(row => row.rowIndex === entry.rowIndex ? live : row));
        toast.info('This class changed on another device. The latest values were loaded — review and try removing it again.');
        return;
      }
      await clearSheetRange(token, SHEET_ID, `'${TABS.TIMETABLE}'!A${entry.rowIndex}:M${entry.rowIndex}`);
      setRows(currentRows => currentRows.filter(row => row.rowIndex !== entry.rowIndex));
      void recordAudit(token, 'DELETE', 'Timetable', `${entry.day} ${entry.start}`, entry.batch).catch(() => undefined);
      toast.success('Class removed from the weekly timetable.');
    } catch (removeError: any) { toast.error(`Remove failed: ${removeError.message}`); }
    finally { setDeleting(null); }
  };

  if (loading) return <Layout title="Weekly Classes"><PageSkeleton /></Layout>;
  const visibleRows = rows.filter(row => {
    const query = search.trim().toLowerCase();
    return (!query || `${row.batch} ${row.level} ${row.coach} ${row.room}`.toLowerCase().includes(query))
      && (coachFilter === 'All' || row.coach === coachFilter)
      && (statusFilter === 'All' || row.status === statusFilter);
  });
  const sortedRows = [...visibleRows].sort((left, right) => sort === 'batch'
    ? left.batch.localeCompare(right.batch) || left.start.localeCompare(right.start)
    : left.start.localeCompare(right.start));
  const availableDays = WEEKDAYS.filter(day => rows.some(row => row.day.toLowerCase() === day.toLowerCase()));
  let saveLabel = 'Add class';
  if (editing) saveLabel = 'Save changes';
  if (saving) saveLabel = 'Saving…';

  return <Layout title="Weekly Classes" action={
    <>
      <button type="button" onClick={sync} disabled={syncing} aria-label="Sync latest changes" title="Sync latest changes"
        className="icon-button"><RefreshCw size={16} className={syncing ? 'animate-spin' : ''} aria-hidden="true" /></button>
      <button type="button" onClick={openCreate} className="header-action-add" aria-label="Add weekly class"><Plus size={16} />Add</button>
    </>
  }>
    <div className="timetable-screen page-stack">
      {error && <div role="alert" className="error-state"><p>{error}</p><button type="button" onClick={load}>Retry</button></div>}
      {!error && rows.length > 0 && <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search classes…" aria-label="Search classes" className="input col-span-2 text-xs sm:col-span-1" />
        <select value={coachFilter} onChange={event => setCoachFilter(event.target.value)} className="input text-xs" aria-label="Filter classes by coach"><option>All</option>{[...new Set(rows.map(row => row.coach).filter(Boolean))].map(coach => <option key={coach}>{coach}</option>)}</select>
        <select value={statusFilter} onChange={event => setStatusFilter(event.target.value)} className="input text-xs" aria-label="Filter classes by status"><option>All</option><option>Active</option><option>Paused</option></select>
        <select value={sort} onChange={event => setSort(event.target.value as typeof sort)} className="input text-xs" aria-label="Sort classes"><option value="time">Sort by time</option><option value="batch">Sort by batch</option></select>
      </div>}
      {!error && rows.length === 0 && <div className="empty-state"><CalendarDays size={24} /><p>No weekly classes scheduled yet.</p><button type="button" onClick={openCreate} className="primary-action"><Plus size={16} />Add first class</button></div>}
      {!error && visibleRows.length === 0 && rows.length > 0 && <div className="empty-state"><CalendarDays size={24} /><p>No classes match the selected filters.</p></div>}
      {!error && availableDays.map(day => <section key={day} className="space-y-2">
        <h2 className="section-label px-1">{day}</h2>
        {sortedRows.filter(row => row.day.toLowerCase() === day.toLowerCase()).map(entry => <article key={entry.rowIndex} className="timetable-row surface-card p-3">
          <div className="flex items-start gap-3"><span className="icon-tile"><CalendarDays size={18} /></span><div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2"><div><h3 className="text-sm font-semibold text-gray-900">{entry.batch}</h3><p className="text-xs text-gray-500">{entry.level || 'Level not set'}</p></div><span className={entry.status === 'Active' ? 'badge-green' : 'badge-gray'}>{entry.status || 'Scheduled'}</span></div>
            <div className="mt-2 grid gap-1.5 text-xs text-gray-600 sm:grid-cols-2">
              <Meta Icon={Clock3}>{entry.start} - {entry.end}</Meta><Meta Icon={UserRound}>{entry.coach}</Meta>
              {entry.room && <Meta Icon={MapPin}>{entry.room}</Meta>}{entry.capacity && <Meta Icon={UsersRound}>{entry.enrolled || '0'} / {entry.capacity} enrolled</Meta>}
            </div>
          </div></div>
          <div className="mt-2 flex justify-end gap-1.5"><button type="button" onClick={() => openEdit(entry)} className="icon-button" aria-label={`Edit ${entry.batch} class`}><Pencil size={15} /></button><button type="button" onClick={() => remove(entry)} disabled={deleting === entry.rowIndex} className="icon-button-danger" aria-label={`Remove ${entry.batch} class`}><Trash2 size={15} /></button></div>
        </article>)}
      </section>)}
    </div>
    {showForm && <div className="modal-backdrop items-end justify-center sm:items-center"><dialog open aria-labelledby="class-form-title" className="modal-panel max-h-[92vh] max-w-lg overflow-y-auto p-4">
      <div className="mb-3 flex items-center justify-between"><h2 id="class-form-title" className="text-base font-semibold text-navy">{editing ? 'Edit weekly class' : 'Add weekly class'}</h2><button type="button" onClick={() => setShowForm(false)} className="icon-button" aria-label="Close"><X size={18} /></button></div>
      <div className="form-grid">
        <div className="grid grid-cols-2 gap-2"><Field label="Day"><select className="input" value={form.day} onChange={update('day')}><option value="">Select day</option>{WEEKDAYS.map(day => <option key={day}>{day}</option>)}</select></Field><Field label="Status"><select className="input" value={form.status} onChange={update('status')}><option>Active</option><option>Paused</option></select></Field></div>
        <Field label="Batch"><input className="input" list="class-batches" value={form.batch} onChange={update('batch')} /><datalist id="class-batches">{batches.map(batch => <option key={batch} value={batch} />)}</datalist></Field>
        <Field label="Level"><input className="input" list="class-levels" value={form.level} onChange={update('level')} /><datalist id="class-levels">{levels.map(level => <option key={level} value={level} />)}</datalist></Field>
        <div className="grid grid-cols-2 gap-2"><Field label="Start time"><input type="time" className="input" value={form.start} onChange={update('start')} /></Field><Field label="End time"><input type="time" className="input" value={form.end} onChange={update('end')} /></Field></div>
        <div className="grid grid-cols-2 gap-2"><Field label="Coach"><input className="input" value={form.coach} onChange={update('coach')} /></Field><Field label="Room / location"><input className="input" value={form.room} onChange={update('room')} /></Field></div>
        <div className="grid grid-cols-2 gap-2"><Field label="Capacity"><input type="number" min="0" className="input" value={form.capacity} onChange={update('capacity')} /></Field><Field label="Enrolled"><input type="number" min="0" className="input" value={form.enrolled} onChange={update('enrolled')} /></Field></div>
        <Field label="Notes"><textarea className="input" rows={2} value={form.notes} onChange={update('notes')} /></Field>
      </div>
      {timetableValidationError(form) && <p role="alert" className="mt-3 text-xs text-red-600">{timetableValidationError(form)}</p>}
      <button type="button" onClick={save} disabled={saving} className="primary-action mt-3 w-full">{saving && <span className="button-spinner" />}{saveLabel}</button>
    </dialog></div>}
  </Layout>;
}

function Meta({ Icon, children }: Readonly<{ Icon: typeof Clock3; children: React.ReactNode }>) { return <span className="flex min-w-0 items-center gap-1.5"><Icon size={14} className="flex-none text-gray-400" /><span className="truncate">{children}</span></span>; }
function Field({ label, children }: Readonly<{ label: string; children: React.ReactNode }>) { return <label className="block"><span className="field-label">{label}</span>{children}</label>; }
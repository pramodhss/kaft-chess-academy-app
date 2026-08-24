import { useEffect, useState } from 'react';
import { Bus, Clock3, MapPin, Phone, Plus, Trash2, UserRound, X } from 'lucide-react';
import { Layout } from '../components/Layout';
import { PageSkeleton } from '../components/Skeleton';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { appendRows, clearSheetRange, ensureSheet, readSheet, readSheetLive, writeRange } from '../lib/sheets';
import { phoneValidationError } from '../lib/validation';
import { recordAudit } from '../lib/audit';
import { SHEET_ID, TABS } from '../config';

const HEADERS = ['Van ID', 'Student Name', 'Tournament', 'Parent / Contact', 'Pickup Location', 'Pickup Time', 'Return Location', 'Return Time', 'Driver Name', 'Driver Phone', 'Transport Fee', 'Status', 'Notes'];
const EMPTY = { studentName: '', tournament: '', contact: '', pickupLocation: '', pickupTime: '', returnLocation: '', returnTime: '', driverName: '', driverPhone: '', fee: '', status: 'Assigned', notes: '' };
type AssignmentDraft = typeof EMPTY;
interface VanAssignment extends AssignmentDraft { vanId: string; rowIndex: number }

function rowToAssignment(row: string[], rowIndex: number): VanAssignment {
  return {
    vanId: row[0] ?? '', studentName: row[1] ?? '', tournament: row[2] ?? '', contact: row[3] ?? '',
    pickupLocation: row[4] ?? '', pickupTime: row[5] ?? '', returnLocation: row[6] ?? '', returnTime: row[7] ?? '',
    driverName: row[8] ?? '', driverPhone: row[9] ?? '', fee: row[10] ?? '', status: row[11] ?? '', notes: row[12] ?? '', rowIndex,
  };
}

function migrateLegacyRows(rows: string[][]): string[][] {
  return rows.slice(1).map(row => {
    const legacyBatch = row[2]?.trim();
    const legacyNote = legacyBatch ? `Previous batch: ${legacyBatch}` : '';
    return [
      row[0] ?? '', row[1] ?? '', 'Legacy transport assignment', row[3] ?? '', row[4] ?? '', row[5] ?? '',
      row[6] ?? '', row[7] ?? '', row[8] ?? '', row[9] ?? '', row[10] ?? '', row[11] ?? '',
      [row[12], legacyNote].filter(Boolean).join(' · '),
    ];
  });
}

function assignmentValidationError(form: AssignmentDraft): string {
  if (!form.studentName) return 'Select a student.';
  if (!form.tournament.trim()) return 'Select or enter a tournament.';
  if (!form.pickupLocation.trim()) return 'Enter a pickup location.';
  if (!form.driverName.trim()) return 'Enter the driver name.';
  return phoneValidationError(form.driverPhone, 'Driver phone');
}

export function Van() {
  const { token, logout } = useAuth();
  const toast = useToast();
  const [entries, setEntries] = useState<VanAssignment[]>([]);
  const [students, setStudents] = useState<{ name: string; contact: string }[]>([]);
  const [tournaments, setTournaments] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState<AssignmentDraft>({ ...EMPTY });
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<number | null>(null);

  const load = async () => {
    if (!token) return;
    setLoading(true); setError('');
    try {
      await ensureSheet(token, SHEET_ID, TABS.VAN, HEADERS);
      const [vanRows, studentRows, tournamentRows] = await Promise.all([
        readSheet(token, SHEET_ID, `'${TABS.VAN}'!A:M`),
        readSheet(token, SHEET_ID, `'${TABS.STUDENTS}'!A:L`),
        readSheet(token, SHEET_ID, `'${TABS.UPCOMING}'!A:E`).catch(() => []),
      ]);
      const assignmentRows = vanRows.length > 0 && vanRows[0][2] !== 'Tournament' ? migrateLegacyRows(vanRows) : vanRows.slice(1);
      if (vanRows.length > 0 && vanRows[0][2] !== 'Tournament') {
        await writeRange(token, SHEET_ID, `'${TABS.VAN}'!A1:M${assignmentRows.length + 1}`, [HEADERS, ...assignmentRows]);
      }
      setEntries(assignmentRows.map((row, index) => rowToAssignment(row, index + 2)).filter(entry => entry.studentName.trim()));
      setStudents(studentRows.slice(1).filter(row => row[0]?.trim()).map(row => ({ name: row[0], contact: row[11] || row[10] || '' })));
      setTournaments(tournamentRows.slice(1).map(row => row[0]).filter(Boolean));
    } catch (loadError: any) {
      if (loadError.message === 'TOKEN_EXPIRED') { logout(); return; }
      setError(loadError.message);
    } finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, [token]);

  const addAssignment = async () => {
    if (!token) return;
    const validationError = assignmentValidationError(form);
    if (validationError) { toast.error(validationError); return; }
    setSaving(true);
    try {
      const vanId = `VAN-${crypto.randomUUID().slice(0, 6).toUpperCase()}`;
      const rowIndex = await appendRows(token, SHEET_ID, `'${TABS.VAN}'!A:M`, [[
        vanId, form.studentName, form.tournament, form.contact, form.pickupLocation, form.pickupTime,
        form.returnLocation, form.returnTime, form.driverName, form.driverPhone, form.fee, form.status, form.notes,
      ]]);
      setEntries(current => [...current, { ...form, vanId, rowIndex }]);
      void recordAudit(token, 'CREATE', 'Tournament Transport', vanId, `${form.studentName} · ${form.tournament}`).catch(() => undefined);
      setForm({ ...EMPTY }); setShowAdd(false);
      toast.success(`${form.studentName} was assigned tournament transport.`);
    } catch (saveError: any) { toast.error(`Save failed: ${saveError.message}`); }
    finally { setSaving(false); }
  };

  const removeEntry = async (entry: VanAssignment) => {
    if (!token || !window.confirm(`Remove tournament transport for ${entry.studentName}?`)) return;
    setDeleting(entry.rowIndex);
    try {
      const currentRows = await readSheetLive(token, SHEET_ID, `'${TABS.VAN}'!A${entry.rowIndex}:M${entry.rowIndex}`);
      if (JSON.stringify(rowToAssignment(currentRows[0] ?? [], entry.rowIndex)) !== JSON.stringify(entry)) {
        toast.info('This assignment changed on another device. Reload before removing it.'); return;
      }
      await clearSheetRange(token, SHEET_ID, `'${TABS.VAN}'!A${entry.rowIndex}:M${entry.rowIndex}`);
      setEntries(current => current.filter(item => item.rowIndex !== entry.rowIndex));
      void recordAudit(token, 'DELETE', 'Tournament Transport', entry.vanId, entry.studentName).catch(() => undefined);
      toast.success(`${entry.studentName}'s tournament transport was removed.`);
    } catch (removeError: any) { toast.error(`Remove failed: ${removeError.message}`); }
    finally { setDeleting(null); }
  };

  const chooseStudent = (name: string) => {
    const student = students.find(item => item.name === name);
    setForm(current => ({ ...current, studentName: name, contact: student?.contact ?? current.contact }));
  };
  const update = (key: keyof AssignmentDraft) => (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setForm(current => ({ ...current, [key]: event.target.value }));
  const query = search.trim().toLowerCase();
  const filtered = entries.filter(entry => !query || [entry.studentName, entry.tournament, entry.vanId, entry.driverName].some(value => value.toLowerCase().includes(query)));
  const importedPhoneErrors = entries
    .map(entry => phoneValidationError(entry.driverPhone, 'Driver phone'))
    .filter((message): message is string => Boolean(message));

  if (loading) return <Layout title="Tournament Transport"><PageSkeleton /></Layout>;
  return <Layout title="Tournament Transport" action={<button type="button" onClick={() => setShowAdd(true)} className="header-action" aria-label="Add transport assignment"><Plus size={15} /> Add</button>}>
    <div className="page-stack">
      {error && <div role="alert" className="error-state"><p>{error}</p><button type="button" onClick={load}>Retry</button></div>}
      {importedPhoneErrors.length > 0 && <div role="alert" className="error-state"><p>{[...new Set(importedPhoneErrors)].join(' ')}</p></div>}
      <div className="surface-card flex items-center gap-3 p-3"><span className="icon-tile"><Bus size={18} /></span><div><h2 className="text-sm font-semibold text-gray-900">Tournament travel</h2><p className="text-xs text-gray-500">Assign students, pickup points and drivers.</p></div></div>
      <input className="input" value={search} onChange={event => setSearch(event.target.value)} placeholder="Search student, tournament or van" aria-label="Search transport assignments" />
      {filtered.length === 0 && <div className="empty-state"><Bus size={24} /><p>{entries.length === 0 ? 'No tournament transport assigned yet.' : 'No matching assignments.'}</p></div>}
      <div className="space-y-2">{filtered.map(entry => <article key={entry.rowIndex} className="surface-card p-3">
        <div className="flex items-start gap-3"><span className="icon-tile"><Bus size={18} /></span><div className="min-w-0 flex-1"><div className="flex items-start justify-between gap-2"><div><h2 className="text-sm font-semibold text-gray-900">{entry.studentName}</h2><p className="text-xs font-medium text-chess-blue">{entry.tournament || 'Tournament not set'}</p></div><span className={entry.status === 'Confirmed' ? 'badge-green' : 'badge-blue'}>{entry.status || 'Assigned'}</span></div>
          <div className="mt-2 grid gap-1.5 text-xs text-gray-600 sm:grid-cols-2">
            <Info Icon={MapPin}>{entry.pickupLocation}{entry.pickupTime ? ` · ${entry.pickupTime}` : ''}</Info>
            {entry.returnLocation && <Info Icon={Clock3}>{entry.returnLocation}{entry.returnTime ? ` · ${entry.returnTime}` : ''}</Info>}
            <Info Icon={UserRound}>{entry.driverName}</Info>
            {entry.driverPhone && <Info Icon={Phone}><a href={`tel:${entry.driverPhone}`}>{entry.driverPhone}</a></Info>}
          </div>
        </div><button type="button" onClick={() => removeEntry(entry)} disabled={deleting === entry.rowIndex} className="icon-button-danger ml-auto mt-2" aria-label={`Remove transport for ${entry.studentName}`}><Trash2 size={16} /></button></div>
      </article>)}</div>
    </div>
    {showAdd && <div className="modal-backdrop items-end justify-center sm:items-center"><dialog open aria-labelledby="transport-modal-title" className="modal-panel max-h-[92vh] max-w-lg overflow-y-auto p-4">
      <div className="mb-3 flex items-center justify-between"><h2 id="transport-modal-title" className="text-base font-semibold text-navy">Assign tournament transport</h2><button type="button" onClick={() => setShowAdd(false)} className="icon-button" aria-label="Close"><X size={18} /></button></div>
      <div className="form-grid">
        <Field label="Student"><select className="input" value={form.studentName} onChange={event => chooseStudent(event.target.value)}><option value="">Select student</option>{students.map(student => <option key={student.name}>{student.name}</option>)}</select></Field>
        <Field label="Tournament"><input className="input" list="tournament-list" value={form.tournament} onChange={update('tournament')} placeholder="Select or type tournament" /><datalist id="tournament-list">{tournaments.map(name => <option key={name} value={name} />)}</datalist></Field>
        <Field label="Parent / contact"><input className="input" value={form.contact} onChange={update('contact')} inputMode="tel" /></Field>
        <Field label="Pickup location"><input className="input" value={form.pickupLocation} onChange={update('pickupLocation')} /></Field>
        <div className="grid grid-cols-2 gap-2"><Field label="Pickup time"><input type="time" className="input" value={form.pickupTime} onChange={update('pickupTime')} /></Field><Field label="Return time"><input type="time" className="input" value={form.returnTime} onChange={update('returnTime')} /></Field></div>
        <Field label="Return location"><input className="input" value={form.returnLocation} onChange={update('returnLocation')} /></Field>
        <div className="grid grid-cols-2 gap-2"><Field label="Driver"><input className="input" value={form.driverName} onChange={update('driverName')} /></Field><Field label="Driver phone"><input className="input" value={form.driverPhone} onChange={update('driverPhone')} inputMode="tel" /></Field></div>
        <div className="grid grid-cols-2 gap-2"><Field label="Transport fee"><input type="number" min="0" className="input" value={form.fee} onChange={update('fee')} /></Field><Field label="Status"><select className="input" value={form.status} onChange={update('status')}><option>Assigned</option><option>Confirmed</option><option>Completed</option></select></Field></div>
        <Field label="Notes"><textarea className="input" rows={2} value={form.notes} onChange={update('notes')} /></Field>
      </div>
      {assignmentValidationError(form) && <p role="alert" className="mt-3 text-xs text-red-600">{assignmentValidationError(form)}</p>}
      <button type="button" onClick={addAssignment} disabled={saving} className="primary-action mt-3 w-full">{saving ? 'Assigning…' : 'Assign transport'}</button>
    </dialog></div>}
  </Layout>;
}

function Info({ Icon, children }: Readonly<{ Icon: typeof MapPin; children: React.ReactNode }>) { return <span className="flex min-w-0 items-center gap-1.5"><Icon size={14} className="flex-none text-gray-400" /><span className="truncate">{children}</span></span>; }
function Field({ label, children }: Readonly<{ label: string; children: React.ReactNode }>) { return <label className="block"><span className="field-label">{label}</span>{children}</label>; }

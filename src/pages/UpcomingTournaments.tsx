import { useEffect, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Layout } from '../components/Layout';
import { PageSkeleton } from '../components/Skeleton';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { readSheet, appendRows, clearSheetRange, ensureSheet } from '../lib/sheets';
import { SHEET_ID, TABS } from '../config';
import { useCoachName } from '../hooks/useCoachName';

const HEADERS = ['Tournament Name','Type','Date','Reg Deadline','Venue','Entry Fee','Eligibility','Link','Notes','Status','Added By','Added On'];
const TYPES = ['Internal','Zonal','District','State','National','Online','Rapid','Blitz','Classical'];
const STATUS_OPTS = ['Open','Upcoming','Full','Closed'];
const ELIGIBILITY = ['All Levels','Beginner','Intermediate','Advanced','Competitive'];
const STATUS_COLOR: Record<string,string> = { Open:'badge-green', Upcoming:'badge-blue', Full:'badge-amber', Closed:'badge-gray' };
const EMPTY = { name:'', type:'Internal', date:'', deadline:'', venue:'', fee:'', eligibility:'All Levels', link:'', notes:'', status:'Upcoming' };

function isWebUrl(value: string): boolean {
  try { return ['http:', 'https:'].includes(new URL(value).protocol); } catch { return false; }
}

interface UTEntry { name:string; type:string; date:string; deadline:string; venue:string; fee:string; eligibility:string; link:string; notes:string; status:string; addedBy:string; addedOn:string; rowIndex:number }

function rowToEntry(row: string[], rowIndex: number): UTEntry {
  return {
    name:row[0]??'', type:row[1]??'', date:row[2]??'', deadline:row[3]??'', venue:row[4]??'',
    fee:row[5]??'', eligibility:row[6]??'', link:row[7]??'', notes:row[8]??'',
    status:row[9]??'', addedBy:row[10]??'', addedOn:row[11]??'', rowIndex,
  };
}

export function UpcomingTournaments() {
  const { token, logout } = useAuth();
  const { coachName: savedCoachName } = useCoachName();
  const toast = useToast();
  const [entries, setEntries] = useState<UTEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ ...EMPTY });
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<number | null>(null);
  const coachName = savedCoachName || 'Coach';

  const load = async () => {
    if (!token) return;
    setLoading(true); setError('');
    try {
      await ensureSheet(token, SHEET_ID, TABS.UPCOMING, HEADERS);
      const rows = await readSheet(token, SHEET_ID, `'${TABS.UPCOMING}'!A:L`);
      setEntries(rows.slice(1).map((row, index) => rowToEntry(row, index + 2)).filter(entry => entry.name.trim()));
    } catch(e:any) { if(e.message==='TOKEN_EXPIRED'){logout();return;} setError(e.message); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [token]);

  const handleAdd = async () => {
    if (!token || !form.name.trim()) return;
    if (form.link.trim() && !isWebUrl(form.link.trim())) { toast.error('Enter a valid http:// or https:// registration URL.'); return; }
    setSaving(true);
    try {
      const rowIndex = await appendRows(token, SHEET_ID, `'${TABS.UPCOMING}'!A:L`, [[
        form.name, form.type, form.date, form.deadline, form.venue, form.fee,
        form.eligibility, form.link, form.notes, form.status,
        coachName, new Date().toLocaleDateString('en-IN'),
      ]]);
      const addedOn = new Date().toLocaleDateString('en-IN');
      setEntries(prev => [...prev, { ...form, addedBy: coachName, addedOn, rowIndex }]);
      setShowAdd(false);
      setForm({ ...EMPTY });
      toast.success(`${form.name} was posted successfully.`);
    } catch(e:any) { toast.error('Save failed: ' + e.message); }
    finally { setSaving(false); }
  };

  const removeEntry = async (entry: UTEntry) => {
    if (!token || !window.confirm(`Remove the upcoming tournament ${entry.name}? This cannot be undone.`)) return;
    setDeleting(entry.rowIndex);
    try {
      const currentRows = await readSheet(token, SHEET_ID, `'${TABS.UPCOMING}'!A${entry.rowIndex}:L${entry.rowIndex}`);
      const currentEntry = rowToEntry(currentRows[0] ?? [], entry.rowIndex);
      if (JSON.stringify(currentEntry) !== JSON.stringify(entry)) {
        toast.info('This tournament was changed on another device. Reload before removing it.');
        return;
      }
      await clearSheetRange(token, SHEET_ID, `'${TABS.UPCOMING}'!A${entry.rowIndex}:L${entry.rowIndex}`);
      setEntries(prev => prev.filter(item => item.rowIndex !== entry.rowIndex));
      toast.success(`${entry.name} was removed.`);
    } catch (e: any) { toast.error('Remove failed: ' + e.message); }
    finally { setDeleting(null); }
  };

  const u = (k: keyof typeof EMPTY) => (e: React.ChangeEvent<HTMLInputElement|HTMLSelectElement|HTMLTextAreaElement>) => setForm({...form,[k]:e.target.value});

  if (loading) return <Layout title="Upcoming Tournaments" showBack><PageSkeleton /></Layout>;

  return (
    <Layout title="Upcoming Tournaments" showBack action={
      <button type="button" onClick={() => setShowAdd(true)} aria-label="+ Add" className="header-action"><Plus size={15} aria-hidden="true" /> Add</button>
    }>
      <div className="p-4 space-y-3">
        {error && <p className="text-red-600 text-sm bg-red-50 p-3 rounded-xl">{error}</p>}
        {entries.length === 0 && <div className="text-center py-12 text-gray-400"><p className="text-4xl mb-2">📋</p><p>No upcoming tournaments yet. Tap + Add to post one.</p></div>}
        {entries.map(e => (
          <div key={e.rowIndex} className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <p className="font-semibold text-gray-900">{e.name}</p>
                <p className="text-xs text-gray-500">{e.type} · {e.eligibility}</p>
              </div>
              <span className={STATUS_COLOR[e.status] ?? 'badge-gray'}>{e.status}</span>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-1 text-xs text-gray-600">
              {e.date && <span>📅 {e.date}</span>}
              {e.deadline && <span>⏰ Reg by: {e.deadline}</span>}
              {e.venue && <span>📍 {e.venue}</span>}
              {e.fee && <span>💰 ₹{e.fee}</span>}
            </div>
            {e.notes && <p className="text-xs text-gray-500 mt-1">{e.notes}</p>}
            {e.link && (
              <a href={e.link} target="_blank" rel="noopener noreferrer"
                className="mt-2 inline-flex items-center gap-1 text-xs text-chess-blue font-medium">
                🔗 Register / More Info
              </a>
            )}
            <div className="mt-2 flex items-center justify-between gap-2">
              <p className="text-xs text-gray-300">Added by {e.addedBy} on {e.addedOn}</p>
              <button type="button" onClick={() => removeEntry(e)} disabled={deleting === e.rowIndex}
                aria-label={`Remove ${e.name}`} title="Remove tournament"
                className="p-2 rounded-lg bg-red-50 text-red-700 disabled:opacity-50">
                <Trash2 size={17} aria-hidden="true" />
              </button>
            </div>
          </div>
        ))}
      </div>
      {showAdd && (
        <div className="modal-backdrop items-end justify-center sm:items-center" onClick={() => setShowAdd(false)}>
          <div className="modal-panel max-h-[92vh] max-w-lg overflow-y-auto p-4" onClick={e=>e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold text-lg text-navy">Add Tournament</h2>
              <button onClick={() => setShowAdd(false)} className="text-gray-400 text-2xl">×</button>
            </div>
            <div className="space-y-3">
              <F label="Tournament Name *"><input value={form.name} onChange={u('name')} className="input" /></F>
              <div className="grid grid-cols-2 gap-2">
                <F label="Type"><select value={form.type} onChange={u('type')} className="input">{TYPES.map(o=><option key={o}>{o}</option>)}</select></F>
                <F label="Status"><select value={form.status} onChange={u('status')} className="input">{STATUS_OPTS.map(o=><option key={o}>{o}</option>)}</select></F>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <F label="Tournament Date"><input type="date" value={form.date} onChange={u('date')} className="input" /></F>
                <F label="Reg Deadline"><input type="date" value={form.deadline} onChange={u('deadline')} className="input" /></F>
              </div>
              <F label="Venue / Platform"><input value={form.venue} onChange={u('venue')} className="input" /></F>
              <div className="grid grid-cols-2 gap-2">
                <F label="Entry Fee (₹)"><input type="number" value={form.fee} onChange={u('fee')} className="input" /></F>
                <F label="Eligibility"><select value={form.eligibility} onChange={u('eligibility')} className="input">{ELIGIBILITY.map(o=><option key={o}>{o}</option>)}</select></F>
              </div>
              <F label="Registration Link / URL"><input value={form.link} onChange={u('link')} className="input" placeholder="https://…" /></F>
              <F label="Notes"><textarea value={form.notes} onChange={u('notes')} className="input" rows={2}/></F>
              <p className="text-xs text-gray-400">Will be added by: <strong>{coachName}</strong></p>
            </div>
            <button onClick={handleAdd} disabled={saving||!form.name.trim()} className="w-full bg-navy text-white py-3 rounded-xl font-semibold mt-4 disabled:opacity-50">
              <span className="inline-flex items-center justify-center gap-2">
                {saving && <span className="button-spinner" aria-hidden="true"/>}
                {saving ? 'Posting tournament…' : 'Post Tournament'}
              </span>
            </button>
          </div>
        </div>
      )}
    </Layout>
  );
}
function F({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label className="text-xs font-medium text-gray-500 mb-1 block">{label}</label>{children}</div>;
}

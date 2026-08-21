import { useEffect, useState } from 'react';
import { Layout } from '../components/Layout';
import { Spinner } from '../components/Spinner';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { EmptyState, ErrorState } from '../components/EmptyState';
import { readSheet, appendRows, ensureSheet } from '../lib/sheets';
import { SHEET_ID, TABS } from '../config';

const HEADERS = ['Tournament Name','Type','Date','Reg Deadline','Venue','Entry Fee','Eligibility','Link','Notes','Status','Added By','Added On'];
const TYPES = ['Internal','Zonal','District','State','National','Online','Rapid','Blitz','Classical'];
const STATUS_OPTS = ['Open','Upcoming','Full','Closed'];
const ELIGIBILITY = ['All Levels','Beginner','Intermediate','Advanced','Competitive'];
const STATUS_COLOR: Record<string,string> = { Open:'badge-green', Upcoming:'badge-blue', Full:'badge-amber', Closed:'badge-gray' };
const EMPTY = { name:'', type:'Internal', date:'', deadline:'', venue:'', fee:'', eligibility:'All Levels', link:'', notes:'', status:'Upcoming' };

interface UTEntry { name:string; type:string; date:string; deadline:string; venue:string; fee:string; eligibility:string; link:string; notes:string; status:string; addedBy:string; addedOn:string; rowIndex:number }

export function UpcomingTournaments() {
  const { token, logout } = useAuth();
  const toast = useToast();
  const [entries, setEntries] = useState<UTEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ ...EMPTY });
  const [saving, setSaving] = useState(false);
  const coachName = localStorage.getItem('chess_coach_name') ?? 'Coach';

  const load = async () => {
    if (!token) return;
    setLoading(true); setError('');
    try {
      await ensureSheet(token, SHEET_ID, TABS.UPCOMING, HEADERS);
      const rows = await readSheet(token, SHEET_ID, `'${TABS.UPCOMING}'!A:L`);
      setEntries(rows.slice(1).filter(r => r[0]?.trim()).map((r,i) => ({
        name:r[0]??'', type:r[1]??'', date:r[2]??'', deadline:r[3]??'', venue:r[4]??'',
        fee:r[5]??'', eligibility:r[6]??'', link:r[7]??'', notes:r[8]??'',
        status:r[9]??'', addedBy:r[10]??'', addedOn:r[11]??'', rowIndex:i+2,
      })));
    } catch(e:any) { if(e.message==='TOKEN_EXPIRED'){logout();return;} setError(e.message); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [token]);

  const handleAdd = async () => {
    if (!token || !form.name.trim()) return;
    setSaving(true);
    try {
      await appendRows(token, SHEET_ID, `'${TABS.UPCOMING}'!A:L`, [[
        form.name, form.type, form.date, form.deadline, form.venue, form.fee,
        form.eligibility, form.link, form.notes, form.status,
        coachName, new Date().toLocaleDateString('en-IN'),
      ]]);
      setShowAdd(false); setForm({ ...EMPTY }); await load(); toast.success('Tournament posted!');
    } catch(e:any) { toast.error('Save failed: ' + e.message); }
    finally { setSaving(false); }
  };

  const u = (k: keyof typeof EMPTY) => (e: React.ChangeEvent<HTMLInputElement|HTMLSelectElement|HTMLTextAreaElement>) => setForm({...form,[k]:e.target.value});

  if (loading) return <Layout title="Upcoming Tournaments" showBack><Spinner /></Layout>;

  return (
    <Layout title="Upcoming Tournaments" showBack action={
      <button onClick={() => setShowAdd(true)} className="bg-white text-navy text-sm font-bold px-3 py-1 rounded-full">+ Add</button>
    }>
      <div className="p-4 space-y-3">
        {error && <p className="text-red-600 text-sm bg-red-50 p-3 rounded-xl">{error}</p>}
        {entries.length === 0 && <div className="text-center py-12 text-gray-400"><p className="text-4xl mb-2">📋</p><p>No upcoming tournaments yet. Tap + Add to post one.</p></div>}
        {entries.map((e,i) => (
          <div key={i} className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
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
            <p className="text-xs text-gray-300 mt-2">Added by {e.addedBy} on {e.addedOn}</p>
          </div>
        ))}
      </div>
      {showAdd && (
        <div className="fixed inset-0 bg-black/50 flex items-end z-50" onClick={() => setShowAdd(false)}>
          <div className="bg-white w-full rounded-t-2xl p-5 max-h-[90vh] overflow-y-auto" onClick={e=>e.stopPropagation()}>
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
              {saving ? 'Saving…' : '💾 Add Tournament'}
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

import { useEffect, useState } from 'react';
import { Layout } from '../components/Layout';
import { Spinner } from '../components/Spinner';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { EmptyState, ErrorState } from '../components/EmptyState';
import { readSheet, appendRows } from '../lib/sheets';
import { SHEET_ID, TABS } from '../config';
import type { TournamentEntry } from '../types';

const TYPES   = ['Internal','Zonal','District','State','National','Online','Rapid','Blitz','Classical'];
const MEDALS  = ['Gold','Silver','Bronze','Participation','Best Game','None'];
const EMPTY_F = { studentName:'', month:'', tournamentName:'', type:'Internal', date:'', venue:'', rounds:'', wins:'', draws:'', losses:'', position:'', ratingBefore:'', ratingAfter:'', medal:'None', prize:'', coachNotes:'' };

const MEDAL_ICON: Record<string, string> = { Gold:'🥇', Silver:'🥈', Bronze:'🥉', Participation:'🎖', 'Best Game':'⭐', None:'' };

function rowToEntry(row: string[], idx: number): TournamentEntry {
  return {
    month: row[0]??'', studentName: row[1]??'', batch: row[2]??'', level: row[3]??'',
    tournamentName: row[4]??'', type: row[5]??'', date: row[6]??'', venue: row[7]??'',
    roundsPlayed: row[8]??'', wins: row[9]??'', draws: row[10]??'', losses: row[11]??'',
    position: row[12]??'', ratingBefore: row[13]??'', ratingAfter: row[14]??'', ratingChange: row[15]??'',
    medal: row[16]??'', prizeAmount: row[17]??'', certificate: row[18]??'',
    coachNotes: row[19]??'', parentNotified: row[20]??'', rowIndex: idx + 2,
  };
}

export function Tournaments() {
  const { token, logout } = useAuth();
  const toast = useToast();
  const [entries, setEntries] = useState<TournamentEntry[]>([]);
  const [students, setStudents] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ ...EMPTY_F });
  const [saving, setSaving] = useState(false);

  const load = async () => {
    if (!token) return;
    setLoading(true); setError('');
    try {
      const [tRows, sRows] = await Promise.all([
        readSheet(token, SHEET_ID, `'${TABS.TOURNAMENTS}'!A:U`),
        readSheet(token, SHEET_ID, `'${TABS.STUDENTS}'!A:A`),
      ]);
      setEntries(tRows.slice(1).map(rowToEntry).filter(entry => entry.studentName.trim()));
      setStudents(sRows.slice(1).map(r => r[0]).filter(Boolean));
    } catch (e: any) {
      if (e.message === 'TOKEN_EXPIRED') { logout(); return; }
      setError(e.message);
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [token]);

  const upd = (k: keyof typeof EMPTY_F) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm({ ...form, [k]: e.target.value });

  const handleAdd = async () => {
    if (!token || !form.studentName || !form.tournamentName) return;
    setSaving(true);
    try {
      const ratingChange = form.ratingBefore && form.ratingAfter
        ? String(parseFloat(form.ratingAfter) - parseFloat(form.ratingBefore)) : '';
      const rowIndex = await appendRows(token, SHEET_ID, `'${TABS.TOURNAMENTS}'!A:V`, [[
        form.month, form.studentName, '', '', form.tournamentName, form.type,
        form.date, form.venue, form.rounds, form.wins, form.draws, form.losses,
        form.position, form.ratingBefore, form.ratingAfter, ratingChange,
        form.medal, form.prize, '', form.coachNotes, '',
      ]]);
      setEntries(prev => [...prev, {
        month: form.month, studentName: form.studentName, batch: '', level: '',
        tournamentName: form.tournamentName, type: form.type, date: form.date, venue: form.venue,
        roundsPlayed: form.rounds, wins: form.wins, draws: form.draws, losses: form.losses,
        position: form.position, ratingBefore: form.ratingBefore, ratingAfter: form.ratingAfter,
        ratingChange, medal: form.medal, prizeAmount: form.prize, certificate: '',
        coachNotes: form.coachNotes, parentNotified: '', rowIndex,
      }]);
      setShowAdd(false);
      setForm({ ...EMPTY_F });
      toast.success(`${form.studentName}'s tournament result was saved.`);
    } catch (e: any) { toast.error('Save failed: ' + e.message); }
    finally { setSaving(false); }
  };

  if (loading) return <Layout title="Tournaments" showBack><Spinner /></Layout>;

  return (
    <Layout title="Tournaments" showBack action={
      <button onClick={() => setShowAdd(true)} className="bg-white text-navy text-sm font-bold px-3 py-1 rounded-full">+ Add</button>
    }>
      <div className="p-4 space-y-3">
        {error && <p className="text-red-600 text-sm">{error}</p>}

        {entries.length === 0 && (
          <div className="text-center py-12 text-gray-400">
            <p className="text-4xl mb-2">🏆</p>
            <p>No tournament results yet.</p>
          </div>
        )}

        {entries.map((e, i) => (
          <div key={i} className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <p className="font-semibold text-gray-900">{e.studentName}</p>
                <p className="text-sm text-navy font-medium">{e.tournamentName}</p>
                <p className="text-xs text-gray-400 mt-0.5">{e.type} · {e.date}</p>
              </div>
              {MEDAL_ICON[e.medal] && <span className="text-3xl ml-2">{MEDAL_ICON[e.medal]}</span>}
            </div>
            <div className="flex gap-3 mt-2 text-xs text-gray-500">
              {e.position && <span>📍 Rank: <strong>{e.position}</strong></span>}
              {(e.wins || e.draws || e.losses) && (
                <span>W{e.wins}/D{e.draws}/L{e.losses}</span>
              )}
              {e.ratingChange && (
                <span className={parseFloat(e.ratingChange) >= 0 ? 'text-green-600' : 'text-red-600'}>
                  Rating: {parseFloat(e.ratingChange) >= 0 ? '+' : ''}{e.ratingChange}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>

      {showAdd && (
        <div className="fixed inset-0 bg-black/50 flex items-end z-50" onClick={() => setShowAdd(false)}>
          <div className="bg-white w-full rounded-t-2xl p-5 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold text-lg text-navy">Add Tournament Result</h2>
              <button onClick={() => setShowAdd(false)} className="text-gray-400 text-2xl leading-none">×</button>
            </div>
            <div className="space-y-3">
              <Field label="Student *">
                <select value={form.studentName} onChange={upd('studentName')} className="input">
                  <option value="">Select student…</option>
                  {students.map(s => <option key={s}>{s}</option>)}
                </select>
              </Field>
              <Field label="Tournament Name *"><input value={form.tournamentName} onChange={upd('tournamentName')} className="input" /></Field>
              <Field label="Type">
                <select value={form.type} onChange={upd('type')} className="input">
                  {TYPES.map(o => <option key={o}>{o}</option>)}
                </select>
              </Field>
              <Field label="Date"><input type="date" value={form.date} onChange={upd('date')} className="input" /></Field>
              <Field label="Venue / Platform"><input value={form.venue} onChange={upd('venue')} className="input" /></Field>
              <div className="grid grid-cols-3 gap-2">
                <Field label="Wins"><input type="number" value={form.wins} onChange={upd('wins')} className="input" /></Field>
                <Field label="Draws"><input type="number" value={form.draws} onChange={upd('draws')} className="input" /></Field>
                <Field label="Losses"><input type="number" value={form.losses} onChange={upd('losses')} className="input" /></Field>
              </div>
              <Field label="Final Position / Rank"><input value={form.position} onChange={upd('position')} className="input" /></Field>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Rating Before"><input type="number" value={form.ratingBefore} onChange={upd('ratingBefore')} className="input" /></Field>
                <Field label="Rating After"><input type="number" value={form.ratingAfter} onChange={upd('ratingAfter')} className="input" /></Field>
              </div>
              <Field label="Medal / Award">
                <select value={form.medal} onChange={upd('medal')} className="input">
                  {MEDALS.map(o => <option key={o}>{o}</option>)}
                </select>
              </Field>
              <Field label="Coach Notes"><textarea value={form.coachNotes} onChange={upd('coachNotes')} className="input" rows={2} /></Field>
            </div>
            <button onClick={handleAdd} disabled={saving || !form.studentName || !form.tournamentName}
              className="w-full bg-navy text-white py-3 rounded-xl font-semibold mt-4 disabled:opacity-60 flex items-center justify-center gap-2">
              {saving && <span className="button-spinner" aria-hidden="true"/>}
              {saving ? 'Saving result…' : 'Save Result'}
            </button>
          </div>
        </div>
      )}
    </Layout>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label className="text-xs font-medium text-gray-500 mb-1 block">{label}</label>{children}</div>;
}

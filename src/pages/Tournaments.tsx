import { useEffect, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Layout } from '../components/Layout';
import { CopyButton } from '../components/CopyButton';
import { PageSkeleton } from '../components/Skeleton';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { readSheet, readSheetLive, appendRows, clearSheetRange } from '../lib/sheets';
import { matchOnlineTournamentResults, ordinal, type MatchedOnlineResult, type OnlinePlayerDirectory } from '../lib/onlineTournamentMatch';
import { monthLabel, rowToRegistration, type TournamentRegistration } from '../lib/tournamentManagement';
import { rowToSavedWeeklyOnlineTournament, type SavedWeeklyOnlineTournament } from '../lib/weeklyOnlineTournament';
import { SHEET_ID, TABS } from '../config';
import type { TournamentEntry } from '../types';

const TYPES   = ['Internal','Zonal','District','State','National','Online','Rapid','Blitz','Classical'];
const MEDALS  = ['Gold','Silver','Bronze','Participation','Best Game','None'];
const EMPTY_F = { studentName:'', month:'', tournamentName:'', type:'Internal', date:'', venue:'', rounds:'', wins:'', draws:'', losses:'', position:'', ratingBefore:'', ratingAfter:'', medal:'None', prize:'', coachNotes:'' };

const MEDAL_ICON: Record<string, string> = { Gold:'🥇', Silver:'🥈', Bronze:'🥉', Participation:'🎖', 'Best Game':'⭐', None:'' };

interface ResultItem { key: string; sortKey: string; copyText: string; entry: TournamentEntry | null; node: React.ReactNode }

function entryCopyText(entry: TournamentEntry): string {
  const lines = [`*${entry.studentName} \u2013 ${entry.tournamentName}*`, `${entry.type} \u00b7 ${entry.date || 'Date not recorded'}`];
  if (entry.position) lines.push(`Rank: ${entry.position}`);
  if (entry.wins || entry.draws || entry.losses) lines.push(`W${entry.wins || 0}/D${entry.draws || 0}/L${entry.losses || 0}`);
  if (entry.ratingChange) lines.push(`Rating change: ${Number.parseFloat(entry.ratingChange) >= 0 ? '+' : ''}${entry.ratingChange}`);
  if (entry.medal && entry.medal !== 'None') lines.push(`Medal: ${entry.medal}`);
  return lines.join('\n');
}

function groupCopyText(title: string, items: ResultItem[]): string {
  if (items.length === 0) return '';
  return [`*${title}*`, ...items.map(item => `\u2022 ${item.copyText.split('\n')[0].replace(/^\*|\*$/g, '')}`)].join('\n');
}

function manualResultItem(entry: TournamentEntry, deleting: number | null, removeEntry: (entry: TournamentEntry) => void): ResultItem {
  return {
    key: `manual-${entry.rowIndex}`,
    sortKey: entry.date || entry.month,
    copyText: entryCopyText(entry),
    entry,
    node: (
      <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <p className="font-semibold text-gray-900">{entry.studentName}</p>
            <p className="text-sm text-navy font-medium">{entry.tournamentName}</p>
            <p className="text-xs text-gray-400 mt-0.5">{entry.type} · {entry.date}</p>
          </div>
          {MEDAL_ICON[entry.medal] && <span className="text-3xl ml-2">{MEDAL_ICON[entry.medal]}</span>}
        </div>
        <div className="flex gap-3 mt-2 text-xs text-gray-500">
          {entry.position && <span>📍 Rank: <strong>{entry.position}</strong></span>}
          {(entry.wins || entry.draws || entry.losses) && <span>W{entry.wins}/D{entry.draws}/L{entry.losses}</span>}
          {entry.ratingChange && (
            <span className={Number.parseFloat(entry.ratingChange) >= 0 ? 'text-green-600' : 'text-red-600'}>
              Rating: {Number.parseFloat(entry.ratingChange) >= 0 ? '+' : ''}{entry.ratingChange}
            </span>
          )}
        </div>
        <div className="mt-3 flex justify-end gap-1.5">
          <CopyButton text={entryCopyText(entry)} label={`Copy ${entry.tournamentName} result`} />
          <button type="button" onClick={() => removeEntry(entry)} disabled={deleting === entry.rowIndex}
            aria-label={`Remove ${entry.tournamentName} result`} title="Remove tournament result"
            className="icon-button-danger">
            <Trash2 size={15} aria-hidden="true" />
          </button>
        </div>
      </div>
    ),
  };
}

function autoOfflineItem(registration: TournamentRegistration): ResultItem {
  const dateLabel = registration.tournamentDate || monthLabel(registration.month);
  const copyText = `• [Offline · Auto-tracked] ${registration.studentName} – ${registration.tournamentName} (${dateLabel})`;
  return {
    key: `auto-offline-${registration.rowIndex}`,
    sortKey: registration.tournamentDate || registration.month,
    copyText,
    entry: null,
    node: (
      <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-1.5"><span className="badge-gray">Auto-tracked</span><p className="font-semibold text-gray-900">{registration.studentName}</p></div>
            <p className="text-sm text-navy font-medium">{registration.tournamentName}</p>
            <p className="text-xs text-gray-400 mt-0.5">Tournament event · {dateLabel}</p>
          </div>
        </div>
        <p className="mt-2 text-xs text-gray-500">Fee {registration.feePaid ? 'paid' : 'pending'}</p>
        <div className="mt-3 flex justify-end"><CopyButton text={copyText} label={`Copy ${registration.studentName}'s result`} /></div>
      </div>
    ),
  };
}

function autoOnlineItem(match: MatchedOnlineResult): ResultItem {
  const tournament = match.tournament;
  const dateValue = tournament.completedAt || tournament.startedAt;
  const dateLabel = dateValue && !Number.isNaN(new Date(dateValue).getTime())
    ? new Date(dateValue).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
    : 'Date not recorded';
  const sourceLabel = match.source === 'chess.com' ? 'Chess.com' : 'Lichess';
  const pointsSuffix = match.score ? ` · ${match.score} pts` : '';
  const copyText = `• [Online · ${sourceLabel} · Auto-tracked] ${match.studentName} – ${tournament.name} (${dateLabel}) · Place ${ordinal(match.rank)}${pointsSuffix}`;
  return {
    key: `auto-online-${tournament.rowIndex}-${match.studentName}`,
    sortKey: dateValue,
    copyText,
    entry: null,
    node: (
      <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-1.5"><span className="badge-gray">Auto-tracked</span><p className="font-semibold text-gray-900">{match.studentName}</p></div>
            <p className="text-sm text-navy font-medium">{tournament.name}</p>
            <p className="text-xs text-gray-400 mt-0.5">{sourceLabel} · {dateLabel}</p>
          </div>
        </div>
        <p className="mt-2 text-xs text-gray-500">Place {ordinal(match.rank)}{pointsSuffix}</p>
        <div className="mt-3 flex justify-end"><CopyButton text={copyText} label={`Copy ${match.studentName}'s result`} /></div>
      </div>
    ),
  };
}


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
  const [onlinePlayers, setOnlinePlayers] = useState<OnlinePlayerDirectory[]>([]);
  const [registrations, setRegistrations] = useState<TournamentRegistration[]>([]);
  const [weeklyResults, setWeeklyResults] = useState<SavedWeeklyOnlineTournament[]>([]);
  const [studentDetails, setStudentDetails] = useState<Map<string, { batch: string; level: string }>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ ...EMPTY_F });
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<number | null>(null);

  const load = async () => {
    if (!token) return;
    setLoading(true); setError('');
    try {
      const [tRows, sRows, registrationRows, weeklyRows] = await Promise.all([
        readSheet(token, SHEET_ID, `'${TABS.TOURNAMENTS}'!A:U`),
        readSheet(token, SHEET_ID, `'${TABS.STUDENTS}'!A:AG`),
        readSheet(token, SHEET_ID, `'${TABS.TOURNAMENT_REGISTRATIONS}'!A:J`).catch(() => []),
        readSheet(token, SHEET_ID, `'${TABS.WEEKLY_ONLINE_TOURNAMENTS}'!A:N`).catch(() => []),
      ]);
      setEntries(tRows.slice(1).map((row, index) => rowToEntry(row, index)).filter(entry => entry.studentName.trim()));
      setStudents(sRows.slice(1).map(r => r[0]).filter(Boolean));
      setStudentDetails(new Map(sRows.slice(1).filter(row => row[0]).map(row => [
        row[0], { batch: row[5] ?? '', level: row[6] ?? '' },
      ])));
      setOnlinePlayers(sRows.slice(1).filter(row => row[0]).map(row => ({
        name: row[0], chessComUsername: row[30] ?? '', lichessUsername: row[31] ?? '',
      })));
      setRegistrations(registrationRows.slice(1).map((row, index) => rowToRegistration(row, index + 2)).filter(item => item.playing));
      setWeeklyResults(weeklyRows.slice(1).map((row, index) => rowToSavedWeeklyOnlineTournament(row, index + 2)).filter(item => item.name));
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
        ? String(Number.parseFloat(form.ratingAfter) - Number.parseFloat(form.ratingBefore)) : '';
      const details = studentDetails.get(form.studentName) ?? { batch: '', level: '' };
      const rowIndex = await appendRows(token, SHEET_ID, `'${TABS.TOURNAMENTS}'!A:V`, [[
        form.month, form.studentName, details.batch, details.level, form.tournamentName, form.type,
        form.date, form.venue, form.rounds, form.wins, form.draws, form.losses,
        form.position, form.ratingBefore, form.ratingAfter, ratingChange,
        form.medal, form.prize, '', form.coachNotes, '',
      ]]);
      setEntries(prev => [...prev, {
        month: form.month, studentName: form.studentName, batch: details.batch, level: details.level,
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

  const removeEntry = async (entry: TournamentEntry) => {
    if (!token || !window.confirm(`Remove ${entry.studentName}'s result for ${entry.tournamentName}? This cannot be undone.`)) return;
    setDeleting(entry.rowIndex);
    try {
      const currentRows = await readSheetLive(token, SHEET_ID, `'${TABS.TOURNAMENTS}'!A${entry.rowIndex}:V${entry.rowIndex}`);
      const currentEntry = rowToEntry(currentRows[0] ?? [], entry.rowIndex - 2);
      if (JSON.stringify(currentEntry) !== JSON.stringify(entry)) {
        setEntries(prev => prev.map(item => item.rowIndex === entry.rowIndex ? currentEntry : item));
        toast.info('This tournament result was changed on another device. The latest values were loaded — review and try removing it again.');
        return;
      }
      await clearSheetRange(token, SHEET_ID, `'${TABS.TOURNAMENTS}'!A${entry.rowIndex}:V${entry.rowIndex}`);
      setEntries(prev => prev.filter(item => item.rowIndex !== entry.rowIndex));
      toast.success(`${entry.tournamentName} was removed from ${entry.studentName}'s results.`);
    } catch (e: any) { toast.error('Remove failed: ' + e.message); }
    finally { setDeleting(null); }
  };

  if (loading) return <Layout title="Tournaments" showBack><PageSkeleton /></Layout>;

  const manualOffline = entries.filter(e => e.type !== 'Online').map(entry => manualResultItem(entry, deleting, removeEntry));
  const manualOnline = entries.filter(e => e.type === 'Online').map(entry => manualResultItem(entry, deleting, removeEntry));
  const autoOffline = registrations.map(autoOfflineItem);
  const autoOnline = matchOnlineTournamentResults(weeklyResults, onlinePlayers).map(autoOnlineItem);
  const offlineItems = [...manualOffline, ...autoOffline].sort((left, right) => right.sortKey.localeCompare(left.sortKey));
  const onlineItems = [...manualOnline, ...autoOnline].sort((left, right) => right.sortKey.localeCompare(left.sortKey));

  return (
    <Layout title="Tournaments" showBack action={
      <button type="button" onClick={() => setShowAdd(true)} aria-label="Add tournament result" className="header-action-add"><Plus size={16} aria-hidden="true" /> Add</button>
    }>
      <div className="p-4 space-y-4">
        {error && <p className="text-red-600 text-sm">{error}</p>}

        {offlineItems.length === 0 && onlineItems.length === 0 && (
          <div className="text-center py-12 text-gray-400">
            <p className="text-4xl mb-2">🏆</p>
            <p>No tournament results yet.</p>
          </div>
        )}

        {([['Offline results', 'badge-blue', offlineItems], ['Online results', 'badge-green', onlineItems]] as const).map(([title, badgeClass, group]) =>
          group.length > 0 && (
            <section key={title} className="space-y-2">
              <div className="flex items-center justify-between">
                <h2 className="section-label flex items-center gap-2"><span className={badgeClass}>{group.length}</span>{title}</h2>
                <CopyButton text={groupCopyText(title, group)} label={`Copy ${title}`} />
              </div>
              {group.map(item => <div key={item.key}>{item.node}</div>)}
            </section>
          )
        )}
      </div>

      {showAdd && (
        <div className="modal-backdrop items-end justify-center sm:items-center">
          <dialog open className="modal-panel max-h-[92vh] max-w-lg overflow-y-auto p-4" aria-labelledby="add-tournament-result-title">
            <div className="flex items-center justify-between mb-4">
              <h2 id="add-tournament-result-title" className="font-bold text-lg text-navy">Add Tournament Result</h2>
              <button type="button" onClick={() => setShowAdd(false)} className="text-gray-400 text-2xl leading-none" aria-label="Close tournament result form">×</button>
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
            <button type="button" onClick={handleAdd} disabled={saving || !form.studentName || !form.tournamentName}
              className="primary-action mt-4 w-full">
              {saving && <span className="button-spinner" aria-hidden="true"/>}
              {saving ? 'Saving result…' : 'Save Result'}
            </button>
          </dialog>
        </div>
      )}
    </Layout>
  );
}

function Field({ label, children }: Readonly<{ label: string; children: React.ReactNode }>) {
  return <div><label className="text-xs font-medium text-gray-500 mb-1 block">{label}</label>{children}</div>;
}

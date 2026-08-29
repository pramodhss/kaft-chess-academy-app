import { useEffect, useState } from 'react';
import { Bus, CalendarDays, ChevronRight, CircleDollarSign, Copy, Link, LoaderCircle, MessageCircle, Pencil, Plus, Save, Search, StickyNote, Trash2, Trophy, Users, X } from 'lucide-react';
import { Layout } from '../components/Layout';
import { PageSkeleton } from '../components/Skeleton';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useCoachName } from '../hooks/useCoachName';
import { appendRows, batchWriteRanges, clearSheetRange, ensureSheet, ensureSheetColumns, readSheet, readSheetLive, writeRange } from '../lib/sheets';
import { recordAudit } from '../lib/audit';
import { phoneValidationError } from '../lib/validation';
import { fetchWeeklyOnlineTournament, rowToSavedWeeklyOnlineTournament, WEEKLY_ONLINE_TOURNAMENT_HEADERS, weeklyTournamentValues, weeklyTournamentWhatsAppMessage, type SavedWeeklyOnlineTournament, type WeeklyOnlineTournament } from '../lib/weeklyOnlineTournament';
import {
  EMPTY_TOURNAMENT, REGISTRATION_HEADERS, TOURNAMENT_HEADERS, registrationValues,
  rowToManagedTournament, rowToRegistration, tournamentMonth, tournamentValidationError, tournamentValues,
  type ManagedTournament, type TournamentDraft, type TournamentRegistration,
} from '../lib/tournamentManagement';
import { SHEET_ID, TABS } from '../config';

interface RosterChoice { playing: boolean; feePaid: boolean; vanRequired: boolean; notes: string }

function newTournamentId() { return `TRN-${crypto.randomUUID().slice(0, 8).toUpperCase()}`; }
function sameTournament(left: ManagedTournament, right: ManagedTournament) { return JSON.stringify(tournamentValues(left)) === JSON.stringify(tournamentValues(right)); }
function formattedDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return value || 'Date not set';
  return new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${value}T00:00:00Z`));
}

async function ensureTournamentSheets(token: string) {
  await ensureSheet(token, SHEET_ID, TABS.UPCOMING, TOURNAMENT_HEADERS);
  await ensureSheetColumns(token, SHEET_ID, TABS.UPCOMING, TOURNAMENT_HEADERS.length);
  const idHeader = await readSheetLive(token, SHEET_ID, `'${TABS.UPCOMING}'!M1`);
  if (idHeader[0]?.[0] !== 'Tournament ID') await writeRange(token, SHEET_ID, `'${TABS.UPCOMING}'!M1`, [['Tournament ID']]);
  await ensureSheet(token, SHEET_ID, TABS.TOURNAMENT_REGISTRATIONS, REGISTRATION_HEADERS);
  await ensureSheetColumns(token, SHEET_ID, TABS.TOURNAMENT_REGISTRATIONS, REGISTRATION_HEADERS.length);
  await ensureSheet(token, SHEET_ID, TABS.WEEKLY_ONLINE_TOURNAMENTS, WEEKLY_ONLINE_TOURNAMENT_HEADERS);
  await ensureSheetColumns(token, SHEET_ID, TABS.WEEKLY_ONLINE_TOURNAMENTS, WEEKLY_ONLINE_TOURNAMENT_HEADERS.length);
}

async function addMissingIds(token: string, tournaments: ManagedTournament[]) {
  const missing = tournaments.filter(t => !t.id);
  if (missing.length === 0) return tournaments;
  const generated = missing.map(t => ({ tournament: t, id: newTournamentId() }));
  await batchWriteRanges(token, SHEET_ID, generated.map(({ tournament, id }) => ({ range: `'${TABS.UPCOMING}'!M${tournament.rowIndex}`, values: [[id]] })));
  const idByRow = new Map(generated.map(({ tournament, id }) => [tournament.rowIndex, id]));
  return tournaments.map(t => ({ ...t, id: t.id || idByRow.get(t.rowIndex) || '' }));
}

function createRoster(students: string[], registrations: TournamentRegistration[], tournamentId: string) {
  const saved = new Map(registrations.filter(r => r.tournamentId === tournamentId).map(r => [r.studentName, r]));
  return Object.fromEntries(students.map(s => [s, {
    playing: saved.get(s)?.playing ?? false,
    feePaid: saved.get(s)?.feePaid ?? false,
    vanRequired: saved.get(s)?.vanRequired ?? false,
    notes: saved.get(s)?.studentNotes ?? '',
  }]));
}

export function Van() {
  const { token, logout } = useAuth();
  const { coachName } = useCoachName();
  const toast = useToast();
  const [tournaments, setTournaments] = useState<ManagedTournament[]>([]);
  const [registrations, setRegistrations] = useState<TournamentRegistration[]>([]);
  const [students, setStudents] = useState<string[]>([]);
  const [selected, setSelected] = useState<ManagedTournament | null>(null);
  const [roster, setRoster] = useState<Record<string, RosterChoice>>({});
  const [query, setQuery] = useState('');
  const [form, setForm] = useState<TournamentDraft>({ ...EMPTY_TOURNAMENT });
  const [editing, setEditing] = useState<ManagedTournament | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [legacyWarning, setLegacyWarning] = useState('');
  const [weeklyLink, setWeeklyLink] = useState('');
  const [weeklyResult, setWeeklyResult] = useState<WeeklyOnlineTournament | null>(null);
  const [savedWeeklyResults, setSavedWeeklyResults] = useState<SavedWeeklyOnlineTournament[]>([]);
  const [selectedWeeklyResult, setSelectedWeeklyResult] = useState<SavedWeeklyOnlineTournament | null>(null);
  const [weeklyLoading, setWeeklyLoading] = useState(false);
  const weeklyResultAlreadySaved = Boolean(weeklyResult && savedWeeklyResults.some(item => item.sourceUrl === weeklyResult.sourceUrl));

  const load = async () => {
    if (!token) return;
    setLoading(true); setError('');
    try {
      await ensureTournamentSheets(token);
      const [tournamentRows, studentRows, registrationRows, weeklyRows, legacyVanRows] = await Promise.all([
        readSheet(token, SHEET_ID, `'${TABS.UPCOMING}'!A:M`),
        readSheet(token, SHEET_ID, `'${TABS.STUDENTS}'!A:AG`),
        readSheet(token, SHEET_ID, `'${TABS.TOURNAMENT_REGISTRATIONS}'!A:L`),
        readSheet(token, SHEET_ID, `'${TABS.WEEKLY_ONLINE_TOURNAMENTS}'!A:N`),
        readSheet(token, SHEET_ID, `'${TABS.VAN}'!A:M`).catch(() => []),
      ]);
      const parsed = tournamentRows.slice(1).map((row, i) => rowToManagedTournament(row, i + 2)).filter(t => t.name.trim());
      setTournaments(await addMissingIds(token, parsed));
      setStudents(studentRows.slice(1).map(r => r[0]?.trim()).filter((n): n is string => Boolean(n)));
      setRegistrations(registrationRows.slice(1).map((r, i) => rowToRegistration(r, i + 2)).filter(r => r.tournamentId && r.studentName));
      setSavedWeeklyResults(weeklyRows.slice(1).map((row, index) => rowToSavedWeeklyOnlineTournament(row, index + 2)).filter(item => item.name));
      setLegacyWarning(legacyVanRows.slice(1).map(r => phoneValidationError(r[9] ?? '', 'Driver phone')).find(Boolean) ?? '');
    } catch (e: any) {
      if (e.message === 'TOKEN_EXPIRED') { logout(); return; }
      setError(e.message);
    } finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, [token]);

  const openRoster = (t: ManagedTournament) => { setSelected(t); setRoster(createRoster(students, registrations, t.id)); setQuery(''); };
  const openCreate = () => { setEditing(null); setForm({ ...EMPTY_TOURNAMENT }); setShowForm(true); };
  const openEdit = (t: ManagedTournament) => { setEditing(t); setForm({ name: t.name, date: t.date, fee: t.fee }); setShowForm(true); };

  const createTournament = async () => {
    if (!token) return;
    const created: ManagedTournament = {
      id: newTournamentId(), name: form.name.trim(), date: form.date, fee: form.fee,
      type: 'Open', deadline: '', venue: '', eligibility: 'All Levels', link: '', notes: '', status: 'Upcoming',
      addedBy: coachName || 'Coach', addedOn: new Date().toISOString(), rowIndex: 0,
    };
    const rowIndex = await appendRows(token, SHEET_ID, `'${TABS.UPCOMING}'!A:M`, [tournamentValues(created)]);
    const saved = { ...created, rowIndex };
    setTournaments(c => [...c, saved]);
    void recordAudit(token, 'CREATE', 'Tournament Management', saved.name, saved.date).catch(() => undefined);
    toast.success(`${saved.name} was created. Open it to select players.`);
  };

  const updateTournament = async (original: ManagedTournament) => {
    if (!token) return;
    const liveRows = await readSheetLive(token, SHEET_ID, `'${TABS.UPCOMING}'!A${original.rowIndex}:M${original.rowIndex}`);
    if (!sameTournament(rowToManagedTournament(liveRows[0] ?? [], original.rowIndex), original)) throw new Error('This tournament changed on another device. Reload and try again.');
    const updated = { ...original, name: form.name.trim(), date: form.date, fee: form.fee };
    const linked = registrations.filter(r => r.tournamentId === original.id);
    const updatedRegs = linked.map(r => ({ ...r, tournamentName: updated.name, tournamentDate: updated.date, month: tournamentMonth(updated.date), entryFee: updated.fee }));
    await batchWriteRanges(token, SHEET_ID, [
      { range: `'${TABS.UPCOMING}'!A${original.rowIndex}:M${original.rowIndex}`, values: [tournamentValues(updated)] },
      ...updatedRegs.map(r => ({ range: `'${TABS.TOURNAMENT_REGISTRATIONS}'!A${r.rowIndex}:L${r.rowIndex}`, values: [registrationValues(r)] })),
    ]);
    setTournaments(c => c.map(t => t.id === updated.id ? updated : t));
    setRegistrations(c => c.map(r => updatedRegs.find(u => u.rowIndex === r.rowIndex) ?? r));
    if (selected?.id === updated.id) setSelected(updated);
    void recordAudit(token, 'UPDATE', 'Tournament Management', updated.name, updated.date).catch(() => undefined);
    toast.success(`${updated.name} was updated.`);
  };

  const notifyTournament = (tournament: ManagedTournament) => {
    const playing = students.filter(s => registrations.some(r => r.tournamentId === tournament.id && r.playing && r.studentName === s));
    const lines = [
      `🏆 *Tournament: ${tournament.name}*`,
      `📅 Date: ${formattedDate(tournament.date)}`,
      tournament.fee ? `💰 Entry fee: \u20b9${tournament.fee}` : '',
      '',
      playing.length > 0 ? `*Participating students (${playing.length}):*` : '',
      ...playing.map(s => `\u2022 ${s}`),
      '',
      'Please confirm participation and arrange fee payment.',
      '\u2014 KAFT Chess Academy',
    ].filter(Boolean).join('\n');
    window.open(`https://wa.me/?text=${encodeURIComponent(lines)}`, '_blank', 'noopener,noreferrer');
  };
  const copyTournamentRoster = (tournament: ManagedTournament) => {
    const regs = registrations.filter(r => r.tournamentId === tournament.id && r.playing);
    const entryFee = tournament.fee ? ` \u00b7 Entry: \u20b9${tournament.fee}` : '';
    const lines = [
      `\ud83c\udfc6 *${tournament.name}*`,
      `\ud83d\udcc5 ${formattedDate(tournament.date)}${entryFee}`,
      ``,
      `*Roster (${regs.length} players)*`,
      ...regs.map(r => {
        const tags = [r.feePaid ? '\ud83d\udcb3 Paid' : '\u23f3 Fee pending', r.vanRequired ? '\ud83d\ude8c Van' : null].filter(Boolean);
        const tagList = tags.length ? ` \u2014 ${tags.join(', ')}` : '';
        return `\u2022 ${r.studentName}${tagList}`;
      }),
      ``,
      `\u2014 KAFT Chess Academy`,
    ].join('\n');
    void navigator.clipboard.writeText(lines).then(
      () => toast.success('Roster copied \u2014 ready to paste in WhatsApp.'),
      () => toast.error('Could not copy to clipboard.')
    );
  };
  const importWeeklyTournament = async () => {
    setWeeklyLoading(true);
    try {
      setWeeklyResult(await fetchWeeklyOnlineTournament(weeklyLink));
      toast.success('Final standings loaded. Review them before sharing.');
    } catch (e: any) {
      setWeeklyResult(null);
      toast.error(e.message || 'Could not import tournament results.');
    } finally { setWeeklyLoading(false); }
  };
  const copyWeeklyMessage = () => {
    if (!weeklyResult) return;
    void navigator.clipboard.writeText(weeklyTournamentWhatsAppMessage(weeklyResult)).then(
      () => toast.success('Weekly results copied for WhatsApp.'),
      () => toast.error('Could not copy to clipboard.'),
    );
  };
  const copySavedWeeklyMessage = (tournament: SavedWeeklyOnlineTournament) => {
    void navigator.clipboard.writeText(weeklyTournamentWhatsAppMessage(tournament)).then(
      () => toast.success('Weekly results copied for WhatsApp.'),
      () => toast.error('Could not copy to clipboard.'),
    );
  };
  const saveWeeklyTournament = async () => {
    if (!token || !weeklyResult) return;
    if (savedWeeklyResults.some(item => item.sourceUrl === weeklyResult.sourceUrl)) {
      toast.info('This weekly tournament has already been saved.');
      return;
    }
    setSaving(true);
    try {
      const savedAt = new Date().toISOString();
      const savedBy = coachName || 'Coach';
      const rowIndex = await appendRows(token, SHEET_ID, `'${TABS.WEEKLY_ONLINE_TOURNAMENTS}'!A:N`, [weeklyTournamentValues(weeklyResult, savedBy, savedAt)]);
      setSavedWeeklyResults(current => [{ ...weeklyResult, savedBy, savedAt, rowIndex }, ...current]);
      void recordAudit(token, 'CREATE', 'Weekly Online Tournament', weeklyResult.name, weeklyResult.sourceUrl).catch(() => undefined);
      toast.success('Weekly tournament was saved as a read-only record.');
    } catch (e: any) { toast.error(`Save failed: ${e.message}`); }
    finally { setSaving(false); }
  };
  const saveTournament = async () => {
    if (!token) return;
    const err = tournamentValidationError(form);
    if (err) { toast.error(err); return; }
    setSaving(true);
    try {
      if (editing) {
        await updateTournament(editing);
      } else {
        await createTournament();
      }
      setShowForm(false);
    }
    catch (e: any) { toast.error(`Save failed: ${e.message}`); }
    finally { setSaving(false); }
  };

  const removeTournament = async (t: ManagedTournament) => {
    if (!token || !window.confirm(`Remove ${t.name} and its player checklist? Tournament result history will be kept.`)) return;
    setSaving(true);
    try {
      const liveRows = await readSheetLive(token, SHEET_ID, `'${TABS.UPCOMING}'!A${t.rowIndex}:M${t.rowIndex}`);
      if (!sameTournament(rowToManagedTournament(liveRows[0] ?? [], t.rowIndex), t)) { toast.info('This tournament changed on another device. Reload before removing it.'); return; }
      const linked = registrations.filter(r => r.tournamentId === t.id);
      await Promise.all([
        clearSheetRange(token, SHEET_ID, `'${TABS.UPCOMING}'!A${t.rowIndex}:M${t.rowIndex}`),
        ...linked.map(r => clearSheetRange(token, SHEET_ID, `'${TABS.TOURNAMENT_REGISTRATIONS}'!A${r.rowIndex}:L${r.rowIndex}`)),
      ]);
      setTournaments(c => c.filter(x => x.id !== t.id));
      setRegistrations(c => c.filter(x => x.tournamentId !== t.id));
      void recordAudit(token, 'DELETE', 'Tournament Management', t.name, t.date).catch(() => undefined);
      toast.success(`${t.name} was removed.`);
    } catch (e: any) { toast.error(`Remove failed: ${e.message}`); }
    finally { setSaving(false); }
  };

  const togglePlaying = (s: string) => setRoster(c => {
    const playing = !c[s]?.playing;
    return { ...c, [s]: { ...c[s], playing, feePaid: playing ? c[s]?.feePaid ?? false : false, vanRequired: playing ? c[s]?.vanRequired ?? false : false } };
  });
  const toggleFee = (s: string) => setRoster(c => ({ ...c, [s]: { ...c[s], feePaid: !c[s]?.feePaid } }));
  const toggleVan = (s: string) => setRoster(c => ({ ...c, [s]: { ...c[s], vanRequired: !c[s]?.vanRequired } }));
  const setStudentNotes = (s: string, notes: string) => setRoster(c => ({ ...c, [s]: { ...c[s], notes } }));

  const saveRoster = async () => {
    if (!token || !selected) return;
    setSaving(true);
    try {
      const liveRows = await readSheetLive(token, SHEET_ID, `'${TABS.TOURNAMENT_REGISTRATIONS}'!A:L`);
      const live = liveRows.slice(1).map((r, i) => rowToRegistration(r, i + 2));
      const existingByStudent = new Map(live.filter(r => r.tournamentId === selected.id).map(r => [r.studentName, r]));
      const timestamp = new Date().toISOString();
      const desired = students.map(student => ({
        tournamentId: selected.id, tournamentName: selected.name, tournamentDate: selected.date,
        month: tournamentMonth(selected.date), studentName: student,
        playing: roster[student]?.playing ?? false,
        feePaid: roster[student]?.playing ? roster[student]?.feePaid ?? false : false,
        vanRequired: roster[student]?.playing ? roster[student]?.vanRequired ?? false : false,
        studentNotes: roster[student]?.notes ?? '',
        entryFee: selected.fee, updatedBy: coachName || 'Coach', updatedAt: timestamp,
        rowIndex: existingByStudent.get(student)?.rowIndex ?? 0,
      }));
      const existing = desired.filter(r => r.rowIndex > 0);
      const missing = desired.filter(r => r.rowIndex === 0);
      if (existing.length > 0) await batchWriteRanges(token, SHEET_ID, existing.map(r => ({
        range: `'${TABS.TOURNAMENT_REGISTRATIONS}'!A${r.rowIndex}:L${r.rowIndex}`, values: [registrationValues(r)],
      })));
      let firstNewRow = 0;
      if (missing.length > 0) firstNewRow = await appendRows(token, SHEET_ID, `'${TABS.TOURNAMENT_REGISTRATIONS}'!A:L`, missing.map(registrationValues));
      const saved = [...existing, ...missing.map((r, i) => ({ ...r, rowIndex: firstNewRow + i }))];
      setRegistrations(c => [...c.filter(r => r.tournamentId !== selected.id), ...saved]);
      void recordAudit(token, 'UPDATE', 'Tournament Roster', selected.name, `${saved.filter(r => r.playing).length} players`).catch(() => undefined);
      toast.success(`${selected.name} roster was saved.`);
    } catch (e: any) { toast.error(`Roster save failed: ${e.message}`); }
    finally { setSaving(false); }
  };

  if (loading) return <Layout title="Tournament Management"><PageSkeleton /></Layout>;
  if (selected) return <RosterView tournament={selected} students={students} roster={roster} query={query} saving={saving}
    setQuery={setQuery} togglePlaying={togglePlaying} toggleFee={toggleFee} toggleVan={toggleVan}
    setStudentNotes={setStudentNotes} save={saveRoster} close={() => setSelected(null)} />;

  return (
    <Layout title="Tournament Management" action={<button type="button" onClick={openCreate} className="header-action" aria-label="Add tournament"><Plus size={15} /> Add</button>}>
      <div className="page-stack">
        {error && <div role="alert" className="error-state"><p>{error}</p><button type="button" onClick={load}>Retry</button></div>}
        {legacyWarning && <div role="alert" className="error-state"><p><Bus size={14} className="inline mr-1" />{legacyWarning} Legacy transport data was left unchanged.</p></div>}
        <div className="surface-card flex items-center gap-3 p-3">
          <span className="icon-tile"><Trophy size={18} /></span>
          <div>
            <h2 className="text-sm font-semibold text-gray-900">Tournament rosters</h2>
            <p className="text-xs text-gray-500">Create an event, then mark players, fees and van needs.</p>
          </div>
        </div>
        <section className="weekly-workspace" aria-labelledby="weekly-online-title">
          <div className="weekly-workspace-heading"><span className="icon-tile"><Link size={18} /></span><div><p className="section-label">Weekly results</p><h2 id="weekly-online-title">Online tournament</h2></div></div>
          <label className="weekly-link-field"><span>Completed Lichess event link</span><div className="flex gap-2"><input type="url" value={weeklyLink} onChange={event => setWeeklyLink(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') void importWeeklyTournament(); }} className="input min-w-0 flex-1" placeholder="https://lichess.org/swiss/abcdefgh" aria-label="Completed Lichess tournament link" /><button type="button" onClick={() => void importWeeklyTournament()} disabled={weeklyLoading || !weeklyLink.trim()} className="primary-action shrink-0">{weeklyLoading ? <LoaderCircle size={15} className="animate-spin" /> : <Trophy size={15} />} Load results</button></div></label>
          {weeklyResult && <div className="weekly-result-view">
            <div className="weekly-result-title"><div className="min-w-0"><p className="section-label">Results ready</p><h3>{weeklyResult.name}</h3><p>{[weeklyResult.format, weeklyResult.variant, weeklyResult.timeControl].filter(Boolean).join(' | ')}</p></div><span className="badge-green">Final</span></div>
            <dl className="weekly-stat-grid"><div><dt>Players</dt><dd>{weeklyResult.playerCount || '-'}</dd></div><div><dt>Rounds</dt><dd>{weeklyResult.rounds || '-'}</dd></div><div><dt>Organizer</dt><dd>{weeklyResult.organizer || '-'}</dd></div></dl>
            <div className="weekly-standings"><div className="weekly-standings-heading"><h4>Top 5 standings</h4><span>Final points</span></div>{weeklyResult.standings.map(player => <div key={`${player.rank}-${player.playerName}`} className="weekly-standing-row"><span className="weekly-place">{({ 1: '🥇', 2: '🥈', 3: '🥉' } as Record<number, string>)[player.rank] ?? player.rank}</span><span className="truncate">{player.playerName}</span><strong>{player.score || '-'}{player.score ? ' pts' : ''}</strong></div>)}</div>
            <div className="weekly-result-actions"><p>{weeklyResultAlreadySaved ? 'This result is saved and cannot be edited.' : 'Save this final result to the academy record.'}</p><div><button type="button" onClick={copyWeeklyMessage} className="secondary-action"><Copy size={15} /> Copy WhatsApp text</button><button type="button" onClick={() => void saveWeeklyTournament()} disabled={saving || weeklyResultAlreadySaved} className="primary-action"><Save size={15} />{saving ? 'Saving...' : weeklyResultAlreadySaved ? 'Saved' : 'Save result'}</button></div></div>
          </div>}
        </section>
        {savedWeeklyResults.length > 0 && <section className="weekly-history" aria-labelledby="saved-weekly-title">
          <div className="weekly-history-heading"><div><p className="section-label">Archive</p><h2 id="saved-weekly-title">Saved weekly results</h2></div><span>{savedWeeklyResults.length} saved</span></div>
          <div>
            {[...savedWeeklyResults].sort((left, right) => right.savedAt.localeCompare(left.savedAt)).map(item => <button key={item.rowIndex} type="button" onClick={() => setSelectedWeeklyResult(item)} className="weekly-history-row"><span className="weekly-history-trophy"><Trophy size={15} /></span><span className="min-w-0 flex-1"><strong className="truncate">{item.name}</strong><small>{[item.format, item.variant, item.timeControl].filter(Boolean).join(' | ')} · {item.standings.length} finalists</small></span><span className="weekly-view-label">View <ChevronRight size={15} /></span></button>)}
          </div>
        </section>}
        {tournaments.length === 0 && !error && (
          <div className="empty-state"><CalendarDays size={25} /><p>No tournaments yet.</p>
            <button type="button" onClick={openCreate} className="primary-action"><Plus size={15} /> Create tournament</button>
          </div>
        )}
        <div className="space-y-2">
          {[...tournaments].sort((a, b) => b.date.localeCompare(a.date)).map(t => {
            const playing = registrations.filter(r => r.tournamentId === t.id && r.playing);
            return <TournamentCard key={t.id} tournament={t} playing={playing.length}
              paid={playing.filter(r => r.feePaid).length} van={playing.filter(r => r.vanRequired).length}
              open={() => openRoster(t)} edit={() => openEdit(t)} remove={() => removeTournament(t)} notify={() => notifyTournament(t)} copy={() => copyTournamentRoster(t)} saving={saving} />;
          })}
        </div>
      </div>
      {showForm && <TournamentForm form={form} setForm={setForm} editing={Boolean(editing)} saving={saving} close={() => setShowForm(false)} save={saveTournament} />}
      {selectedWeeklyResult && <WeeklyTournamentDetail tournament={selectedWeeklyResult} close={() => setSelectedWeeklyResult(null)} copy={() => copySavedWeeklyMessage(selectedWeeklyResult)} />}
    </Layout>
  );
}

function WeeklyTournamentDetail({ tournament, close, copy }: Readonly<{ tournament: SavedWeeklyOnlineTournament; close: () => void; copy: () => void }>) {
  return <div className="modal-backdrop items-end justify-center sm:items-center"><dialog open className="modal-panel max-w-md p-0" aria-labelledby="weekly-result-detail-title">
    <div className="flex items-start justify-between border-b border-gray-100 px-4 py-3"><div className="min-w-0"><p className="text-[10px] font-bold uppercase tracking-wider text-chess-blue">Saved weekly result</p><h2 id="weekly-result-detail-title" className="mt-0.5 truncate text-base font-semibold text-gray-900">{tournament.name}</h2><p className="mt-1 text-xs text-gray-500">{[tournament.format, tournament.variant, tournament.timeControl].filter(Boolean).join(' | ')}</p></div><button type="button" onClick={close} className="icon-button shrink-0" aria-label="Close saved weekly result"><X size={17} /></button></div>
    <dl className="grid grid-cols-3 divide-x divide-gray-100 border-b border-gray-100 text-xs"><div className="px-4 py-2.5"><dt className="text-gray-400">Players</dt><dd className="mt-0.5 font-semibold text-gray-800">{tournament.playerCount || '-'}</dd></div><div className="px-4 py-2.5"><dt className="text-gray-400">Rounds</dt><dd className="mt-0.5 font-semibold text-gray-800">{tournament.rounds || '-'}</dd></div><div className="px-4 py-2.5"><dt className="text-gray-400">Organizer</dt><dd className="mt-0.5 truncate font-semibold text-gray-800">{tournament.organizer || '-'}</dd></div></dl>
    <div className="p-4"><div className="mb-2 flex items-center justify-between"><h3 className="text-sm font-semibold text-gray-800">Top 5 final standings</h3><span className="badge-blue">Read-only</span></div><div className="overflow-hidden rounded-md border border-gray-100"><div className="grid grid-cols-[42px_minmax(0,1fr)_64px] bg-gray-50 px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-gray-400"><span>Rank</span><span>Player</span><span className="text-right">Points</span></div>{tournament.standings.map(player => <div key={`${player.rank}-${player.playerName}`} className="grid grid-cols-[42px_minmax(0,1fr)_64px] border-t border-gray-100 px-3 py-2.5 text-sm"><span className="font-semibold text-chess-blue">{({ 1: '🥇', 2: '🥈', 3: '🥉' } as Record<number, string>)[player.rank] ?? player.rank}</span><span className="truncate font-medium text-gray-800">{player.playerName}</span><span className="text-right text-gray-500">{player.score || '-'}{player.score ? ' pts' : ''}</span></div>)}</div></div>
    <div className="flex items-center justify-end border-t border-gray-100 bg-gray-50 px-4 py-3"><button type="button" onClick={copy} className="secondary-action"><Copy size={15} /> Copy for WhatsApp</button></div>
  </dialog></div>;
}

function TournamentCard({ tournament, playing, paid, van, open, edit, remove, notify, copy, saving }: Readonly<{
  tournament: ManagedTournament; playing: number; paid: number; van: number;
  open: () => void; edit: () => void; remove: () => void; notify: () => void; copy: () => void; saving: boolean;
}>) {
  return (
    <article className="surface-card overflow-hidden">
      <button type="button" onClick={open} className="w-full p-3 text-left">
        <div className="flex items-start gap-3">
          <span className="icon-tile"><Trophy size={18} /></span>
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-sm font-semibold text-gray-900">{tournament.name}</h2>
            <p className="mt-0.5 text-xs text-gray-500">{formattedDate(tournament.date)} · ₹{tournament.fee || '0'}</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <span className="badge-blue"><Users size={12} className="inline mr-0.5" />{playing} playing</span>
              <span className="badge-green"><CircleDollarSign size={12} className="inline mr-0.5" />{paid} paid</span>
              {van > 0 && <span className="badge-amber"><Bus size={12} className="inline mr-0.5" />{van} van</span>}
            </div>
          </div>
          <ChevronRight size={16} className="mt-1 flex-shrink-0 text-gray-400" />
        </div>
      </button>
      <div className="flex items-center justify-between border-t border-gray-100 px-3 py-2">
        <div className="flex items-center gap-2">
          <button type="button" onClick={notify} className="flex items-center gap-1.5 text-xs font-semibold text-green-700"><MessageCircle size={14} />Notify</button>
          <button type="button" onClick={copy} className="flex items-center gap-1.5 text-xs font-semibold text-gray-500" aria-label="Copy roster" title="Copy roster for WhatsApp"><Copy size={14} />Copy</button>
        </div>
        <div className="flex gap-1.5">
          <button type="button" onClick={edit} className="icon-button" aria-label={`Edit ${tournament.name}`}><Pencil size={15} /></button>
          <button type="button" onClick={remove} disabled={saving} className="icon-button-danger" aria-label={`Remove ${tournament.name}`}><Trash2 size={15} /></button>
        </div>
      </div>
    </article>
  );
}

function RosterView({ tournament, students, roster, query, saving, setQuery, togglePlaying, toggleFee, toggleVan, setStudentNotes, save, close }: Readonly<{
  tournament: ManagedTournament; students: string[]; roster: Record<string, RosterChoice>; query: string; saving: boolean;
  setQuery: (value: string) => void; togglePlaying: (student: string) => void; toggleFee: (student: string) => void;
  toggleVan: (student: string) => void; setStudentNotes: (student: string, notes: string) => void; save: () => void; close: () => void;
}>) {
  const [notesStudent, setNotesStudent] = useState<string | null>(null);
  const [notesText, setNotesText] = useState('');
  const visible = students.filter(s => s.toLowerCase().includes(query.trim().toLowerCase()));
  const playing = students.filter(s => roster[s]?.playing).length;
  const paid = students.filter(s => roster[s]?.playing && roster[s]?.feePaid).length;
  const van = students.filter(s => roster[s]?.playing && roster[s]?.vanRequired).length;
  const openNotes = (s: string) => { setNotesStudent(s); setNotesText(roster[s]?.notes ?? ''); };
  const saveNotes = () => { if (notesStudent) { setStudentNotes(notesStudent, notesText); setNotesStudent(null); } };
  return (
    <Layout title={tournament.name} onBack={close} action={<button type="button" onClick={close} className="header-action">Done</button>}>
      <div className="page-stack">
        <div className="surface-card p-3">
          <p className="text-sm font-semibold text-gray-900">{formattedDate(tournament.date)}</p>
          <p className="mt-0.5 text-xs text-gray-500">Entry fee: ₹{tournament.fee || '0'}</p>
          <div className="mt-2.5 flex flex-wrap gap-2">
            <span className="badge-blue"><Users size={12} className="inline mr-1" />{playing} playing</span>
            <span className="badge-green"><CircleDollarSign size={12} className="inline mr-1" />{paid} paid</span>
            <span className="badge-amber"><Bus size={12} className="inline mr-1" />{van} van</span>
          </div>
        </div>
        <div className="relative">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input className="input input-with-icon" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search students…" aria-label="Search students" />
        </div>
        <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
          <div className="grid grid-cols-[minmax(0,1fr)_52px_52px_52px_36px] items-center gap-1 border-b border-gray-200 bg-gray-50 px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-gray-500">
            <span>Student</span>
            <span className="text-center">Play</span>
            <span className="text-center">Fee</span>
            <span className="text-center">Van</span>
            <span />
          </div>
          {visible.map(s => (
            <div key={s} className="grid grid-cols-[minmax(0,1fr)_52px_52px_52px_36px] items-center gap-1 border-b border-gray-100 px-3 py-2.5 last:border-0">
              <span className="truncate text-sm font-medium text-gray-900">{s}</span>
              <label className="flex justify-center" title="Playing"><span className="sr-only">{s} playing</span><input type="checkbox" checked={roster[s]?.playing ?? false} onChange={() => togglePlaying(s)} className="h-5 w-5 cursor-pointer accent-navy" /></label>
              <label className="flex justify-center" title="Fee paid"><span className="sr-only">{s} fee paid</span><input type="checkbox" checked={roster[s]?.feePaid ?? false} onChange={() => toggleFee(s)} disabled={!roster[s]?.playing} className="h-5 w-5 cursor-pointer accent-green-700 disabled:opacity-30" /></label>
              <label className="flex justify-center" title="Van required"><span className="sr-only">{s} van required</span><input type="checkbox" checked={roster[s]?.vanRequired ?? false} onChange={() => toggleVan(s)} disabled={!roster[s]?.playing} className="h-5 w-5 cursor-pointer accent-amber-500 disabled:opacity-30" /></label>
              <button type="button" onClick={() => openNotes(s)} title="Notes" aria-label={`Notes for ${s}`}
                className={`flex h-8 w-8 items-center justify-center rounded-lg transition-colors hover:bg-gray-100 ${roster[s]?.notes ? 'text-chess-blue' : 'text-gray-300'}`}>
                <StickyNote size={14} />
              </button>
            </div>
          ))}
          {visible.length === 0 && <p className="p-5 text-center text-sm text-gray-400">No matching students.</p>}
        </div>
        <button type="button" onClick={save} disabled={saving} className="primary-action w-full">{saving ? 'Saving roster…' : 'Save roster'}</button>
      </div>
      {notesStudent && (
        <div className="modal-backdrop items-end justify-center sm:items-center">
          <dialog open aria-labelledby="notes-overlay-title" className="modal-panel max-w-md p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 id="notes-overlay-title" className="text-sm font-semibold text-navy"><StickyNote size={15} className="inline mr-1.5" />Notes — {notesStudent}</h3>
              <button type="button" onClick={() => setNotesStudent(null)} className="icon-button" aria-label="Close"><X size={17} /></button>
            </div>
            <textarea className="input" rows={4} value={notesText} onChange={e => setNotesText(e.target.value)} placeholder="Pickup point, travel details, special requirements…" autoFocus />
            <div className="mt-3 flex gap-2">
              <button type="button" onClick={() => setNotesStudent(null)} className="flex-1 rounded-lg border border-gray-200 py-2.5 text-sm font-semibold text-gray-700">Cancel</button>
              <button type="button" onClick={saveNotes} className="primary-action flex-1">Save note</button>
            </div>
          </dialog>
        </div>
      )}
    </Layout>
  );
}

function TournamentForm({ form, setForm, editing, saving, close, save }: Readonly<{
  form: TournamentDraft; setForm: React.Dispatch<React.SetStateAction<TournamentDraft>>; editing: boolean; saving: boolean; close: () => void; save: () => void;
}>) {
  let buttonLabel = 'Create tournament';
  if (editing) buttonLabel = 'Save changes';
  if (saving) buttonLabel = 'Saving…';
  return (
    <div className="modal-backdrop items-end justify-center sm:items-center">
      <dialog open aria-labelledby="tournament-form-title" className="modal-panel max-w-md p-4">
        <div className="mb-4 flex items-center justify-between">
          <h2 id="tournament-form-title" className="text-base font-semibold text-navy">{editing ? 'Edit tournament' : 'Create tournament'}</h2>
          <button type="button" onClick={close} className="icon-button" aria-label="Close"><X size={18} /></button>
        </div>
        <div className="space-y-3">
          <Field label="Tournament name"><input className="input" maxLength={120} value={form.name} onChange={e => setForm(c => ({ ...c, name: e.target.value }))} /></Field>
          <Field label="Tournament date"><input type="date" className="input" value={form.date} onChange={e => setForm(c => ({ ...c, date: e.target.value }))} /></Field>
          <Field label="Entry fee (₹)"><input type="number" min="0" step="0.01" className="input" value={form.fee} onChange={e => setForm(c => ({ ...c, fee: e.target.value }))} /></Field>
        </div>
        {tournamentValidationError(form) && <p role="alert" className="mt-3 text-xs text-red-600">{tournamentValidationError(form)}</p>}
        <button type="button" onClick={save} disabled={saving} className="primary-action mt-4 w-full">{buttonLabel}</button>
      </dialog>
    </div>
  );
}

function Field({ label, children }: Readonly<{ label: string; children: React.ReactNode }>) {
  return <label className="block"><span className="field-label">{label}</span>{children}</label>;
}

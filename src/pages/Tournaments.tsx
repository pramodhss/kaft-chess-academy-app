import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Award, ChevronDown, Info, Medal, Plus, RefreshCw, Search, Trash2, Trophy } from 'lucide-react';
import { Layout } from '../components/Layout';
import { CopyButton } from '../components/CopyButton';
import { PageSkeleton } from '../components/Skeleton';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { clearSheetReadCache, readSheet, readSheetLive, appendRows, clearSheetRange } from '../lib/sheets';
import { matchOnlineTournamentResults, ordinal, type MatchedOnlineResult, type OnlinePlayerDirectory } from '../lib/onlineTournamentMatch';
import { monthLabel, rowToRegistration, type TournamentRegistration } from '../lib/tournamentManagement';
import { rowToSavedWeeklyOnlineTournament, type SavedWeeklyOnlineTournament } from '../lib/weeklyOnlineTournament';
import { loadMiniTournamentSessions, historyFromSession, type MiniTournamentSession } from '../lib/miniTournamentStore';
import { computeStandings } from '../lib/pairingEngine';
import { SHEET_ID, TABS } from '../config';
import { uniqueStudentNames } from '../lib/studentRoster';
import type { TournamentEntry } from '../types';

const TYPES   = ['Internal','Zonal','District','State','National','Online','Rapid','Blitz','Classical'];
const MEDALS  = ['Gold','Silver','Bronze','Participation','Best Game','None'];
const EMPTY_F = { studentName:'', month:'', tournamentName:'', type:'Internal', date:'', venue:'', rounds:'', wins:'', draws:'', losses:'', position:'', ratingBefore:'', ratingAfter:'', medal:'None', prize:'', coachNotes:'' };

const MEDAL_ICON: Record<string, string> = { Gold:'🥇', Silver:'🥈', Bronze:'🥉', Participation:'🎖', 'Best Game':'⭐', None:'' };
const MEDAL_SCORE = { Gold: 10, Silver: 6, Bronze: 3, Participation: 1, 'Best Game': 2, None: 0 };

interface LeaderboardItem {
  name: string;
  batch: string;
  gold: number;
  silver: number;
  bronze: number;
  wins: number;
  ratingGain: number;
  total: number;
}

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

function leaderboardCopyText(board: LeaderboardItem[]): string {
  if (board.length === 0) return '';
  return [
    '*KAFT Chess Academy \u2013 Tournament Leaderboard*',
    '',
    ...board.map((e, i) => {
      const medals = [e.gold > 0 ? `\ud83e\udd47${e.gold}` : '', e.silver > 0 ? `\ud83e\udd48${e.silver}` : '', e.bronze > 0 ? `\ud83e\udd49${e.bronze}` : ''].filter(Boolean).join(' ');
      const medalStr = medals ? ` (${medals})` : '';
      return `${i + 1}. ${e.name}${medalStr} \u2013 ${e.wins} wins \u00b7 ${e.total} pts`;
    }),
    '',
    '\u2014 KAFT Chess Academy',
  ].join('\n');
}

function leaderboardBadgeClass(index: number): string {
  if (index === 0) return 'bg-amber-400 text-slate-900 shadow-sm';
  if (index === 1) return 'bg-slate-300 text-slate-800';
  if (index === 2) return 'bg-amber-600 text-white';
  return 'bg-gray-100 text-gray-600';
}

function computeLeaderboard(
  entries: TournamentEntry[],
  weeklyResults: SavedWeeklyOnlineTournament[],
  onlinePlayers: OnlinePlayerDirectory[],
  miniSessions: MiniTournamentSession[],
  studentDetails: Map<string, { batch: string; level: string }>,
): LeaderboardItem[] {
  const map = new Map<string, LeaderboardItem>();

  const getOrCreate = (name: string, fallbackBatch = '') => {
    const cleanName = name.trim();
    if (!map.has(cleanName)) {
      const batch = studentDetails.get(cleanName)?.batch || fallbackBatch || 'General';
      map.set(cleanName, { name: cleanName, batch, gold: 0, silver: 0, bronze: 0, wins: 0, ratingGain: 0, total: 0 });
    }
    return map.get(cleanName)!;
  };

  // 1. Manual Tournament Entries (Official external/academy rated tournaments)
  entries.forEach(entry => {
    const name = entry.studentName.trim();
    if (!name) return;
    const item = getOrCreate(name, entry.batch);
    const medal = entry.medal || 'None';
    const wins = Number.parseInt(entry.wins || '0', 10) || 0;
    const ratingChange = Number.parseFloat(entry.ratingChange || '0') || 0;
    if (medal === 'Gold') item.gold++;
    else if (medal === 'Silver') item.silver++;
    else if (medal === 'Bronze') item.bronze++;
    item.wins += wins;
    item.ratingGain += ratingChange;
    item.total += MEDAL_SCORE[medal as keyof typeof MEDAL_SCORE] ?? 0;
  });

  // 2. Weekly Online Tournaments (Lichess & Chess.com synced tournaments)
  const matchedOnline = matchOnlineTournamentResults(weeklyResults, onlinePlayers);
  matchedOnline.forEach(match => {
    const item = getOrCreate(match.studentName);
    const scoreVal = Number.parseFloat(match.score || '0') || 0;
    const estimatedWins = Math.max(0, Math.floor(scoreVal / 2));
    item.wins += estimatedWins;
    if (match.rank === 1) {
      item.gold++;
      item.total += 10;
    } else if (match.rank === 2) {
      item.silver++;
      item.total += 6;
    } else if (match.rank === 3) {
      item.bronze++;
      item.total += 3;
    } else {
      // Participation & tournament score points
      item.total += Math.max(1, Math.round(scoreVal));
    }
  });

  // 3. Mini Tournaments (In-class Swiss system / Round robin sessions)
  miniSessions.forEach(session => {
    if (!session.rounds || session.rounds.length === 0) return;
    try {
      const history = historyFromSession(session);
      const standings = computeStandings(session.participants, history);
      standings.forEach((standing, rankIdx) => {
        const item = getOrCreate(standing.name);
        const winEstimate = Math.max(0, Math.floor(standing.points));
        item.wins += winEstimate;
        // Podiums for completed mini-tournaments
        if (rankIdx === 0 && standing.points > 0) {
          item.gold++;
          item.total += 10;
        } else if (rankIdx === 1 && standing.points > 0) {
          item.silver++;
          item.total += 6;
        } else if (rankIdx === 2 && standing.points > 0) {
          item.bronze++;
          item.total += 3;
        } else {
          item.total += Math.round(standing.points * 2);
        }
      });
    } catch {
      // Continue safely if session is incomplete
    }
  });

  return [...map.values()].sort((a, b) => b.total - a.total || b.gold - a.gold || b.silver - a.silver || b.wins - a.wins);
}

function manualResultItem(entry: TournamentEntry, deleting: number | null, removeEntry: (entry: TournamentEntry) => void): ResultItem {
  return {
    key: `manual-${entry.rowIndex}`,
    sortKey: entry.date || entry.month,
    copyText: entryCopyText(entry),
    entry,
    node: (
      <div className="tournament-result-row">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="badge-navy text-[10px] py-0 px-1.5">{entry.type || 'Official'}</span>
              <p className="font-semibold text-gray-900 text-sm truncate">{entry.studentName}</p>
            </div>
            <p className="text-xs text-navy font-medium truncate mt-0.5">{entry.tournamentName}</p>
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {MEDAL_ICON[entry.medal] && <span className="text-xl" title={entry.medal}>{MEDAL_ICON[entry.medal]}</span>}
            <CopyButton text={entryCopyText(entry)} label={`Copy ${entry.tournamentName} result`} />
            <button type="button" onClick={() => removeEntry(entry)} disabled={deleting === entry.rowIndex}
              aria-label={`Remove ${entry.tournamentName} result`} title="Remove tournament result"
              className="icon-button-danger p-1 text-gray-400 hover:text-red-600">
              <Trash2 size={13} aria-hidden="true" />
            </button>
          </div>
        </div>
        <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-100 text-xs text-gray-500">
          <div className="flex items-center gap-2">
            {entry.position && <span className="font-semibold text-gray-700">Rank: #{entry.position}</span>}
            {(entry.wins || entry.draws || entry.losses) && (
              <span className="font-mono text-[11px] bg-gray-50 px-1.5 py-0.5 rounded border border-gray-200">
                W{entry.wins || 0}/D{entry.draws || 0}/L{entry.losses || 0}
              </span>
            )}
            {entry.ratingChange && (
              <span className={`font-semibold ${Number.parseFloat(entry.ratingChange) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {Number.parseFloat(entry.ratingChange) >= 0 ? '+' : ''}{entry.ratingChange}
              </span>
            )}
          </div>
          <span className="text-gray-400 text-[11px]">{entry.date || entry.month}</span>
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
      <div className="tournament-result-row">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span className="badge-gray text-[10px] py-0 px-1.5">Event Reg</span>
              <p className="font-semibold text-gray-900 text-sm truncate">{registration.studentName}</p>
            </div>
            <p className="text-xs text-navy font-medium truncate mt-0.5">{registration.tournamentName}</p>
          </div>
          <CopyButton text={copyText} label={`Copy ${registration.studentName}'s result`} />
        </div>
        <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-100 text-xs text-gray-500">
          <span className={`text-[11px] font-medium ${registration.feePaid ? 'text-green-600' : 'text-amber-600'}`}>
            Fee: {registration.feePaid ? 'Paid' : 'Pending'}
          </span>
          <span className="text-gray-400 text-[11px]">{dateLabel}</span>
        </div>
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
      <div className="tournament-result-row">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span className="badge-green text-[10px] py-0 px-1.5">{sourceLabel}</span>
              <p className="font-semibold text-gray-900 text-sm truncate">{match.studentName}</p>
            </div>
            <p className="text-xs text-navy font-medium truncate mt-0.5">{tournament.name}</p>
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {match.rank <= 3 && <span className="text-xl">{['🥇', '🥈', '🥉'][match.rank - 1]}</span>}
            <CopyButton text={copyText} label={`Copy ${match.studentName}'s result`} />
          </div>
        </div>
        <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-100 text-xs text-gray-500">
          <span className="font-semibold text-gray-700 text-xs">
            {ordinal(match.rank)} Place {match.score && <span className="text-navy">({match.score} pts)</span>}
          </span>
          <span className="text-gray-400 text-[11px]">{dateLabel}</span>
        </div>
      </div>
    ),
  };
}

function miniTournamentResultItem(session: MiniTournamentSession): ResultItem[] {
  if (!session.rounds || session.rounds.length === 0) return [];
  try {
    const history = historyFromSession(session);
    const standings = computeStandings(session.participants, history);
    const dateLabel = session.date || 'In-class';
    return standings.map((st, idx) => {
      const copyText = `• [Mini Tournament] ${st.name} – ${session.name} (${dateLabel}) · Place ${ordinal(idx + 1)} · ${st.points} pts`;
      return {
        key: `mini-${session.sessionId}-${st.name}`,
        sortKey: session.date || '',
        copyText,
        entry: null,
        node: (
          <div className="tournament-result-row">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="badge-purple text-[10px] py-0 px-1.5">Mini Tourney</span>
                  <p className="font-semibold text-gray-900 text-sm truncate">{st.name}</p>
                </div>
                <p className="text-xs text-navy font-medium truncate mt-0.5">{session.name}</p>
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                {idx < 3 && <span className="text-xl">{['🥇', '🥈', '🥉'][idx]}</span>}
                <CopyButton text={copyText} label={`Copy ${st.name}'s result`} />
              </div>
            </div>
            <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-100 text-xs text-gray-500">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-gray-700 text-xs">{ordinal(idx + 1)} Place ({st.points} pts)</span>
                <span className="font-mono text-[11px] bg-gray-50 px-1.5 py-0.5 rounded border border-gray-200">
                  {st.games} games played
                </span>
              </div>
              <span className="text-gray-400 text-[11px]">{dateLabel}</span>
            </div>
          </div>
        ),
      };
    });
  } catch {
    return [];
  }
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
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState<'results' | 'leaderboard'>(() => searchParams.get('tab') === 'leaderboard' ? 'leaderboard' : 'results');
  const [search, setSearch] = useState('');
  const [resultSource, setResultSource] = useState<'all' | 'offline' | 'online' | 'mini'>('all');
  const [resultSort, setResultSort] = useState<'newest' | 'oldest' | 'student'>('newest');
  const [leaderboardSort, setLeaderboardSort] = useState<'points' | 'wins' | 'rating' | 'student'>('points');
  const [leaderboardSearch, setLeaderboardSearch] = useState('');
  const [leaderboardBatch, setLeaderboardBatch] = useState('all');
  const [entries, setEntries] = useState<TournamentEntry[]>([]);
  const [students, setStudents] = useState<string[]>([]);
  const [onlinePlayers, setOnlinePlayers] = useState<OnlinePlayerDirectory[]>([]);
  const [registrations, setRegistrations] = useState<TournamentRegistration[]>([]);
  const [weeklyResults, setWeeklyResults] = useState<SavedWeeklyOnlineTournament[]>([]);
  const [miniSessions, setMiniSessions] = useState<MiniTournamentSession[]>([]);
  const [studentDetails, setStudentDetails] = useState<Map<string, { batch: string; level: string }>>(new Map());
  const [showInfoBanner, setShowInfoBanner] = useState(false);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ ...EMPTY_F });
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<number | null>(null);

  const load = async () => {
    if (!token) return;
    setLoading(true); setError('');
    try {
      const [tRows, sRows, registrationRows, weeklyRows, loadedMiniSessions] = await Promise.all([
        readSheet(token, SHEET_ID, `'${TABS.TOURNAMENTS}'!A:U`),
        readSheet(token, SHEET_ID, `'${TABS.STUDENTS}'!A:AG`),
        readSheet(token, SHEET_ID, `'${TABS.TOURNAMENT_REGISTRATIONS}'!A:J`).catch(() => []),
        readSheet(token, SHEET_ID, `'${TABS.WEEKLY_ONLINE_TOURNAMENTS}'!A:N`).catch(() => []),
        loadMiniTournamentSessions(token, SHEET_ID).catch(() => []),
      ]);
      setEntries(tRows.slice(1).map((row, index) => rowToEntry(row, index)).filter(entry => entry.studentName.trim()));
      setStudents(uniqueStudentNames(sRows, true));
      setStudentDetails(new Map(sRows.slice(1).filter(row => row[0]).map(row => [
        row[0], { batch: row[5] ?? '', level: row[6] ?? '' },
      ])));
      setOnlinePlayers(sRows.slice(1).filter(row => row[0]).map(row => ({
        name: row[0], chessComUsername: row[30] ?? '', lichessUsername: row[31] ?? '',
      })));
      setRegistrations(registrationRows.slice(1).map((row, index) => rowToRegistration(row, index + 2)).filter(item => item.playing));
      setWeeklyResults(weeklyRows.slice(1).map((row, index) => rowToSavedWeeklyOnlineTournament(row, index + 2)).filter(item => item.name));
      setMiniSessions(loadedMiniSessions);
    } catch (e: any) {
      if (e.message === 'TOKEN_EXPIRED') { logout(); return; }
      setError(e.message);
    } finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, [token]);

  const sync = () => {
    clearSheetReadCache(SHEET_ID);
    setSyncing(true);
    void load().finally(() => setSyncing(false));
  };

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

  const leaderboard = useMemo(() => {
    const sorted = computeLeaderboard(entries, weeklyResults, onlinePlayers, miniSessions, studentDetails);
    return sorted.sort((left, right) => {
      if (leaderboardSort === 'student') return left.name.localeCompare(right.name);
      if (leaderboardSort === 'wins') return right.wins - left.wins || left.name.localeCompare(right.name);
      if (leaderboardSort === 'rating') return right.ratingGain - left.ratingGain || left.name.localeCompare(right.name);
      return right.total - left.total || right.gold - left.gold || left.name.localeCompare(right.name);
    });
  }, [entries, weeklyResults, onlinePlayers, miniSessions, studentDetails, leaderboardSort]);

  const leaderboardBatches = useMemo(() => Array.from(new Set(leaderboard.map(item => item.batch).filter(Boolean))).sort((left, right) => left.localeCompare(right)), [leaderboard]);
  const visibleLeaderboard = leaderboard.filter(item => {
    const query = leaderboardSearch.trim().toLowerCase();
    return (leaderboardBatch === 'all' || item.batch === leaderboardBatch)
      && (!query || `${item.name} ${item.batch}`.toLowerCase().includes(query));
  });

  if (loading) return <Layout title="Tournaments" showBack><PageSkeleton /></Layout>;

  const manualOffline = entries.filter(e => e.type !== 'Online').map(entry => manualResultItem(entry, deleting, removeEntry));
  const manualOnline = entries.filter(e => e.type === 'Online').map(entry => manualResultItem(entry, deleting, removeEntry));
  const autoOffline = registrations.map(autoOfflineItem);
  const autoOnline = matchOnlineTournamentResults(weeklyResults, onlinePlayers).map(autoOnlineItem);
  const miniResults = miniSessions.flatMap(miniTournamentResultItem);

  const sortResults = (items: ResultItem[]) => [...items].sort((left, right) => {
    if (resultSort === 'student') return (left.entry?.studentName ?? left.copyText).localeCompare(right.entry?.studentName ?? right.copyText);
    const direction = resultSort === 'newest' ? -1 : 1;
    return direction * left.sortKey.localeCompare(right.sortKey);
  });

  const offlineItems = sortResults([...manualOffline, ...autoOffline]);
  const onlineItems = sortResults([...manualOnline, ...autoOnline]);
  const miniItems = sortResults(miniResults);

  const q = search.trim().toLowerCase();
  const filterList = (items: ResultItem[]) => q ? items.filter(i => i.copyText.toLowerCase().includes(q)) : items;

  const visibleOffline = (resultSource === 'all' || resultSource === 'offline') ? filterList(offlineItems) : [];
  const visibleOnline = (resultSource === 'all' || resultSource === 'online') ? filterList(onlineItems) : [];
  const visibleMini = (resultSource === 'all' || resultSource === 'mini') ? filterList(miniItems) : [];

  const totalResultsCount = offlineItems.length + onlineItems.length + miniItems.length;

  const handleTabChange = (tab: 'results' | 'leaderboard') => {
    setActiveTab(tab);
    setSearchParams(tab === 'leaderboard' ? { tab: 'leaderboard' } : {});
  };

  return (
    <Layout title="Tournaments & Leaderboard" showBack action={
      <>
        <button type="button" onClick={() => setShowInfoBanner(prev => !prev)} aria-label="Toggle purpose and guide" title="About this section"
          className={`icon-button ${showInfoBanner ? 'bg-navy text-white' : ''}`}><Info size={16} aria-hidden="true" /></button>
        <button type="button" onClick={sync} disabled={syncing} aria-label="Sync latest changes" title="Sync latest changes"
          className="icon-button"><RefreshCw size={16} className={syncing ? 'animate-spin' : ''} aria-hidden="true" /></button>
        <button type="button" onClick={() => setShowAdd(true)} aria-label="Add tournament result" className="header-action-add"><Plus size={16} aria-hidden="true" /> Add</button>
      </>
    }>
      <div className="p-4 space-y-4">
        {error && <p className="text-red-600 text-sm">{error}</p>}

        {/* Informational banner / Purpose Explainer */}
        {showInfoBanner && (
          <div className="tournament-info-panel">
            <div className="flex items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-1.5"><Award size={15} className="shrink-0 text-amber-600" /><span className="truncate font-bold text-navy">How this page works</span></div>
              <button type="button" onClick={() => setShowInfoBanner(false)} className="icon-button h-7 w-7 text-gray-400" aria-label="Close guide">×</button>
            </div>
            <div className="mt-2 grid gap-1.5 text-[11px] text-slate-600 sm:grid-cols-3">
              <p><strong className="text-slate-800">Official:</strong> Results entered by the coach.</p>
              <p><strong className="text-slate-800">Online:</strong> Matched from Chess.com and Lichess.</p>
              <p><strong className="text-slate-800">Mini:</strong> In-class games from academy sessions.</p>
            </div>
            <p className="mt-2 border-t border-blue-200/70 pt-2 text-[10px] text-slate-500">Leaderboard: 10 points for 1st, 6 for 2nd, 3 for 3rd, plus game points.</p>
          </div>
        )}

        {/* Tab switcher */}
        <div className="surface-card flex p-1 gap-1">
          <button type="button" onClick={() => handleTabChange('results')}
            className={`flex-1 py-2 rounded-lg text-xs font-bold transition-colors flex items-center justify-center gap-1.5
              ${activeTab === 'results' ? 'bg-navy text-white shadow-sm' : 'text-gray-500 hover:text-gray-900'}`}>
            <Trophy size={15} /> Results ({totalResultsCount})
          </button>
          <button type="button" onClick={() => handleTabChange('leaderboard')}
            className={`flex-1 py-2 rounded-lg text-xs font-bold transition-colors flex items-center justify-center gap-1.5
              ${activeTab === 'leaderboard' ? 'bg-navy text-white shadow-sm' : 'text-gray-500 hover:text-gray-900'}`}>
            <Medal size={15} /> Leaderboard ({leaderboard.length})
          </button>
        </div>

        {activeTab === 'results' && (
          <div className="space-y-4">
            {/* Search & Filters */}
            <label className="relative block">
              <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search by student, tournament, or place…" aria-label="Search tournament results"
                className="input input-with-icon" />
            </label>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              <select value={resultSource} onChange={e => setResultSource(e.target.value as typeof resultSource)} className="input text-xs" aria-label="Filter tournament result source">
                <option value="all">All Sources ({totalResultsCount})</option>
                <option value="offline">External & Offline ({offlineItems.length})</option>
                <option value="online">Online Tournaments ({onlineItems.length})</option>
                <option value="mini">In-Class Mini Tournaments ({miniItems.length})</option>
              </select>
              <select value={resultSort} onChange={e => setResultSort(e.target.value as typeof resultSort)} className="input text-xs" aria-label="Sort tournament results">
                <option value="newest">Newest first</option>
                <option value="oldest">Oldest first</option>
                <option value="student">Student A-Z</option>
              </select>
            </div>

            {visibleOffline.length === 0 && visibleOnline.length === 0 && visibleMini.length === 0 && (
              <div className="text-center py-12 text-gray-400">
                <p className="text-4xl mb-2">🏆</p>
                <p>{q ? 'No matching tournament results found.' : 'No tournament results recorded yet.'}</p>
              </div>
            )}

            {([
              ['Official & Offline Results', 'badge-blue', visibleOffline],
              ['Online Tournaments (Lichess / Chess.com)', 'badge-green', visibleOnline],
              ['In-Class Mini Tournaments', 'badge-purple', visibleMini],
            ] as const).map(([title, badgeClass, group]) =>
              group.length > 0 && (
                <section key={title} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h2 className="section-label flex items-center gap-2"><span className={badgeClass}>{group.length}</span>{title}</h2>
                    <CopyButton text={groupCopyText(title, group)} label={`Copy ${title}`} />
                  </div>
                  {title === 'In-Class Mini Tournaments' ? (
                    <div className="grid gap-2">
                      {Array.from(new Set(group.map(item => item.key.split('-').slice(0, 2).join('-')))).map(sessionKey => {
                        const sessionItems = group.filter(item => item.key.startsWith(`${sessionKey}-`));
                        const firstItem = sessionItems[0];
                        const sessionName = firstItem.copyText.split(' – ')[1]?.split(' (')[0] || 'Mini tournament';
                        const sessionDate = firstItem.sortKey || 'In-class';
                        return (
                          <details key={sessionKey} className="tournament-collapsible" open={sessionItems.length <= 6}>
                            <summary className="tournament-collapsible-summary">
                              <span className="min-w-0 flex-1"><span className="block truncate font-semibold text-gray-900">{sessionName}</span><span className="text-[10px] text-gray-500">{sessionDate} · {sessionItems.length} players</span></span>
                              <span className="badge-purple shrink-0">Mini</span><ChevronDown size={15} className="tournament-collapsible-chevron shrink-0" />
                            </summary>
                            <div className="grid gap-1.5 border-t border-gray-100 p-2">{sessionItems.map(item => <div key={item.key}>{item.node}</div>)}</div>
                          </details>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="grid gap-1.5">{group.map(item => <div key={item.key}>{item.node}</div>)}</div>
                  )}
                </section>
              )
            )}
          </div>
        )}

        {activeTab === 'leaderboard' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="section-label">Academy Rankings</p>
                <h2 className="text-sm font-bold text-navy">All-Time Student Standings</h2>
              </div>
              {leaderboard.length > 0 && <CopyButton text={leaderboardCopyText(leaderboard)} label="Copy Leaderboard for WhatsApp" />}
            </div>

            <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
              <label className="relative">
                <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input value={leaderboardSearch} onChange={e => setLeaderboardSearch(e.target.value)} className="input input-with-icon text-xs" placeholder="Find a student" aria-label="Search leaderboard" />
              </label>
              <select value={leaderboardBatch} onChange={e => setLeaderboardBatch(e.target.value)} className="input max-w-[150px] text-xs" aria-label="Filter leaderboard by batch">
                <option value="all">All batches</option>
                {leaderboardBatches.map(batch => <option key={batch} value={batch}>{batch}</option>)}
              </select>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-gray-400">Showing {visibleLeaderboard.length} of {leaderboard.length} · medals + wins + tournament points</span>
              <select value={leaderboardSort} onChange={e => setLeaderboardSort(e.target.value as typeof leaderboardSort)} className="input max-w-[150px] text-xs" aria-label="Sort tournament leaderboard">
                <option value="points">Sort by points</option>
                <option value="wins">Sort by wins</option>
                <option value="rating">Sort by rating gain</option>
                <option value="student">Student A-Z</option>
              </select>
            </div>

            {visibleLeaderboard.length === 0 && (
              <div className="text-center py-12 text-gray-400">
                <p className="text-4xl mb-2">🏅</p>
                <p>No tournament medals or scores recorded yet.</p>
              </div>
            )}

            <div className="space-y-2">
              {visibleLeaderboard.map((e, i) => (
                <div key={e.name} className="tournament-leaderboard-row">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs flex-shrink-0 ${leaderboardBadgeClass(i)}`}>
                    {i < 3 ? ['🥇', '🥈', '🥉'][i] : i + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-sm text-gray-900 truncate">{e.name}</p>
                    <p className="text-xs text-gray-500 truncate">{e.batch || 'General Batch'}</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className="flex gap-1.5 text-xs justify-end font-semibold">
                      {e.gold > 0 && <span title={`${e.gold} Gold`}>🥇{e.gold}</span>}
                      {e.silver > 0 && <span title={`${e.silver} Silver`}>🥈{e.silver}</span>}
                      {e.bronze > 0 && <span title={`${e.bronze} Bronze`}>🥉{e.bronze}</span>}
                    </div>
                    <p className="text-xs text-gray-500 font-medium mt-0.5">
                      <strong className="text-navy font-bold">{e.total}</strong> pts · {e.wins} win{e.wins === 1 ? '' : 's'}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
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
            <div className="mt-5 flex items-center justify-between gap-3">
              <button type="button" onClick={() => setShowAdd(false)} disabled={saving} className="btn-secondary">
                Cancel
              </button>
              <button type="button" onClick={handleAdd} disabled={saving || !form.studentName || !form.tournamentName}
                className="primary-action">
                {saving && <span className="button-spinner" aria-hidden="true"/>}
                {saving ? 'Saving result…' : 'Save Result'}
              </button>
            </div>
          </dialog>
        </div>
      )}
    </Layout>
  );
}

function Field({ label, children }: Readonly<{ label: string; children: React.ReactNode }>) {
  return <div><label className="text-xs font-medium text-gray-500 mb-1 block">{label}</label>{children}</div>;
}

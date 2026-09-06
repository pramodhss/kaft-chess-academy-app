import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertCircle, BookOpen, CalendarCheck, CheckCircle2, ChevronRight, ClipboardCheck, Clock3, FileWarning, MapPin, MessageCircle, RefreshCw, SlidersHorizontal, Trophy, UserRound, Users, Wallet } from 'lucide-react';
import { Layout } from '../components/Layout';
import { PageSkeleton } from '../components/Skeleton';
import { useAuth } from '../context/AuthContext';
import { clearSheetReadCache, readSheet } from '../lib/sheets';
import { parseSheetNumber } from '../lib/values';
import { normalizeFeeMonth } from '../lib/feeRules';
import { normalizeTimetableRows, upcomingClasses } from '../lib/timetable';
import { uniqueStudentNames } from '../lib/studentRoster';
import { useCoachName } from '../hooks/useCoachName';
import { SHEET_ID, TABS } from '../config';

const MONTHS_S = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const DAYS_S   = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

function nextWeekendDate(): Date {
  const d = new Date(); d.setHours(0,0,0,0);
  while (d.getDay() !== 6 && d.getDay() !== 0) d.setDate(d.getDate() + 1);
  return d;
}

function parseStudentDate(value: string): Date | null {
  const trimmed = value.trim();
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(trimmed);
  const local = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(trimmed);
  let parts: number[] | null = null;
  if (iso) parts = [Number(iso[1]), Number(iso[2]), Number(iso[3])];
  else if (local) parts = [Number(local[3]), Number(local[2]), Number(local[1])];
  if (!parts) return null;
  const [year, month, day] = parts;
  const parsed = new Date(year, month - 1, day);
  return parsed.getFullYear() === year && parsed.getMonth() === month - 1 && parsed.getDate() === day ? parsed : null;
}

function nonNegativeSheetNumber(value: string): number {
  const parsed = parseSheetNumber(value);
  return Number.isFinite(parsed) ? Math.max(parsed, 0) : 0;
}

interface DashboardAction {
  id: string;
  title: string;
  detail: string;
  count: number;
  tone: 'amber' | 'red' | 'blue';
  Icon: typeof AlertCircle;
  to: string;
}

function upcomingBirthdays(studentRows: string[][]): { name: string; dob: string; daysLeft: number }[] {
  const today = new Date(); today.setHours(0,0,0,0);
  const result: { name: string; dob: string; daysLeft: number }[] = [];
  studentRows.slice(1).forEach(r => {
    const name = r[0]?.trim(); const dobStr = r[1]?.trim();
    if (!name || !dobStr) return;
    const dob = parseStudentDate(dobStr);
    if (!dob) return;
    const thisYear = new Date(today.getFullYear(), dob.getMonth(), dob.getDate());
    if (thisYear < today) thisYear.setFullYear(today.getFullYear() + 1);
    const daysLeft = Math.round((thisYear.getTime() - today.getTime()) / 86400000);
    if (daysLeft <= 7) result.push({ name, dob: dobStr, daysLeft });
  });
  return result.sort((a, b) => a.daysLeft - b.daysLeft);
}

const QUICK_LINKS = [
  { to: '/students',   Icon: Users, label: 'Students' },
  { to: '/attendance', Icon: CalendarCheck, label: 'Attendance' },
  { to: '/fees',       Icon: Wallet, label: 'Fees' },
  { to: '/upcoming',   Icon: Trophy, label: 'Tournaments' },
  { to: '/resources',  Icon: BookOpen, label: 'Resources' },
  { to: '/more',       Icon: SlidersHorizontal, label: 'More' },
];

const PRIMARY_ACTIONS = [
  { to: '/attendance', Icon: CalendarCheck, label: 'Mark attendance', tone: 'blue' },
  { to: '/fees', Icon: Wallet, label: 'Collect fee', tone: 'green' },
  { to: '/students', Icon: Users, label: 'Add student', tone: 'gold' },
] as const;

export function Dashboard() {
  const { token, logout } = useAuth();
  const navigate = useNavigate();
  const { coachName } = useCoachName();
  const [stats, setStats] = useState<{ total: number; active: number; collected: number; outstanding: number } | null>(null);
  const [birthdays, setBirthdays] = useState<{ name: string; dob: string; daysLeft: number }[]>([]);
  const [classes, setClasses] = useState<ReturnType<typeof upcomingClasses>>([]);
  const [overdueCount, setOverdueCount] = useState(0);
  const [attendanceRiskCount, setAttendanceRiskCount] = useState(0);
  const [feeIssueCount, setFeeIssueCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [lastSynced, setLastSynced] = useState<Date | null>(null);
  const [error, setError] = useState('');
  const nextSession = nextWeekendDate();

  const load = async (isBackgroundSync = false) => {
    if (!token) return;
    if (isBackgroundSync) setSyncing(true); else setLoading(true);
    setError('');
    try {
      const [studentRows, feeRows, timetableRows, attendanceRows] = await Promise.all([
        readSheet(token, SHEET_ID, `'${TABS.STUDENTS}'!A:AG`),
        readSheet(token, SHEET_ID, `'${TABS.FEES}'!A:N`),
        readSheet(token, SHEET_ID, `'${TABS.TIMETABLE}'!A:M`).catch(() => []),
        readSheet(token, SHEET_ID, `'${TABS.MONTHLY_ATT}'!A:E`).catch(() => []),
      ]);
      const allStudentNames = uniqueStudentNames(studentRows);
      const activeStudentNames = uniqueStudentNames(studentRows, true);
      const active = activeStudentNames.length;
      const now = new Date();
      const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      let collected = 0, outstanding = 0;
      feeRows.slice(1).forEach(r => {
        if (normalizeFeeMonth(r[3] ?? '') !== currentMonth) return;
        collected   += nonNegativeSheetNumber(r[6] ?? '');
        outstanding += nonNegativeSheetNumber(r[7] ?? '');
      });
      setStats({ total: allStudentNames.length, active, collected, outstanding });
      setBirthdays(upcomingBirthdays(studentRows));
      setClasses(upcomingClasses(normalizeTimetableRows(timetableRows).entries).slice(0, 3));
      const overdueMap = new Map<string, number>();
      feeRows.slice(1).forEach(r => {
        if (normalizeFeeMonth(r[3] ?? '') !== currentMonth) return;
        const name = (r[1] ?? '').trim();
        const balance = nonNegativeSheetNumber(r[7] ?? '');
        if (name && balance > 0) overdueMap.set(name, (overdueMap.get(name) ?? 0) + balance);
      });
      setOverdueCount(overdueMap.size);
      const activeNames = new Set(activeStudentNames.map(name => name.toLowerCase()));
      const attendanceRisk = new Set<string>();
      attendanceRows.slice(1).forEach(row => {
        const name = (row[0] ?? '').trim().toLowerCase();
        const scheduled = Number.parseInt(row[3] ?? '0', 10) || 0;
        const attended = Number.parseInt(row[2] ?? '0', 10) || 0;
        if (name && activeNames.has(name) && scheduled >= 2 && attended === 0) attendanceRisk.add(name);
      });
      setAttendanceRiskCount(attendanceRisk.size);
      const feeKeys = new Set<string>();
      let feeIssues = 0;
      feeRows.slice(1).forEach(row => {
        const name = (row[1] ?? '').trim().toLowerCase();
        const month = normalizeFeeMonth(row[3] ?? '');
        if (!name || !month) return;
        const key = `${name}|${month}|${(row[4] ?? 'tuition').trim().toLowerCase()}`;
        if (feeKeys.has(key)) feeIssues += 1;
        feeKeys.add(key);
        const due = nonNegativeSheetNumber(row[5] ?? '');
        const paid = nonNegativeSheetNumber(row[6] ?? '');
        const status = (row[11] ?? '').trim().toLowerCase();
        if (paid > due && status !== 'waived') feeIssues += 1;
      });
      setFeeIssueCount(feeIssues);
      setLastSynced(new Date());
    } catch (e: any) {
      if (e.message === 'TOKEN_EXPIRED') { logout(); return; }
      setError(e.message);
    } finally { setLoading(false); setSyncing(false); }
  };

  useEffect(() => { void load(); }, [token]);

  // Sheets reads are cached for a few minutes for performance, so other coaches'
  // edits may not appear immediately — this forces a fresh fetch on demand.
  const sync = () => { clearSheetReadCache(SHEET_ID); void load(true); };

  let content: React.ReactNode;
  if (loading) {
    content = <PageSkeleton />;
  } else if (error) {
    content = <p className="p-4 text-red-600 text-sm">{error}</p>;
  } else if (stats) {
    const nextDate = classes[0]?.date ?? nextSession;
    const today = new Date(); today.setHours(0,0,0,0);
    const myClassesToday = classes.filter(({ entry, date }) => {
      const d = new Date(date); d.setHours(0,0,0,0);
      return d.getTime() === today.getTime() && coachName && entry.coach.toLowerCase().includes(coachName.split(' ')[0]?.toLowerCase() ?? '');
    });
    const actions: DashboardAction[] = [
      ...(overdueCount > 0 ? [{ id: 'fees', title: 'Send fee reminders', detail: 'Accounts still have a balance this month', count: overdueCount, tone: 'amber' as const, Icon: MessageCircle, to: '/operations' }] : []),
      ...(attendanceRiskCount > 0 ? [{ id: 'attendance', title: 'Review attendance risk', detail: 'Active students have missed every recorded class', count: attendanceRiskCount, tone: 'red' as const, Icon: ClipboardCheck, to: '/attendance' }] : []),
      ...(feeIssueCount > 0 ? [{ id: 'quality', title: 'Resolve fee data issues', detail: 'Duplicate or inconsistent fee records need review', count: feeIssueCount, tone: 'blue' as const, Icon: FileWarning, to: '/operations' }] : []),
    ];
    content = (
      <div className="dashboard-screen space-y-5 p-3 sm:p-4 md:p-6">
        <section className="dashboard-intro">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="section-label">{new Date().toLocaleDateString('en-IN', { weekday: 'long' })} · KAFT Chess Academy</p>
              <h2 className="mt-1 text-xl font-bold tracking-tight text-gray-900 dark:text-white sm:text-2xl">Good morning{coachName ? `, ${coachName.split(' ')[0]}` : ''}</h2>
            </div>
            <button type="button" onClick={sync} disabled={syncing} className="dashboard-live-status inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-semibold text-xs active:scale-95 transition-all shadow-sm"
              aria-label="Sync latest changes from other coaches"
              title={lastSynced ? `Last synced ${lastSynced.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}` : 'Sync now'}>
              <span className={`w-2 h-2 rounded-full ${syncing ? 'bg-amber-500 animate-ping' : 'bg-emerald-500'}`} />
              <RefreshCw size={12} className={syncing ? 'animate-spin' : ''} aria-hidden="true" />
              <span>{syncing ? 'Syncing…' : 'Sync'}</span>
            </button>
          </div>
        </section>
        {/* Stat cards */}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatCard label="Students" value={stats.active} sub={`${stats.total - stats.active} inactive`} tone="blue" icon={<Users size={19} />} />
          <StatCard label="Next class" value={`${DAYS_S[nextDate.getDay()]} ${nextDate.getDate()}`} sub={`${MONTHS_S[nextDate.getMonth()]} session`} tone="green" icon={<CalendarCheck size={19} />} />
          <StatCard label="Fees collected" value={`₹${stats.collected.toLocaleString('en-IN')}`} sub="This month" tone="gold" icon={<Trophy size={19} />} />
          <StatCard label="Fee pending" value={`₹${stats.outstanding.toLocaleString('en-IN')}`} sub={`${overdueCount} accounts`} tone="red" icon={<AlertCircle size={19} />} />
        </div>

        <section className="dashboard-primary-actions"><h2 className="section-label">Quick actions</h2><div className="mt-2 grid grid-cols-3 gap-2">{PRIMARY_ACTIONS.map(({ to, Icon, label, tone }) => <button key={to} type="button" onClick={() => navigate(to)} className={`dashboard-action dashboard-action-${tone}`}><span><Icon size={18} /></span><strong>{label}</strong></button>)}</div></section>

        <section className="surface-card overflow-hidden">
          <div className="flex items-center justify-between gap-3 border-b border-gray-100 p-4 dark:border-gray-800">
            <div><h2 className="section-label">Coach focus</h2><p className="mt-1 text-xs text-gray-500">Daily follow-ups from the latest academy records</p></div>
            {actions.length === 0 ? <CheckCircle2 size={20} className="text-green-600" aria-label="No follow-ups" /> : <span className="badge-amber">{actions.length} follow-up{actions.length === 1 ? '' : 's'}</span>}
          </div>
          {actions.length === 0 ? <div className="flex items-center gap-3 p-4"><span className="icon-tile bg-green-50 text-green-700 dark:bg-green-950/30 dark:text-green-400"><CheckCircle2 size={18} /></span><p className="text-sm text-gray-600 dark:text-gray-300">No urgent follow-ups found. Keep the board moving.</p></div> : <div className="divide-y divide-gray-100 dark:divide-gray-800">{actions.map(action => <button key={action.id} type="button" onClick={() => navigate(action.to)} className="card-btn flex w-full items-center gap-3 p-4 text-left"><span className={`icon-tile ${action.tone === 'red' ? 'bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-400' : action.tone === 'blue' ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-400' : 'bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400'}`}><action.Icon size={17} /></span><span className="min-w-0 flex-1"><strong className="block text-sm text-gray-900 dark:text-white">{action.title}</strong><span className="mt-0.5 block text-xs text-gray-500">{action.detail}</span></span><span className="flex items-center gap-1.5"><span className="text-sm font-bold text-gray-900 dark:text-white">{action.count}</span><ChevronRight size={16} className="text-gray-400" /></span></button>)}</div>}
        </section>

        {birthdays.length > 0 && (
          <div className="rounded-lg border border-pink-200 bg-pink-50 p-4">
            <p className="mb-2 text-sm font-semibold text-pink-800">Upcoming Birthdays</p>
            {birthdays.map(b => {
              let timing = `in ${b.daysLeft} days`;
              if (b.daysLeft === 0) timing = 'Today';
              else if (b.daysLeft === 1) timing = 'in 1 day';
              return (
                <div key={b.name} className="flex justify-between items-center py-1">
                  <span className="text-sm text-pink-900 font-medium">{b.name}</span>
                  <span className="text-xs text-pink-600 font-semibold">{timing}</span>
                </div>
              );
            })}
          </div>
        )}

        {myClassesToday.length > 0 && <section className="space-y-2">
          <h2 className="section-label">My Classes Today</h2>
          <div className="grid gap-2 md:grid-cols-3">{myClassesToday.map(({ entry, date }) => <article key={`${entry.rowIndex}-${date.toISOString()}`} className="surface-card p-3 border-l-[3px] border-l-chess-blue">
            <div className="flex items-start justify-between gap-2"><div><h3 className="text-sm font-semibold text-gray-900">{entry.batch}</h3><p className="text-xs font-medium text-chess-blue">Today</p></div><span className="badge-green">{entry.status || 'Active'}</span></div>
            <div className="mt-2 space-y-1 text-xs text-gray-600"><p className="flex items-center gap-1.5"><Clock3 size={13} />{entry.start} – {entry.end}</p>{entry.room && <p className="flex items-center gap-1.5"><MapPin size={13} />{entry.room}</p>}</div>
          </article>)}</div>
        </section>}

        {overdueCount > 0 && <button type="button" onClick={() => navigate('/operations')} className="card-btn surface-card flex w-full items-center gap-3 p-4 text-left">
          <span className="flex h-10 w-10 flex-none items-center justify-center rounded-xl bg-amber-100 text-amber-700"><AlertCircle size={18} /></span>
          <div className="flex-1 min-w-0">
            <strong className="block text-sm text-gray-900">{overdueCount} student{overdueCount !== 1 ? 's' : ''} with pending fees</strong>
            <span className="text-xs text-gray-500">Open Operations › Reminders to send WhatsApp alerts</span>
          </div>
          <ChevronRight size={16} className="hover-arrow text-gray-400" />
        </button>}

        {classes.length > 0 && <section className="dashboard-sessions space-y-2">
          <div className="flex items-center justify-between"><h2 className="section-label">Next sessions</h2><button type="button" onClick={() => navigate('/timetable')} className="flex items-center gap-1 text-xs font-semibold text-chess-blue">View all <ChevronRight size={13} /></button></div>
          <div className="grid gap-2 md:grid-cols-3">{classes.map(({ entry, date }) => <article key={`${entry.rowIndex}-${date.toISOString()}`} className="surface-card p-3">
            <div className="flex items-start justify-between gap-2"><div><h3 className="text-sm font-semibold text-gray-900">{entry.batch}</h3><p className="text-xs font-medium text-chess-blue">{date.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}</p></div><span className="badge-green">{entry.status || 'Active'}</span></div>
            <div className="mt-2 space-y-1 text-xs text-gray-600"><p className="flex items-center gap-1.5"><Clock3 size={13} />{entry.start} - {entry.end}</p><p className="flex items-center gap-1.5"><UserRound size={13} />{entry.coach}</p>{entry.room && <p className="flex items-center gap-1.5"><MapPin size={13} />{entry.room}</p>}</div>
          </article>)}</div>
        </section>}

        <button type="button" onClick={() => navigate('/operations')} className="card-btn surface-card flex w-full items-center justify-between border-l-[3px] border-l-chess-blue p-4 text-left">
          <span><strong className="block text-sm text-gray-900">Operations & Data</strong><span className="text-xs text-gray-500">Follow-ups, data quality and exports</span></span>
          <ChevronRight size={17} className="text-chess-blue" />
        </button>

        <h2 className="section-label">Quick Access</h2>
        <div className="grid grid-cols-3 gap-2.5 md:grid-cols-6">
          {QUICK_LINKS.map(({ to, Icon, label }) => (
            <button type="button" key={to} onClick={() => navigate(to)}
              className="quick-link flex flex-col items-center justify-center gap-2 rounded-xl bg-white p-3 text-xs font-semibold text-gray-700 shadow-sm transition-all hover:-translate-y-0.5">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-navy/5">
                <Icon size={22} strokeWidth={1.7} className="text-navy" aria-hidden="true" />
              </span>
              <span className="leading-tight text-center">{label}</span>
            </button>
          ))}
        </div>
      </div>
    );
  } else {
    content = null;
  }

  return (
    <Layout title="Chess Academy" hideMobileHeader>
      {content}
    </Layout>
  );
}

const STAT_TONE_GRADIENTS: Record<'blue' | 'gold' | 'green' | 'red', string> = {
  blue: 'stat-card-blue bg-gradient-to-br from-blue-500/[0.08] via-indigo-500/[0.03] to-transparent border-blue-500/20 text-blue-900 dark:text-blue-100',
  green: 'stat-card-green bg-gradient-to-br from-emerald-500/[0.08] via-teal-500/[0.03] to-transparent border-emerald-500/20 text-emerald-900 dark:text-emerald-100',
  gold: 'stat-card-gold bg-gradient-to-br from-amber-500/[0.12] via-yellow-500/[0.04] to-transparent border-amber-500/25 text-amber-900 dark:text-amber-100',
  red: 'stat-card-red bg-gradient-to-br from-rose-500/[0.08] via-pink-500/[0.03] to-transparent border-rose-500/20 text-rose-900 dark:text-rose-100',
};

function StatCard({ label, value, sub, tone, icon }: Readonly<{ label: string; value: string | number; sub?: string; tone: 'blue' | 'gold' | 'green' | 'red'; icon?: React.ReactNode }>) {
  return (
    <div className={`stat-card ${STAT_TONE_GRADIENTS[tone]} rounded-2xl p-3.5 sm:p-4 transition-all duration-200 active:scale-[0.98]`}>
      <div className="flex items-start justify-between gap-2">
        <p className="section-label">{label}</p>
        {icon && <span className="stat-card-icon shadow-xs">{icon}</span>}
      </div>
      <p className="mt-2 text-xl font-extrabold tracking-tight leading-tight text-gray-900 dark:text-white sm:text-2xl">{value}</p>
      {sub && <p className="mt-1 text-xs text-gray-500 dark:text-gray-400 font-medium">{sub}</p>}
    </div>
  );
}

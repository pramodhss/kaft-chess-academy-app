import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertCircle, BookOpen, CalendarCheck, ChevronRight, Clock3, MapPin, RefreshCw, SlidersHorizontal, Trophy, UserRound, Users, Wallet } from 'lucide-react';
import { Layout } from '../components/Layout';
import { PageSkeleton } from '../components/Skeleton';
import { useAuth } from '../context/AuthContext';
import { clearSheetReadCache, readSheet } from '../lib/sheets';
import { parseSheetNumber } from '../lib/values';
import { normalizeFeeMonth } from '../lib/feeRules';
import { normalizeTimetableRows, upcomingClasses } from '../lib/timetable';
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
      const [studentRows, feeRows, timetableRows] = await Promise.all([
        readSheet(token, SHEET_ID, `'${TABS.STUDENTS}'!A:AG`),
        readSheet(token, SHEET_ID, `'${TABS.FEES}'!A:N`),
        readSheet(token, SHEET_ID, `'${TABS.TIMETABLE}'!A:M`).catch(() => []),
      ]);
      const data = studentRows.slice(1).filter(r => r[0]?.trim());
      const active = data.filter(r => (r[8] ?? '').toLowerCase() === 'active').length;
      const now = new Date();
      const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      let collected = 0, outstanding = 0;
      feeRows.slice(1).forEach(r => {
        if (normalizeFeeMonth(r[3] ?? '') !== currentMonth) return;
        collected   += nonNegativeSheetNumber(r[6] ?? '');
        outstanding += nonNegativeSheetNumber(r[7] ?? '');
      });
      setStats({ total: data.length, active, collected, outstanding });
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
    content = (
      <div className="dashboard-screen space-y-5 p-3 sm:p-4 md:p-6">
        <section className="dashboard-intro">
          <div className="flex items-start justify-between gap-3">
            <div><p className="section-label">{new Date().toLocaleDateString('en-IN', { weekday: 'long' })} · KAFT Chess Academy</p><h2 className="mt-1 text-xl font-bold text-gray-900 sm:text-2xl">Good morning{coachName ? `, ${coachName.split(' ')[0]}` : ''}</h2></div>
            <button type="button" onClick={sync} disabled={syncing} className="dashboard-live-status"
              aria-label="Sync latest changes from other coaches"
              title={lastSynced ? `Last synced ${lastSynced.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}` : 'Sync now'}>
              <RefreshCw size={12} className={syncing ? 'animate-spin' : ''} aria-hidden="true" />{syncing ? 'Syncing…' : 'Sync'}
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

function StatCard({ label, value, sub, tone, icon }: Readonly<{ label: string; value: string | number; sub?: string; tone: 'blue' | 'gold' | 'green' | 'red'; icon?: React.ReactNode }>) {
  return (
    <div className={`stat-card stat-card-${tone} rounded-xl p-4`}>
      <div className="flex items-start justify-between gap-2"><p className="section-label">{label}</p>{icon && <span className="stat-card-icon">{icon}</span>}</div>
      <p className="mt-3 text-xl font-bold leading-tight text-gray-900 sm:text-2xl">{value}</p>
      {sub && <p className="mt-1 text-xs text-gray-500">{sub}</p>}
    </div>
  );
}

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BookOpen, CalendarCheck, ChevronRight, Clock3, LayoutGrid, MapPin, ReceiptIndianRupee, Trophy, UserRound, Users } from 'lucide-react';
import { Layout } from '../components/Layout';
import { PageSkeleton } from '../components/Skeleton';
import { useAuth } from '../context/AuthContext';
import { readSheet } from '../lib/sheets';
import { parseSheetNumber } from '../lib/values';
import { normalizeTimetableRows, upcomingClasses } from '../lib/timetable';
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
  { to: '/fees',       Icon: ReceiptIndianRupee, label: 'Fees' },
  { to: '/upcoming',   Icon: Trophy, label: 'Tournaments' },
  { to: '/resources',  Icon: BookOpen, label: 'Resources' },
  { to: '/more',       Icon: LayoutGrid, label: 'More' },
];

export function Dashboard() {
  const { token, logout } = useAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState<{ total: number; active: number; collected: number; outstanding: number } | null>(null);
  const [birthdays, setBirthdays] = useState<{ name: string; dob: string; daysLeft: number }[]>([]);
  const [classes, setClasses] = useState<ReturnType<typeof upcomingClasses>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const nextSession = nextWeekendDate();

  useEffect(() => {
    if (!token) return;
    (async () => {
      try {
        const [studentRows, feeRows, timetableRows] = await Promise.all([
          readSheet(token, SHEET_ID, `'${TABS.STUDENTS}'!A:J`),
          readSheet(token, SHEET_ID, `'${TABS.FEES}'!B:I`),
          readSheet(token, SHEET_ID, `'${TABS.TIMETABLE}'!A:M`).catch(() => []),
        ]);
        const data = studentRows.slice(1).filter(r => r[0]?.trim());
        const active = data.filter(r => (r[8] ?? '').toLowerCase() === 'active').length;
        let collected = 0, outstanding = 0;
        feeRows.slice(1).forEach(r => {
          collected   += nonNegativeSheetNumber(r[5] ?? '');
          outstanding += nonNegativeSheetNumber(r[6] ?? '');
        });
        setStats({ total: data.length, active, collected, outstanding });
        setBirthdays(upcomingBirthdays(studentRows));
        setClasses(upcomingClasses(normalizeTimetableRows(timetableRows).entries).slice(0, 3));
      } catch (e: any) {
        if (e.message === 'TOKEN_EXPIRED') { logout(); return; }
        setError(e.message);
      } finally { setLoading(false); }
    })();
  }, [token, logout]);

  let content: React.ReactNode;
  if (loading) {
    content = <PageSkeleton />;
  } else if (error) {
    content = <p className="p-4 text-red-600 text-sm">{error}</p>;
  } else if (stats) {
    const nextDate = classes[0]?.date ?? nextSession;
    content = (
      <div className="space-y-4 p-3 sm:p-4 md:p-6">
        {/* Stat cards */}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatCard label="Active Students" value={stats.active} sub={`of ${stats.total} enrolled`} gradient="from-navy to-navy/80" icon={<Users size={22} className="opacity-70" />} />
          <StatCard label="Next Session" value={`${DAYS_S[nextDate.getDay()]} ${nextDate.getDate()} ${MONTHS_S[nextDate.getMonth()]}`} gradient="from-chess-blue to-chess-blue/80" icon={<CalendarCheck size={22} className="opacity-70" />} />
          <StatCard label="Fees Collected" value={`₹${stats.collected.toLocaleString('en-IN')}`} gradient="from-green-600 to-green-700" icon={<ReceiptIndianRupee size={22} className="opacity-70" />} />
          <StatCard label="Outstanding" value={`₹${stats.outstanding.toLocaleString('en-IN')}`} gradient="from-amber-500 to-amber-600" icon={<Trophy size={22} className="opacity-70" />} />
        </div>

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

        {classes.length > 0 && <section className="space-y-2">
          <div className="flex items-center justify-between"><h2 className="section-label">Upcoming Classes</h2><button type="button" onClick={() => navigate('/timetable')} className="flex items-center gap-1 text-xs font-semibold text-chess-blue">Manage <ChevronRight size={13} /></button></div>
          <div className="grid gap-2 md:grid-cols-3">{classes.map(({ entry, date }) => <article key={`${entry.rowIndex}-${date.toISOString()}`} className="surface-card p-3">
            <div className="flex items-start justify-between gap-2"><div><h3 className="text-sm font-semibold text-gray-900">{entry.batch}</h3><p className="text-xs font-medium text-chess-blue">{date.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}</p></div><span className="badge-green">{entry.status || 'Active'}</span></div>
            <div className="mt-2 space-y-1 text-xs text-gray-600"><p className="flex items-center gap-1.5"><Clock3 size={13} />{entry.start} - {entry.end}</p><p className="flex items-center gap-1.5"><UserRound size={13} />{entry.coach}</p>{entry.room && <p className="flex items-center gap-1.5"><MapPin size={13} />{entry.room}</p>}</div>
          </article>)}</div>
        </section>}

        <button type="button" onClick={() => navigate('/operations')} className="surface-card flex w-full items-center justify-between border-l-[3px] border-l-chess-blue p-4 text-left transition-colors hover:bg-gray-50">
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
    <Layout title="Chess Academy">
      {content}
    </Layout>
  );
}

function StatCard({ label, value, sub, gradient, icon }: Readonly<{ label: string; value: string | number; sub?: string; gradient: string; icon?: React.ReactNode }>) {
  return (
    <div className={`stat-card bg-gradient-to-br ${gradient} rounded-xl p-4 text-white`}>
      {icon && <div className="mb-1 text-white">{icon}</div>}
      <p className="text-xs opacity-80 mb-0.5">{label}</p>
      <p className="text-xl font-bold leading-tight sm:text-2xl">{value}</p>
      {sub && <p className="mt-0.5 text-xs opacity-70">{sub}</p>}
    </div>
  );
}

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Layout } from '../components/Layout';
import { Spinner } from '../components/Spinner';
import { useAuth } from '../context/AuthContext';
import { readSheet } from '../lib/sheets';
import { SHEET_ID, TABS } from '../config';

const MONTHS_S = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const DAYS_S   = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

function nextWeekendDate(): Date {
  const d = new Date(); d.setHours(0,0,0,0);
  while (d.getDay() !== 6 && d.getDay() !== 0) d.setDate(d.getDate() + 1);
  return d;
}

function upcomingBirthdays(studentRows: string[][]): { name: string; dob: string; daysLeft: number }[] {
  const today = new Date(); today.setHours(0,0,0,0);
  const result: { name: string; dob: string; daysLeft: number }[] = [];
  studentRows.slice(1).forEach(r => {
    const name = r[0]?.trim(); const dobStr = r[1]?.trim();
    if (!name || !dobStr) return;
    const dob = new Date(dobStr);
    if (isNaN(dob.getTime())) return;
    const thisYear = new Date(today.getFullYear(), dob.getMonth(), dob.getDate());
    if (thisYear < today) thisYear.setFullYear(today.getFullYear() + 1);
    const daysLeft = Math.round((thisYear.getTime() - today.getTime()) / 86400000);
    if (daysLeft <= 7) result.push({ name, dob: dobStr, daysLeft });
  });
  return result.sort((a, b) => a.daysLeft - b.daysLeft);
}

const QUICK_LINKS = [
  { to: '/students',   icon: '👥', label: 'Students',   color: 'bg-blue-50  text-blue-800'   },
  { to: '/attendance', icon: '✅', label: 'Attendance',  color: 'bg-green-50 text-green-800'  },
  { to: '/fees',       icon: '💰', label: 'Fees',        color: 'bg-amber-50 text-amber-800'  },
  { to: '/upcoming',   icon: '📋', label: 'Tournaments', color: 'bg-purple-50 text-purple-800'},
  { to: '/resources',  icon: '📚', label: 'Resources',   color: 'bg-teal-50  text-teal-800'   },
  { to: '/more',       icon: '☰',  label: 'More',        color: 'bg-gray-100 text-gray-700'   },
];

export function Dashboard() {
  const { token, logout } = useAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState<{ total: number; active: number; collected: number; outstanding: number } | null>(null);
  const [birthdays, setBirthdays] = useState<{ name: string; dob: string; daysLeft: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const nextSession = nextWeekendDate();

  useEffect(() => {
    if (!token) return;
    (async () => {
      try {
        const [studentRows, feeRows] = await Promise.all([
          readSheet(token, SHEET_ID, `'${TABS.STUDENTS}'!A:J`),
          readSheet(token, SHEET_ID, `'${TABS.FEES}'!B:I`),
        ]);
        const data = studentRows.slice(1).filter(r => r[0]?.trim());
        const active = data.filter(r => (r[8] ?? '').toLowerCase() === 'active').length;
        let collected = 0, outstanding = 0;
        feeRows.slice(1).forEach(r => {
          collected   += parseFloat(r[6] ?? '0') || 0;
          outstanding += parseFloat(r[7] ?? '0') || 0;
        });
        setStats({ total: data.length, active, collected, outstanding });
        setBirthdays(upcomingBirthdays(studentRows));
      } catch (e: any) {
        if (e.message === 'TOKEN_EXPIRED') { logout(); return; }
        setError(e.message);
      } finally { setLoading(false); }
    })();
  }, [token, logout]);

  return (
    <Layout title="Chess Academy">
      {loading ? <Spinner /> : error ? (
        <p className="p-4 text-red-600 text-sm">{error}</p>
      ) : (
        <div className="p-4 space-y-4">
          {/* Stats */}
          <div className="grid grid-cols-2 gap-3">
            <StatCard label="Active Students" value={stats!.active} sub={`of ${stats!.total} enrolled`} color="bg-navy text-white" />
            <StatCard label="Next Session" value={`${DAYS_S[nextSession.getDay()]} ${nextSession.getDate()} ${MONTHS_S[nextSession.getMonth()]}`} color="bg-chess-blue text-white" />
            <StatCard label="Fees Collected" value={`₹${stats!.collected.toLocaleString('en-IN')}`} color="bg-green-600 text-white" />
            <StatCard label="Outstanding" value={`₹${stats!.outstanding.toLocaleString('en-IN')}`} color="bg-amber-500 text-white" />
          </div>

          {/* Birthday reminders */}
          {birthdays.length > 0 && (
            <div className="bg-pink-50 border border-pink-200 rounded-xl p-4">
              <p className="text-pink-800 font-bold text-sm mb-2">🎂 Upcoming Birthdays</p>
              {birthdays.map(b => (
                <div key={b.name} className="flex justify-between items-center py-1">
                  <span className="text-sm text-pink-900 font-medium">{b.name}</span>
                  <span className="text-xs text-pink-600 font-semibold">
                    {b.daysLeft === 0 ? '🎉 Today!' : `in ${b.daysLeft} day${b.daysLeft > 1 ? 's' : ''}`}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Quick links */}
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Quick Access</h2>
          <div className="grid grid-cols-3 gap-3">
            {QUICK_LINKS.map(({ to, icon, label, color }) => (
              <button key={to} onClick={() => navigate(to)}
                className={`${color} flex flex-col items-center justify-center rounded-xl p-4 font-medium text-sm gap-1 active:scale-95 transition-transform`}>
                <span className="text-2xl">{icon}</span>
                <span>{label}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </Layout>
  );
}

function StatCard({ label, value, sub, color }: { label: string; value: string | number; sub?: string; color: string }) {
  return (
    <div className={`${color} rounded-xl p-4`}>
      <p className="text-xs opacity-80 mb-1">{label}</p>
      <p className="text-2xl font-bold leading-tight">{value}</p>
      {sub && <p className="text-xs opacity-70 mt-0.5">{sub}</p>}
    </div>
  );
}

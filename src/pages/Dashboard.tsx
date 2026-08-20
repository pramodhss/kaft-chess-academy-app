import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Layout } from '../components/Layout';
import { Spinner } from '../components/Spinner';
import { useAuth } from '../context/AuthContext';
import { readSheet } from '../lib/sheets';
import { SHEET_ID, TABS } from '../config';

interface Stats {
  totalStudents: number;
  activeStudents: number;
  feesCollected: number;
  feesOutstanding: number;
}

const QUICK_LINKS = [
  { to: '/students',   icon: '👥', label: 'Students',   color: 'bg-blue-50  text-blue-800'  },
  { to: '/attendance', icon: '✅', label: 'Attendance',  color: 'bg-green-50 text-green-800' },
  { to: '/fees',       icon: '💰', label: 'Fees',        color: 'bg-amber-50 text-amber-800' },
  { to: '/tournaments',icon: '🏆', label: 'Tournaments', color: 'bg-purple-50 text-purple-800'},
  { to: '/van',        icon: '🚐', label: 'Van',         color: 'bg-orange-50 text-orange-800'},
  { to: '/timetable',  icon: '📅', label: 'Timetable',   color: 'bg-pink-50  text-pink-800'  },
];

export function Dashboard() {
  const { token, logout } = useAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!token) return;
    (async () => {
      try {
        const [studentRows, feeRows] = await Promise.all([
          readSheet(token, SHEET_ID, `'${TABS.STUDENTS}'!A:J`),
          readSheet(token, SHEET_ID, `'${TABS.FEES}'!B:I`),
        ]);
        const dataRows = studentRows.slice(1).filter(r => r[0]?.trim());
        const active = dataRows.filter(r => (r[8] ?? '').toLowerCase() === 'active').length;
        let collected = 0, outstanding = 0;
        feeRows.slice(1).forEach(r => {
          collected   += parseFloat(r[6] ?? '0') || 0;
          outstanding += parseFloat(r[7] ?? '0') || 0;
        });
        setStats({ totalStudents: dataRows.length, activeStudents: active, feesCollected: collected, feesOutstanding: outstanding });
      } catch (e: any) {
        if (e.message === 'TOKEN_EXPIRED') { logout(); return; }
        setError(e.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [token, logout]);

  return (
    <Layout title="Chess Academy" action={
      <button onClick={logout} className="text-xs text-chess-light underline">Sign out</button>
    }>
      {loading ? <Spinner /> : error ? (
        <div className="p-4 text-red-600 text-sm">{error}</div>
      ) : (
        <div className="p-4 space-y-4">
          {/* Stats cards */}
          <div className="grid grid-cols-2 gap-3">
            <StatCard label="Active Students" value={stats!.activeStudents} sub={`of ${stats!.totalStudents} total`} color="bg-navy text-white" />
            <StatCard label="Fees Collected" value={`₹${stats!.feesCollected.toLocaleString('en-IN')}`} color="bg-green-600 text-white" />
            <StatCard label="Outstanding" value={`₹${stats!.feesOutstanding.toLocaleString('en-IN')}`} color="bg-amber-500 text-white" />
            <StatCard label="Today" value={new Date().toLocaleDateString('en-IN',{weekday:'short',day:'numeric',month:'short'})} color="bg-chess-blue text-white" />
          </div>

          {/* Quick links */}
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mt-4">Quick Access</h2>
          <div className="grid grid-cols-3 gap-3">
            {QUICK_LINKS.map(({ to, icon, label, color }) => (
              <button
                key={to}
                onClick={() => navigate(to)}
                className={`${color} flex flex-col items-center justify-center rounded-xl p-4 font-medium text-sm gap-1 active:scale-95 transition-transform`}
              >
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

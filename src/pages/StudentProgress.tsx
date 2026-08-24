import { useEffect, useState } from 'react';
import { Layout } from '../components/Layout';
import { PageSkeleton } from '../components/Skeleton';
import { EmptyState } from '../components/EmptyState';
import { useAuth } from '../context/AuthContext';
import { readSheet } from '../lib/sheets';
import { parseSheetNumber, parseSheetPercentage } from '../lib/values';
import { SHEET_ID, TABS } from '../config';

const MONTHS = Array.from({ length: 12 }, (_, index) => {
  const current = new Date();
  const date = new Date(current.getFullYear(), current.getMonth() - 11 + index, 1);
  const shortMonth = date.toLocaleString('en-US', { month: 'short' });
  const longMonth = date.toLocaleString('en-US', { month: 'long' });
  const year = date.getFullYear();
  return {
    label: `${shortMonth} ${year}`,
    chartLabel: `${shortMonth} '${String(year).slice(-2)}`,
    feeKey: `${year}-${String(date.getMonth() + 1).padStart(2, '0')}`,
    matchKeys: [`${shortMonth}-${year}`, `${shortMonth} ${year}`, `${longMonth} ${year}`].map(key => key.toLowerCase()),
  };
});

function matchesMonth(value: string | undefined, month: typeof MONTHS[number]) {
  const normalized = value?.trim().toLowerCase() ?? '';
  return normalized.includes(month.feeKey) || month.matchKeys.some(key => normalized.includes(key));
}

interface MonthData {
  label: string;
  attendance: number;
  overall: number;
}

function attendanceBadge(attendance: number): string {
  if (attendance >= 75) return 'badge-green';
  if (attendance >= 50) return 'badge-amber';
  if (attendance > 0) return 'badge-red';
  return 'badge-gray';
}

// Lightweight SVG line chart — zero dependencies
function LineChart({ data, color, label, max: maxProp }: Readonly<{ data: number[]; color: string; label: string; max?: number }>) {
  const nonZero = data.filter(v => v > 0);
  if (nonZero.length === 0) return <p className="text-xs text-gray-400 text-center py-2">No data yet</p>;
  const W = 280, H = 60, PAD = 8;
  const max = maxProp ?? Math.max(...data, 1);
  const min = 0;
  const range = max - min || 1;
  const pts = data.map((v, i) => ({
    x: PAD + (i / (data.length - 1 || 1)) * (W - PAD * 2),
    y: H - PAD - ((v - min) / range) * (H - PAD * 2),
    v,
  }));
  const path = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
  const area = `${path} L ${pts[pts.length-1].x.toFixed(1)} ${H} L ${pts[0].x.toFixed(1)} ${H} Z`;
  return (
    <div>
      <p className="text-xs font-medium text-gray-500 mb-1">{label}</p>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: 64 }}>
        <defs>
          <linearGradient id={`grad-${label}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.25"/>
            <stop offset="100%" stopColor={color} stopOpacity="0"/>
          </linearGradient>
        </defs>
        <path d={area} fill={`url(#grad-${label})`}/>
        <path d={path} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
        {pts.map(p => (
          <g key={`${p.x}-${p.y}-${p.v}`}>
            <circle cx={p.x} cy={p.y} r="4" fill={color} stroke="white" strokeWidth="1.5"/>
            {p.v > 0 && <text x={p.x} y={p.y - 7} textAnchor="middle" fontSize="9" fill={color} fontWeight="bold">{p.v}</text>}
          </g>
        ))}
      </svg>
      <div className="flex justify-between text-[10px] text-gray-400 mt-1">
        {MONTHS.map(month => <span key={month.label}>{month.chartLabel}</span>)}
      </div>
    </div>
  );
}

export function StudentProgress() {
  const { token, logout } = useAuth();
  const [students, setStudents] = useState<string[]>([]);
  const [selected, setSelected] = useState('');
  const [data, setData] = useState<MonthData[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingStudents, setLoadingStudents] = useState(true);

  // Load student list
  useEffect(() => {
    if (!token) return;
    readSheet(token, SHEET_ID, `'${TABS.STUDENTS}'!A:A`)
      .then(rows => setStudents(rows.slice(1).map(r => r[0]).filter(Boolean)))
      .catch(e => { if (e.message === 'TOKEN_EXPIRED') logout(); })
      .finally(() => setLoadingStudents(false));
  }, [token, logout]);

  const load = async (name: string) => {
    if (!token || !name) return;
    setLoading(true);
    try {
      const [attRows, metricsRows] = await Promise.all([
        readSheet(token, SHEET_ID, `'${TABS.MONTHLY_ATT}'!A:E`),
        readSheet(token, SHEET_ID, `'${TABS.METRICS}'!A:J`),
      ]);
      const monthData: MonthData[] = MONTHS.map(month => {
        const att = attRows.slice(1).find(row => row[0]?.trim() === name && matchesMonth(row[1], month));
        const met = metricsRows.slice(1).find(row => row[0]?.trim() === name && matchesMonth(row[1], month));
        return {
          label: month.label,
          attendance: att ? Math.min(100, Math.max(0, Math.round(parseSheetPercentage(att[4]) * 100))) : 0,
          overall: met ? Math.min(5, Math.max(0, parseSheetNumber(met[9]))) : 0,
        };
      });
      setData(monthData);
    } catch(e:any) { if (e.message === 'TOKEN_EXPIRED') logout(); }
    finally { setLoading(false); }
  };

  return (
    <Layout title="Student Progress" showBack>
      <div className="p-4 space-y-4">
        {/* Student selector */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
          <label htmlFor="progress-student" className="text-xs font-medium text-gray-500 mb-2 block">Select Student</label>
          {loadingStudents ? (
            <p className="text-sm text-gray-400">Loading students…</p>
          ) : (
            <select id="progress-student" value={selected} onChange={e => { setSelected(e.target.value); load(e.target.value); }}
              className="input w-full">
              <option value="">Choose a student…</option>
              {students.map(s => <option key={s}>{s}</option>)}
            </select>
          )}
        </div>

        {loading && <PageSkeleton />}

        {!loading && selected && data.length > 0 && (
          <>
            {/* Attendance trend */}
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 animate-chess-slide">
              <h2 className="text-sm font-bold text-navy mb-3">📅 Attendance Trend (%)</h2>
              <LineChart data={data.map(d => d.attendance)} color="#16a34a" label="Attendance %" max={100}/>
            </div>

            {/* Skill ratings */}
            {data.some(d => d.overall > 0) && (
              <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 animate-chess-slide">
                <h2 className="text-sm font-bold text-navy mb-3">⭐ Overall Skill Rating (out of 5)</h2>
                <LineChart data={data.map(d => d.overall)} color="#C9970A" label="Overall Rating" max={5}/>
              </div>
            )}

            {/* Monthly table */}
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden animate-chess-slide">
              <div className="px-4 py-3 border-b border-gray-100">
                <h2 className="text-sm font-bold text-navy">Monthly Breakdown</h2>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500">Month</th>
                    <th className="text-center px-2 py-2 text-xs font-semibold text-gray-500">Attend %</th>
                    <th className="text-center px-2 py-2 text-xs font-semibold text-gray-500">Rating</th>
                  </tr>
                </thead>
                <tbody>
                  {data.map(d => (
                    <tr key={d.label} className="border-t border-gray-50">
                      <td className="px-4 py-2 font-medium text-gray-900">{d.label}</td>
                      <td className="px-2 py-2 text-center">
                        <span className={`badge ${attendanceBadge(d.attendance)}`}>
                          {d.attendance > 0 ? `${d.attendance}%` : '—'}
                        </span>
                      </td>
                      <td className="px-2 py-2 text-center">
                        {d.overall > 0 ? <span className="font-bold text-amber-600">{d.overall.toFixed(1)}/5</span> : <span className="text-gray-300">—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {!loading && !selected && (
          <EmptyState title="Select a student" subtitle="Choose a student above to view their progress charts across all months"/>
        )}
      </div>
    </Layout>
  );
}

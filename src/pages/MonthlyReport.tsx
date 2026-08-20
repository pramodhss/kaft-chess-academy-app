import { useState, useCallback, useRef } from 'react';
import { Layout } from '../components/Layout';
import { Spinner } from '../components/Spinner';
import { useAuth } from '../context/AuthContext';
import { readSheet } from '../lib/sheets';
import { SHEET_ID, TABS } from '../config';

const MONTHS = [
  { label: 'August 2026',    attKey: 'Aug',  feeKey: '2026-08' },
  { label: 'September 2026', attKey: 'Sep',  feeKey: '2026-09' },
  { label: 'October 2026',   attKey: 'Oct',  feeKey: '2026-10' },
  { label: 'November 2026',  attKey: 'Nov',  feeKey: '2026-11' },
  { label: 'December 2026',  attKey: 'Dec',  feeKey: '2026-12' },
];

const MEDAL_ICON: Record<string, string> = {
  Gold: '🥇', Silver: '🥈', Bronze: '🥉', 'Best Game': '⭐', Participation: '🎖',
};

const FEE_COLOR: Record<string, string> = {
  Paid: 'badge-green', Partial: 'badge-amber', Pending: 'badge-amber',
  Overdue: 'badge-red', Waived: 'badge-gray',
};

interface StudentReport {
  name: string;
  batch: string;
  daysAttended: number;
  daysScheduled: number;
  attendancePct: number;
  feeStatus: string;
  feeBalance: string;
  medals: string[];
  overallRating: string;
  openingSkill: string;
  middlegameSkill: string;
  endgameSkill: string;
  tacticsSkill: string;
  sportsmanship: string;
  prize: string;
  coachSummary: string;
  parentMeeting: string;
}

export function MonthlyReport() {
  const { token, logout } = useAuth();
  const [selectedMonth, setSelectedMonth] = useState(0);
  const [reports, setReports] = useState<StudentReport[]>([]);
  const reportRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const [expandedName, setExpandedName] = useState<string | null>(null);

  const load = useCallback(async (monthIdx: number) => {
    if (!token) return;
    setLoading(true); setError(''); setLoaded(false); setReports([]);
    const month = MONTHS[monthIdx];
    try {
      const [attRows, feeRows, tornRows, metricsRows] = await Promise.all([
        readSheet(token, SHEET_ID, `'${TABS.MONTHLY_ATT}'!A:E`),
        readSheet(token, SHEET_ID, `'${TABS.FEES}'!B:L`),
        readSheet(token, SHEET_ID, `'${TABS.TOURNAMENTS}'!A:Q`),
        readSheet(token, SHEET_ID, `'${TABS.METRICS}'!A:O`),
      ]);

      // Attendance rows: A=Name, B=Month(formatted), C=DaysAttended, D=Scheduled, E=Pct
      const attMap = new Map<string, { days: number; scheduled: number; pct: number }>();
      attRows.slice(1).forEach(r => {
        const name = r[0]?.trim();
        const rowMonth = r[1]?.trim() ?? '';
        if (!name || !rowMonth.includes(month.attKey)) return;
        attMap.set(name, {
          days:      parseFloat(r[2] ?? '0') || 0,
          scheduled: parseFloat(r[3] ?? '0') || 0,
          pct:       parseFloat(r[4] ?? '0') || 0,
        });
      });

      // Fee rows: B=StudentName(0), D=FeeMonth(2→col index 2 in slice), L=Status(10)
      // readSheet returns: [B,C,D,E,F,G,H,I,J,K,L] → index: Name=0,Batch=1,Month=2,...,Status=10,Balance=6
      const feeMap = new Map<string, { status: string; balance: string }>();
      feeRows.slice(1).forEach(r => {
        const name = r[0]?.trim();
        const rowMonth = r[2]?.trim() ?? ''; // D col = index 2
        if (!name || !rowMonth.includes(month.feeKey)) return;
        const existing = feeMap.get(name);
        const status = r[10]?.trim() ?? '';
        // worst status wins
        const priority = ['Overdue','Partial','Pending','Paid','Waived'];
        if (!existing || priority.indexOf(status) < priority.indexOf(existing.status)) {
          feeMap.set(name, { status, balance: r[6]?.trim() ?? '' });
        }
      });

      // Tournament rows: A=Month(0), B=Name(1), Q=Medal(16)
      const tornMap = new Map<string, string[]>();
      tornRows.slice(1).forEach(r => {
        const name = r[1]?.trim();
        const rowMonth = r[0]?.trim() ?? '';
        const medal = r[16]?.trim() ?? '';
        if (!name || !rowMonth.includes(month.attKey) || !medal || medal === 'None') return;
        if (!tornMap.has(name)) tornMap.set(name, []);
        tornMap.get(name)!.push(medal);
      });

      // Metrics rows: A=Name(0), B=Month(1), C=Batch(2), D=AttPct(3),
      //               E=Opening(4) F=Mid(5) G=End(6) H=Tactics(7) I=Sport(8)
      //               J=Overall(9) K=Prize(10) L=PrizeDetail(11) M=CoachSummary(12) N=ParentMeeting(13)
      const metricsMap = new Map<string, { batch:string; overall:string; opening:string; mid:string; end:string; tactics:string; sport:string; prize:string; coach:string; parent:string }>();
      metricsRows.slice(1).forEach(r => {
        const name = r[0]?.trim();
        const rowMonth = r[1]?.trim() ?? '';
        if (!name || !rowMonth.includes(month.attKey)) return;
        metricsMap.set(name, {
          batch: r[2]??'', overall: r[9]??'', opening: r[4]??'', mid: r[5]??'',
          end: r[6]??'', tactics: r[7]??'', sport: r[8]??'',
          prize: r[10]??'', coach: r[12]??'', parent: r[13]??'',
        });
      });

      // Build report per student from attendance (source of truth for enrolled students)
      const result: StudentReport[] = [];
      attMap.forEach((att, name) => {
        const fee = feeMap.get(name);
        const medals = tornMap.get(name) ?? [];
        const m = metricsMap.get(name);
        result.push({
          name, batch: m?.batch ?? '',
          daysAttended: att.days, daysScheduled: att.scheduled,
          attendancePct: att.pct,
          feeStatus: fee?.status ?? '', feeBalance: fee?.balance ?? '',
          medals, overallRating: m?.overall ?? '',
          openingSkill: m?.opening ?? '', middlegameSkill: m?.mid ?? '',
          endgameSkill: m?.end ?? '', tacticsSkill: m?.tactics ?? '',
          sportsmanship: m?.sport ?? '', prize: m?.prize ?? '',
          coachSummary: m?.coach ?? '', parentMeeting: m?.parent ?? '',
        });
      });

      result.sort((a, b) => b.attendancePct - a.attendancePct);
      setReports(result);
      setLoaded(true);
    } catch (e: any) {
      if (e.message === 'TOKEN_EXPIRED') { logout(); return; }
      setError(e.message);
    } finally { setLoading(false); }
  }, [token, logout]);

  const handleMonthChange = (idx: number) => {
    setSelectedMonth(idx);
    setLoaded(false); setReports([]);
  };

  const downloadPdf = async () => {
    if (!reportRef.current) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const html2pdf = ((await import('html2pdf.js')) as any).default;
    html2pdf().from(reportRef.current).set({
      margin: 8,
      filename: `Chess_Academy_${MONTHS[selectedMonth].label}.pdf`,
      html2canvas: { scale: 2, useCORS: true, backgroundColor: '#f9fafb' },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
    }).save();
  };

  return (
    <Layout title="Monthly Report" action={
      loaded ? (
        <div className="flex gap-1 no-print">
          <button onClick={downloadPdf} className="bg-white text-navy text-xs font-bold px-2 py-1 rounded-full">⬇ PDF</button>
          <button onClick={() => window.print()} className="bg-white text-navy text-xs font-bold px-2 py-1 rounded-full">🖨️</button>
        </div>
      ) : undefined
    }>
      <div className="p-4 space-y-3" ref={reportRef}>
        {/* Month selector */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
          <p className="text-xs font-medium text-gray-500 mb-2">Select Month</p>
          <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
            {MONTHS.map((m, i) => (
              <button key={i} onClick={() => handleMonthChange(i)}
                className={`flex-shrink-0 px-3 py-2 rounded-xl text-xs font-semibold transition-colors
                  ${selectedMonth === i ? 'bg-navy text-white' : 'bg-gray-100 text-gray-600'}`}>
                {m.label.split(' ')[0]}
              </button>
            ))}
          </div>
          <button onClick={() => load(selectedMonth)} disabled={loading}
            className="mt-3 w-full bg-chess-blue text-white py-2.5 rounded-xl text-sm font-semibold disabled:opacity-50">
            {loading ? 'Loading…' : `Load ${MONTHS[selectedMonth].label} Report`}
          </button>
        </div>

        {error && <p className="text-red-600 text-sm bg-red-50 p-3 rounded-xl">{error}</p>}

        {loaded && (
          <>
            {/* Summary bar */}
            <div className="grid grid-cols-3 gap-2">
              <SumCard label="Students" value={reports.length} color="bg-navy text-white" />
              <SumCard label="Avg Attendance"
                value={reports.length ? `${Math.round(reports.reduce((s,r)=>s+r.attendancePct,0)/reports.length*100)}%` : '—'}
                color="bg-chess-blue text-white" />
              <SumCard label="Achievements" value={reports.reduce((s,r)=>s+r.medals.length,0)} color="bg-purple-600 text-white" />
            </div>

            {/* At-risk section */}
            {reports.filter(r => r.attendancePct < 0.5).length > 0 && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-3">
                <p className="text-red-700 text-xs font-bold mb-1">⚠️ Below 50% Attendance</p>
                {reports.filter(r => r.attendancePct < 0.5).map(r => (
                  <p key={r.name} className="text-red-600 text-sm">{r.name} — {Math.round(r.attendancePct * 100)}%</p>
                ))}
              </div>
            )}

            {/* Student cards */}
            {reports.length === 0 && (
              <p className="text-center text-gray-400 py-8">No data for this month yet.</p>
            )}
            {reports.map(r => {
              const pct = Math.round(r.attendancePct * 100);
              const attColor = pct >= 75 ? 'bg-green-500' : pct >= 50 ? 'bg-amber-400' : 'bg-red-500';
              const expanded = expandedName === r.name;
              return (
                <div key={r.name} className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                  {/* Card header */}
                  <button onClick={() => setExpandedName(expanded ? null : r.name)}
                    className="w-full p-4 text-left flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold text-gray-900">{r.name}</p>
                        {r.batch && <span className="badge-blue">{r.batch}</span>}
                        {r.medals.map((m, i) => <span key={i} className="text-lg">{MEDAL_ICON[m] ?? '🎖'}</span>)}
                        {r.parentMeeting === 'Yes' && <span className="badge-red">Parent Meet</span>}
                      </div>
                      {/* Attendance bar */}
                      <div className="mt-2">
                        <div className="flex justify-between text-xs text-gray-500 mb-1">
                          <span>📅 {r.daysAttended}/{r.daysScheduled} days</span>
                          <span className={`font-bold ${pct>=75?'text-green-600':pct>=50?'text-amber-600':'text-red-600'}`}>{pct}%</span>
                        </div>
                        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                          <div className={`h-full ${attColor} rounded-full`} style={{ width: `${Math.min(pct,100)}%` }} />
                        </div>
                      </div>
                      {/* Fee + quick stats row */}
                      <div className="flex gap-2 mt-2 flex-wrap">
                        {r.feeStatus && <span className={FEE_COLOR[r.feeStatus] ?? 'badge-gray'}>💰 {r.feeStatus}</span>}
                        {r.feeStatus === 'Overdue' && r.feeBalance && <span className="text-xs text-red-500">₹{r.feeBalance} due</span>}
                        {r.overallRating && <span className="badge-blue">⭐ {parseFloat(r.overallRating).toFixed(1)}/5</span>}
                        {r.prize && <span className="badge-green">🏅 {r.prize}</span>}
                      </div>
                    </div>
                    <span className={`ml-2 text-gray-300 text-xl transition-transform ${expanded ? 'rotate-90' : ''}`}>›</span>
                  </button>

                  {/* Expanded details */}
                  {expanded && (
                    <div className="border-t border-gray-100 p-4 bg-gray-50 space-y-3">
                      {/* Skill ratings */}
                      {(r.openingSkill || r.middlegameSkill || r.endgameSkill) && (
                        <div>
                          <p className="text-xs font-bold text-navy mb-2">SKILL RATINGS</p>
                          <div className="grid grid-cols-3 gap-2">
                            {[['Opening', r.openingSkill],['Middlegame', r.middlegameSkill],
                              ['Endgame', r.endgameSkill],['Tactics', r.tacticsSkill],
                              ['Sportsmanship', r.sportsmanship]].filter(([,v])=>v).map(([label, val]) => (
                              <div key={label} className="bg-white rounded-lg p-2 text-center border border-gray-100">
                                <p className="text-xs text-gray-500">{label}</p>
                                <p className="font-bold text-navy text-lg">{val}<span className="text-xs text-gray-400">/5</span></p>
                                <div className="flex justify-center gap-0.5 mt-1">
                                  {[1,2,3,4,5].map(n => (
                                    <div key={n} className={`w-2 h-2 rounded-full ${n<=parseFloat(val??'0')?'bg-chess-blue':'bg-gray-200'}`} />
                                  ))}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      {/* Coach summary */}
                      {r.coachSummary && (
                        <div className="bg-white rounded-xl p-3 border border-gray-100">
                          <p className="text-xs font-bold text-navy mb-1">COACH NOTES</p>
                          <p className="text-sm text-gray-700">{r.coachSummary}</p>
                        </div>
                      )}
                      {/* Tournaments */}
                      {r.medals.length > 0 && (
                        <div className="bg-white rounded-xl p-3 border border-gray-100">
                          <p className="text-xs font-bold text-navy mb-1">ACHIEVEMENTS</p>
                          <div className="flex gap-2 flex-wrap">
                            {r.medals.map((m, i) => (
                              <span key={i} className="text-sm">{MEDAL_ICON[m] ?? '🎖'} {m}</span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </>
        )}
      </div>
    </Layout>
  );
}

function SumCard({ label, value, color }: { label: string; value: string | number; color: string }) {
  return (
    <div className={`${color} rounded-xl p-3 text-center`}>
      <p className="text-xs opacity-80">{label}</p>
      <p className="text-xl font-bold">{value}</p>
    </div>
  );
}

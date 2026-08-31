import { useState, useCallback } from 'react';
import { Download, Mail, MessageCircle, Printer } from 'lucide-react';
import { Layout } from '../components/Layout';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { readSheet } from '../lib/sheets';
import { parseSheetNumber, parseSheetPercentage } from '../lib/values';
import { useCoachName } from '../hooks/useCoachName';
import { SHEET_ID, TABS } from '../config';

function buildMonths(count: number) {
  const current = new Date();
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(current.getFullYear(), current.getMonth() - count + index + 1, 1);
    const shortMonth = date.toLocaleString('en-US', { month: 'short' });
    const longMonth = date.toLocaleString('en-US', { month: 'long' });
    const year = date.getFullYear();
    return {
      label: `${longMonth} ${year}`,
      shortLabel: `${shortMonth} '${String(year).slice(-2)}`,
      feeKey: `${year}-${String(date.getMonth() + 1).padStart(2, '0')}`,
      matchKeys: [`${shortMonth}-${year}`, `${shortMonth} ${year}`, `${longMonth} ${year}`].map(key => key.toLowerCase()),
    };
  });
}

const MONTHS = buildMonths(24);

function matchesMonth(value: string, month: typeof MONTHS[number]) {
  const normalized = value.trim().toLowerCase();
  return normalized.includes(month.feeKey) || month.matchKeys.some(key => normalized.includes(key));
}

const MEDAL_ICON: Record<string, string> = {
  Gold: '🥇', Silver: '🥈', Bronze: '🥉', 'Best Game': '⭐', Participation: '🎖',
};

function medalItems(medals: string[]) {
  const occurrences = new Map<string, number>();
  return medals.map(medal => {
    const occurrence = (occurrences.get(medal) ?? 0) + 1;
    occurrences.set(medal, occurrence);
    return { medal, key: `${medal}-${occurrence}` };
  });
}

const FEE_COLOR: Record<string, string> = {
  Paid: 'badge-green', Partial: 'badge-amber', Pending: 'badge-amber',
  Overdue: 'badge-red', Waived: 'badge-gray',
};

export interface StudentReport {
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
  const { coachName: savedCoachName } = useCoachName();
  const [selectedMonth, setSelectedMonth] = useState(MONTHS.length - 1);
  const [reports, setReports] = useState<StudentReport[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const [expandedName, setExpandedName] = useState<string | null>(null);
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [emailTo, setEmailTo] = useState('');
  const [emailCc, setEmailCc] = useState('');
  const [emailError, setEmailError] = useState('');
  const toast = useToast();
  const coachName = savedCoachName || 'Admin';
  const attendanceReports = reports.filter(report => report.daysScheduled > 0);
  const avgAttendance = attendanceReports.length
    ? Math.round(attendanceReports.reduce((sum, report) => sum + report.attendancePct, 0) / attendanceReports.length * 100)
    : null;
  const avgAttendanceLabel = avgAttendance === null ? 'N/A' : `${avgAttendance}%`;

  const shareStudentWhatsApp = (r: StudentReport) => {
    const month = MONTHS[selectedMonth].label;
    const skills = [
      r.openingSkill ? `Opening: ${r.openingSkill}/5` : '',
      r.middlegameSkill ? `Middlegame: ${r.middlegameSkill}/5` : '',
      r.endgameSkill ? `Endgame: ${r.endgameSkill}/5` : '',
      r.tacticsSkill ? `Tactics: ${r.tacticsSkill}/5` : '',
    ].filter(Boolean).join(' · ');

    const message = [
      `🏆 *KAFT Chess Academy – Monthly Student Progress*`,
      `👤 *Student:* ${r.name}`,
      `📅 *Month:* ${month}`,
      `📚 *Batch:* ${r.batch}`,
      `📅 *Attendance:* ${r.daysAttended}/${r.daysScheduled} classes (${Math.round(r.attendancePct * 100)}%)`,
      r.overallRating ? `⭐ *Overall Rating:* ${r.overallRating}/5` : '',
      skills ? `♟ *Skills:* ${skills}` : '',
      r.coachSummary ? `📝 *Coach Notes:* ${r.coachSummary}` : '',
      ``,
      `🔗 *Parent Portal:* https://pramodhss.github.io/kaft-chess-academy-app/#/parent`,
      ``,
      `— KAFT Chess Academy`,
    ].filter(Boolean).join('\n');

    void navigator.clipboard.writeText(message).then(
      () => toast.success(`Monthly progress for ${r.name} copied — ready to paste in WhatsApp.`),
      () => toast.error('Could not copy to clipboard.'),
    );
  };

  const generateReportText = () => {
    const month = MONTHS[selectedMonth].label;
    const today = new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
    const atRisk = reports.filter(r => r.daysScheduled > 0 && r.attendancePct < 0.5);
    const pending = reports.filter(r => r.feeStatus && r.feeStatus !== 'Paid' && r.feeStatus !== 'Waived');
    let t = `KAFT Chess Academy — Monthly Report: ${month}\nGenerated: ${today} by ${coachName}\n`;
    t += `${'='.repeat(50)}\n\nSUMMARY\n${'─'.repeat(30)}\n`;
    t += `Total Students : ${reports.length}\nAvg Attendance : ${avgAttendanceLabel}\n\n`;
    if (atRisk.length) {
      t += `⚠️  LOW ATTENDANCE (below 50%)\n${'─'.repeat(30)}\n`;
      atRisk.forEach(r => { t += `${r.name} — ${r.daysAttended}/${r.daysScheduled} days (${Math.round(r.attendancePct*100)}%)\n`; });
      t += '\n';
    }
    if (pending.length) {
      t += `💰  PENDING / OVERDUE FEES\n${'─'.repeat(30)}\n`;
      pending.forEach(r => {
        const balance = r.feeBalance ? ` ₹${r.feeBalance}` : '';
        t += `${r.name} — ${r.feeStatus}${balance}\n`;
      });
      t += '\n';
    }
    t += `📅  FULL ATTENDANCE\n${'─'.repeat(30)}\n`;
    reports.forEach(r => {
      const pct = Math.round(r.attendancePct * 100);
      let indicator = '❌';
      if (pct >= 75) indicator = '✅';
      else if (pct >= 50) indicator = '⚠️';
      t += `${indicator} ${r.name.padEnd(22)} ${r.daysAttended}/${r.daysScheduled} days  ${pct}%\n`;
    });
    t += `\n${'─'.repeat(50)}\nThis report was auto-generated by the KAFT Chess Academy App.`;
    return t;
  };

  const handleSendEmail = () => {
    if (!emailTo.trim()) return;
    const addresses = [emailTo.trim(), emailCc.trim()].filter(Boolean);
    const isEmail = (address: string) => {
      const at = address.indexOf('@');
      const dot = address.lastIndexOf('.');
      return address.trim() === address && !address.includes(' ') && at > 0
        && at === address.lastIndexOf('@') && dot > at + 1 && dot < address.length - 1;
    };
    if (addresses.some(address => !isEmail(address))) {
      setEmailError('Enter valid email addresses before opening the report.');
      return;
    }
    setEmailError('');
    const subject = `KAFT Chess Academy — Monthly Report: ${MONTHS[selectedMonth].label}`;
    const body = generateReportText();
    const queryPrefix = emailCc.trim() ? `?cc=${emailCc.trim()}&` : '?';
    const url = `mailto:${emailTo.trim()}${queryPrefix}subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    window.open(url, '_blank');
    setShowEmailModal(false);
  };

  const load = useCallback(async (monthIdx: number) => {
    if (!token) return;
    setLoading(true); setError(''); setLoaded(false); setReports([]);
    const month = MONTHS[monthIdx];
    try {
      const [studentRows, attRows, feeRows, tornRows, metricsRows] = await Promise.all([
        readSheet(token, SHEET_ID, `'${TABS.STUDENTS}'!A:AG`),
        readSheet(token, SHEET_ID, `'${TABS.MONTHLY_ATT}'!A:E`),
        readSheet(token, SHEET_ID, `'${TABS.FEES}'!A:N`),
        readSheet(token, SHEET_ID, `'${TABS.TOURNAMENTS}'!A:Q`),
        readSheet(token, SHEET_ID, `'${TABS.METRICS}'!A:O`),
      ]);

      // Attendance rows: A=Name, B=Month(formatted), C=DaysAttended, D=Scheduled, E=Pct
      const attMap = new Map<string, { days: number; scheduled: number; pct: number }>();
      attRows.slice(1).forEach(r => {
        const name = r[0]?.trim();
        const rowMonth = r[1]?.trim() ?? '';
        if (!name || !matchesMonth(rowMonth, month)) return;
        attMap.set(name, {
          days:      parseSheetNumber(r[2]),
          scheduled: parseSheetNumber(r[3]),
          pct:       parseSheetPercentage(r[4]),
        });
      });

      // Fee rows use the canonical A:N range shared by all fee screens.
      const feeMap = new Map<string, { status: string; balance: string }>();
      feeRows.slice(1).forEach(r => {
        const name = r[1]?.trim();
        const rowMonth = r[3]?.trim() ?? '';
        if (!name || !matchesMonth(rowMonth, month)) return;
        const existing = feeMap.get(name);
        const status = r[11]?.trim() ?? '';
        // worst status wins
        const priority = ['Overdue','Partial','Pending','Paid','Waived'];
        const existingPriority = existing ? priority.indexOf(existing.status) : Number.MAX_SAFE_INTEGER;
        const statusPriority = priority.indexOf(status);
        feeMap.set(name, {
          status: !existing || (statusPriority >= 0 && statusPriority < existingPriority) ? status : existing.status,
          balance: String(parseSheetNumber(existing?.balance) + parseSheetNumber(r[7])),
        });
      });

      // Tournament rows: A=Month(0), B=Name(1), Q=Medal(16)
      const tornMap = new Map<string, string[]>();
      tornRows.slice(1).forEach(r => {
        const name = r[1]?.trim();
        const rowMonth = r[0]?.trim() ?? '';
        const medal = r[16]?.trim() ?? '';
        if (!name || !matchesMonth(rowMonth, month) || !medal || medal === 'None') return;
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
        if (!name || !matchesMonth(rowMonth, month)) return;
        metricsMap.set(name, {
          batch: r[2]??'', overall: r[9]??'', opening: r[4]??'', mid: r[5]??'',
          end: r[6]??'', tactics: r[7]??'', sport: r[8]??'',
          prize: r[10]??'', coach: r[12]??'', parent: r[13]??'',
        });
      });

      const studentMap = new Map<string, string>();
      studentRows.slice(1).forEach(row => {
        const name = row[0]?.trim();
        if (name) studentMap.set(name, row[5]?.trim() ?? '');
      });
      attMap.forEach((_, name) => { if (!studentMap.has(name)) studentMap.set(name, ''); });

      // Build the report from the roster and left-join monthly data.
      const result: StudentReport[] = [];
      studentMap.forEach((rosterBatch, name) => {
        const att = attMap.get(name) ?? { days: 0, scheduled: 0, pct: 0 };
        const fee = feeMap.get(name);
        const medals = tornMap.get(name) ?? [];
        const m = metricsMap.get(name);
        result.push({
          name, batch: m?.batch || rosterBatch,
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
    const { downloadMonthlyPerformancePdf } = await import('../lib/monthlyReportPdf');
    downloadMonthlyPerformancePdf({
      month: MONTHS[selectedMonth].label,
      coachName,
      reports,
    });
  };

  return (
    <Layout title="Monthly Report" showBack action={
      loaded ? (
        <div className="flex gap-1 no-print">
          <button type="button" onClick={() => { setEmailError(''); setShowEmailModal(true); }} className="header-action px-2" aria-label="Email report" title="Email report"><Mail size={15} aria-hidden="true" /></button>
          <button type="button" onClick={downloadPdf} className="header-action"><Download size={15} aria-hidden="true" /> PDF</button>
          <button type="button" onClick={() => window.print()} className="header-action px-2" aria-label="Print report" title="Print report"><Printer size={15} aria-hidden="true" /></button>
        </div>
      ) : undefined
    }>
      <div className="p-4 space-y-3">
        {/* Month selector */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
          <p className="text-xs font-medium text-gray-500 mb-2">Select Month</p>
          <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
            {MONTHS.map((m, i) => (
              <button key={m.label} type="button" onClick={() => handleMonthChange(i)}
                className={`flex-shrink-0 px-3 py-2 rounded-xl text-xs font-semibold transition-colors
                  ${selectedMonth === i ? 'bg-navy text-white' : 'bg-gray-100 text-gray-600'}`}>
                {m.shortLabel}
              </button>
            ))}
          </div>
          <button type="button" onClick={() => load(selectedMonth)} disabled={loading}
            className="primary-action mt-3 w-full">
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
                value={avgAttendance === null ? '—' : avgAttendanceLabel}
                color="summary-tile-gold" />
              <SumCard label="Achievements" value={reports.reduce((s,r)=>s+r.medals.length,0)} color="bg-navy text-white" />
            </div>

            {/* At-risk section */}
            {reports.some(r => r.daysScheduled > 0 && r.attendancePct < 0.5) && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-3">
                <p className="text-red-700 text-xs font-bold mb-1">⚠️ Below 50% Attendance</p>
                {reports.filter(r => r.daysScheduled > 0 && r.attendancePct < 0.5).map(r => (
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
              let attColor = 'bg-red-500';
              let attTextColor = 'text-red-600';
              if (pct >= 75) {
                attColor = 'bg-green-500';
                attTextColor = 'text-green-600';
              } else if (pct >= 50) {
                attColor = 'bg-amber-400';
                attTextColor = 'text-amber-600';
              }
              const expanded = expandedName === r.name;
              return (
                <div key={r.name} className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                  {/* Card header */}
                  <button type="button" onClick={() => setExpandedName(expanded ? null : r.name)}
                    className="w-full p-4 text-left flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold text-gray-900">{r.name}</p>
                        {r.batch && <span className="badge-blue">{r.batch}</span>}
                        {medalItems(r.medals).map(item => <span key={item.key} className="text-lg">{MEDAL_ICON[item.medal] ?? '🎖'}</span>)}
                        {r.parentMeeting === 'Yes' && <span className="badge-red">Parent Meet</span>}
                      </div>
                      {/* Attendance bar */}
                      <div className="mt-2">
                        <div className="flex justify-between text-xs text-gray-500 mb-1">
                          <span>📅 {r.daysAttended}/{r.daysScheduled} days</span>
                          <span className={`font-bold ${attTextColor}`}>{pct}%</span>
                        </div>
                        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                          <div className={`h-full ${attColor} rounded-full`} style={{ width: `${Math.min(pct,100)}%` }} />
                        </div>
                      </div>
                      {/* Fee + quick stats row */}
                      <div className="flex gap-2 mt-2 flex-wrap">
                        {r.feeStatus && <span className={FEE_COLOR[r.feeStatus] ?? 'badge-gray'}>💰 {r.feeStatus}</span>}
                        {r.feeStatus === 'Overdue' && r.feeBalance && <span className="text-xs text-red-500">₹{r.feeBalance} due</span>}
                        {r.overallRating && <span className="badge-blue">⭐ {Number.parseFloat(r.overallRating).toFixed(1)}/5</span>}
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
                                    <div key={n} className={`w-2 h-2 rounded-full ${n <= Number.parseFloat(val ?? '0') ? 'bg-chess-blue' : 'bg-gray-200'}`} />
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
                            {medalItems(r.medals).map(item => (
                              <span key={item.key} className="text-sm">{MEDAL_ICON[item.medal] ?? '🎖'} {item.medal}</span>
                            ))}
                          </div>
                        </div>
                      )}
                      <button
                        type="button"
                        onClick={() => shareStudentWhatsApp(r)}
                        className="w-full mt-2 flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg bg-green-50 text-green-700 hover:bg-green-100 border border-green-200 text-xs font-semibold"
                        title="Copy student monthly card for WhatsApp"
                      >
                        <MessageCircle size={14} /> Share Monthly Card on WhatsApp
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </>
        )}
      </div>

      {/* Email modal */}
      {showEmailModal && (
        <div className="modal-backdrop items-end justify-center sm:items-center no-print">
          <dialog open className="modal-panel max-w-lg p-4" aria-labelledby="monthly-report-email-title">
            <div className="flex items-center justify-between mb-4">
              <h2 id="monthly-report-email-title" className="font-bold text-lg text-navy">📧 Send Monthly Report</h2>
              <button type="button" onClick={() => setShowEmailModal(false)} className="text-gray-400 text-2xl leading-none" aria-label="Close email report">×</button>
            </div>
            <p className="text-xs text-gray-500 mb-3">
              Opens your Gmail app with the full {MONTHS[selectedMonth].label} report pre-filled. Just tap Send.
            </p>
            {emailError && <p className="text-sm text-red-600 bg-red-50 rounded-xl p-3 mb-3">{emailError}</p>}
            <div className="space-y-3">
              <div>
                <label htmlFor="monthly-report-email-to" className="text-xs font-medium text-gray-500 mb-1 block">To (required) *</label>
                <input id="monthly-report-email-to" value={emailTo} onChange={e => setEmailTo(e.target.value)}
                  type="email" placeholder="e.g. principal@kaftchess.com"
                  className="input w-full" autoFocus />
              </div>
              <div>
                <label htmlFor="monthly-report-email-cc" className="text-xs font-medium text-gray-500 mb-1 block">CC (optional — add more coaches)</label>
                <input id="monthly-report-email-cc" value={emailCc} onChange={e => setEmailCc(e.target.value)}
                  type="email" placeholder="e.g. coach2@gmail.com"
                  className="input w-full" />
              </div>
              <div className="bg-gray-50 rounded-xl p-3 text-xs text-gray-500">
                <p className="font-semibold mb-1">Report includes:</p>
                <p>• Attendance summary ({reports.length} students, avg {avgAttendanceLabel})</p>
                <p>• Students below 50% attendance</p>
                <p>• Pending / overdue fees</p>
                <p>• Full student-by-student breakdown</p>
              </div>
            </div>
            <button type="button" onClick={handleSendEmail} disabled={!emailTo.trim()}
              className="primary-action mt-4 w-full">
              📧 Open in Gmail / Mail App
            </button>
          </dialog>
        </div>
      )}
    </Layout>
  );
}

function SumCard({ label, value, color }: Readonly<{ label: string; value: string | number; color: string }>) {
  return (
    <div className={`${color} rounded-xl p-3 text-center`}>
      <p className="text-xs opacity-80">{label}</p>
      <p className="text-xl font-bold">{value}</p>
    </div>
  );
}

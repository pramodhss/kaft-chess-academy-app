import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertCircle, CalendarCheck, ClipboardCheck, Download, MessageCircle, MessageSquareShare, Send, Settings, ShieldCheck, TrendingUp, Users, Wallet } from 'lucide-react';
import { Layout } from '../components/Layout';
import { CopyButton } from '../components/CopyButton';
import { PageSkeleton } from '../components/Skeleton';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useCoachName } from '../hooks/useCoachName';
import { readSheet } from '../lib/sheets';
import { parseSheetNumber, parseSheetPercentage } from '../lib/values';
import { SHEET_ID, TABS } from '../config';
import { recordAudit } from '../lib/audit';

type Tab = 'actions' | 'broadcast' | 'analytics' | 'reminders' | 'quality' | 'audit' | 'backup';
interface StudentSummary { name: string; batch: string; status: string; parent: string; phone: string; whatsapp: string; email: string; dob: string }
interface FeeSummary { student: string; feeMonth: string; amountDue: number; amountPaid: number; balance: number; dueDate: string; paymentDate: string; paymentStatus: string }
interface AttendanceSummary { student: string; month: string; attended: number; scheduled: number; percentage: number }
interface TournamentSummary { student: string; tournamentName: string; date: string; medal: string; position: string }

function csvCell(value: string): string { return `"${value.replace(/"/g, '""')}"`; }
function downloadCsv(filename: string, rows: string[][]) {
  const csv = rows.map(row => row.map(csvCell).join(',')).join('\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const anchor = document.createElement('a');
  anchor.href = url; anchor.download = filename; anchor.click(); URL.revokeObjectURL(url);
}

function downloadJson(filename: string, value: unknown) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }));
  const anchor = document.createElement('a');
  anchor.href = url; anchor.download = filename; anchor.click(); URL.revokeObjectURL(url);
}

const BROADCAST_TEMPLATES = [
  {
    id: 'class-reminder',
    name: '📅 Class Schedule & Batch Timings',
    text: (coach: string) => `*KAFT Chess Academy – Class Reminder*\n\nDear Parents,\nThis is a friendly reminder regarding the upcoming weekend chess training sessions. Please ensure students join on time with their chess notation books.\n\nThank you,\n${coach} · KAFT Chess Academy`,
  },
  {
    id: 'tournament-alert',
    name: '🏆 Upcoming Tournament Announcement',
    text: (coach: string) => `*KAFT Chess Academy – Tournament Announcement*\n\nDear Parents & Students,\nRegistrations are now open for our upcoming chess tournament. Interested students should confirm their participation at the earliest.\n\nWarm regards,\n${coach} · KAFT Chess Academy`,
  },
  {
    id: 'general-notice',
    name: '📢 General Academy Announcement',
    text: (coach: string) => `*KAFT Chess Academy – Important Notice*\n\nDear Parents,\nPlease take note of the latest academy update.\n\nThank you for your continued support,\n${coach} · KAFT Chess Academy`,
  },
  {
    id: 'fee-reminder',
    name: '💰 Monthly Tuition Fee Notice',
    text: (coach: string) => `*KAFT Chess Academy – Monthly Tuition Notice*\n\nDear Parents,\nKindly arrange the monthly chess tuition payment for the ongoing session. Please share the transaction reference once completed.\n\nThank you,\n${coach} · KAFT Chess Academy`,
  },
];

export function OperationsCenter() {
  const navigate = useNavigate();
  const { token, logout } = useAuth();
  const { coachName: savedCoachName } = useCoachName();
  const coachName = savedCoachName || 'Coach';
  const toast = useToast();
  const [tab, setTab] = useState<Tab>('actions');
  const [students, setStudents] = useState<StudentSummary[]>([]);
  const [fees, setFees] = useState<FeeSummary[]>([]);
  const [attendance, setAttendance] = useState<AttendanceSummary[]>([]);
  const [tournaments, setTournaments] = useState<TournamentSummary[]>([]);
  const [raw, setRaw] = useState<{ students: string[][]; fees: string[][] }>({ students: [], fees: [] });
  const [loading, setLoading] = useState(true);
  const [auditRows, setAuditRows] = useState<string[][]>([]);
  const [exporting, setExporting] = useState(false);

  // Broadcast state
  const [broadcastBatch, setBroadcastBatch] = useState('All');
  const [selectedTemplate, setSelectedTemplate] = useState(BROADCAST_TEMPLATES[0].id);
  const [customMessage, setCustomMessage] = useState(() => BROADCAST_TEMPLATES[0].text(coachName));

  // Analytics Custom Date Range State
  const now = new Date();
  const [startDate, setStartDate] = useState(() => {
    const d = new Date(now.getFullYear(), now.getMonth() - 2, 1);
    return d.toISOString().slice(0, 10);
  });
  const [endDate, setEndDate] = useState(() => now.toISOString().slice(0, 10));

  useEffect(() => {
    if (!token) return;
    Promise.all([
      readSheet(token, SHEET_ID, `'${TABS.STUDENTS}'!A:AG`),
      readSheet(token, SHEET_ID, `'${TABS.FEES}'!A:N`),
      readSheet(token, SHEET_ID, `'${TABS.MONTHLY_ATT}'!A:E`).catch(() => []),
      readSheet(token, SHEET_ID, `'${TABS.TOURNAMENTS}'!A:U`).catch(() => []),
      readSheet(token, SHEET_ID, `'${TABS.AUDIT}'!A:F`).catch(() => []),
    ]).then(([studentRows, feeRows, attRows, tRows, audit]) => {
      setRaw({ students: studentRows, fees: feeRows });
      setStudents(studentRows.slice(1).filter(row => row[0]?.trim()).map(row => ({
        name: row[0] ?? '',
        batch: row[5] ?? 'General',
        status: row[8] ?? '',
        parent: row[9] ?? '',
        phone: row[10] ?? '',
        whatsapp: row[11] ?? '',
        email: row[12] ?? '',
        dob: row[1] ?? '',
      })));
      setFees(feeRows.slice(1).filter(row => row[1]?.trim()).map(row => ({
        student: row[1] ?? '',
        feeMonth: row[3] ?? '',
        amountDue: parseSheetNumber(row[5] ?? '0'),
        amountPaid: parseSheetNumber(row[6] ?? '0'),
        balance: Math.max(0, parseSheetNumber(row[7] ?? '')),
        dueDate: row[8] ?? '',
        paymentDate: row[9] ?? '',
        paymentStatus: row[11] ?? 'Pending',
      })));
      setAttendance(attRows.slice(1).filter(r => r[0]?.trim()).map(r => ({
        student: r[0] ?? '',
        month: r[1] ?? '',
        attended: Number.parseInt(r[2] ?? '0', 10) || 0,
        scheduled: Number.parseInt(r[3] ?? '0', 10) || 0,
        percentage: parseSheetPercentage(r[4] ?? '0'),
      })));
      setTournaments(tRows.slice(1).filter(r => r[1]?.trim()).map(r => ({
        student: r[1] ?? '',
        tournamentName: r[4] ?? '',
        date: r[6] ?? '',
        medal: r[16] ?? 'None',
        position: r[12] ?? '',
      })));
      setAuditRows(audit.slice(1).reverse().slice(0, 50));
    }).catch((error: Error) => {
      if (error.message === 'TOKEN_EXPIRED') logout();
      else toast.error(error.message);
    }).finally(() => setLoading(false));
  }, [token, logout]);

  const batches = useMemo(() => ['All', ...new Set(students.map(s => s.batch).filter(Boolean))], [students]);

  const broadcastRecipients = useMemo(() => {
    return students.filter(s => {
      if (s.status.toLowerCase() !== 'active') return false;
      if (broadcastBatch !== 'All' && s.batch !== broadcastBatch) return false;
      return true;
    });
  }, [students, broadcastBatch]);

  const handleTemplateChange = (templateId: string) => {
    setSelectedTemplate(templateId);
    const tmpl = BROADCAST_TEMPLATES.find(t => t.id === templateId);
    if (tmpl) setCustomMessage(tmpl.text(coachName));
  };

  const openIndividualWhatsApp = (phone: string, studentName: string) => {
    const cleanPhone = phone.replace(/\D/g, '').slice(-10);
    if (!cleanPhone) {
      toast.error(`No phone number available for ${studentName}.`);
      return;
    }
    const personalized = customMessage.replace('{STUDENT_NAME}', studentName);
    window.open(`https://wa.me/91${cleanPhone}?text=${encodeURIComponent(personalized)}`, '_blank', 'noopener,noreferrer');
  };

  // Range Analytics Calculations
  const rangeAnalytics = useMemo(() => {
    const start = new Date(startDate);
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);

    const validRange = !Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime()) && start <= end;
    if (!validRange) {
      return { collected: 0, balance: 0, avgAttendance: 0, tournamentCount: 0, perStudent: [] };
    }

    // Filter fees
    let collected = 0;
    let balance = 0;
    fees.forEach(f => {
      const d = f.paymentDate ? new Date(f.paymentDate) : (f.dueDate ? new Date(f.dueDate) : null);
      if (d && !Number.isNaN(d.getTime()) && d >= start && d <= end) {
        collected += f.amountPaid;
        balance += f.balance;
      }
    });

    // Filter attendance
    const studentAttMap = new Map<string, { attended: number; scheduled: number }>();
    attendance.forEach(a => {
      studentAttMap.set(a.student, {
        attended: (studentAttMap.get(a.student)?.attended || 0) + a.attended,
        scheduled: (studentAttMap.get(a.student)?.scheduled || 0) + a.scheduled,
      });
    });

    const activeStudents = students.filter(s => s.status.toLowerCase() === 'active');
    let totalAttended = 0;
    let totalScheduled = 0;
    studentAttMap.forEach(val => {
      totalAttended += val.attended;
      totalScheduled += val.scheduled;
    });
    const avgAttendance = totalScheduled > 0 ? Math.round((totalAttended / totalScheduled) * 100) : 0;

    // Tournaments
    const rangeTournaments = tournaments.filter(t => {
      if (!t.date) return false;
      const d = new Date(t.date);
      return !Number.isNaN(d.getTime()) && d >= start && d <= end;
    });

    const perStudent = activeStudents.map(s => {
      const att = studentAttMap.get(s.name) || { attended: 0, scheduled: 0 };
      const sFees = fees.filter(f => f.student.toLowerCase() === s.name.toLowerCase());
      const sPaid = sFees.reduce((sum, f) => sum + f.amountPaid, 0);
      const sBal = sFees.reduce((sum, f) => sum + f.balance, 0);
      const sTourneys = rangeTournaments.filter(t => t.student.toLowerCase() === s.name.toLowerCase()).length;
      return {
        name: s.name,
        batch: s.batch,
        attended: att.attended,
        attendancePct: att.scheduled > 0 ? Math.round((att.attended / att.scheduled) * 100) : 0,
        paid: sPaid,
        balance: sBal,
        tournaments: sTourneys,
      };
    });

    return {
      collected,
      balance,
      avgAttendance,
      tournamentCount: rangeTournaments.length,
      perStudent,
    };
  }, [startDate, endDate, fees, attendance, tournaments, students]);

  const downloadRangeCsv = () => {
    const headers = ['Student Name', 'Batch', 'Classes Attended', 'Attendance Rate', 'Total Paid (INR)', 'Pending Balance (INR)', 'Tournaments'];
    const rows = rangeAnalytics.perStudent.map(s => [
      s.name, s.batch, String(s.attended), `${s.attendancePct}%`, String(s.paid), String(s.balance), String(s.tournaments),
    ]);
    downloadCsv(`kaft-report-${startDate}-to-${endDate}.csv`, [headers, ...rows]);
    toast.success('Custom period report downloaded as CSV.');
  };

  const setRangePreset = (monthsBack: number) => {
    const end = new Date();
    const start = new Date(end.getFullYear(), end.getMonth() - monthsBack + 1, 1);
    setStartDate(start.toISOString().slice(0, 10));
    setEndDate(end.toISOString().slice(0, 10));
  };

  if (loading) return <Layout title="Operations & Data" showBack><PageSkeleton /></Layout>;
  const pendingFees = fees.filter(fee => fee.balance > 0);
  const quality = students.flatMap(student => [
    !student.dob ? `${student.name}: missing date of birth` : '',
    !student.parent ? `${student.name}: missing parent name` : '',
    !/^\d{7,15}$/.test(student.phone) ? `${student.name}: invalid parent phone` : '',
    student.email && !student.email.includes('@') ? `${student.name}: invalid email` : '',
  ].filter(Boolean));

  const openReminder = (fee: FeeSummary) => {
    const student = students.find(item => item.name === fee.student);
    const phone = (student?.whatsapp || student?.phone || '').replace(/\D/g, '').slice(-10);
    if (!phone) { toast.error(`No WhatsApp number is available for ${fee.student}.`); return; }
    const message = `Hello, this is a reminder from Kaft Chess Academy. ${fee.student} has a pending fee balance of ₹${fee.balance.toLocaleString('en-IN')}. Please contact the academy if you have any questions.`;
    window.open(`https://wa.me/91${phone}?text=${encodeURIComponent(message)}`, '_blank', 'noopener,noreferrer');
  };

  const exportFullBackup = async () => {
    if (!token) return;
    setExporting(true);
    try {
      const tabNames = Object.values(TABS);
      const entries = await Promise.all(tabNames.map(async tabName => {
        const rows = await readSheet(token, SHEET_ID, `'${tabName}'!A:ZZ`).catch(() => [] as string[][]);
        return [tabName, rows] as const;
      }));
      const exportedAt = new Date().toISOString();
      downloadJson(`kaft-full-backup-${exportedAt.slice(0, 10)}.json`, { format: 'kaft-workbook-backup-v1', sheetId: SHEET_ID, exportedAt, tabs: Object.fromEntries(entries) });
      void recordAudit(token, 'EXPORT', 'Backup', 'Complete workbook', `${tabNames.length} tabs`).catch(() => undefined);
      toast.success('Complete workbook backup downloaded.');
    } catch (error: any) { toast.error(`Backup failed: ${error.message}`); }
    finally { setExporting(false); }
  };

  const tabs: { key: Tab; label: string }[] = [
    { key: 'actions', label: 'Actions' },
    { key: 'broadcast', label: 'Broadcasts' },
    { key: 'analytics', label: 'Custom Reports' },
    { key: 'reminders', label: 'Reminders' },
    { key: 'quality', label: 'Data Quality' },
    { key: 'audit', label: 'Audit' },
    { key: 'backup', label: 'Export' },
  ];

  return (
    <Layout title="Operations & Data" showBack>
      <div className="space-y-4 p-4 md:p-6">
        {/* Navigation Tabs */}
        <div className="flex gap-2 overflow-x-auto no-scrollbar">
          {tabs.map(item => (
            <button type="button" key={item.key} onClick={() => setTab(item.key)}
              className={`flex-shrink-0 rounded-xl px-3.5 py-2 text-xs font-semibold transition-colors
                ${tab === item.key ? 'bg-navy text-white shadow-sm' : 'bg-white text-gray-600 hover:bg-gray-100'}`}>
              {item.label}
            </button>
          ))}
        </div>

        {/* 1. Actions */}
        {tab === 'actions' && (
          <div className="space-y-3">
            <div className="grid gap-3 md:grid-cols-3">
              <Metric icon={ClipboardCheck} label="Active students" value={students.filter(student => student.status.toLowerCase() === 'active').length} />
              <Metric icon={MessageCircle} label="Fee follow-ups" value={pendingFees.length} />
              <Metric icon={ShieldCheck} label="Data issues" value={quality.length} />
            </div>
            <button type="button" onClick={() => navigate('/admin-settings')} className="surface-card flex w-full items-center gap-3 p-4 text-left">
              <span className="icon-tile"><Settings size={18} /></span>
              <span>
                <strong className="block text-sm text-gray-900">Student batch settings</strong>
                <span className="text-xs text-gray-500">Manage batches (Beginner, Intermediate, Advanced)</span>
              </span>
            </button>
          </div>
        )}

        {/* 2. WhatsApp Broadcasts */}
        {tab === 'broadcast' && (
          <div className="space-y-4">
            <div className="surface-card p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-bold text-navy flex items-center gap-1.5"><MessageSquareShare size={16} /> Batch WhatsApp Broadcast</h2>
                  <p className="text-xs text-gray-500">Compose and send announcements to batch parents in 1 click.</p>
                </div>
                <CopyButton text={customMessage} label="Copy Broadcast Message" />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                <label className="block">
                  <span className="field-label">Target Audience</span>
                  <select value={broadcastBatch} onChange={e => setBroadcastBatch(e.target.value)} className="input">
                    {batches.map(b => <option key={b} value={b}>{b === 'All' ? 'All Active Students' : `${b} Batch`}</option>)}
                  </select>
                </label>
                <label className="block">
                  <span className="field-label">Template Preset</span>
                  <select value={selectedTemplate} onChange={e => handleTemplateChange(e.target.value)} className="input">
                    {BROADCAST_TEMPLATES.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </label>
              </div>

              <label className="block">
                <span className="field-label">Message Text</span>
                <textarea rows={6} value={customMessage} onChange={e => setCustomMessage(e.target.value)} className="input font-sans text-xs leading-relaxed" />
              </label>
            </div>

            {/* Recipient Roster */}
            <div className="surface-card p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="section-label flex items-center gap-1.5"><Users size={14} /> Recipients ({broadcastRecipients.length})</h3>
                <span className="text-xs text-gray-400">Click to open chat</span>
              </div>

              <div className="divide-y divide-gray-100 max-h-72 overflow-y-auto">
                {broadcastRecipients.map(s => {
                  const phone = s.whatsapp || s.phone;
                  return (
                    <div key={s.name} className="py-2.5 flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <strong className="block text-xs font-semibold text-gray-900 truncate">{s.name}</strong>
                        <span className="block text-[10px] text-gray-500 truncate">{s.batch} · Parent: {s.parent || 'Parent'} ({phone || 'No phone'})</span>
                      </div>
                      <button type="button" onClick={() => openIndividualWhatsApp(phone, s.name)}
                        disabled={!phone}
                        className="resource-action bg-green-50 text-green-700 border border-green-200 hover:bg-green-100 disabled:opacity-40">
                        <Send size={12} /> Send
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* 3. Custom Date Range Analytics */}
        {tab === 'analytics' && (
          <div className="space-y-4">
            <div className="surface-card p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-bold text-navy flex items-center gap-1.5"><TrendingUp size={16} /> Custom Period Report</h2>
                  <p className="text-xs text-gray-500">Calculate financial and attendance metrics for custom terms.</p>
                </div>
                <button type="button" onClick={downloadRangeCsv} className="header-action">
                  <Download size={14} /> CSV
                </button>
              </div>

              <div className="flex flex-wrap gap-1.5 pt-1">
                <button type="button" onClick={() => setRangePreset(1)} className="resource-action bg-gray-100 text-gray-700">This Month</button>
                <button type="button" onClick={() => setRangePreset(3)} className="resource-action bg-gray-100 text-gray-700">Last 3 Months</button>
                <button type="button" onClick={() => setRangePreset(6)} className="resource-action bg-gray-100 text-gray-700">Last 6 Months</button>
                <button type="button" onClick={() => setRangePreset(12)} className="resource-action bg-gray-100 text-gray-700">Past Year</button>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="field-label">From Date</span>
                  <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="input" />
                </label>
                <label className="block">
                  <span className="field-label">To Date</span>
                  <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="input" />
                </label>
              </div>
            </div>

            {/* Metrics cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="surface-card p-3.5">
                <p className="section-label flex items-center gap-1 text-green-700"><Wallet size={13} /> Collected</p>
                <p className="text-xl font-bold text-gray-900 mt-1">₹{rangeAnalytics.collected.toLocaleString('en-IN')}</p>
              </div>
              <div className="surface-card p-3.5">
                <p className="section-label flex items-center gap-1 text-amber-700"><Wallet size={13} /> Pending</p>
                <p className="text-xl font-bold text-gray-900 mt-1">₹{rangeAnalytics.balance.toLocaleString('en-IN')}</p>
              </div>
              <div className="surface-card p-3.5">
                <p className="section-label flex items-center gap-1 text-blue-700"><CalendarCheck size={13} /> Attendance</p>
                <p className="text-xl font-bold text-gray-900 mt-1">{rangeAnalytics.avgAttendance}%</p>
              </div>
              <div className="surface-card p-3.5">
                <p className="section-label flex items-center gap-1 text-purple-700"><ClipboardCheck size={13} /> Tournaments</p>
                <p className="text-xl font-bold text-gray-900 mt-1">{rangeAnalytics.tournamentCount}</p>
              </div>
            </div>

            {/* Student breakdown table */}
            <div className="surface-card p-4 space-y-2">
              <h3 className="section-label">Student Performance Breakdown</h3>
              <div className="divide-y divide-gray-100 max-h-80 overflow-y-auto text-xs">
                {rangeAnalytics.perStudent.map(s => (
                  <div key={s.name} className="py-2.5 flex items-center justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <strong className="block text-gray-900 truncate">{s.name}</strong>
                      <span className="text-gray-500">{s.batch} · {s.attended} classes ({s.attendancePct}%)</span>
                    </div>
                    <div className="text-right">
                      <span className="block font-semibold text-green-700">₹{s.paid.toLocaleString('en-IN')} paid</span>
                      {s.balance > 0 && <span className="block text-amber-600">₹{s.balance} due</span>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* 4. Fee Reminders */}
        {tab === 'reminders' && (
          <List title="Coach-reviewed fee reminders" empty="No pending fee reminders.">
            {pendingFees.map(fee => (
              <button type="button" key={`${fee.student}-${fee.dueDate}`} onClick={() => openReminder(fee)}
                className="surface-card flex w-full items-center justify-between p-4 text-left">
                <span>
                  <strong className="block text-sm text-gray-900">{fee.student}</strong>
                  <span className="text-xs text-gray-500">₹{fee.balance.toLocaleString('en-IN')} pending</span>
                </span>
                <MessageCircle size={18} className="text-green-600" />
              </button>
            ))}
          </List>
        )}

        {/* 5. Data Quality */}
        {tab === 'quality' && (
          <List title="Records requiring attention" empty="No data-quality issues found.">
            {quality.map(issue => (
              <div key={issue} className="surface-card flex items-start gap-3 p-4 text-sm text-gray-700">
                <AlertCircle size={18} className="mt-0.5 flex-none text-amber-600" />
                {issue}
              </div>
            ))}
          </List>
        )}

        {/* 6. Audit */}
        {tab === 'audit' && (
          <List title="Recent changes" empty="No audited changes yet.">
            {auditRows.map((row, index) => (
              <article key={`${row[0]}-${index}`} className="surface-card p-4">
                <div className="flex items-center justify-between gap-2">
                  <strong className="text-sm text-gray-900">{row[2]} · {row[3]}</strong>
                  <time className="text-[10px] text-gray-400">{row[0] ? new Date(row[0]).toLocaleString('en-IN') : ''}</time>
                </div>
                <p className="mt-1 text-xs text-gray-500">{row[4]}{row[5] ? ` · ${row[5]}` : ''}</p>
                <p className="mt-1 text-[10px] text-gray-400">{row[1]}</p>
              </article>
            ))}
          </List>
        )}

        {/* 7. Backup & Export */}
        {tab === 'backup' && (
          <div className="surface-card space-y-3 p-4">
            <h2 className="font-semibold text-gray-900">Manual backup and export</h2>
            <p className="text-sm text-gray-500">Download a complete JSON workbook backup or focused CSV registers without changing Google Sheets.</p>
            <button type="button" onClick={exportFullBackup} disabled={exporting} className="primary-action w-full">
              <Download size={16} />{exporting ? 'Preparing backup…' : 'Complete workbook backup'}
            </button>
            <div className="h-px bg-gray-100" />
            <button type="button" onClick={() => downloadCsv(`kaft-students-${new Date().toISOString().slice(0, 10)}.csv`, raw.students)} className="primary-action w-full">
              <Download size={16} /> Students CSV
            </button>
            <button type="button" onClick={() => downloadCsv(`kaft-fees-${new Date().toISOString().slice(0, 10)}.csv`, raw.fees)} className="primary-action w-full">
              <Download size={16} /> Fees CSV
            </button>
          </div>
        )}
      </div>
    </Layout>
  );
}

function Metric({ icon: Icon, label, value }: Readonly<{ icon: typeof ClipboardCheck; label: string; value: number }>) {
  return (
    <div className="surface-card flex items-center gap-3 p-4">
      <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-chess-light text-navy">
        <Icon size={19} />
      </span>
      <span>
        <strong className="block text-xl text-gray-900">{value}</strong>
        <span className="text-xs text-gray-500">{label}</span>
      </span>
    </div>
  );
}

function List({ title, empty, children }: Readonly<{ title: string; empty: string; children: React.ReactNode }>) {
  const hasChildren = Array.isArray(children) ? children.length > 0 : Boolean(children);
  return (
    <section className="space-y-2">
      <h2 className="section-label">{title}</h2>
      {hasChildren ? children : <p className="surface-card p-6 text-center text-sm text-gray-400">{empty}</p>}
    </section>
  );
}
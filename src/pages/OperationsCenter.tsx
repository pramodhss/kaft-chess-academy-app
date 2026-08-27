import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertCircle, ClipboardCheck, Download, MessageCircle, Settings, ShieldCheck } from 'lucide-react';
import { Layout } from '../components/Layout';
import { PageSkeleton } from '../components/Skeleton';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { readSheet } from '../lib/sheets';
import { parseSheetNumber } from '../lib/values';
import { SHEET_ID, TABS } from '../config';
import { recordAudit } from '../lib/audit';

type Tab = 'actions' | 'reminders' | 'quality' | 'audit' | 'backup';
interface StudentSummary { name: string; status: string; parent: string; phone: string; whatsapp: string; email: string; dob: string }
interface FeeSummary { student: string; balance: number; dueDate: string }

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

export function OperationsCenter() {
  const navigate = useNavigate();
  const { token, logout } = useAuth();
  const toast = useToast();
  const [tab, setTab] = useState<Tab>('actions');
  const [students, setStudents] = useState<StudentSummary[]>([]);
  const [fees, setFees] = useState<FeeSummary[]>([]);
  const [raw, setRaw] = useState<{ students: string[][]; fees: string[][] }>({ students: [], fees: [] });
  const [loading, setLoading] = useState(true);
  const [auditRows, setAuditRows] = useState<string[][]>([]);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    if (!token) return;
    Promise.all([readSheet(token, SHEET_ID, `'${TABS.STUDENTS}'!A:AG`), readSheet(token, SHEET_ID, `'${TABS.FEES}'!A:N`), readSheet(token, SHEET_ID, `'${TABS.AUDIT}'!A:F`).catch(() => [])]).then(([studentRows, feeRows, audit]) => {
      setRaw({ students: studentRows, fees: feeRows });
      setStudents(studentRows.slice(1).filter(row => row[0]?.trim()).map(row => ({ name: row[0] ?? '', dob: row[1] ?? '', status: row[8] ?? '', parent: row[9] ?? '', phone: row[10] ?? '', whatsapp: row[11] ?? '', email: row[12] ?? '' })));
      setFees(feeRows.slice(1).filter(row => row[1]?.trim()).map(row => ({ student: row[1] ?? '', balance: Math.max(0, parseSheetNumber(row[7] ?? '')), dueDate: row[8] ?? '' })));
      setAuditRows(audit.slice(1).reverse().slice(0, 50));
    }).catch((error: Error) => { if (error.message === 'TOKEN_EXPIRED') logout(); else toast.error(error.message); }).finally(() => setLoading(false));
  }, [token, logout]);

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

  const tabs: { key: Tab; label: string }[] = [{ key: 'actions', label: 'Actions' }, { key: 'reminders', label: 'Reminders' }, { key: 'quality', label: 'Data Quality' }, { key: 'audit', label: 'Audit' }, { key: 'backup', label: 'Export' }];
  return (
    <Layout title="Operations & Data" showBack>
      <div className="space-y-4 p-4 md:p-6">
        <div className="flex gap-2 overflow-x-auto no-scrollbar">{tabs.map(item => <button type="button" key={item.key} onClick={() => setTab(item.key)} className={`flex-shrink-0 rounded-lg px-3 py-2 text-xs font-semibold ${tab === item.key ? 'bg-navy text-white' : 'bg-white text-gray-600'}`}>{item.label}</button>)}</div>
        {tab === 'actions' && <div className="space-y-3"><div className="grid gap-3 md:grid-cols-3"><Metric icon={ClipboardCheck} label="Active students" value={students.filter(student => student.status.toLowerCase() === 'active').length} /><Metric icon={MessageCircle} label="Fee follow-ups" value={pendingFees.length} /><Metric icon={ShieldCheck} label="Data issues" value={quality.length} /></div><button type="button" onClick={() => navigate('/admin-settings')} className="surface-card flex w-full items-center gap-3 p-4 text-left"><span className="icon-tile"><Settings size={18} /></span><span><strong className="block text-sm text-gray-900">Batch and level settings</strong><span className="text-xs text-gray-500">Manage the options used in student and class records</span></span></button></div>}
        {tab === 'reminders' && <List title="Coach-reviewed fee reminders" empty="No pending fee reminders.">{pendingFees.map(fee => <button type="button" key={`${fee.student}-${fee.dueDate}`} onClick={() => openReminder(fee)} className="surface-card flex w-full items-center justify-between p-4 text-left"><span><strong className="block text-sm text-gray-900">{fee.student}</strong><span className="text-xs text-gray-500">₹{fee.balance.toLocaleString('en-IN')} pending</span></span><MessageCircle size={18} className="text-green-600" /></button>)}</List>}
        {tab === 'quality' && <List title="Records requiring attention" empty="No data-quality issues found.">{quality.map(issue => <div key={issue} className="surface-card flex items-start gap-3 p-4 text-sm text-gray-700"><AlertCircle size={18} className="mt-0.5 flex-none text-amber-600" />{issue}</div>)}</List>}
        {tab === 'audit' && <List title="Recent changes" empty="No audited changes yet.">{auditRows.map((row, index) => <article key={`${row[0]}-${index}`} className="surface-card p-4"><div className="flex items-center justify-between gap-2"><strong className="text-sm text-gray-900">{row[2]} · {row[3]}</strong><time className="text-[10px] text-gray-400">{row[0] ? new Date(row[0]).toLocaleString('en-IN') : ''}</time></div><p className="mt-1 text-xs text-gray-500">{row[4]}{row[5] ? ` · ${row[5]}` : ''}</p><p className="mt-1 text-[10px] text-gray-400">{row[1]}</p></article>)}</List>}
        {tab === 'backup' && <div className="surface-card space-y-3 p-4"><h2 className="font-semibold text-gray-900">Manual backup and export</h2><p className="text-sm text-gray-500">Download a complete JSON workbook backup or focused CSV registers without changing Google Sheets.</p><button type="button" onClick={exportFullBackup} disabled={exporting} className="primary-action w-full"><Download size={16} />{exporting ? 'Preparing backup…' : 'Complete workbook backup'}</button><div className="h-px bg-gray-100" /><button type="button" onClick={() => downloadCsv(`kaft-students-${new Date().toISOString().slice(0,10)}.csv`, raw.students)} className="primary-action w-full"><Download size={16} /> Students CSV</button><button type="button" onClick={() => downloadCsv(`kaft-fees-${new Date().toISOString().slice(0,10)}.csv`, raw.fees)} className="primary-action w-full"><Download size={16} /> Fees CSV</button></div>}
      </div>
    </Layout>
  );
}

function Metric({ icon: Icon, label, value }: Readonly<{ icon: typeof ClipboardCheck; label: string; value: number }>) { return <div className="surface-card flex items-center gap-3 p-4"><span className="flex h-10 w-10 items-center justify-center rounded-lg bg-chess-light text-navy"><Icon size={19} /></span><span><strong className="block text-xl text-gray-900">{value}</strong><span className="text-xs text-gray-500">{label}</span></span></div>; }
function List({ title, empty, children }: Readonly<{ title: string; empty: string; children: React.ReactNode }>) { const hasChildren = Array.isArray(children) ? children.length > 0 : Boolean(children); return <section className="space-y-2"><h2 className="section-label">{title}</h2>{hasChildren ? children : <p className="surface-card p-6 text-center text-sm text-gray-400">{empty}</p>}</section>; }
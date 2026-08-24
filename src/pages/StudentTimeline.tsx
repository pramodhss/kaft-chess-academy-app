import { useEffect, useState } from 'react';
import { CalendarCheck, ChevronDown, Download, ReceiptIndianRupee, Trophy } from 'lucide-react';
import { Layout } from '../components/Layout';
import { PageSkeleton } from '../components/Skeleton';
import { useAuth } from '../context/AuthContext';
import { readSheet } from '../lib/sheets';
import { monthLabel, rowToRegistration } from '../lib/tournamentManagement';
import { SHEET_ID, TABS } from '../config';

type EventKind = 'fee' | 'tournament' | 'attendance';
interface StudentEvent { key: string; student: string; date: string; title: string; details: string[]; kind: EventKind }

const SECTIONS: { kind: EventKind; title: string; empty: string; Icon: typeof CalendarCheck }[] = [
  { kind: 'attendance', title: 'Monthly attendance', empty: 'No monthly attendance recorded.', Icon: CalendarCheck },
  { kind: 'fee', title: 'Fee history', empty: 'No fee records available.', Icon: ReceiptIndianRupee },
  { kind: 'tournament', title: 'Tournament history', empty: 'No tournament results recorded.', Icon: Trophy },
];

function compactDetails(values: Array<string | undefined>) {
  return values.map(value => value?.trim()).filter((value): value is string => Boolean(value));
}

export function StudentTimeline() {
  const { token, logout } = useAuth();
  const [students, setStudents] = useState<string[]>([]);
  const [selected, setSelected] = useState('');
  const [events, setEvents] = useState<StudentEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    if (!token) return;
    Promise.all([
      readSheet(token, SHEET_ID, `'${TABS.STUDENTS}'!A:A`),
      readSheet(token, SHEET_ID, `'${TABS.FEES}'!A:N`),
      readSheet(token, SHEET_ID, `'${TABS.TOURNAMENTS}'!A:U`),
      readSheet(token, SHEET_ID, `'${TABS.TOURNAMENT_REGISTRATIONS}'!A:J`).catch(() => []),
      readSheet(token, SHEET_ID, `'${TABS.MONTHLY_ATT}'!A:E`),
    ]).then(([studentRows, feeRows, tournamentRows, registrationRows, attendanceRows]) => {
      const names = studentRows.slice(1).map(row => row[0]).filter(Boolean);
      setStudents(names);
      setSelected(current => current || names[0] || '');
      setEvents([
        ...feeRows.slice(1).filter(row => row[1]).map((row, index): StudentEvent => ({
          key: `fee-${index}`, student: row[1], date: row[9] || row[8] || row[3] || '', title: row[4] || 'Fee payment', kind: 'fee',
          details: compactDetails([
            `Status: ${row[11] || 'Not recorded'}`, `Due: ₹${row[5] || '0'}`, `Paid: ₹${row[6] || '0'}`, `Balance: ₹${row[7] || '0'}`,
            row[8] ? `Due date: ${row[8]}` : undefined, row[9] ? `Payment date: ${row[9]}` : undefined,
            row[10] ? `Method: ${row[10]}` : undefined, row[12] ? `Reference: ${row[12]}` : undefined,
            row[0] ? `Receipt: ${row[0]}` : undefined, row[13] ? `Notes: ${row[13]}` : undefined,
          ]),
        })),
        ...tournamentRows.slice(1).filter(row => row[1]).map((row, index): StudentEvent => ({
          key: `tournament-${index}`, student: row[1], date: row[6] || row[0] || '', title: row[4] || 'Tournament', kind: 'tournament',
          details: compactDetails([row[16], row[12] ? `Position: ${row[12]}` : undefined, row[13] ? `Score: ${row[13]}` : undefined]),
        })),
        ...registrationRows.slice(1).map((row, index) => rowToRegistration(row, index + 2)).filter(item => item.playing).map((item): StudentEvent => ({
          key: `registration-${item.rowIndex}`, student: item.studentName, date: item.tournamentDate || item.month,
          title: item.tournamentName || 'Tournament', kind: 'tournament',
          details: compactDetails([
            `Attending: Yes`, `Month: ${monthLabel(item.month)}`,
            `Entry fee: ₹${item.entryFee || '0'}`, `Fee paid: ${item.feePaid ? 'Yes' : 'No'}`,
          ]),
        })),
        ...attendanceRows.slice(1).filter(row => row[0]).map((row, index): StudentEvent => ({
          key: `attendance-${index}`, student: row[0], date: row[1] || '', title: row[1] || 'Monthly attendance', kind: 'attendance',
          details: compactDetails([`${row[2] || '0'} of ${row[3] || '0'} classes attended`, row[4] ? `Attendance: ${row[4]}` : undefined]),
        })),
      ]);
    }).catch((loadError: Error) => {
      if (loadError.message === 'TOKEN_EXPIRED') logout();
      else setError(loadError.message);
    }).finally(() => setLoading(false));
  }, [token, logout]);

  if (loading) return <Layout title="Student Timeline"><PageSkeleton /></Layout>;
  const visible = events.filter(event => event.student === selected).sort((left, right) => right.date.localeCompare(left.date));

  const downloadReport = async () => {
    if (!selected) return;
    setDownloading(true);
    try {
      const { downloadStudentTimelinePdf } = await import('../lib/studentInsightsPdf');
      downloadStudentTimelinePdf(selected, visible.map(item => ({
        date: item.date,
        type: SECTIONS.find(section => section.kind === item.kind)?.title ?? item.kind,
        title: item.title,
        details: item.details,
      })));
    } finally { setDownloading(false); }
  };

  return <Layout title="Student Timeline" action={selected ? <button type="button" onClick={downloadReport} disabled={downloading} className="header-action"><Download size={15} />{downloading ? 'Preparing…' : 'PDF'}</button> : undefined}>
    <div className="page-stack">
      {error && <div role="alert" className="error-state">{error}</div>}
      <label className="surface-card block p-3" htmlFor="timeline-student"><span className="field-label">Student</span><select id="timeline-student" value={selected} onChange={event => setSelected(event.target.value)} className="input">{students.map(name => <option key={name}>{name}</option>)}</select></label>
      {!error && SECTIONS.map(({ kind, title, empty, Icon }, sectionIndex) => {
        const items = visible.filter(item => item.kind === kind);
        return <details key={kind} className="timeline-section surface-card overflow-hidden" open={sectionIndex < 2}>
          <summary className="flex cursor-pointer list-none items-center gap-3 p-3">
            <span className="icon-tile"><Icon size={18} /></span>
            <span className="min-w-0 flex-1"><strong className="block text-sm text-gray-900">{title}</strong><span className="text-xs text-gray-500">{items.length} {items.length === 1 ? 'record' : 'records'}</span></span>
            <ChevronDown size={17} className="timeline-chevron text-gray-400" />
          </summary>
          <div className="timeline-content border-t border-gray-100 px-3 pb-3">
            {items.length === 0 && <p className="py-4 text-center text-xs text-gray-400">{empty}</p>}
            {items.map(item => <article key={item.key} className="border-b border-gray-100 py-3 last:border-b-0">
              <div className="flex items-start justify-between gap-3"><h2 className="text-sm font-semibold text-gray-900">{item.title}</h2><time className="flex-none text-[11px] text-gray-400">{item.date || 'Date not recorded'}</time></div>
              <div className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-gray-600">{item.details.map(detail => <p key={detail}>{detail}</p>)}</div>
            </article>)}
          </div>
        </details>;
      })}
    </div>
  </Layout>;
}
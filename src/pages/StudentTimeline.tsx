import { useEffect, useState } from 'react';
import { CalendarCheck, ReceiptIndianRupee, Trophy } from 'lucide-react';
import { Layout } from '../components/Layout';
import { PageSkeleton } from '../components/Skeleton';
import { useAuth } from '../context/AuthContext';
import { readSheet } from '../lib/sheets';
import { SHEET_ID, TABS } from '../config';

interface Event { key: string; date: string; title: string; detail: string; kind: 'fee' | 'tournament' | 'attendance' }
interface StudentEvent extends Event { student: string }

export function StudentTimeline() {
  const { token } = useAuth();
  const [students, setStudents] = useState<string[]>([]);
  const [selected, setSelected] = useState('');
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => { if (!token) return; Promise.all([readSheet(token, SHEET_ID, `'${TABS.STUDENTS}'!A:A`), readSheet(token, SHEET_ID, `'${TABS.FEES}'!A:N`), readSheet(token, SHEET_ID, `'${TABS.TOURNAMENTS}'!A:U`), readSheet(token, SHEET_ID, `'${TABS.MONTHLY_ATT}'!A:E`)]).then(([studentRows, feeRows, tournamentRows, attendanceRows]) => {
    const names = studentRows.slice(1).map(row => row[0]).filter(Boolean); setStudents(names); setSelected(current => current || names[0] || '');
    const all: StudentEvent[] = [
      ...feeRows.slice(1).filter(row => row[1]).map((row, index) => ({ key: `fee-${index}`, date: row[9] || row[8] || row[3] || '', title: `${row[4] || 'Fee'}: ${row[11] || 'Updated'}`, detail: `Paid ₹${row[6] || '0'} · Balance ₹${row[7] || '0'}`, kind: 'fee' as const, student: row[1] })),
      ...tournamentRows.slice(1).filter(row => row[1]).map((row, index) => ({ key: `tournament-${index}`, date: row[6] || row[0] || '', title: row[4] || 'Tournament', detail: [row[16], row[12] ? `Position ${row[12]}` : ''].filter(Boolean).join(' · '), kind: 'tournament' as const, student: row[1] })),
      ...attendanceRows.slice(1).filter(row => row[0]).map((row, index) => ({ key: `attendance-${index}`, date: row[1] || '', title: 'Monthly attendance', detail: `${row[2] || '0'} of ${row[3] || '0'} classes`, kind: 'attendance' as const, student: row[0] })),
    ];
    setEvents(all.map(({ student: _student, ...event }) => ({ ...event, key: `${event.key}:${_student}` } as Event)));
  }).finally(() => setLoading(false)); }, [token]);
  if (loading) return <Layout title="Student Timeline" showBack><PageSkeleton /></Layout>;
  const visible = events.filter(event => event.key.endsWith(`:${selected}`)).sort((left, right) => right.date.localeCompare(left.date));
  const icons = { fee: ReceiptIndianRupee, tournament: Trophy, attendance: CalendarCheck };
  return <Layout title="Student Timeline" showBack><div className="space-y-4 p-4 md:p-6"><label className="block text-xs font-semibold text-gray-500" htmlFor="timeline-student">Student</label><select id="timeline-student" value={selected} onChange={event => setSelected(event.target.value)} className="input">{students.map(name => <option key={name}>{name}</option>)}</select><div className="space-y-2">{visible.length === 0 && <p className="surface-card p-6 text-center text-sm text-gray-400">No timeline events yet.</p>}{visible.map(item => { const Icon = icons[item.kind]; return <article key={item.key} className="surface-card flex gap-3 p-4"><span className="flex h-9 w-9 flex-none items-center justify-center rounded-lg bg-gray-100 text-navy"><Icon size={18} /></span><div><time className="text-[11px] text-gray-400">{item.date || 'Date not recorded'}</time><h2 className="text-sm font-semibold text-gray-900">{item.title}</h2><p className="text-xs text-gray-500">{item.detail}</p></div></article>; })}</div></div></Layout>;
}
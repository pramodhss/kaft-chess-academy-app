import { useEffect, useState } from 'react';
import { Layout } from '../components/Layout';
import { Spinner } from '../components/Spinner';
import { EmptyState, ErrorState } from '../components/EmptyState';
import { useAuth } from '../context/AuthContext';
import { readSheet } from '../lib/sheets';
import { SHEET_ID, TABS } from '../config';

interface TimetableRow { day: string; batch: string; level: string; start: string; end: string; coach: string; coordinator: string; room: string; capacity: string; enrolled: string; seats: string; status: string; notes: string }

export function Timetable() {
  const { token, logout } = useAuth();
  const [rows, setRows] = useState<TimetableRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!token) return;
    (async () => {
      try {
        const data = await readSheet(token, SHEET_ID, `'${TABS.TIMETABLE}'!A:M`);
        setRows(data.slice(1).filter(r => r[0]?.trim()).map(r => ({
          day: r[0]??'', batch: r[1]??'', level: r[2]??'', start: r[3]??'',
          end: r[4]??'', coach: r[5]??'', coordinator: r[6]??'', room: r[7]??'',
          capacity: r[8]??'', enrolled: r[9]??'', seats: r[10]??'',
          status: r[11]??'', notes: r[12]??'',
        })));
      } catch (e: any) {
        if (e.message === 'TOKEN_EXPIRED') { logout(); return; }
        setError(e.message);
      } finally { setLoading(false); }
    })();
  }, [token]);

  if (loading) return <Layout title="Timetable" showBack><Spinner /></Layout>;

  const dayOrder = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const availableDays = Array.from(new Set(rows.map(row => row.day.trim()).filter(Boolean)))
    .sort((left, right) => {
      const leftIndex = dayOrder.findIndex(day => day.toLowerCase() === left.toLowerCase());
      const rightIndex = dayOrder.findIndex(day => day.toLowerCase() === right.toLowerCase());
      return (leftIndex < 0 ? dayOrder.length : leftIndex) - (rightIndex < 0 ? dayOrder.length : rightIndex);
    });

  return (
    <Layout title="Timetable" showBack>
      <div className="p-4 space-y-3">
        {error && <ErrorState message={error} onRetry={() => window.location.reload()} />}
        {!error && rows.length === 0 && (
          <EmptyState title="No timetable published" subtitle="Class schedules will appear here after they are added to the Timetable sheet." />
        )}
        {!error && availableDays.map(day => {
          const dayRows = rows.filter(row => row.day.trim().toLowerCase() === day.toLowerCase());
          return (
            <div key={day}>
              <h2 className="text-sm font-bold text-navy mb-2 uppercase tracking-wider">{day}</h2>
              {dayRows.map(row => (
                <div key={`${row.day}-${row.batch}-${row.start}`} className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 mb-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-semibold text-gray-900">{row.batch}</p>
                      <p className="text-xs text-gray-500">{row.level} · {row.room}</p>
                    </div>
                    <span className={row.status === 'Active' ? 'badge-green' : 'badge-gray'}>{row.status || 'Scheduled'}</span>
                  </div>
                  <div className="flex gap-4 mt-2 text-xs text-gray-600">
                    <span>⏰ {row.start} – {row.end}</span>
                    {row.coach && <span>👤 {row.coach}</span>}
                    {row.coordinator && <span>📋 {row.coordinator}</span>}
                    {row.capacity && <span>👥 {row.enrolled}/{row.capacity}</span>}
                  </div>
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </Layout>
  );
}

import { useEffect, useState } from 'react';
import { Layout } from '../components/Layout';
import { Spinner } from '../components/Spinner';
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

  if (loading) return <Layout title="Timetable"><Spinner /></Layout>;

  return (
    <Layout title="Timetable">
      <div className="p-4 space-y-3">
        {error && <p className="text-red-600 text-sm">{error}</p>}
        {['Saturday', 'Sunday'].map(day => {
          const dayRows = rows.filter(r => r.day === day);
          if (!dayRows.length) return null;
          return (
            <div key={day}>
              <h2 className="text-sm font-bold text-navy mb-2 uppercase tracking-wider">{day}</h2>
              {dayRows.map((r, i) => (
                <div key={i} className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 mb-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-semibold text-gray-900">{r.batch}</p>
                      <p className="text-xs text-gray-500">{r.level} · {r.room}</p>
                    </div>
                    <span className={r.status === 'Active' ? 'badge-green' : 'badge-gray'}>{r.status}</span>
                  </div>
                  <div className="flex gap-4 mt-2 text-xs text-gray-600">
                    <span>⏰ {r.start} – {r.end}</span>
                    <span>👤 {r.coach}</span>
                    {r.coordinator && <span>📋 {r.coordinator}</span>}
                    {r.capacity && <span>👥 {r.enrolled}/{r.capacity}</span>}
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

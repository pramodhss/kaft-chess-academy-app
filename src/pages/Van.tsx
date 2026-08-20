import { useEffect, useState } from 'react';
import { Layout } from '../components/Layout';
import { Spinner } from '../components/Spinner';
import { useAuth } from '../context/AuthContext';
import { readSheet } from '../lib/sheets';
import { SHEET_ID, TABS } from '../config';
import type { VanEntry } from '../types';

function rowToVan(row: string[], idx: number): VanEntry {
  return {
    vanId: row[0]??'', studentName: row[1]??'', batch: row[2]??'', parent: row[3]??'',
    pickupLocation: row[4]??'', pickupTime: row[5]??'', dropLocation: row[6]??'',
    dropTime: row[7]??'', driverName: row[8]??'', driverPhone: row[9]??'',
    vanFee: row[10]??'', vanFeeStatus: row[11]??'', notes: row[12]??'', rowIndex: idx + 2,
  };
}

export function Van() {
  const { token, logout } = useAuth();
  const [entries, setEntries] = useState<VanEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!token) return;
    (async () => {
      try {
        const rows = await readSheet(token, SHEET_ID, `'${TABS.VAN}'!A:M`);
        setEntries(rows.slice(1).filter(r => r[1]?.trim()).map(rowToVan));
      } catch (e: any) {
        if (e.message === 'TOKEN_EXPIRED') { logout(); return; }
        setError(e.message);
      } finally { setLoading(false); }
    })();
  }, [token]);

  const filtered = search
    ? entries.filter(e => e.studentName.toLowerCase().includes(search.toLowerCase()) || (e.vanId ?? '').toLowerCase().includes(search.toLowerCase()))
    : entries;

  if (loading) return <Layout title="Van Allotment"><Spinner /></Layout>;

  return (
    <Layout title="Van Allotment">
      <div className="p-4 space-y-3">
        {error && <p className="text-red-600 text-sm">{error}</p>}
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search by student or van ID…"
          className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-chess-blue" />

        {filtered.map((e, i) => (
          <div key={i} className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
            <div className="flex items-start justify-between">
              <div>
                <p className="font-semibold text-gray-900">{e.studentName}</p>
                <p className="text-xs text-gray-500">{e.batch} · {e.parent}</p>
              </div>
              <span className={e.vanFeeStatus === 'Paid' ? 'badge-green' : 'badge-amber'}>{e.vanFeeStatus || '—'}</span>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-1 text-xs text-gray-600">
              {e.pickupLocation && <span>📍 {e.pickupLocation} {e.pickupTime && `@ ${e.pickupTime}`}</span>}
              {e.dropLocation && <span>🏁 {e.dropLocation} {e.dropTime && `@ ${e.dropTime}`}</span>}
              {e.driverName && <span>🚗 {e.driverName}</span>}
              {e.vanFee && <span>💰 ₹{e.vanFee}/mo</span>}
            </div>
          </div>
        ))}
      </div>
    </Layout>
  );
}

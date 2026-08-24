import { useEffect, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { Layout } from '../components/Layout';
import { PageSkeleton } from '../components/Skeleton';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { clearSheetRange, readSheet, readSheetLive } from '../lib/sheets';
import { parseSheetNumber } from '../lib/values';
import { phoneValidationError } from '../lib/validation';
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

function vanEntryValidationError(entry: VanEntry): string {
  if (!entry.studentName.trim()) return 'Student name is missing.';
  const phoneError = phoneValidationError(entry.driverPhone, 'Driver phone');
  if (phoneError) return phoneError;
  if (entry.vanFee.trim() && parseSheetNumber(entry.vanFee) <= 0) return 'Van fee must be a positive numeric amount.';
  return '';
}

export function Van() {
  const { token, logout } = useAuth();
  const toast = useToast();
  const [entries, setEntries] = useState<VanEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [deleting, setDeleting] = useState<number | null>(null);

  useEffect(() => {
    if (!token) return;
    (async () => {
      try {
        const rows = await readSheet(token, SHEET_ID, `'${TABS.VAN}'!A:M`);
        setEntries(rows.slice(1).map((row, index) => rowToVan(row, index)).filter(entry => entry.studentName.trim()));
      } catch (e: any) {
        if (e.message === 'TOKEN_EXPIRED') { logout(); return; }
        setError(e.message);
      } finally { setLoading(false); }
    })();
  }, [token]);

  const filtered = search
    ? entries.filter(e => e.studentName.toLowerCase().includes(search.toLowerCase()) || (e.vanId ?? '').toLowerCase().includes(search.toLowerCase()))
    : entries;

  const removeEntry = async (entry: VanEntry) => {
    if (!token || !window.confirm(`Remove ${entry.studentName}'s van allotment? This cannot be undone.`)) return;
    setDeleting(entry.rowIndex);
    try {
      const currentRows = await readSheetLive(token, SHEET_ID, `'${TABS.VAN}'!A${entry.rowIndex}:M${entry.rowIndex}`);
      const currentEntry = rowToVan(currentRows[0] ?? [], entry.rowIndex - 2);
      if (JSON.stringify(currentEntry) !== JSON.stringify(entry)) {
        toast.info('This van allotment was changed on another device. Reload before removing it.');
        return;
      }
      await clearSheetRange(token, SHEET_ID, `'${TABS.VAN}'!A${entry.rowIndex}:M${entry.rowIndex}`);
      setEntries(prev => prev.filter(item => item.rowIndex !== entry.rowIndex));
      toast.success(`${entry.studentName}'s van allotment was removed.`);
    } catch (e: any) { toast.error('Remove failed: ' + e.message); }
    finally { setDeleting(null); }
  };

  if (loading) return <Layout title="Van Allotment" showBack><PageSkeleton /></Layout>;

  return (
    <Layout title="Van Allotment" showBack>
      <div className="p-4 space-y-3">
        {error && <p className="text-red-600 text-sm">{error}</p>}
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search by student or van ID…"
          className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-chess-blue" />

        {filtered.map(e => {
          const validationError = vanEntryValidationError(e);
          return <div key={e.rowIndex} className={`bg-white rounded-xl p-4 shadow-sm border ${validationError ? 'border-red-200' : 'border-gray-100'}`}>
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
              {e.driverPhone && <a href={`tel:${e.driverPhone}`} className="text-chess-blue underline">☎ {e.driverPhone}</a>}
              {e.vanFee && <span>💰 ₹{parseSheetNumber(e.vanFee).toLocaleString('en-IN')}/mo</span>}
            </div>
            {validationError && <p role="alert" className="mt-2 text-xs text-red-600">Check Sheet data: {validationError}</p>}
            <div className="mt-3 flex justify-end">
              <button type="button" onClick={() => removeEntry(e)} disabled={deleting === e.rowIndex}
                aria-label={`Remove van allotment for ${e.studentName}`} title="Remove van allotment"
                className="p-2 rounded-lg bg-red-50 text-red-700 disabled:opacity-50">
                <Trash2 size={17} aria-hidden="true" />
              </button>
            </div>
          </div>;
        })}
      </div>
    </Layout>
  );
}

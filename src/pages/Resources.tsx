import { useEffect, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { Layout } from '../components/Layout';
import { Spinner } from '../components/Spinner';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { readSheet, appendRows, clearSheetRange, ensureSheet } from '../lib/sheets';
import { SHEET_ID, TABS } from '../config';
import { useCoachName } from '../hooks/useCoachName';

const HEADERS = ['Name','Type','URL','Description','Added By','Date Added'];
const TYPES = ['eBook','PDF','Video','Article','Link','Other'];
const TYPE_ICON: Record<string,string> = { eBook:'📖', PDF:'📄', Video:'🎥', Article:'📰', Link:'🔗', Other:'📎' };
const EMPTY = { name:'', type:'PDF', url:'', description:'' };

function isWebUrl(value: string): boolean {
  try { return ['http:', 'https:'].includes(new URL(value).protocol); } catch { return false; }
}

interface Resource { name:string; type:string; url:string; description:string; addedBy:string; dateAdded:string; rowIndex:number }

function rowToResource(row: string[], rowIndex: number): Resource {
  return {
    name:row[0]??'', type:row[1]??'', url:row[2]??'', description:row[3]??'',
    addedBy:row[4]??'', dateAdded:row[5]??'', rowIndex,
  };
}

export function Resources() {
  const { token, logout } = useAuth();
  const { coachName: savedCoachName } = useCoachName();
  const toast = useToast();
  const [items, setItems] = useState<Resource[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ ...EMPTY });
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<number | null>(null);
  const [filter, setFilter] = useState('');
  const coachName = savedCoachName || 'Coach';

  const load = async () => {
    if (!token) return;
    setLoading(true); setError('');
    try {
      await ensureSheet(token, SHEET_ID, TABS.RESOURCES, HEADERS);
      const rows = await readSheet(token, SHEET_ID, `'${TABS.RESOURCES}'!A:F`);
      setItems(rows.slice(1).map((row, index) => rowToResource(row, index + 2)).filter(item => item.name.trim()));
    } catch(e:any) { if(e.message==='TOKEN_EXPIRED'){logout();return;} setError(e.message); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [token]);

  const handleAdd = async () => {
    if (!token || !form.name.trim() || !form.url.trim()) return;
    if (!isWebUrl(form.url.trim())) { toast.error('Enter a valid http:// or https:// resource URL.'); return; }
    setSaving(true);
    try {
      const rowIndex = await appendRows(token, SHEET_ID, `'${TABS.RESOURCES}'!A:F`, [[
        form.name, form.type, form.url, form.description, coachName, new Date().toLocaleDateString('en-IN'),
      ]]);
      const dateAdded = new Date().toLocaleDateString('en-IN');
      setItems(prev => [...prev, { ...form, addedBy: coachName, dateAdded, rowIndex }]);
      setShowAdd(false);
      setForm({ ...EMPTY });
      toast.success(`${form.name} was added to Resources.`);
    } catch(e:any) { toast.error('Save failed: ' + e.message); }
    finally { setSaving(false); }
  };

  const removeResource = async (resource: Resource) => {
    if (!token || !window.confirm(`Remove ${resource.name} from Resources? This cannot be undone.`)) return;
    setDeleting(resource.rowIndex);
    try {
      const currentRows = await readSheet(token, SHEET_ID, `'${TABS.RESOURCES}'!A${resource.rowIndex}:F${resource.rowIndex}`);
      const currentResource = rowToResource(currentRows[0] ?? [], resource.rowIndex);
      if (JSON.stringify(currentResource) !== JSON.stringify(resource)) {
        toast.info('This resource was changed on another device. Reload before removing it.');
        return;
      }
      await clearSheetRange(token, SHEET_ID, `'${TABS.RESOURCES}'!A${resource.rowIndex}:F${resource.rowIndex}`);
      setItems(prev => prev.filter(item => item.rowIndex !== resource.rowIndex));
      toast.success(`${resource.name} was removed from Resources.`);
    } catch (e: any) { toast.error('Remove failed: ' + e.message); }
    finally { setDeleting(null); }
  };

  const u = (k: keyof typeof EMPTY) => (e: React.ChangeEvent<HTMLInputElement|HTMLSelectElement|HTMLTextAreaElement>) => setForm({...form,[k]:e.target.value});
  const visible = filter ? items.filter(i => i.type === filter) : items;

  if (loading) return <Layout title="Resources"><Spinner /></Layout>;

  return (
    <Layout title="📚 Resources & eBooks" showBack action={
      <button onClick={() => setShowAdd(true)} className="bg-white text-navy text-sm font-bold px-3 py-1 rounded-full">+ Add</button>
    }>
      <div className="p-4 space-y-3">
        {error && <p className="text-red-600 text-sm bg-red-50 p-3 rounded-xl">{error}</p>}
        <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
          {['', ...TYPES].map(t => (
            <button key={t} onClick={() => setFilter(t)}
              className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium ${filter===t?'bg-navy text-white':'bg-gray-100 text-gray-600'}`}>
              {t || 'All'} {t ? `(${items.filter(i=>i.type===t).length})` : `(${items.length})`}
            </button>
          ))}
        </div>
        {visible.length===0 && <div className="text-center py-12 text-gray-400"><p className="text-4xl mb-2">📚</p><p>No resources yet. Tap + Add to share a link or eBook.</p></div>}
        {visible.map(r => (
          <div key={r.rowIndex} className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
            <div className="flex items-start gap-3">
              <span className="text-3xl">{TYPE_ICON[r.type] ?? '📎'}</span>
              <div className="flex-1">
                <p className="font-semibold text-gray-900">{r.name}</p>
                <span className="badge-blue text-xs">{r.type}</span>
                {r.description && <p className="text-xs text-gray-500 mt-1">{r.description}</p>}
                <a href={r.url} target="_blank" rel="noopener noreferrer"
                  className="mt-2 inline-flex items-center gap-1 bg-navy text-white text-xs font-medium px-3 py-1.5 rounded-full">
                  {r.type === 'Video' ? '▶ Watch' : r.type === 'PDF' || r.type === 'eBook' ? '⬇ Download / Open' : '🔗 Open'}
                </a>
              </div>
            </div>
            <div className="mt-2 flex items-center justify-between gap-2">
              <p className="text-xs text-gray-300">Added by {r.addedBy} · {r.dateAdded}</p>
              <button type="button" onClick={() => removeResource(r)} disabled={deleting === r.rowIndex}
                aria-label={`Remove ${r.name}`} title="Remove resource"
                className="p-2 rounded-lg bg-red-50 text-red-700 disabled:opacity-50">
                <Trash2 size={17} aria-hidden="true" />
              </button>
            </div>
          </div>
        ))}
      </div>
      {showAdd && (
        <div className="fixed inset-0 bg-black/50 flex items-end z-50" onClick={() => setShowAdd(false)}>
          <div className="bg-white w-full rounded-t-2xl p-5 max-h-[90vh] overflow-y-auto" onClick={e=>e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold text-lg text-navy">Add Resource</h2>
              <button onClick={() => setShowAdd(false)} className="text-gray-400 text-2xl">×</button>
            </div>
            <div className="space-y-3">
              <F label="Name *"><input value={form.name} onChange={u('name')} className="input" placeholder="e.g. Chess Tactics for Beginners" /></F>
              <F label="Type"><select value={form.type} onChange={u('type')} className="input">{TYPES.map(o=><option key={o}>{o}</option>)}</select></F>
              <F label="URL / Link *"><input value={form.url} onChange={u('url')} className="input" placeholder="https://drive.google.com/… or any URL" /></F>
              <F label="Description"><textarea value={form.description} onChange={u('description')} className="input" rows={2} /></F>
              <p className="text-xs text-gray-400">Will be added by: <strong>{coachName}</strong></p>
            </div>
            <button onClick={handleAdd} disabled={saving||!form.name.trim()||!form.url.trim()}
              className="w-full bg-navy text-white py-3 rounded-xl font-semibold mt-4 disabled:opacity-60 flex items-center justify-center gap-2">
              {saving && <span className="button-spinner" aria-hidden="true"/>}
              {saving ? 'Adding resource…' : 'Add Resource'}
            </button>
          </div>
        </div>
      )}
    </Layout>
  );
}
function F({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label className="text-xs font-medium text-gray-500 mb-1 block">{label}</label>{children}</div>;
}

import { useEffect, useState } from 'react';
import { Download, Eye, FileImage, FileText, Library, Link2, Plus, RefreshCw, Search, Share2, Trash2, X } from 'lucide-react';
import { Layout } from '../components/Layout';
import { PageSkeleton } from '../components/Skeleton';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { clearSheetReadCache, readSheet, readSheetLive, appendRows, clearSheetRange, ensureSheet } from '../lib/sheets';
import { SHEET_ID, TABS } from '../config';
import { useCoachName } from '../hooks/useCoachName';
import { deleteDriveFile, uploadFileToDrive, uploadPdf, validateImage, validatePdf } from '../lib/drive';
import { recordAudit } from '../lib/audit';

const HEADERS = ['Name','Type','URL','Description','Added By','Date Added','Drive File ID'];
const TYPES = ['PDF','Image','Link'];
const TYPE_ICON: Record<string, React.ElementType> = { PDF: FileText, Image: FileImage, Link: Link2 };
const EMPTY = { name:'', type:'PDF', url:'', description:'' };

function isWebUrl(value: string): boolean {
  try { return ['http:', 'https:'].includes(new URL(value).protocol); } catch { return false; }
}

interface Resource { name:string; type:string; url:string; description:string; addedBy:string; dateAdded:string; fileId:string; rowIndex:number }

function rowToResource(row: string[], rowIndex: number): Resource {
  return {
    name:row[0]??'', type:row[1]??'', url:row[2]??'', description:row[3]??'',
    addedBy:row[4]??'', dateAdded:row[5]??'', fileId:row[6]??'', rowIndex,
  };
}

function isSameResource(current: Resource, expected: Resource) {
  return current.rowIndex === expected.rowIndex
    && current.name === expected.name
    && current.type === expected.type
    && current.url === expected.url
    && current.fileId === expected.fileId;
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
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<'newest' | 'oldest' | 'name'>('newest');
  const [syncing, setSyncing] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [shareByLink, setShareByLink] = useState(false);
  const coachName = savedCoachName || 'Coach';

  const load = async () => {
    if (!token) return;
    setLoading(true); setError('');
    try {
      await ensureSheet(token, SHEET_ID, TABS.RESOURCES, HEADERS);
      const rows = await readSheet(token, SHEET_ID, `'${TABS.RESOURCES}'!A:G`);
      setItems(rows.slice(1).map((row, index) => rowToResource(row, index + 2)).filter(item => item.name.trim()));
    } catch(e:any) { if(e.message==='TOKEN_EXPIRED'){logout();return;} setError(e.message); }
    finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, [token]);

  const sync = () => {
    clearSheetReadCache(SHEET_ID);
    setSyncing(true);
    void load().finally(() => setSyncing(false));
  };

  const handleAdd = async () => {
    if (!token || !form.name.trim() || (!form.url.trim() && !uploadFile)) return;
    if (!uploadFile && !isWebUrl(form.url.trim())) { toast.error('Enter a valid http:// or https:// resource URL.'); return; }
    setSaving(true);
    try {
      let url = form.url.trim();
      let fileId = '';
      if (uploadFile) {
        const isPdf = uploadFile.type === 'application/pdf' || uploadFile.name.toLowerCase().endsWith('.pdf');
        const validationError = isPdf ? await validatePdf(uploadFile) : validateImage(uploadFile);
        if (validationError) { toast.error(validationError); return; }
        const uploaded = isPdf ? await uploadPdf(token, uploadFile, shareByLink) : await uploadFileToDrive(token, uploadFile, shareByLink);
        url = uploaded.webViewLink;
        fileId = uploaded.id;
        if (shareByLink && !uploaded.sharingEnabled) toast.info('File uploaded, but this Google account does not allow public link sharing. Signed-in users can still open it.');
      }
      const rowIndex = await appendRows(token, SHEET_ID, `'${TABS.RESOURCES}'!A:G`, [[
        form.name, form.type, url, form.description, coachName, new Date().toLocaleDateString('en-IN'), fileId,
      ]]);
      const dateAdded = new Date().toLocaleDateString('en-IN');
      setItems(prev => [...prev, { ...form, url, fileId, addedBy: coachName, dateAdded, rowIndex }]);
      setShowAdd(false);
      setForm({ ...EMPTY });
      setUploadFile(null);
      setShareByLink(false);
      void recordAudit(token, 'CREATE', 'Resources', form.name, fileId ? 'Drive PDF' : 'External link').catch(() => undefined);
      toast.success(`${form.name} was added to Resources.`);
    } catch(e:any) {
      if (e.message === 'TOKEN_EXPIRED') { logout(); return; }
      toast.error('Save failed: ' + e.message);
    }
    finally { setSaving(false); }
  };

  const removeResource = async (resource: Resource) => {
    if (!token || !window.confirm(`Remove ${resource.name} from Resources? This cannot be undone.`)) return;
    setDeleting(resource.rowIndex);
    try {
      const currentRows = await readSheetLive(token, SHEET_ID, `'${TABS.RESOURCES}'!A${resource.rowIndex}:G${resource.rowIndex}`);
      const currentResource = rowToResource(currentRows[0] ?? [], resource.rowIndex);
      if (!isSameResource(currentResource, resource)) {
        setItems(prev => prev.map(item => item.rowIndex === resource.rowIndex ? currentResource : item));
        toast.info('This resource was changed on another device. The latest values were loaded — review and try removing it again.');
        return;
      }
      await clearSheetRange(token, SHEET_ID, `'${TABS.RESOURCES}'!A${resource.rowIndex}:G${resource.rowIndex}`);
      if (resource.fileId) await deleteDriveFile(token, resource.fileId).catch(() => toast.info('Resource removed; the Drive file could not be deleted.'));
      void recordAudit(token, 'DELETE', 'Resources', resource.name).catch(() => undefined);
      setItems(prev => prev.filter(item => item.rowIndex !== resource.rowIndex));
      toast.success(`${resource.name} was removed from Resources.`);
    } catch (e: any) { toast.error('Remove failed: ' + e.message); }
    finally { setDeleting(null); }
  };

  const u = (k: keyof typeof EMPTY) => (e: React.ChangeEvent<HTMLInputElement|HTMLSelectElement|HTMLTextAreaElement>) => setForm({...form,[k]:e.target.value});
  const shareResource = async (resource: Resource) => {
    try {
      if (navigator.share) await navigator.share({ title: resource.name, url: resource.url });
      else {
        await navigator.clipboard.writeText(resource.url);
        toast.success('Resource link copied.');
      }
    } catch (shareError) {
      if (shareError instanceof DOMException && shareError.name === 'AbortError') return;
      toast.error('Unable to share this resource.');
    }
  };
  const displayTypes = [...new Set(items.map(i => i.type))];
  const visible = [...items]
    .filter(item => !filter || item.type === filter)
    .filter(item => {
      const query = search.trim().toLowerCase();
      return !query || `${item.name} ${item.description} ${item.addedBy}`.toLowerCase().includes(query);
    })
    .sort((left, right) => sort === 'name'
      ? left.name.localeCompare(right.name)
      : (sort === 'newest' ? -1 : 1) * left.rowIndex.toString().localeCompare(right.rowIndex.toString(), undefined, { numeric: true }));

  if (loading) return <Layout title="Resources"><PageSkeleton /></Layout>;

  return (
    <Layout title="Resources & eBooks" showBack action={
      <>
        <button type="button" onClick={sync} disabled={syncing} aria-label="Sync latest changes" title="Sync latest changes"
          className="icon-button"><RefreshCw size={16} className={syncing ? 'animate-spin' : ''} aria-hidden="true" /></button>
        <button type="button" onClick={() => setShowAdd(true)} aria-label="Add resource" className="header-action-add"><Plus size={16} aria-hidden="true" /> Add</button>
      </>
    }>
      <div className="p-4 space-y-3">
        {error && <p className="text-red-600 text-sm bg-red-50 p-3 rounded-xl">{error}</p>}
        <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
          <label className="relative block min-w-0">
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" aria-hidden="true" />
            <input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search resources…" aria-label="Search resources" className="input input-with-icon" />
          </label>
          <select value={sort} onChange={event => setSort(event.target.value as typeof sort)} className="input w-auto text-xs" aria-label="Sort resources">
            <option value="newest">Newest</option>
            <option value="oldest">Oldest</option>
            <option value="name">Name A-Z</option>
          </select>
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
          {['', ...displayTypes].map(t => (
            <button type="button" key={t} onClick={() => setFilter(t)}
              className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${filter===t?'bg-navy text-white':'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
              {t || 'All'} ({t ? items.filter(i=>i.type===t).length : items.length})
            </button>
          ))}
        </div>
        {visible.length===0 && <div className="flex flex-col items-center py-14 text-center text-gray-400"><span className="mb-3 flex h-12 w-12 items-center justify-center rounded-lg bg-gray-100 text-gray-500"><Library size={23} aria-hidden="true" /></span><p className="font-medium text-gray-600">No resources yet</p><p className="mt-1 max-w-xs text-sm">Add a link, PDF, video, or eBook for the academy.</p></div>}
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {visible.map(r => {
          const TypeIcon = TYPE_ICON[r.type] ?? FileText;
          const isDriveFile = Boolean(r.fileId);
          const downloadUrl = r.fileId ? `https://drive.google.com/uc?export=download&id=${encodeURIComponent(r.fileId)}` : r.url;
          return (
          <div key={r.rowIndex} className="surface-card p-4">
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-gray-100 text-navy"><TypeIcon size={20} aria-hidden="true" /></span>
              <div className="flex-1">
                <p className="font-semibold text-gray-900">{r.name}</p>
                <span className="badge-blue text-xs">{r.type}</span>
                {r.description && <p className="text-xs text-gray-500 mt-1">{r.description}</p>}
                <div className="mt-3 flex flex-wrap gap-1.5">
                  <a href={r.url} target="_blank" rel="noopener noreferrer" className="resource-action bg-navy text-white"><Eye size={14} aria-hidden="true" />View</a>
                  {isDriveFile && <a href={downloadUrl} target="_blank" rel="noopener noreferrer" download className="resource-action border border-gray-200 bg-white text-gray-700"><Download size={14} aria-hidden="true" />Download</a>}
                  <button type="button" onClick={() => shareResource(r)} className="resource-action border border-gray-200 bg-white text-gray-700"><Share2 size={14} aria-hidden="true" />Share</button>
                </div>
              </div>
            </div>
            <div className="mt-2 flex items-center justify-between gap-2">
              <p className="text-xs text-gray-300">Added by {r.addedBy} · {r.dateAdded}</p>
              <button type="button" onClick={() => removeResource(r)} disabled={deleting === r.rowIndex}
                aria-label={`Delete ${r.name}`} title="Delete resource"
                className="resource-action bg-red-50 text-red-700 disabled:opacity-50">
                <Trash2 size={15} aria-hidden="true" />Delete
              </button>
            </div>
          </div>
          );
        })}
        </div>
      </div>
      {showAdd && (
        <div className="modal-backdrop items-end justify-center sm:items-center">
          <dialog open aria-labelledby="add-resource-title" className="modal-panel m-0 max-h-[90vh] max-w-lg overflow-y-auto p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 id="add-resource-title" className="font-bold text-lg text-navy">Add Resource</h2>
              <button type="button" onClick={() => setShowAdd(false)} aria-label="Close" title="Close" className="flex h-9 w-9 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100"><X size={19} aria-hidden="true" /></button>
            </div>
            <div className="space-y-3">
              <F label="Name *"><input value={form.name} onChange={u('name')} className="input" placeholder="e.g. Chess Tactics for Beginners" /></F>
              <F label="Type"><select value={form.type} onChange={u('type')} className="input">{TYPES.map(o => <option key={o}>{o}</option>)}</select></F>
              <F label="Upload PDF or Image">
                <input type="file" accept="application/pdf,.pdf,image/jpeg,image/png,image/gif,image/webp"
                  onChange={event => {
                    const file = event.target.files?.[0] ?? null;
                    setUploadFile(file);
                    if (file && !form.name.trim()) {
                      const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
                      setForm(current => ({ ...current, name: file.name.replace(/\.(pdf|jpe?g|png|gif|webp)$/i, ''), type: isPdf ? 'PDF' : 'Image' }));
                    }
                  }}
                  className="input cursor-pointer file:mr-3 file:cursor-pointer file:rounded-md file:border-0 file:bg-navy file:px-3 file:py-1 file:text-xs file:font-semibold file:text-white hover:file:bg-navy/80" />
              </F>
              {uploadFile && <label className="flex items-center gap-2 text-xs text-gray-600"><input type="checkbox" checked={shareByLink} onChange={event => setShareByLink(event.target.checked)} className="h-4 w-4" /> Allow anyone with the link to view this file</label>}
              <div className="flex items-center gap-2 text-xs text-gray-400"><span className="h-px flex-1 bg-gray-200" />or add a link<span className="h-px flex-1 bg-gray-200" /></div>
              <F label="URL / Link"><input value={form.url} onChange={u('url')} className="input" placeholder="https://drive.google.com/… or any URL" /></F>
              <F label="Description"><textarea value={form.description} onChange={u('description')} className="input" rows={2} /></F>
              <p className="text-xs text-gray-400">Will be added by: <strong>{coachName}</strong></p>
            </div>
            <button type="button" onClick={handleAdd} disabled={saving||!form.name.trim()||(!form.url.trim()&&!uploadFile)}
              className="primary-action mt-4 w-full">
              {saving && <span className="button-spinner" aria-hidden="true"/>}
              {saving ? 'Adding resource…' : 'Add Resource'}
            </button>
          </dialog>
        </div>
      )}
    </Layout>
  );
}
function F({ label, children }: Readonly<{ label: string; children: React.ReactNode }>) {
  return <label className="block"><span className="text-xs font-medium text-gray-500 mb-1 block">{label}</span>{children}</label>;
}

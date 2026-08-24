import { useEffect, useState } from 'react';
import { Plus, Save, Trash2 } from 'lucide-react';
import { Layout } from '../components/Layout';
import { PageSkeleton } from '../components/Skeleton';
import { SHEET_ID } from '../config';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useCoachName } from '../hooks/useCoachName';
import {
  ensureStudentOptionsSheet,
  loadStudentOptions,
  saveStudentOptionList,
} from '../lib/studentOptions';
import type { StudentOptionKey, StudentOptions } from '../lib/studentOptions';
import { loadRoles, saveRoles, type AppRole, type RoleEntry } from '../lib/roles';
import { recordAudit } from '../lib/audit';

export function AdminSettings() {
  const { token, email, logout } = useAuth();
  const { coachName } = useCoachName();
  const toast = useToast();
  const [options, setOptions] = useState<StudentOptions | null>(null);
  const [saving, setSaving] = useState<StudentOptionKey | null>(null);
  const [error, setError] = useState('');
  const [roles, setRoles] = useState<RoleEntry[]>([]);
  const [savingRoles, setSavingRoles] = useState(false);

  const load = async () => {
    if (!token) return;
    setError('');
    try {
      await ensureStudentOptionsSheet(token, SHEET_ID);
      const [studentOptions, roleEntries] = await Promise.all([loadStudentOptions(token, SHEET_ID, true), loadRoles(token, SHEET_ID)]);
      setOptions(studentOptions);
      setRoles(roleEntries.length > 0 ? roleEntries : [{ email: email ?? '', role: 'admin' }]);
    } catch (loadError: any) {
      if (loadError.message === 'TOKEN_EXPIRED') { logout(); return; }
      setError(loadError.message);
    }
  };

  const saveRoleEntries = async () => {
    if (!token) return;
    setSavingRoles(true);
    try {
      await saveRoles(token, SHEET_ID, roles, coachName || email || 'Admin');
      void recordAudit(token, 'UPDATE', 'Settings', 'User roles', `${roles.length} role mappings`).catch(() => undefined);
      toast.success('Staff roles updated. Changes apply on the next sign-in.');
    } catch (saveError: any) { toast.error(`Save failed: ${saveError.message}`); }
    finally { setSavingRoles(false); }
  };

  useEffect(() => { void load(); }, [token]);

  const updateValues = (section: 'batches' | 'levels', values: string[]) => {
    setOptions(current => current ? {
      ...current,
      [section]: { ...current[section], values },
    } : current);
  };

  const save = async (section: 'batches' | 'levels', key: StudentOptionKey) => {
    if (!token || !options) return;
    setSaving(key);
    try {
      const result = await saveStudentOptionList(
        token,
        SHEET_ID,
        key,
        options[section].values,
        options[section].version,
        coachName || 'Admin',
      );
      const latestOptions = await loadStudentOptions(token, SHEET_ID, true);
      setOptions(latestOptions);
      if (result.concurrentUpdate) {
        toast.error('Another admin updated this list at the same time. The latest Sheet values were reloaded; review them before saving again.');
      } else {
        toast.success(`${section === 'batches' ? 'Student types' : 'Chess levels'} updated successfully.`);
      }
    } catch (saveError: any) {
      if (saveError.message === 'SETTINGS_CONFLICT') {
        setOptions(await loadStudentOptions(token, SHEET_ID, true));
        toast.error('Another admin changed this list. Latest values were reloaded; review and try again.');
      } else {
        toast.error(`Save failed: ${saveError.message}`);
      }
    } finally {
      setSaving(null);
    }
  };

  if (!options && !error) return <Layout title="Admin Settings"><PageSkeleton /></Layout>;

  return (
    <Layout title="Admin Settings">
      <div className="p-4 pb-24 space-y-5">
        {error && (
          <div className="bg-red-50 border border-red-200 p-4 rounded-lg">
            <p className="text-sm text-red-700">{error}</p>
            <button type="button" onClick={load} className="mt-2 text-sm font-semibold text-red-700 underline">Retry</button>
          </div>
        )}
        {options && (
          <>
            <OptionEditor
              title="Student Types / Batches"
              values={options.batches.values}
              saving={saving === 'student_batches'}
              onChange={values => updateValues('batches', values)}
              onSave={() => save('batches', 'student_batches')}
            />
            <RoleEditor roles={roles} saving={savingRoles} onChange={setRoles} onSave={saveRoleEntries} />
            <OptionEditor
              title="Chess Levels"
              values={options.levels.values}
              saving={saving === 'student_levels'}
              onChange={values => updateValues('levels', values)}
              onSave={() => save('levels', 'student_levels')}
            />
          </>
        )}
      </div>
    </Layout>
  );
}

function RoleEditor({ roles, saving, onChange, onSave }: Readonly<{ roles: RoleEntry[]; saving: boolean; onChange: (roles: RoleEntry[]) => void; onSave: () => void }>) {
  const roleOptions: AppRole[] = ['admin', 'coach', 'finance', 'transport', 'viewer'];
  return <section><div className="mb-3 flex items-center justify-between"><div><h2 className="text-sm font-bold text-navy">Staff Roles</h2><p className="text-xs text-gray-400">Map Google account emails to app responsibilities.</p></div><button type="button" onClick={() => onChange([...roles, { email: '', role: 'coach' }])} className="flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 bg-white text-navy" aria-label="Add staff role"><Plus size={18} /></button></div><div className="space-y-2">{roles.map((entry, index) => <div key={`${entry.email}-${index}`} className="surface-card grid grid-cols-[1fr_auto_auto] gap-2 p-2"><input type="email" value={entry.email} onChange={event => onChange(roles.map((role, roleIndex) => roleIndex === index ? { ...role, email: event.target.value } : role))} className="input" placeholder="coach@example.com" aria-label={`Staff email ${index + 1}`} /><select value={entry.role} onChange={event => onChange(roles.map((role, roleIndex) => roleIndex === index ? { ...role, role: event.target.value as AppRole } : role))} className="input w-28" aria-label={`Role ${index + 1}`}>{roleOptions.map(role => <option key={role}>{role}</option>)}</select><button type="button" onClick={() => onChange(roles.filter((_, roleIndex) => roleIndex !== index))} className="flex h-10 w-10 items-center justify-center rounded-lg text-red-600" aria-label={`Remove ${entry.email || 'role'}`}><Trash2 size={17} /></button></div>)}</div><button type="button" onClick={onSave} disabled={saving || roles.some(entry => !entry.email.trim())} className="primary-action mt-3 w-full"><Save size={17} />{saving ? 'Saving…' : 'Save Staff Roles'}</button></section>;
}

function OptionEditor({ title, values, saving, onChange, onSave }: Readonly<{
  title: string;
  values: string[];
  saving: boolean;
  onChange: (values: string[]) => void;
  onSave: () => void;
}>) {
  const update = (index: number, value: string) => onChange(values.map((item, itemIndex) => itemIndex === index ? value : item));
  const remove = (index: number) => onChange(values.filter((_, itemIndex) => itemIndex !== index));
  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-bold text-navy">{title}</h2>
        <button type="button" onClick={() => onChange([...values, ''])}
          className="w-9 h-9 border border-gray-200 bg-white text-navy rounded-lg flex items-center justify-center"
          aria-label={`Add ${title}`} title={`Add ${title}`}>
          <Plus size={18} aria-hidden="true" />
        </button>
      </div>
      <div className="space-y-2">
        {values.map((value, index) => (
          <div key={`${title}-${index}`} className="flex gap-2">
            <input value={value} onChange={event => update(index, event.target.value)}
              className="input flex-1" aria-label={`${title} option ${index + 1}`} />
            <button type="button" onClick={() => remove(index)} disabled={values.length === 1}
              className="w-11 border border-red-100 bg-white text-red-600 rounded-lg flex items-center justify-center disabled:opacity-30"
              aria-label={`Remove ${value || 'empty option'}`} title="Remove option">
              <Trash2 size={17} aria-hidden="true" />
            </button>
          </div>
        ))}
      </div>
      <button type="button" onClick={onSave} disabled={saving || values.every(value => !value.trim())}
        className="w-full mt-3 bg-navy text-white py-3 rounded-lg font-semibold flex items-center justify-center gap-2 disabled:opacity-50">
        <Save size={17} aria-hidden="true" />
        {saving ? 'Saving…' : `Save ${title}`}
      </button>
    </section>
  );
}

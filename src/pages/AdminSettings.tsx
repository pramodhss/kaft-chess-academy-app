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

export function AdminSettings() {
  const { token, logout } = useAuth();
  const { coachName } = useCoachName();
  const toast = useToast();
  const [options, setOptions] = useState<StudentOptions | null>(null);
  const [saving, setSaving] = useState<StudentOptionKey | null>(null);
  const [error, setError] = useState('');

  const load = async () => {
    if (!token) return;
    setError('');
    try {
      await ensureStudentOptionsSheet(token, SHEET_ID);
      setOptions(await loadStudentOptions(token, SHEET_ID, true));
    } catch (loadError: any) {
      if (loadError.message === 'TOKEN_EXPIRED') { logout(); return; }
      setError(loadError.message);
    }
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

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

  const updateValues = (values: string[]) => {
    setOptions(current => current ? {
      ...current,
      batches: { ...current.batches, values },
    } : current);
  };

  const save = async () => {
    if (!token || !options) return;
    setSaving('student_batches');
    try {
      const result = await saveStudentOptionList(
        token,
        SHEET_ID,
        'student_batches',
        options.batches.values,
        options.batches.version,
        coachName || 'Admin',
      );
      const latestOptions = await loadStudentOptions(token, SHEET_ID, true);
      setOptions(latestOptions);
      if (result.concurrentUpdate) {
        toast.error('Another admin updated this list at the same time. The latest Sheet values were reloaded; review them before saving again.');
      } else {
        toast.success('Student batches updated successfully.');
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
          <OptionEditor
            title="Student Batches"
            values={options.batches.values}
            saving={saving === 'student_batches'}
            onChange={updateValues}
            onSave={save}
          />
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
          className="icon-button-add"
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
              className="icon-button-danger w-11"
              aria-label={`Remove ${value || 'empty option'}`} title="Remove option">
              <Trash2 size={17} aria-hidden="true" />
            </button>
          </div>
        ))}
      </div>
      <button type="button" onClick={onSave} disabled={saving || values.every(value => !value.trim())}
        className="primary-action mt-3 w-full">
        <Save size={17} aria-hidden="true" />
        {saving ? 'Saving…' : `Save ${title}`}
      </button>
    </section>
  );
}

import { useEffect, useState } from 'react';
import { Plus, QrCode, Save, Trash2, UserCheck } from 'lucide-react';
import { Layout } from '../components/Layout';
import { PageSkeleton } from '../components/Skeleton';
import { SHEET_ID } from '../config';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useCoachName } from '../hooks/useCoachName';
import { useUpiSettings } from '../hooks/useUpiSettings';
import {
  ensureStudentOptionsSheet,
  loadStudentOptions,
  saveBatchCoachAssignments,
  saveStudentOptionList,
  syncBatchCoachesToStudents,
} from '../lib/studentOptions';
import type { StudentOptionKey, StudentOptions } from '../lib/studentOptions';

export function AdminSettings() {
  const { token, logout } = useAuth();
  const { coachName } = useCoachName();
  const { upiEnabled, upiVpa, setUpiEnabled, setUpiVpa } = useUpiSettings();
  const toast = useToast();
  const [options, setOptions] = useState<StudentOptions | null>(null);
  const [batchCoaches, setBatchCoaches] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<StudentOptionKey | null>(null);
  const [error, setError] = useState('');

  const load = async () => {
    if (!token) return;
    setError('');
    try {
      await ensureStudentOptionsSheet(token, SHEET_ID);
      const loaded = await loadStudentOptions(token, SHEET_ID, true);
      setOptions(loaded);
      setBatchCoaches(loaded.batchCoaches.map);
    } catch (loadError: any) {
      if (loadError.message === 'TOKEN_EXPIRED') { logout(); return; }
      setError(loadError.message);
    }
  };

  useEffect(() => { void load(); }, [token]);

  const updateBatches = (values: string[]) => {
    setOptions(current => current ? {
      ...current,
      batches: { ...current.batches, values },
    } : current);
  };

  const updateCoaches = (values: string[]) => {
    setOptions(current => current ? {
      ...current,
      coaches: { ...current.coaches, values },
    } : current);
  };

  const saveOption = async (key: 'student_batches' | 'student_coaches') => {
    if (!token || !options) return;
    setSaving(key);
    const target = key === 'student_batches' ? options.batches : options.coaches;
    const label = key === 'student_batches' ? 'Student batches' : 'Coaches list';
    try {
      const result = await saveStudentOptionList(
        token,
        SHEET_ID,
        key,
        target.values,
        target.version,
        coachName || 'Admin',
      );
      const latestOptions = await loadStudentOptions(token, SHEET_ID, true);
      setOptions(latestOptions);
      if (result.concurrentUpdate) {
        toast.error('Another admin updated this list at the same time. The latest Sheet values were reloaded; review them before saving again.');
      } else {
        toast.success(`${label} updated successfully.`);
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

  const handleBatchCoachChange = (batch: string, coach: string) => {
    setBatchCoaches(prev => ({ ...prev, [batch]: coach }));
  };

  const saveBatchCoaches = async () => {
    if (!token || !options) return;
    setSaving('student_batch_coaches');
    try {
      await saveBatchCoachAssignments(
        token,
        SHEET_ID,
        batchCoaches,
        options.batchCoaches.version,
        coachName || 'Admin',
      );
      const { updatedCount } = await syncBatchCoachesToStudents(token, SHEET_ID, batchCoaches);
      const latestOptions = await loadStudentOptions(token, SHEET_ID, true);
      setOptions(latestOptions);
      setBatchCoaches(latestOptions.batchCoaches.map);
      if (updatedCount > 0) {
        toast.success(`Batch coaches saved! Updated assigned coach for ${updatedCount} student(s).`);
      } else {
        toast.success('Batch coach assignments saved successfully.');
      }
    } catch (saveError: any) {
      if (saveError.message === 'SETTINGS_CONFLICT') {
        const latest = await loadStudentOptions(token, SHEET_ID, true);
        setOptions(latest);
        setBatchCoaches(latest.batchCoaches.map);
        toast.error('Another admin changed settings. Latest values were reloaded; review and try again.');
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
              title="Student Batches"
              values={options.batches.values}
              saving={saving === 'student_batches'}
              onChange={updateBatches}
              onSave={() => saveOption('student_batches')}
            />

            <OptionEditor
              title="Assigned Coaches"
              values={options.coaches.values}
              saving={saving === 'student_coaches'}
              onChange={updateCoaches}
              onSave={() => saveOption('student_coaches')}
            />

            <section className="pt-2 border-t border-gray-100">
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-sm font-bold text-navy flex items-center gap-1.5">
                  <UserCheck size={16} /> Assign Coaches to Batches
                </h2>
              </div>
              <p className="text-xs text-gray-500 mb-3">
                Assign a default coach to each batch (e.g. Beginner → Coach Anand). Saving updates all existing students in that batch automatically and pre-fills the coach when adding new students.
              </p>
              <div className="surface-card p-3 space-y-3">
                {options.batches.values.filter(b => b.trim()).map(batch => (
                  <div key={batch} className="flex items-center justify-between gap-3">
                    <span className="text-sm font-semibold text-gray-800 dark:text-gray-200 min-w-[100px]">{batch}</span>
                    <select
                      value={batchCoaches[batch] ?? ''}
                      onChange={e => handleBatchCoachChange(batch, e.target.value)}
                      className="input flex-1 py-1.5 text-sm"
                      aria-label={`Assigned coach for ${batch}`}
                    >
                      <option value="">Unassigned (None)</option>
                      {options.coaches.values.filter(c => c.trim()).map(coach => (
                        <option key={coach} value={coach}>{coach}</option>
                      ))}
                    </select>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={saveBatchCoaches}
                  disabled={saving === 'student_batch_coaches'}
                  className="primary-action mt-2 w-full"
                >
                  <Save size={17} aria-hidden="true" />
                  {saving === 'student_batch_coaches' ? 'Saving & Updating Students…' : 'Save & Update Students'}
                </button>
              </div>
            </section>

            <section className="pt-2 border-t border-gray-100">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-bold text-navy flex items-center gap-1.5"><QrCode size={16} /> Dynamic UPI QR Pay</h2>
              </div>
              <div className="surface-card p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <strong className="block text-sm text-gray-900">Enable UPI QR Button in Fees</strong>
                    <span className="text-xs text-gray-500">Allow coaches to generate instant UPI QR code on student fee cards</span>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={upiEnabled}
                      onChange={e => {
                        setUpiEnabled(e.target.checked);
                        toast.info(`UPI QR Pay is now ${e.target.checked ? 'enabled' : 'disabled'}.`);
                      }}
                      className="sr-only peer"
                      aria-label="Toggle Dynamic UPI QR Code in Settings"
                    />
                    <div className="w-11 h-6 bg-gray-200 dark:bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-green-600"></div>
                  </label>
                </div>

                {upiEnabled && (
                  <div className="pt-2 border-t border-gray-100">
                    <label className="block">
                      <span className="field-label">Academy UPI ID / VPA</span>
                      <input
                        type="text"
                        value={upiVpa}
                        onChange={e => setUpiVpa(e.target.value)}
                        placeholder="e.g. kaftchess@upi"
                        className="input"
                      />
                    </label>
                  </div>
                )}
              </div>
            </section>
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

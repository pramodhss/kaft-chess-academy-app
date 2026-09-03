import { useEffect, useState } from 'react';
import { GraduationCap, Plus, QrCode, Save, Search, Trash2, UserCheck } from 'lucide-react';
import { clearSheetRange, clearSheetReadCache, readSheet } from '../lib/sheets';
import { Layout } from '../components/Layout';
import { PageSkeleton } from '../components/Skeleton';
import { SHEET_ID, TABS } from '../config';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useCoachName } from '../hooks/useCoachName';
import { useUpiSettings } from '../hooks/useUpiSettings';
import { useRoster } from '../context/RosterContext';
import { normalizeFeeMonth } from '../lib/feeRules';
import {
  bulkAssignSchoolToStudents,
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
  const [monthToClear, setMonthToClear] = useState('');
  const [clearingMonth, setClearingMonth] = useState('');

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

  const updateSchools = (values: string[]) => {
    setOptions(current => current ? {
      ...current,
      schools: { ...current.schools, values },
    } : current);
  };

  const saveOption = async (key: 'student_batches' | 'student_coaches' | 'student_schools') => {
    if (!token || !options) return;
    setSaving(key);
    const target = key === 'student_batches' ? options.batches : key === 'student_coaches' ? options.coaches : options.schools;
    const label = key === 'student_batches' ? 'Student batches' : key === 'student_coaches' ? 'Coaches list' : 'School list';
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

  const handleClearFeesMonth = async () => {
    if (!token || !monthToClear.trim()) { toast.error('Select a month to clear fees.'); return; }
    if (!window.confirm(`Clear all monthly fee records for ${monthToClear}? This removes the selected month's collected and pending fee totals.`)) return;
    setClearingMonth(monthToClear);
    try {
      const [feeRows] = await Promise.all([
        readSheet(token, SHEET_ID, `'${TABS.FEES}'!A:N`),
      ]);
      const month = normalizeFeeMonth(monthToClear);
      const rowsToClear: string[] = [];
      feeRows.slice(1).forEach((row, idx) => {
        const rowMonth = row[3]?.trim() ?? '';
        const rowType = row[4]?.trim() ?? '';
        if (rowType === 'Monthly Tuition' && normalizeFeeMonth(rowMonth) === month) {
          const rowIndex = idx + 2;
          rowsToClear.push(`'${TABS.FEES}'!A${rowIndex}:N${rowIndex}`);
        }
      });
      if (rowsToClear.length === 0) { toast.info('No fees found for the selected month.'); return; }
      await Promise.all(rowsToClear.map(range => clearSheetRange(token, SHEET_ID, range)));
      clearSheetReadCache(SHEET_ID);
      setMonthToClear('');
      toast.success(`Cleared ${rowsToClear.length} monthly fee record${rowsToClear.length === 1 ? '' : 's'} for ${monthToClear}. Syncing...`);
      setTimeout(() => window.location.reload(), 500);
    } catch (e: any) { toast.error(`Clear failed: ${e.message}`); }
    finally { setClearingMonth(''); }
  };

  if (!options && !error) return <Layout title="Admin Settings"><PageSkeleton /></Layout>;

  return (
    <Layout title="Admin Settings">
      <div className="admin-settings-screen page-stack">
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

            <OptionEditor
              title="School Values"
              values={options.schools.values}
              saving={saving === 'student_schools'}
              onChange={updateSchools}
              onSave={() => saveOption('student_schools')}
              allowEmpty
            />

            <AssignSchoolToStudents
              token={token}
              schools={options.schools.values}
            />

            <section className="pt-2 border-t border-gray-100 dark:border-slate-800">
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-sm font-bold text-navy dark:text-gray-100 flex items-center gap-1.5">
                  <UserCheck size={16} /> Assign Coaches to Batches
                </h2>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
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

            <section className="pt-2 border-t border-gray-100 dark:border-slate-800">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-bold text-navy dark:text-gray-100 flex items-center gap-1.5">🗑️ Bulk Clear Fees by Month</h2>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
                Clear collected fees for all students in a specific month. Resets amounts to zero and marks as Pending.
              </p>
              <div className="surface-card p-3 space-y-2">
                <input
                  type="text"
                  value={monthToClear}
                  onChange={e => setMonthToClear(e.target.value)}
                  placeholder="e.g. Sept-2024 or 2024-09"
                  className="input text-sm"
                  aria-label="Month to clear fees"
                />
                <button
                  type="button"
                  onClick={handleClearFeesMonth}
                  disabled={clearingMonth.length > 0 || !monthToClear.trim()}
                  className="primary-action w-full bg-red-600 hover:bg-red-700 text-white"
                >
                  {clearingMonth ? 'Clearing fees…' : 'Clear Fees & Sync'}
                </button>
              </div>
            </section>

            <section className="pt-2 border-t border-gray-100 dark:border-slate-800">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-bold text-navy dark:text-gray-100 flex items-center gap-1.5"><QrCode size={16} /> Dynamic UPI QR Pay</h2>
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

function OptionEditor({ title, values, saving, onChange, onSave, allowEmpty = false }: Readonly<{
  title: string;
  values: string[];
  saving: boolean;
  onChange: (values: string[]) => void;
  onSave: () => void;
  allowEmpty?: boolean;
}>) {
  const update = (index: number, value: string) => onChange(values.map((item, itemIndex) => itemIndex === index ? value : item));
  const remove = (index: number) => onChange(values.filter((_, itemIndex) => itemIndex !== index));
  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-bold text-navy dark:text-gray-100">{title}</h2>
        <button type="button" onClick={() => onChange([...values, ''])}
          className="icon-button-add"
          aria-label={`Add ${title}`} title={`Add ${title}`}>
          <Plus size={18} aria-hidden="true" />
        </button>
      </div>
      <div className="space-y-2">
        {values.map((value, index) => (
          <div key={`${title}-${index}`} className="flex min-w-0 items-center gap-2">
            <input value={value} onChange={event => update(index, event.target.value)}
              className="input min-w-0 flex-1" aria-label={`${title} option ${index + 1}`} />
            <button type="button" onClick={() => remove(index)} disabled={!allowEmpty && values.length === 1}
              className="icon-button-danger"
              aria-label={`Remove ${value || 'empty option'}`} title="Remove option">
              <Trash2 size={17} aria-hidden="true" />
            </button>
          </div>
        ))}
      </div>
      <button type="button" onClick={onSave} disabled={saving || (!allowEmpty && values.every(value => !value.trim()))}
        className="primary-action mt-3 w-full">
        <Save size={17} aria-hidden="true" />
        {saving ? 'Saving…' : `Save ${title}`}
      </button>
    </section>
  );
}

function AssignSchoolToStudents({
  token,
  schools,
}: Readonly<{
  token: string | null;
  schools: string[];
}>) {
  const { students, refreshRoster } = useRoster();
  const toast = useToast();
  const [targetSchool, setTargetSchool] = useState('');
  const [customSchool, setCustomSchool] = useState('');
  const [search, setSearch] = useState('');
  const [schoolFilter, setSchoolFilter] = useState('All');
  const [assignmentSort, setAssignmentSort] = useState<'name' | 'batch' | 'school'>('name');
  const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set());
  const [saving, setSaving] = useState(false);

  const availableSchools = schools.filter(s => s.trim());

  const filteredStudents = students.filter(s => {
    if (!s.name.trim()) return false;
    if (search && !s.name.toLowerCase().includes(search.toLowerCase())) return false;
    if (schoolFilter === 'Unassigned' && (s.school || s.grade).trim()) return false;
    if (schoolFilter !== 'All' && schoolFilter !== 'Unassigned' && (s.school || s.grade).trim().toLowerCase() !== schoolFilter.toLowerCase()) return false;
    return true;
  }).sort((left, right) => assignmentSort === 'batch'
    ? left.batch.localeCompare(right.batch) || left.name.localeCompare(right.name)
    : assignmentSort === 'school'
      ? (left.school || left.grade).localeCompare(right.school || right.grade) || left.name.localeCompare(right.name)
      : left.name.localeCompare(right.name));

  const toggleStudent = (rowIndex: number) => {
    setSelectedRows(prev => {
      const next = new Set(prev);
      if (next.has(rowIndex)) next.delete(rowIndex);
      else next.add(rowIndex);
      return next;
    });
  };

  const selectAllVisible = () => {
    setSelectedRows(new Set(filteredStudents.map(s => s.rowIndex)));
  };

  const clearSelection = () => {
    setSelectedRows(new Set());
  };

  const effectiveSchool = targetSchool === '__CUSTOM__' ? customSchool.trim() : targetSchool.trim();

  const handleAssign = async () => {
    if (!token || selectedRows.size === 0) return;
    if (targetSchool === '__CUSTOM__' && !customSchool.trim()) {
      toast.error('Please enter a school name.');
      return;
    }
    setSaving(true);
    try {
      const { updatedCount } = await bulkAssignSchoolToStudents(
        token,
        SHEET_ID,
        Array.from(selectedRows),
        effectiveSchool,
      );
      await refreshRoster(true);
      toast.success(
        effectiveSchool
          ? `Assigned "${effectiveSchool}" to ${updatedCount} student(s) successfully.`
          : `Cleared school for ${updatedCount} student(s).`,
      );
      setSelectedRows(new Set());
    } catch (err: any) {
      toast.error(`Failed to assign school: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="pt-2 border-t border-gray-100 dark:border-slate-800">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-sm font-bold text-navy dark:text-gray-100 flex items-center gap-1.5">
          <GraduationCap size={16} /> Assign School to Students
        </h2>
      </div>
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
        Quickly assign or update the school for multiple students at once. Multiple students can belong to the same school.
      </p>

      <div className="surface-card p-4 space-y-3">
        {/* Step 1: Select Target School */}
        <div>
          <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
            Target School to Assign:
          </label>
          <select
            value={targetSchool}
            onChange={e => setTargetSchool(e.target.value)}
            className="input w-full text-sm font-medium"
            aria-label="Select target school"
          >
            <option value="">Select a school…</option>
            {availableSchools.map(sch => (
              <option key={sch} value={sch}>{sch}</option>
            ))}
            <option value="__CUSTOM__">+ Custom / New School…</option>
            <option value="">(Clear / Remove School)</option>
          </select>
          {targetSchool === '__CUSTOM__' && (
            <input
              type="text"
              value={customSchool}
              onChange={e => setCustomSchool(e.target.value)}
              placeholder="Enter school name"
              className="input mt-2 w-full text-sm"
              aria-label="Enter custom school name"
            />
          )}
        </div>

        {/* Step 2: Filters & Search */}
        <div className="space-y-2 pt-2 border-t border-gray-100 dark:border-slate-800">
          <div className="relative">
            <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search students…"
              className="input pl-8 text-xs w-full"
              aria-label="Search students to assign school"
            />
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <select
              value={schoolFilter}
              onChange={e => setSchoolFilter(e.target.value)}
              className="input text-xs"
              aria-label="Filter students by current school"
            >
              <option value="All">All Schools</option>
              <option value="Unassigned">No School Assigned</option>
              {availableSchools.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <select value={assignmentSort} onChange={e => setAssignmentSort(e.target.value as typeof assignmentSort)} className="input text-xs" aria-label="Sort students for school assignment">
              <option value="name">Sort by name</option>
              <option value="batch">Sort by batch</option>
              <option value="school">Sort by school</option>
            </select>
          </div>
        </div>

        {/* Selection summary & Actions */}
        <div className="flex items-center justify-between text-xs font-medium pt-1">
          <span className="text-gray-600 dark:text-gray-400">
            {selectedRows.size} of {filteredStudents.length} selected
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={selectAllVisible}
              className="text-xs text-blue-600 dark:text-blue-400 hover:underline font-semibold"
            >
              Select all visible ({filteredStudents.length})
            </button>
            {selectedRows.size > 0 && (
              <button
                type="button"
                onClick={clearSelection}
                className="text-xs text-red-600 dark:text-red-400 hover:underline font-semibold"
              >
                Clear
              </button>
            )}
          </div>
        </div>

        {/* Student list */}
        <div className="max-h-60 overflow-y-auto border border-gray-200 dark:border-slate-700 rounded-xl divide-y divide-gray-100 dark:divide-slate-800">
          {filteredStudents.length === 0 ? (
            <p className="p-4 text-center text-xs text-gray-400">No matching students found.</p>
          ) : (
            filteredStudents.map(student => {
              const isSelected = selectedRows.has(student.rowIndex);
              const currentSchool = student.school || student.grade;
              return (
                <label
                  key={student.rowIndex}
                  className={`flex items-center justify-between p-2.5 hover:bg-gray-50 dark:hover:bg-slate-800/50 cursor-pointer transition-colors ${
                    isSelected ? 'bg-amber-50/70 dark:bg-amber-950/20' : ''
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleStudent(student.rowIndex)}
                      className="rounded border-gray-300 text-amber-600 focus:ring-amber-500"
                    />
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-gray-900 dark:text-gray-100 truncate">{student.name}</p>
                      <p className="text-[10px] text-gray-500 dark:text-gray-400">
                        {student.batch}{student.standard ? ` · Std ${student.standard}` : ''}
                      </p>
                    </div>
                  </div>
                  <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium truncate max-w-[140px] ${
                    currentSchool
                      ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300 border border-blue-200 dark:border-blue-800'
                      : 'bg-gray-100 text-gray-500 dark:bg-slate-800 dark:text-gray-400'
                  }`}>
                    {currentSchool || 'No school'}
                  </span>
                </label>
              );
            })
          )}
        </div>

        {/* Submit button */}
        <button
          type="button"
          onClick={handleAssign}
          disabled={saving || selectedRows.size === 0 || (targetSchool === '__CUSTOM__' && !customSchool.trim())}
          className="primary-action w-full"
        >
          <Save size={16} aria-hidden="true" />
          {saving
            ? 'Assigning School…'
            : selectedRows.size === 0
            ? 'Select Students to Assign School'
            : effectiveSchool
            ? `Assign "${effectiveSchool}" to ${selectedRows.size} Student${selectedRows.size > 1 ? 's' : ''}`
            : `Clear School for ${selectedRows.size} Student${selectedRows.size > 1 ? 's' : ''}`}
        </button>
      </div>
    </section>
  );
}

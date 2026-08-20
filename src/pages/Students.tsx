import { useEffect, useState } from 'react';
import { Layout } from '../components/Layout';
import { Spinner } from '../components/Spinner';
import { useAuth } from '../context/AuthContext';
import { readSheet, appendRows, batchWrite } from '../lib/sheets';
import { SHEET_ID, TABS } from '../config';
import type { Student } from '../types';

const BATCHES  = ['Beginner A','Beginner B','Intermediate','Advanced','Competitive'];
const LEVELS   = ['Beginner','Intermediate','Advanced','Competitive'];
const STATUSES = ['Active','On Hold','Inactive'];
const GENDERS  = ['Female','Male','Non-binary','Prefer not to say'];

type FormData = { name:string; dob:string; gender:string; grade:string; batch:string; level:string;
  joiningDate:string; status:string; parent1Name:string; parent1Phone:string; parent1WhatsApp:string;
  parent1Email:string; parent2Name:string; parent2Phone:string; emergencyContact:string;
  emergencyPhone:string; address:string; photoConsent:string; notes:string };

const EMPTY: FormData = {
  name:'', dob:'', gender:'Female', grade:'', batch:'Beginner A', level:'Beginner',
  joiningDate:'', status:'Active', parent1Name:'', parent1Phone:'', parent1WhatsApp:'',
  parent1Email:'', parent2Name:'', parent2Phone:'', emergencyContact:'', emergencyPhone:'',
  address:'', photoConsent:'Yes', notes:'',
};

function rowToStudent(row: string[], rowIndex: number): Student {
  return {
    name: row[0]??'', dob: row[1]??'', age: row[2]??'', gender: row[3]??'',
    grade: row[4]??'', batch: row[5]??'', level: row[6]??'', joiningDate: row[7]??'',
    status: row[8]??'', parent1Name: row[9]??'', parent1Phone: row[10]??'',
    parent1WhatsApp: row[11]??'', parent1Email: row[12]??'', parent2Name: row[13]??'',
    parent2Phone: row[14]??'', emergencyContact: row[15]??'', emergencyPhone: row[16]??'',
    address: row[17]??'', photoConsent: row[18]??'', thisMonthAttended: row[19]??'',
    notes: row[20]??'', rowIndex,
  };
}

function studentToForm(s: Student): FormData {
  return { name: s.name, dob: s.dob, gender: s.gender, grade: s.grade, batch: s.batch,
    level: s.level, joiningDate: s.joiningDate, status: s.status, parent1Name: s.parent1Name,
    parent1Phone: s.parent1Phone, parent1WhatsApp: s.parent1WhatsApp, parent1Email: s.parent1Email,
    parent2Name: s.parent2Name, parent2Phone: s.parent2Phone, emergencyContact: s.emergencyContact,
    emergencyPhone: s.emergencyPhone, address: s.address, photoConsent: s.photoConsent, notes: s.notes };
}

export function Students() {
  const { token, logout } = useAuth();
  const [students, setStudents] = useState<Student[]>([]);
  const [filtered, setFiltered] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Student | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState<FormData>({ ...EMPTY });
  const [saving, setSaving] = useState(false);

  const load = async () => {
    if (!token) return;
    setLoading(true); setError('');
    try {
      const rows = await readSheet(token, SHEET_ID, `'${TABS.STUDENTS}'!A:U`);
      const data = rows.slice(1).filter(r => r[0]?.trim()).map((r, i) => rowToStudent(r, i + 2));
      setStudents(data); setFiltered(data);
    } catch (e: any) {
      if (e.message === 'TOKEN_EXPIRED') { logout(); return; }
      setError(e.message);
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [token]);

  useEffect(() => {
    const q = search.toLowerCase();
    setFiltered(students.filter(s =>
      s.name.toLowerCase().includes(q) || s.batch.toLowerCase().includes(q) || s.level.toLowerCase().includes(q)
    ));
  }, [search, students]);

  const handleAdd = async () => {
    if (!token || !form.name.trim()) return;
    setSaving(true);
    try {
      await appendRows(token, SHEET_ID, `'${TABS.STUDENTS}'!A:U`, [[
        form.name, form.dob, '', form.gender, form.grade, form.batch, form.level,
        form.joiningDate, form.status, form.parent1Name, form.parent1Phone,
        form.parent1WhatsApp, form.parent1Email, form.parent2Name, form.parent2Phone,
        form.emergencyContact, form.emergencyPhone, form.address, form.photoConsent, '', form.notes,
      ]]);
      setShowAdd(false); setForm({ ...EMPTY }); await load();
    } catch (e: any) { alert('Save failed: ' + e.message); }
    finally { setSaving(false); }
  };

  const handleEdit = async () => {
    if (!token || !selected || !form.name.trim()) return;
    setSaving(true);
    try {
      const row = selected.rowIndex;
      const tab = TABS.STUDENTS;
      // Update non-formula columns only (skip C=Age formula, T=ThisMonthAttended formula)
      await batchWrite(token, SHEET_ID, [
        { range: `'${tab}'!A${row}`, value: form.name },
        { range: `'${tab}'!B${row}`, value: form.dob },
        { range: `'${tab}'!D${row}`, value: form.gender },
        { range: `'${tab}'!E${row}`, value: form.grade },
        { range: `'${tab}'!F${row}`, value: form.batch },
        { range: `'${tab}'!G${row}`, value: form.level },
        { range: `'${tab}'!H${row}`, value: form.joiningDate },
        { range: `'${tab}'!I${row}`, value: form.status },
        { range: `'${tab}'!J${row}`, value: form.parent1Name },
        { range: `'${tab}'!K${row}`, value: form.parent1Phone },
        { range: `'${tab}'!L${row}`, value: form.parent1WhatsApp },
        { range: `'${tab}'!M${row}`, value: form.parent1Email },
        { range: `'${tab}'!N${row}`, value: form.parent2Name },
        { range: `'${tab}'!O${row}`, value: form.parent2Phone },
        { range: `'${tab}'!P${row}`, value: form.emergencyContact },
        { range: `'${tab}'!Q${row}`, value: form.emergencyPhone },
        { range: `'${tab}'!R${row}`, value: form.address },
        { range: `'${tab}'!S${row}`, value: form.photoConsent },
        { range: `'${tab}'!U${row}`, value: form.notes },
      ]);
      setEditMode(false); setSelected(null); await load();
    } catch (e: any) { alert('Save failed: ' + e.message); }
    finally { setSaving(false); }
  };

  if (loading) return <Layout title="Students"><Spinner /></Layout>;

  // ── Edit mode ──────────────────────────────────────────────────────────────
  if (selected && editMode) {
    return (
      <Layout title="Edit Student" action={
        <button onClick={() => setEditMode(false)} className="text-white text-sm">Cancel</button>
      }>
        <div className="p-4 pb-24 space-y-3 overflow-y-auto">
          <StudentForm form={form} setForm={setForm} />
        </div>
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 p-4">
          <button onClick={handleEdit} disabled={saving || !form.name.trim()}
            className="w-full bg-navy text-white py-3 rounded-xl font-semibold disabled:opacity-50">
            {saving ? 'Saving…' : '💾 Save Changes'}
          </button>
        </div>
      </Layout>
    );
  }

  // ── Detail view ────────────────────────────────────────────────────────────
  if (selected) {
    return (
      <Layout title={selected.name} action={
        <div className="flex items-center gap-2">
          <button onClick={() => { setForm(studentToForm(selected)); setEditMode(true); }}
            className="bg-white text-navy text-sm font-bold px-3 py-1 rounded-full">✏️ Edit</button>
          <button onClick={() => setSelected(null)} className="text-white text-sm">← Back</button>
        </div>
      }>
        <div className="p-4 space-y-3">
          <InfoSection title="Academy">
            <Row label="Batch" value={selected.batch} />
            <Row label="Level" value={selected.level} />
            <Row label="Status">
              <span className={selected.status === 'Active' ? 'badge-green' : 'badge-gray'}>{selected.status}</span>
            </Row>
            <Row label="Joined" value={selected.joiningDate} />
            <Row label="This Month" value={`${selected.thisMonthAttended || 0} days attended`} />
          </InfoSection>
          <InfoSection title="Personal">
            <Row label="DOB" value={selected.dob} />
            <Row label="Age" value={selected.age} />
            <Row label="Gender" value={selected.gender} />
            <Row label="Grade / School" value={selected.grade} />
            <Row label="Address" value={selected.address} />
          </InfoSection>
          <InfoSection title="Parent 1">
            <Row label="Name" value={selected.parent1Name} />
            <Row label="Phone" value={selected.parent1Phone} />
            <Row label="WhatsApp" value={selected.parent1WhatsApp} />
            <Row label="Email" value={selected.parent1Email} />
          </InfoSection>
          {(selected.parent2Name || selected.parent2Phone) && (
            <InfoSection title="Parent 2">
              <Row label="Name" value={selected.parent2Name} />
              <Row label="Phone" value={selected.parent2Phone} />
            </InfoSection>
          )}
          {(selected.emergencyContact || selected.emergencyPhone) && (
            <InfoSection title="Emergency Contact">
              <Row label="Name" value={selected.emergencyContact} />
              <Row label="Phone" value={selected.emergencyPhone} />
            </InfoSection>
          )}
          {selected.notes && (
            <InfoSection title="Notes">
              <p className="text-sm text-gray-700">{selected.notes}</p>
            </InfoSection>
          )}
        </div>
      </Layout>
    );
  }

  // ── List view ──────────────────────────────────────────────────────────────
  return (
    <Layout title="Students" action={
      <button onClick={() => { setForm({ ...EMPTY }); setShowAdd(true); }}
        className="bg-white text-navy text-sm font-bold px-3 py-1 rounded-full">+ Add</button>
    }>
      <div className="p-4 space-y-3">
        {error && <p className="text-red-600 text-sm bg-red-50 p-3 rounded-xl">{error}</p>}
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search by name, batch or level…"
          className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-chess-blue" />
        <p className="text-xs text-gray-400">{filtered.length} student{filtered.length !== 1 ? 's' : ''}</p>
        {filtered.map(s => (
          <button key={s.name + s.rowIndex} onClick={() => setSelected(s)}
            className="w-full bg-white rounded-xl p-4 shadow-sm border border-gray-100 text-left flex items-center justify-between active:bg-gray-50">
            <div>
              <p className="font-semibold text-gray-900">{s.name}</p>
              <p className="text-xs text-gray-500 mt-0.5">{s.batch} · {s.level}</p>
            </div>
            <div className="flex items-center gap-2">
              <span className={s.status === 'Active' ? 'badge-green' : 'badge-gray'}>{s.status}</span>
              <span className="text-gray-300">›</span>
            </div>
          </button>
        ))}
      </div>
      {showAdd && (
        <Modal title="Add Student" onClose={() => setShowAdd(false)}>
          <div className="max-h-[60vh] overflow-y-auto pr-1">
            <StudentForm form={form} setForm={setForm} />
          </div>
          <button onClick={handleAdd} disabled={saving || !form.name.trim()}
            className="w-full bg-navy text-white py-3 rounded-xl font-semibold mt-4 disabled:opacity-50">
            {saving ? 'Saving…' : 'Add Student'}
          </button>
        </Modal>
      )}
    </Layout>
  );
}

// ── Reusable form ─────────────────────────────────────────────────────────────
function StudentForm({ form, setForm }: { form: FormData; setForm: (f: FormData) => void }) {
  const f = <K extends keyof FormData>(k: K) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm({ ...form, [k]: e.target.value });
  return (
    <div className="space-y-3">
      <Field label="Full Name *"><input value={form.name} onChange={f('name')} className="input" /></Field>
      <Field label="Date of Birth"><input type="date" value={form.dob} onChange={f('dob')} className="input" /></Field>
      <Field label="Gender">
        <select value={form.gender} onChange={f('gender')} className="input">
          {['Female','Male','Non-binary','Prefer not to say'].map(o => <option key={o}>{o}</option>)}
        </select>
      </Field>
      <Field label="Grade / School"><input value={form.grade} onChange={f('grade')} className="input" /></Field>
      <Field label="Batch">
        <select value={form.batch} onChange={f('batch')} className="input">
          {['Beginner A','Beginner B','Intermediate','Advanced','Competitive'].map(o => <option key={o}>{o}</option>)}
        </select>
      </Field>
      <Field label="Chess Level">
        <select value={form.level} onChange={f('level')} className="input">
          {['Beginner','Intermediate','Advanced','Competitive'].map(o => <option key={o}>{o}</option>)}
        </select>
      </Field>
      <Field label="Joining Date"><input type="date" value={form.joiningDate} onChange={f('joiningDate')} className="input" /></Field>
      <Field label="Status">
        <select value={form.status} onChange={f('status')} className="input">
          {['Active','On Hold','Inactive'].map(o => <option key={o}>{o}</option>)}
        </select>
      </Field>
      <div className="border-t border-gray-100 pt-3">
        <p className="text-xs font-bold text-navy uppercase tracking-wider mb-2">Parent / Guardian</p>
        <div className="space-y-3">
          <Field label="Parent 1 Name"><input value={form.parent1Name} onChange={f('parent1Name')} className="input" /></Field>
          <Field label="Phone"><input type="tel" value={form.parent1Phone} onChange={f('parent1Phone')} className="input" /></Field>
          <Field label="WhatsApp"><input type="tel" value={form.parent1WhatsApp} onChange={f('parent1WhatsApp')} className="input" /></Field>
          <Field label="Email"><input type="email" value={form.parent1Email} onChange={f('parent1Email')} className="input" /></Field>
          <Field label="Parent 2 Name"><input value={form.parent2Name} onChange={f('parent2Name')} className="input" /></Field>
          <Field label="Parent 2 Phone"><input type="tel" value={form.parent2Phone} onChange={f('parent2Phone')} className="input" /></Field>
        </div>
      </div>
      <div className="border-t border-gray-100 pt-3">
        <p className="text-xs font-bold text-navy uppercase tracking-wider mb-2">Emergency Contact</p>
        <div className="space-y-3">
          <Field label="Name"><input value={form.emergencyContact} onChange={f('emergencyContact')} className="input" /></Field>
          <Field label="Phone"><input type="tel" value={form.emergencyPhone} onChange={f('emergencyPhone')} className="input" /></Field>
        </div>
      </div>
      <Field label="Home Address"><input value={form.address} onChange={f('address')} className="input" /></Field>
      <Field label="Photo Consent">
        <select value={form.photoConsent} onChange={f('photoConsent')} className="input">
          <option>Yes</option><option>No</option>
        </select>
      </Field>
      <Field label="Notes"><textarea value={form.notes} onChange={f('notes')} className="input" rows={2} /></Field>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label className="text-xs font-medium text-gray-500 mb-1 block">{label}</label>{children}</div>;
}
function InfoSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
      <h3 className="text-xs font-bold text-navy uppercase tracking-wider mb-3">{title}</h3>
      <div className="space-y-2">{children}</div>
    </div>
  );
}
function Row({ label, value, children }: { label: string; value?: string; children?: React.ReactNode }) {
  if (!value && !children) return null;
  return (
    <div className="flex justify-between items-center text-sm">
      <span className="text-gray-500 flex-shrink-0">{label}</span>
      {children ? <div>{children}</div> : <span className="font-medium text-gray-900 text-right ml-4">{value}</span>}
    </div>
  );
}
function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-end z-50" onClick={onClose}>
      <div className="bg-white w-full rounded-t-2xl p-5 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-bold text-lg text-navy">{title}</h2>
          <button onClick={onClose} className="text-gray-400 text-2xl leading-none">×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

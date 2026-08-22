import { useEffect, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { Layout } from '../components/Layout';
import { Spinner } from '../components/Spinner';
import { useAuth } from '../context/AuthContext';
import { readSheet, readSheetLive, appendRows, clearSheetRange, ensureSheetColumns, writeRange } from '../lib/sheets';
import { isStudentNameReserved, syncStudentProfile } from '../lib/studentSync';
import { useToast } from '../context/ToastContext';
import { useCoachName } from '../hooks/useCoachName';
import { DEFAULT_BATCHES, DEFAULT_LEVELS, loadStudentOptions } from '../lib/studentOptions';
import { SHEET_ID, TABS } from '../config';
import type { Student } from '../types';

const STANDARDS  = ['LKG','UKG','1st','2nd','3rd','4th','5th','6th','7th','8th','9th','10th','11th','12th','Graduate'];
const CATEGORY_COLOR: Record<string,string> = {
  'Under 7':'bg-blue-100 text-blue-800','Under 9':'bg-cyan-100 text-cyan-800',
  'Under 11':'bg-green-100 text-green-800','Under 13':'bg-emerald-100 text-emerald-800',
  'Under 15':'bg-amber-100 text-amber-800','Under 17':'bg-orange-100 text-orange-800',
  'Under 19':'bg-red-100 text-red-800','Open':'bg-purple-100 text-purple-800',
};

function getCategory(age: string): string {
  const a = parseInt(age);
  if (!a || isNaN(a)) return '';
  if (a <= 6)  return 'Under 7';
  if (a <= 8)  return 'Under 9';
  if (a <= 10) return 'Under 11';
  if (a <= 12) return 'Under 13';
  if (a <= 14) return 'Under 15';
  if (a <= 16) return 'Under 17';
  if (a <= 18) return 'Under 19';
  return 'Open';
}

type FormData = {
  name:string; dob:string; gender:string; grade:string; batch:string; level:string;
  joiningDate:string; status:string; parent1Name:string; parent1Phone:string;
  parent1WhatsApp:string; parent1Email:string; parent2Name:string; parent2Phone:string;
  emergencyContact:string; emergencyPhone:string; address:string; photoConsent:string; notes:string;
  school:string; standard:string; tnscaId:string; fideId:string; aicfId:string;
  ratingClassical:string; ratingRapid:string; ratingBlitz:string; coachName:string;
};

const EMPTY: FormData = {
  name:'', dob:'', gender:'Female', grade:'', batch:'Beginner A', level:'Beginner',
  joiningDate:'', status:'Active', parent1Name:'', parent1Phone:'', parent1WhatsApp:'',
  parent1Email:'', parent2Name:'', parent2Phone:'', emergencyContact:'', emergencyPhone:'',
  address:'', photoConsent:'Yes', notes:'',
  school:'', standard:'', tnscaId:'', fideId:'', aicfId:'',
  ratingClassical:'', ratingRapid:'', ratingBlitz:'', coachName:'',
};

function rowToStudent(row: string[], rowIndex: number): Student {
  return {
    name:row[0]??'', dob:row[1]??'', age:row[2]??'', gender:row[3]??'', grade:row[4]??'',
    batch:row[5]??'', level:row[6]??'', joiningDate:row[7]??'', status:row[8]??'',
    parent1Name:row[9]??'', parent1Phone:row[10]??'', parent1WhatsApp:row[11]??'',
    parent1Email:row[12]??'', parent2Name:row[13]??'', parent2Phone:row[14]??'',
    emergencyContact:row[15]??'', emergencyPhone:row[16]??'', address:row[17]??'',
    photoConsent:row[18]??'', thisMonthAttended:row[19]??'', notes:row[20]??'',
    school:row[21]??'', standard:row[22]??'', tnscaId:row[23]??'', fideId:row[24]??'',
    aicfId:row[25]??'', ratingClassical:row[26]??'', ratingRapid:row[27]??'', ratingBlitz:row[28]??'',
    coachName:row[29]??'',
    rowIndex,
  };
}

function studentToForm(s: Student): FormData {
  return {
    name:s.name, dob:s.dob, gender:s.gender, grade:s.grade, batch:s.batch, level:s.level,
    joiningDate:s.joiningDate, status:s.status, parent1Name:s.parent1Name,
    parent1Phone:s.parent1Phone, parent1WhatsApp:s.parent1WhatsApp, parent1Email:s.parent1Email,
    parent2Name:s.parent2Name, parent2Phone:s.parent2Phone, emergencyContact:s.emergencyContact,
    emergencyPhone:s.emergencyPhone, address:s.address, photoConsent:s.photoConsent, notes:s.notes,
    school:s.school, standard:s.standard, tnscaId:s.tnscaId, fideId:s.fideId, aicfId:s.aicfId,
    ratingClassical:s.ratingClassical, ratingRapid:s.ratingRapid, ratingBlitz:s.ratingBlitz,
    coachName:s.coachName,
  };
}

function formToStudent(form: FormData, rowIndex: number, existing?: Student): Student {
  const dob = form.dob ? new Date(form.dob) : null;
  const age = dob && !isNaN(dob.getTime())
    ? String(Math.floor((Date.now() - dob.getTime()) / (365.25 * 86400000)))
    : '';
  return {
    ...form,
    age,
    thisMonthAttended: existing?.thisMonthAttended ?? '',
    rowIndex,
  };
}

function studentRowValues(form: FormData, row: number) {
  return [
    form.name, form.dob,
    `=IF(B${row}="","",DATEDIF(B${row},TODAY(),"Y"))`,
    form.gender, form.grade, form.batch, form.level,
    form.joiningDate, form.status,
    form.parent1Name, form.parent1Phone, form.parent1WhatsApp, form.parent1Email,
    form.parent2Name, form.parent2Phone,
    form.emergencyContact, form.emergencyPhone,
    form.address, form.photoConsent,
    `=SUMIFS('Monthly Attendance'!$C:$C,'Monthly Attendance'!$A:$A,A${row},'Monthly Attendance'!$B:$B,DATE(YEAR(TODAY()),MONTH(TODAY()),1))`,
    form.notes, form.school, form.standard,
    form.tnscaId, form.fideId, form.aicfId,
    form.ratingClassical, form.ratingRapid, form.ratingBlitz,
    form.coachName,
  ];
}

function formValidationError(form: FormData) {
  if (!form.name.trim()) return 'Student name is required.';
  if (!form.dob || Number.isNaN(new Date(form.dob).getTime())) return 'A valid date of birth is required so age can be calculated.';
  if (new Date(form.dob).getTime() > Date.now()) return 'Date of birth cannot be in the future.';
  if (!form.parent1Name.trim()) return 'At least one parent or guardian name is required.';
  const phoneDigits = form.parent1Phone.replace(/\D/g, '');
  if (phoneDigits.length < 7 || phoneDigits.length > 15) return 'A valid parent or guardian phone number is required.';
  return '';
}

async function ensureStudentSchema(token: string) {
  await ensureSheetColumns(token, SHEET_ID, TABS.STUDENTS, 30);
  const header = await readSheetLive(token, SHEET_ID, `'${TABS.STUDENTS}'!AD1`);
  if (!header[0]?.[0]?.trim()) {
    await writeRange(token, SHEET_ID, `'${TABS.STUDENTS}'!AD1`, [['Coach Name']]);
  }
}

async function loadStudentRows(token: string) {
  try {
    return await readSheet(token, SHEET_ID, `'${TABS.STUDENTS}'!A:AD`);
  } catch (readError) {
    if (navigator.onLine) throw readError;
    return readSheet(token, SHEET_ID, `'${TABS.STUDENTS}'!A:AC`);
  }
}

export function Students() {
  const { token, logout } = useAuth();
  const { coachName } = useCoachName();
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
  const [deleting, setDeleting] = useState(false);
  const [batches, setBatches] = useState([...DEFAULT_BATCHES]);
  const [levels, setLevels] = useState([...DEFAULT_LEVELS]);
  const [sortKey, setSortKey] = useState<'name'|'batch'|'level'|'status'|'attendance'>('name');
  const toast = useToast();

  const load = async () => {
    if (!token) return;
    setLoading(true); setError('');
    try {
      if (navigator.onLine) await ensureStudentSchema(token);
      const [rows, options] = await Promise.all([
        loadStudentRows(token),
        loadStudentOptions(token, SHEET_ID),
      ]);
      const data = rows.slice(1).map((row, index) => rowToStudent(row, index + 2)).filter(student => student.name.trim());
      setStudents(data); setFiltered(data);
      setBatches(options.batches.values);
      setLevels(options.levels.values);
    } catch(e:any) {
      if(e.message==='TOKEN_EXPIRED'){logout();return;}
      setError(e.message);
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [token]);
  useEffect(() => {
    const q = search.toLowerCase();
    setFiltered(students.filter(s =>
      s.name.toLowerCase().includes(q) || s.batch.toLowerCase().includes(q) ||
      s.level.toLowerCase().includes(q) || s.tnscaId.toLowerCase().includes(q) ||
      s.fideId.toLowerCase().includes(q) || s.school.toLowerCase().includes(q)
    ));
  }, [search, students]);

  const handleAdd = async () => {
    if (!token) return;
    const validationError = formValidationError(form);
    if (validationError) { toast.error(validationError); return; }
    setSaving(true);
    let rowIndex: number | null = null;
    try {
      const currentNames = await readSheetLive(token, SHEET_ID, `'${TABS.STUDENTS}'!A:A`);
      if (currentNames.slice(1).some(row => row[0]?.trim().toLocaleLowerCase() === form.name.trim().toLocaleLowerCase())) {
        toast.error('A student with this name already exists. Use a distinct name before saving.');
        return;
      }
      if (await isStudentNameReserved(token, SHEET_ID, form.name)) {
        toast.error('This name belongs to retained student history. Use a distinct name before saving.');
        return;
      }
      await ensureStudentSchema(token);
      rowIndex = await appendRows(token, SHEET_ID, `'${TABS.STUDENTS}'!A:AD`, [[
        form.name, form.dob, '=IF(INDEX(B:B,ROW())="","",DATEDIF(INDEX(B:B,ROW()),TODAY(),"Y"))',
        form.gender, form.grade, form.batch, form.level,
        form.joiningDate, form.status, form.parent1Name, form.parent1Phone,
        form.parent1WhatsApp, form.parent1Email, form.parent2Name, form.parent2Phone,
        form.emergencyContact, form.emergencyPhone, form.address, form.photoConsent,
        '=SUMIFS(\'Monthly Attendance\'!$C:$C,\'Monthly Attendance\'!$A:$A,INDEX(A:A,ROW()),\'Monthly Attendance\'!$B:$B,DATE(YEAR(TODAY()),MONTH(TODAY()),1))',
        form.notes,
        form.school, form.standard, form.tnscaId, form.fideId, form.aicfId,
        form.ratingClassical, form.ratingRapid, form.ratingBlitz, form.coachName,
      ]]);
      const savedRow = rowIndex;
      const values = studentRowValues(form, savedRow);
      const attendanceSynced = await syncStudentProfile(
        token,
        SHEET_ID,
        `'${TABS.STUDENTS}'!A${savedRow}:AD${savedRow}`,
        values,
        { name: form.name, batch: form.batch, level: form.level, parentName: form.parent1Name },
        { name: form.name, batch: form.batch, level: form.level, parentName: form.parent1Name },
      );
      setStudents(prev => [...prev, formToStudent(form, savedRow)]);
      setShowAdd(false);
      setForm({ ...EMPTY });
      if (attendanceSynced) toast.success('Student added successfully. The new profile is ready.');
      else toast.error('Student was saved, but Attendance could not update. Open Attendance while online to retry.');
    } catch(e:any) {
      if (rowIndex !== null) {
        setStudents(prev => prev.some(student => student.rowIndex === rowIndex)
          ? prev
          : [...prev, formToStudent(form, rowIndex!)]);
        setShowAdd(false);
        setForm({ ...EMPTY });
        toast.error('Student was saved, but some linked sheets could not update. Open Attendance while online to retry.');
        return;
      }
      toast.error('Save failed: '+e.message);
    }
    finally { setSaving(false); }
  };

  const handleEdit = async () => {
    if (!token || !selected) return;
    const validationError = formValidationError(form);
    if (validationError) { toast.error(validationError); return; }
    setSaving(true);
    try {
      const row = selected.rowIndex; const tab = TABS.STUDENTS;
      const [currentRows, currentNames] = await Promise.all([
        readSheetLive(token, SHEET_ID, `'${tab}'!A${row}:AD${row}`),
        readSheetLive(token, SHEET_ID, `'${tab}'!A:A`),
      ]);
      const currentStudent = rowToStudent(currentRows[0] ?? [], row);
      if (JSON.stringify(studentToForm(currentStudent)) !== JSON.stringify(studentToForm(selected))) {
        toast.info('This student was changed on another device. Reload the list before editing again.');
        return;
      }
      if (currentNames.slice(1).some((nameRow, index) => index + 2 !== row
        && nameRow[0]?.trim().toLocaleLowerCase() === form.name.trim().toLocaleLowerCase())) {
        toast.error('A student with this name already exists. Use a distinct name before saving.');
        return;
      }
      if (selected.name.trim().toLocaleLowerCase() !== form.name.trim().toLocaleLowerCase()
        && await isStudentNameReserved(token, SHEET_ID, form.name)) {
        toast.error('This name belongs to retained student history. Use a distinct name before saving.');
        return;
      }
      await ensureStudentSchema(token);
      const attendanceSynced = await syncStudentProfile(
        token,
        SHEET_ID,
        `'${tab}'!A${row}:AD${row}`,
        studentRowValues(form, row),
        { name: selected.name, batch: selected.batch, level: selected.level, parentName: selected.parent1Name },
        { name: form.name, batch: form.batch, level: form.level, parentName: form.parent1Name },
      );
      const updated = formToStudent(form, row, selected);
      const confirmedRows = await readSheetLive(token, SHEET_ID, `'${tab}'!A${row}:AD${row}`);
      const confirmed = rowToStudent(confirmedRows[0] ?? [], row);
      if (JSON.stringify(studentToForm(confirmed)) !== JSON.stringify(studentToForm(updated))) {
        setStudents(prev => prev.map(student => student.rowIndex === row ? confirmed : student));
        setEditMode(false);
        setSelected(confirmed);
        toast.error('Another update changed this student at the same time. The latest Sheet values were loaded; review before editing again.');
        return;
      }
      setStudents(prev => prev.map(student => student.rowIndex === row ? updated : student));
      setEditMode(false);
      setSelected(updated);
      if (attendanceSynced) toast.success(`${updated.name}'s changes were updated successfully.`);
      else toast.error(`${updated.name}'s profile was updated, but Attendance could not update. Open Attendance while online to retry.`);
    } catch(e:any) { toast.error('Save failed: '+e.message); }
    finally { setSaving(false); }
  };

  const handleDelete = async () => {
    if (!token || !selected) return;
    const confirmed = window.confirm(
      `Remove ${selected.name}? Their student profile will be removed, but historical fees, attendance, and tournament records will be retained.`,
    );
    if (!confirmed) return;
    setDeleting(true);
    try {
      const row = selected.rowIndex;
      const tab = TABS.STUDENTS;
      const currentRows = await readSheetLive(token, SHEET_ID, `'${tab}'!A${row}:AD${row}`);
      const currentStudent = rowToStudent(currentRows[0] ?? [], row);
      if (JSON.stringify(studentToForm(currentStudent)) !== JSON.stringify(studentToForm(selected))) {
        toast.info('This student was changed on another device. Reload the list before removing it.');
        return;
      }
      await clearSheetRange(token, SHEET_ID, `'${tab}'!A${row}:AD${row}`);
      setStudents(prev => prev.filter(student => student.rowIndex !== row));
      setSelected(null);
      toast.success(`${selected.name} was removed from Students.`);
    } catch (e: any) { toast.error('Remove failed: ' + e.message); }
    finally { setDeleting(false); }
  };

  if (loading) return <Layout title="Students"><Spinner /></Layout>;

  // Edit mode
  if (selected && editMode) {
    return (
      <Layout title="Edit Student" action={
        <button onClick={() => setEditMode(false)} className="text-white text-sm">Cancel</button>
      }>
        <div className="p-4 pb-28 space-y-3 overflow-y-auto">
          <StudentForm form={form} setForm={setForm} batches={batches} levels={levels} />
        </div>
        <div className="fixed bottom-16 left-0 right-0 bg-white border-t border-gray-200 p-4 z-50 shadow-lg">
          <button type="button" onClick={handleEdit} disabled={saving || Boolean(formValidationError(form))}
            className="w-full bg-navy text-white py-3 rounded-xl font-semibold disabled:opacity-60 flex items-center justify-center gap-2">
            {saving && <span className="button-spinner" aria-hidden="true"/>}
            {saving ? 'Saving changes…' : 'Save Changes'}
          </button>
        </div>
      </Layout>
    );
  }

  // Detail view
  if (selected) {
    const category = getCategory(selected.age);
    return (
      <Layout title={selected.name} action={
        <div className="flex items-center gap-2">
          <button onClick={() => { setForm(studentToForm(selected)); setEditMode(true); }}
            className="bg-white text-navy text-sm font-bold px-3 py-1 rounded-full">✏️ Edit</button>
          <button onClick={() => setSelected(null)} className="text-white text-sm">← Back</button>
        </div>
      }>
        <div className="p-4 space-y-3">
          {/* Chess Profile */}
          <InfoSection title="Chess Profile">
            <div className="flex flex-wrap gap-2 mb-2">
              {category && <span className={`text-xs font-bold px-3 py-1 rounded-full ${CATEGORY_COLOR[category] ?? 'badge-blue'}`}>🏆 {category}</span>}
              <span className="badge-blue">{selected.level}</span>
              <span className="badge-gray">{selected.batch}</span>
            </div>
            {(selected.ratingClassical||selected.ratingRapid||selected.ratingBlitz) && (
              <div className="grid grid-cols-3 gap-2 my-2">
                {selected.ratingClassical && <RatingBox label="Classical" value={selected.ratingClassical}/>}
                {selected.ratingRapid     && <RatingBox label="Rapid"     value={selected.ratingRapid}/>}
                {selected.ratingBlitz     && <RatingBox label="Blitz"     value={selected.ratingBlitz}/>}
              </div>
            )}
            <Row label="TNSCA ID" value={selected.tnscaId}/>
            <Row label="FIDE ID"  value={selected.fideId}/>
            <Row label="AICF ID"  value={selected.aicfId}/>
            <Row label="Joined"   value={selected.joiningDate}/>
            <Row label="Coach"    value={selected.coachName}/>
            <Row label="This Month" value={`${selected.thisMonthAttended||0} days`}/>
          </InfoSection>

          {/* Personal */}
          <InfoSection title="Personal">
            <Row label="DOB"    value={selected.dob}/>
            <Row label="Age"    value={selected.age ? `${selected.age} yrs` : ''}/>
            <Row label="Gender" value={selected.gender}/>
            <Row label="Status"><span className={selected.status==='Active'?'badge-green':'badge-gray'}>{selected.status}</span></Row>
          </InfoSection>

          {/* Academic */}
          <InfoSection title="Academic">
            <Row label="School"    value={selected.school||selected.grade}/>
            <Row label="Standard"  value={selected.standard}/>
            <Row label="Grade / School" value={selected.school ? selected.grade : ''}/>
          </InfoSection>

          {/* Parents */}
          <InfoSection title="Parent 1">
            <Row label="Name" value={selected.parent1Name}/>
            <Row label="Phone">
              {selected.parent1Phone ? <a href={`tel:${selected.parent1Phone}`} className="font-medium text-chess-blue underline">{selected.parent1Phone}</a> : null}
            </Row>
            <Row label="WhatsApp">
              {selected.parent1WhatsApp ? <a href={`https://wa.me/91${selected.parent1WhatsApp.replace(/[^0-9]/g,'').slice(-10)}`} target="_blank" rel="noopener noreferrer" className="font-medium text-green-600 underline">{selected.parent1WhatsApp} 💬</a> : null}
            </Row>
            <Row label="Email" value={selected.parent1Email}/>
          </InfoSection>
          {(selected.parent2Name||selected.parent2Phone) && (
            <InfoSection title="Parent 2">
              <Row label="Name" value={selected.parent2Name}/>
              <Row label="Phone">
                {selected.parent2Phone ? <a href={`tel:${selected.parent2Phone}`} className="font-medium text-chess-blue underline">{selected.parent2Phone}</a> : null}
              </Row>
            </InfoSection>
          )}
          {(selected.emergencyContact||selected.emergencyPhone) && (
            <InfoSection title="Emergency">
              <Row label="Name" value={selected.emergencyContact}/>
              <Row label="Phone">
                {selected.emergencyPhone ? <a href={`tel:${selected.emergencyPhone}`} className="font-medium text-chess-blue underline">{selected.emergencyPhone}</a> : null}
              </Row>
            </InfoSection>
          )}
          {selected.notes && <InfoSection title="Notes"><p className="text-sm text-gray-700">{selected.notes}</p></InfoSection>}
          <button type="button" onClick={handleDelete} disabled={deleting}
            className="w-full border border-red-200 text-red-700 py-3 rounded-xl font-semibold flex items-center justify-center gap-2 disabled:opacity-50">
            <Trash2 size={18} aria-hidden="true" />
            {deleting ? 'Removing student…' : 'Remove Student'}
          </button>
        </div>
      </Layout>
    );
  }

  // List view
  return (
    <Layout title="Students" action={
      <button type="button" onClick={() => {
        setForm({
          ...EMPTY,
          batch: batches[0] ?? '',
          level: levels[0] ?? '',
          coachName,
        });
        setShowAdd(true);
      }}
        className="bg-white text-navy text-sm font-bold px-3 py-1 rounded-full">+ Add</button>
    }>
      <div className="p-4 space-y-3">
        {error && <p className="text-red-600 text-sm bg-red-50 p-3 rounded-xl">{error}</p>}
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search by name, batch, FIDE ID, school…"
          className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-chess-blue"/>
        <div className="flex gap-2 items-center">
          <p className="text-xs text-gray-400 flex-1">{filtered.length} student{filtered.length!==1?'s':''}</p>
          <select value={sortKey} onChange={e=>setSortKey(e.target.value as typeof sortKey)}
            className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none bg-white">
            <option value="name">A → Z</option>
            <option value="batch">By Batch</option>
            <option value="level">By Level</option>
            <option value="status">Active First</option>
            <option value="attendance">Attendance ↓</option>
          </select>
        </div>
        {[...filtered].sort((a,b)=>{
            if(sortKey==='name')       return a.name.localeCompare(b.name);
            if(sortKey==='batch')      return a.batch.localeCompare(b.batch);
            if(sortKey==='level')      {
              const aIndex = levels.indexOf(a.level);
              const bIndex = levels.indexOf(b.level);
              return (aIndex < 0 ? levels.length : aIndex) - (bIndex < 0 ? levels.length : bIndex)
                || a.level.localeCompare(b.level);
            }
            if(sortKey==='status')     return a.status==='Active'?-1:1;
            if(sortKey==='attendance') return parseInt(b.thisMonthAttended||'0')-parseInt(a.thisMonthAttended||'0');
            return 0;
          }).map(s => {
          const cat = getCategory(s.age);
          return (
            <button key={s.name+s.rowIndex} onClick={() => setSelected(s)}
              className="w-full bg-white rounded-xl p-4 shadow-sm border border-gray-100 text-left flex items-center justify-between active:bg-gray-50">
              <div>
                <p className="font-semibold text-gray-900">{s.name}</p>
                <div className="flex gap-1 mt-0.5 flex-wrap">
                  <span className="text-xs text-gray-500">{s.batch}</span>
                  {cat && <span className={`text-xs font-medium px-1.5 py-0 rounded ${CATEGORY_COLOR[cat]??'badge-blue'}`}>{cat}</span>}
                  {s.fideId && <span className="text-xs text-gray-400">FIDE: {s.fideId}</span>}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className={s.status==='Active'?'badge-green':'badge-gray'}>{s.status}</span>
                <span className="text-gray-300">›</span>
              </div>
            </button>
          );
        })}
      </div>
      {showAdd && (
        <Modal title="Add Student" onClose={() => setShowAdd(false)}>
          <div className="max-h-[65vh] overflow-y-auto pr-1">
            <StudentForm form={form} setForm={setForm} batches={batches} levels={levels}/>
          </div>
          <button type="button" onClick={handleAdd} disabled={saving || Boolean(formValidationError(form))}
            className="w-full bg-navy text-white py-3 rounded-xl font-semibold mt-4 disabled:opacity-60 flex items-center justify-center gap-2">
            {saving && <span className="button-spinner" aria-hidden="true"/>}
            {saving?'Adding student…':'Add Student'}
          </button>
        </Modal>
      )}
    </Layout>
  );
}

function StudentForm({ form, setForm, batches, levels }: Readonly<{
  form: FormData;
  setForm: (form: FormData) => void;
  batches: string[];
  levels: string[];
}>) {
  const f = <K extends keyof FormData>(k: K) =>
    (e: React.ChangeEvent<HTMLInputElement|HTMLSelectElement|HTMLTextAreaElement>) => setForm({ ...form, [k]: e.target.value });
  
  // Compute auto values from DOB/age
  const dobDate = form.dob ? new Date(form.dob) : null;
  const computedAge = dobDate && !isNaN(dobDate.getTime())
    ? Math.floor((Date.now() - dobDate.getTime()) / (365.25 * 86400000))
    : null;
  const category = computedAge !== null ? getCategory(String(computedAge)) : '';

  return (
    <div className="space-y-4">
      {/* Basic */}
      <Section title="Personal Details">
        <Field label="Full Name *"><input required value={form.name} onChange={f('name')} className="input"/></Field>
        <Field label="Date of Birth *">
          <input required type="date" value={form.dob} onChange={f('dob')} className="input"/>
          {computedAge !== null && (
            <div className="flex gap-2 mt-1">
              <span className="text-xs text-gray-500">Age: <strong>{computedAge}</strong></span>
              {category && <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${CATEGORY_COLOR[category]??'badge-blue'}`}>🏆 {category}</span>}
            </div>
          )}
        </Field>
        <Field label="Gender">
          <select value={form.gender} onChange={f('gender')} className="input">
            {['Female','Male','Non-binary','Prefer not to say'].map(o=><option key={o}>{o}</option>)}
          </select>
        </Field>
        <Field label="Status">
          <select value={form.status} onChange={f('status')} className="input">
            {['Active','On Hold','Inactive'].map(o=><option key={o}>{o}</option>)}
          </select>
        </Field>
      </Section>

      {/* Academic */}
      <Section title="Academic">
        <Field label="School Name"><input value={form.school} onChange={f('school')} className="input" placeholder="e.g. ABC Matriculation School"/></Field>
        <Field label="Standard / Class">
          <select value={form.standard} onChange={f('standard')} className="input">
            <option value="">Select…</option>
            {STANDARDS.map(o=><option key={o}>{o}</option>)}
          </select>
        </Field>
        <Field label="Grade / School (combined)"><input value={form.grade} onChange={f('grade')} className="input" placeholder="e.g. 7th, ABC School"/></Field>
      </Section>

      {/* Chess Profile */}
      <Section title="Chess Profile">
        <Field label="Batch">
          <select value={form.batch} onChange={f('batch')} className="input">
            {!batches.includes(form.batch) && form.batch && <option>{form.batch}</option>}
            {batches.map(option => <option key={option}>{option}</option>)}
          </select>
        </Field>
        <Field label="Chess Level">
          <select value={form.level} onChange={f('level')} className="input">
            {!levels.includes(form.level) && form.level && <option>{form.level}</option>}
            {levels.map(option => <option key={option}>{option}</option>)}
          </select>
        </Field>
        <Field label="Assigned Coach"><input value={form.coachName} onChange={f('coachName')} className="input" placeholder="Coach name"/></Field>
        <Field label="Joining Date"><input type="date" value={form.joiningDate} onChange={f('joiningDate')} className="input"/></Field>
        <div className="grid grid-cols-3 gap-2">
          <Field label="Classical Rating"><input type="number" value={form.ratingClassical} onChange={f('ratingClassical')} className="input" placeholder="e.g. 1200"/></Field>
          <Field label="Rapid Rating"><input type="number" value={form.ratingRapid} onChange={f('ratingRapid')} className="input" placeholder="e.g. 1100"/></Field>
          <Field label="Blitz Rating"><input type="number" value={form.ratingBlitz} onChange={f('ratingBlitz')} className="input" placeholder="e.g. 950"/></Field>
        </div>
        <Field label="TNSCA ID"><input value={form.tnscaId} onChange={f('tnscaId')} className="input" placeholder="TNSCA registration number"/></Field>
        <Field label="FIDE ID"><input value={form.fideId} onChange={f('fideId')} className="input" placeholder="FIDE registration ID"/></Field>
        <Field label="AICF ID"><input value={form.aicfId} onChange={f('aicfId')} className="input" placeholder="All India Chess Federation ID"/></Field>
      </Section>

      {/* Parents */}
      <Section title="Parent / Guardian">
        <Field label="Parent / Guardian Name *"><input required value={form.parent1Name} onChange={f('parent1Name')} className="input"/></Field>
        <Field label="Phone *"><input required type="tel" value={form.parent1Phone} onChange={f('parent1Phone')} className="input"/></Field>
        <Field label="WhatsApp"><input type="tel" value={form.parent1WhatsApp} onChange={f('parent1WhatsApp')} className="input"/></Field>
        <Field label="Email"><input type="email" value={form.parent1Email} onChange={f('parent1Email')} className="input"/></Field>
        <Field label="Parent 2 Name"><input value={form.parent2Name} onChange={f('parent2Name')} className="input"/></Field>
        <Field label="Parent 2 Phone"><input type="tel" value={form.parent2Phone} onChange={f('parent2Phone')} className="input"/></Field>
      </Section>

      <Section title="Emergency Contact">
        <Field label="Name"><input value={form.emergencyContact} onChange={f('emergencyContact')} className="input"/></Field>
        <Field label="Phone"><input type="tel" value={form.emergencyPhone} onChange={f('emergencyPhone')} className="input"/></Field>
      </Section>

      <Field label="Home Address"><input value={form.address} onChange={f('address')} className="input"/></Field>
      <Field label="Photo Consent">
        <select value={form.photoConsent} onChange={f('photoConsent')} className="input"><option>Yes</option><option>No</option></select>
      </Field>
      <Field label="Notes"><textarea value={form.notes} onChange={f('notes')} className="input" rows={2}/></Field>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-bold text-navy uppercase tracking-wider mb-2 border-b border-gray-100 pb-1">{title}</p>
      <div className="space-y-3">{children}</div>
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
function RatingBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-gray-50 rounded-xl p-2 text-center border border-gray-100">
      <p className="text-xs text-gray-500">{label}</p>
      <p className="font-bold text-navy text-lg">{value}</p>
    </div>
  );
}
function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-end z-50" onClick={onClose}>
      <div className="bg-white w-full rounded-t-2xl p-5 max-h-[90vh] overflow-y-auto" onClick={e=>e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-bold text-lg text-navy">{title}</h2>
          <button onClick={onClose} className="text-gray-400 text-2xl leading-none">×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

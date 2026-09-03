import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Check, ChevronRight, Copy, FileChartColumn, FileSpreadsheet, Filter, Pencil, Plus, RefreshCw, Share2, Trash2, Upload, X } from 'lucide-react';
import { Layout } from '../components/Layout';
import { CopyButton } from '../components/CopyButton';
import { PageSkeleton } from '../components/Skeleton';
import { useAuth } from '../context/AuthContext';
import { readSheet, readSheetLive, appendRows, clearSheetRange, clearSheetReadCache, ensureSheetColumns, writeRange } from '../lib/sheets';
import { syncStudentProfile } from '../lib/studentSync';
import { useToast } from '../context/ToastContext';
import { useCoachName } from '../hooks/useCoachName';
import { recordAudit } from '../lib/audit';
import { DEFAULT_BATCHES, DEFAULT_COACHES, loadStudentOptions } from '../lib/studentOptions';
import { monthLabel, rowToRegistration, type TournamentRegistration } from '../lib/tournamentManagement';
import { rowToSavedWeeklyOnlineTournament, type SavedWeeklyOnlineTournament } from '../lib/weeklyOnlineTournament';
import { matchOnlineTournamentResults, ordinal } from '../lib/onlineTournamentMatch';
import { parseExcelOrCsvFile } from '../lib/excelStudentImport';
import { FilterModal, type FilterSection } from '../components/FilterModal';
import {
  dateValidationError,
  digitsOnly,
  emailValidationError,
  integerRangeValidationError,
  phoneValidationError,
} from '../lib/validation';
import { SHEET_ID, TABS } from '../config';
import type { Student } from '../types';
import { normalizeDateInput } from '../lib/dates';
import { createHeaderMap, parseStudentRow } from '../lib/schemaMapper';

const STANDARDS  = ['LKG','UKG','1st','2nd','3rd','4th','5th','6th','7th','8th','9th','10th','11th','12th','Graduate'];
const CATEGORY_COLOR: Record<string,string> = {
  'Under 7':'bg-blue-100 text-blue-800','Under 9':'bg-cyan-100 text-cyan-800',
  'Under 11':'bg-green-100 text-green-800','Under 13':'bg-emerald-100 text-emerald-800',
  'Under 15':'bg-amber-100 text-amber-800','Under 17':'bg-orange-100 text-orange-800',
  'Under 19':'bg-red-100 text-red-800','Open':'bg-purple-100 text-purple-800',
};

function getCategory(age: string): string {
  const a = Number.parseInt(age);
  if (!a || Number.isNaN(a)) return '';
  if (a <= 6)  return 'Under 7';
  if (a <= 8)  return 'Under 9';
  if (a <= 10) return 'Under 11';
  if (a <= 12) return 'Under 13';
  if (a <= 14) return 'Under 15';
  if (a <= 16) return 'Under 17';
  if (a <= 18) return 'Under 19';
  return 'Open';
}

function normalizedName(value: string): string {
  return value.trim().toLocaleLowerCase();
}

function phoneForSheet(value: string): string {
  const trimmed = value.trim();
  return trimmed ? `'${trimmed}` : '';
}

export type FormData = {
  name:string; dob:string; gender:string; grade:string; batch:string; level:string;
  joiningDate:string; status:string; parent1Name:string; parent1Phone:string;
  parent1WhatsApp:string; parent1Email:string; parent2Name:string; parent2Phone:string;
  emergencyContact:string; emergencyPhone:string; address:string; photoConsent:string; notes:string;
  school:string; standard:string; tnscaId:string; fideId:string; aicfId:string;
  ratingClassical:string; ratingRapid:string; ratingBlitz:string; coachName:string;
  chessComUsername:string; lichessUsername:string; photoUrl:string;
};

const EMPTY: FormData = {
  name:'', dob:'', gender:'Female', grade:'', batch:'Beginner A', level:'Beginner',
  joiningDate:'', status:'Active', parent1Name:'', parent1Phone:'', parent1WhatsApp:'',
  parent1Email:'', parent2Name:'', parent2Phone:'', emergencyContact:'', emergencyPhone:'',
  address:'', photoConsent:'Yes', notes:'',
  school:'', standard:'', tnscaId:'', fideId:'', aicfId:'',
  ratingClassical:'', ratingRapid:'', ratingBlitz:'', coachName:'',
  chessComUsername:'', lichessUsername:'', photoUrl:'',
};

const STUDENT_HEADERS = [
  'Full Name', 'DOB', 'Age', 'Gender', 'Grade / School', 'Batch', 'Level', 'Joining Date', 'Status',
  'Parent Name', 'Parent Phone', 'Parent WhatsApp', 'Parent Email', 'Parent 2 Name', 'Parent 2 Phone',
  'Emergency Contact', 'Emergency Phone', 'Address', 'Photo Consent', 'This Month Attended', 'Notes',
  'School', 'Standard', 'TNSCA ID', 'FIDE ID', 'AICF ID', 'Classical Rating', 'Rapid Rating',
  'Blitz Rating', 'Coach Name', 'Chess.com Username', 'Lichess Username', 'Photo URL',
];

function rowToStudent(row: string[], rowIndex: number, headerMap?: Record<string, number>): Student {
  return parseStudentRow(row, rowIndex, headerMap);
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
    coachName:s.coachName, chessComUsername:s.chessComUsername, lichessUsername:s.lichessUsername,
    photoUrl:s.photoUrl,
  };
}

function normalizedDate(value: string) {
  return normalizeDateInput(value);
}

function normalizedStudentForm(form: FormData) {
  return Object.fromEntries(Object.entries(form).map(([key, value]) => {
    if (key === 'dob' || key === 'joiningDate') return [key, normalizedDate(value)];
    return [key, value.trim()];
  }));
}

function sameStudentForm(left: FormData, right: FormData) {
  return JSON.stringify(normalizedStudentForm(left)) === JSON.stringify(normalizedStudentForm(right));
}

function mergeStudentEdits(baseline: FormData, proposed: FormData, current: FormData) {
  const baselineNormalized = normalizedStudentForm(baseline);
  const proposedNormalized = normalizedStudentForm(proposed);
  const currentNormalized = normalizedStudentForm(current);
  const merged = { ...current };
  const conflictingFields: string[] = [];

  (Object.keys(baseline) as (keyof FormData)[]).forEach(key => {
    const proposedChanged = proposedNormalized[key] !== baselineNormalized[key];
    const currentChanged = currentNormalized[key] !== baselineNormalized[key];
    if (proposedChanged && currentChanged && proposedNormalized[key] !== currentNormalized[key]) {
      conflictingFields.push(key);
      return;
    }
    if (proposedChanged) merged[key] = proposed[key];
  });

  return { merged, conflictingFields };
}

function formToStudent(form: FormData, rowIndex: number, existing?: Student): Student {
  const dob = form.dob ? new Date(form.dob) : null;
  const age = dob && !Number.isNaN(dob.getTime())
    ? String(Math.floor((Date.now() - dob.getTime()) / (365.25 * 86400000)))
    : '';
  return {
    ...form,
    age,
    thisMonthAttended: existing?.thisMonthAttended ?? '',
    rowIndex,
  };
}

function studentRowValues(form: FormData) {
  return [
    form.name, form.dob,
    '=IF(INDEX(B:B,ROW())="","",DATEDIF(INDEX(B:B,ROW()),TODAY(),"Y"))',
    form.gender, form.grade, form.batch, form.level,
    form.joiningDate, form.status,
    form.parent1Name, phoneForSheet(form.parent1Phone), phoneForSheet(form.parent1WhatsApp), form.parent1Email,
    form.parent2Name, phoneForSheet(form.parent2Phone),
    form.emergencyContact, phoneForSheet(form.emergencyPhone),
    form.address, form.photoConsent,
    '=SUMIFS(\'Monthly Attendance\'!$C:$C,\'Monthly Attendance\'!$A:$A,INDEX(A:A,ROW()),\'Monthly Attendance\'!$B:$B,DATE(YEAR(TODAY()),MONTH(TODAY()),1))',
    form.notes, form.school, form.standard,
    form.tnscaId, form.fideId, form.aicfId,
    form.ratingClassical, form.ratingRapid, form.ratingBlitz,
    form.coachName, form.chessComUsername.trim(), form.lichessUsername.trim(),
    form.photoUrl,
  ];
}

function onlineUsernameValidationError(value: string, platform: string, maxLength: number) {
  const username = value.trim();
  if (!username) return '';
  if (username.length > maxLength || !/^[A-Za-z0-9_-]+$/.test(username)) {
    return `${platform} username must use only letters, numbers, underscores, or hyphens and be ${maxLength} characters or fewer.`;
  }
  return '';
}

function formValidationError(form: FormData) {
  if (!form.name.trim()) return 'Student name is required.';
  if (form.name.trim().length < 2 || form.name.trim().length > 100) return 'Student name must contain 2 to 100 characters.';
  if (!form.dob) return 'Date of birth is required so age can be calculated.';
  const dobError = dateValidationError(form.dob, 'Date of birth');
  if (dobError) return dobError;
  if (new Date(form.dob).getTime() > Date.now()) return 'Date of birth cannot be in the future.';
  if (!form.parent1Name.trim()) return 'At least one parent or guardian name is required.';
  if (form.parent1Name.trim().length > 100) return 'Parent or guardian name must be 100 characters or fewer.';
  const phoneErrors = [
    phoneValidationError(form.parent1Phone, 'Parent or guardian phone', true),
    phoneValidationError(form.parent1WhatsApp, 'WhatsApp number'),
    phoneValidationError(form.parent2Phone, 'Parent 2 phone'),
    phoneValidationError(form.emergencyPhone, 'Emergency phone'),
  ];
  const phoneError = phoneErrors.find(Boolean);
  if (phoneError) return phoneError;
  const emailError = emailValidationError(form.parent1Email, 'Parent email');
  if (emailError) return emailError;
  const ratingErrors = [
    integerRangeValidationError(form.ratingClassical, 'Classical rating', 0, 4000),
    integerRangeValidationError(form.ratingRapid, 'Rapid rating', 0, 4000),
    integerRangeValidationError(form.ratingBlitz, 'Blitz rating', 0, 4000),
  ];
  const ratingError = ratingErrors.find(Boolean);
  if (ratingError) return ratingError;
  const usernameError = onlineUsernameValidationError(form.chessComUsername, 'Chess.com', 25)
    || onlineUsernameValidationError(form.lichessUsername, 'Lichess', 20);
  if (usernameError) return usernameError;
  return '';
}

/** Builds the plain-text WhatsApp-ready copy for a single student detail section. */
function sectionCopyText(studentName: string, title: string, rows: [string, string][]): string {
  const lines: string[] = [`*${studentName} \u2013 ${title}*`];
  rows.forEach(([label, value]) => { if (value.trim()) lines.push(`${label}: ${value.trim()}`); });
  return lines.length > 1 ? lines.join('\n') : '';
}

function studentDetailsText(student: Student): string {
  const lines: string[] = ['*KAFT Chess Academy - Student Details*', `*Name:* ${student.name}`];
  const add = (label: string, value: string) => { if (value.trim()) lines.push(`*${label}:* ${value.trim()}`); };
  add('Status', student.status);
  add('Date of Birth', student.dob);
  add('Age', student.age ? `${student.age} years` : '');
  add('Category', getCategory(student.age));
  add('Batch', student.batch);
  add('Chess Level', student.level);
  add('Coach', student.coachName);
  add('School', student.school || student.grade);
  add('Standard', student.standard);
  add('Joining Date', student.joiningDate);
  add('Classical Rating', student.ratingClassical);
  add('Rapid Rating', student.ratingRapid);
  add('Blitz Rating', student.ratingBlitz);
  add('TNSCA ID', student.tnscaId);
  add('FIDE ID', student.fideId);
  add('AICF ID', student.aicfId);
  add('Chess.com', student.chessComUsername);
  add('Lichess', student.lichessUsername);
  add('Parent / Guardian', student.parent1Name);
  add('Parent Phone', student.parent1Phone);
  add('Parent WhatsApp', student.parent1WhatsApp);
  add('Parent Email', student.parent1Email);
  add('Parent 2', student.parent2Name);
  add('Parent 2 Phone', student.parent2Phone);
  add('Emergency Contact', student.emergencyContact);
  add('Emergency Phone', student.emergencyPhone);
  add('Address', student.address);
  add('Notes', student.notes);
  return lines.join('\n');
}

function studentRosterText(students: Student[]): string {
  return [
    '*KAFT Chess Academy - Student Roster*',
    '',
    ...students.map(student => [student.name, student.batch, student.fideId || 'No FIDE ID'].join(' | ')),
  ].join('\n');
}

async function confirmUniqueStudentAppend(
  token: string,
  studentName: string,
  appendedRow: number,
  onDuplicateRemoved: () => void,
): Promise<void> {
  const confirmedNames = await readSheetLive(token, SHEET_ID, `'${TABS.STUDENTS}'!A:A`);
  const firstMatchingRow = confirmedNames.findIndex((nameRow, index) => index > 0
    && normalizedName(nameRow[0] ?? '') === normalizedName(studentName));
  if (firstMatchingRow >= 0 && firstMatchingRow + 1 !== appendedRow) {
    await clearSheetRange(token, SHEET_ID, `'${TABS.STUDENTS}'!A${appendedRow}:AG${appendedRow}`);
    onDuplicateRemoved();
    throw new Error('This student was added on another device at the same time. The duplicate row was removed.');
  }
}

function copyStudentToClipboard(student: Student): Promise<void> {
  return navigator.clipboard.writeText(studentDetailsText(student));
}

function StudentDetailActions({ student, onEdit }: Readonly<{
  student: Student;
  onEdit: () => void;
}>) {
  const [copied, setCopied] = useState(false);
  const toast = useToast();
  const copy = () => {
    void copyStudentToClipboard(student).then(() => {
      setCopied(true);
      toast.success('Student details copied. They are ready to paste into WhatsApp.');
      window.setTimeout(() => setCopied(false), 2000);
    }).catch(() => {
      toast.error('Could not copy the student details. Check clipboard permission and try again.');
    });
  };

  const shareParentLink = () => {
    const pin = student.parent1Phone ? student.parent1Phone.replace(/\D/g, '').slice(-4) : '0000';
    const origin = window.location.origin;
    const path = window.location.pathname.endsWith('/') ? window.location.pathname : `${window.location.pathname}/`;
    const url = `${origin}${path}#/parent?student=${encodeURIComponent(student.name)}&pin=${pin}`;
    const message = `Hello! Here is the link to view ${student.name}'s KAFT Chess Academy progress, attendance, and tournament record:\n${url}\n(PIN: ${pin})`;
    void navigator.clipboard.writeText(message).then(() => {
      toast.success('Parent portal link copied with PIN!');
    }).catch(() => {
      toast.error('Could not copy parent link.');
    });
  };

  return (
    <div className="flex items-center gap-1.5">
      <button type="button" onClick={shareParentLink} aria-label="Share parent portal link" title="Share parent progress link for WhatsApp"
        className="icon-button">
        <Share2 size={16} aria-hidden="true" />
      </button>
      <button type="button" onClick={copy} aria-label="Copy student details" title="Copy student details"
        className="icon-button">
        {copied ? <Check size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />}
      </button>
      <button type="button" onClick={onEdit} aria-label="Edit student" title="Edit student"
        className="icon-button">
        <Pencil size={16} aria-hidden="true" />
      </button>
    </div>
  );
}

async function ensureStudentSchema(token: string) {
  await ensureSheetColumns(token, SHEET_ID, TABS.STUDENTS, STUDENT_HEADERS.length);
  const header = await readSheetLive(token, SHEET_ID, `'${TABS.STUDENTS}'!A1:AG1`);
  if (STUDENT_HEADERS.some((value, index) => header[0]?.[index]?.trim() !== value)) {
    await writeRange(token, SHEET_ID, `'${TABS.STUDENTS}'!A1:AG1`, [STUDENT_HEADERS]);
  }
}

async function loadStudentRows(token: string) {
  try {
    return await readSheet(token, SHEET_ID, `'${TABS.STUDENTS}'!A:AG`);
  } catch (readError) {
    if (navigator.onLine) return readSheetLive(token, SHEET_ID, `'${TABS.STUDENTS}'!A:AG`);
    return readSheet(token, SHEET_ID, `'${TABS.STUDENTS}'!A:AC`);
  }
}

function currentMonthKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// run schema migration at most once per token (session) to avoid an extra live read on every visit
const schemaCheckedForToken = new Set<string>();

type ToastApi = ReturnType<typeof useToast>;
type StudentsSetter = React.Dispatch<React.SetStateAction<Student[]>>;

async function loadStudents(deps: Readonly<{
  token: string | null; logout: () => void;
  setLoading: (value: boolean) => void; setError: (value: string) => void;
  setStudents: StudentsSetter; setFiltered: StudentsSetter;
  setBatches: (value: string[]) => void; setLevels: (value: string[]) => void;
  setCoaches: (value: string[]) => void;
  setSchools: (value: string[]) => void;
  setBatchCoaches: (value: Record<string, string>) => void;
  setTournamentRegistrations: (value: TournamentRegistration[]) => void;
  setWeeklyResults: (value: SavedWeeklyOnlineTournament[]) => void;
}>) {
  const { token, logout, setLoading, setError, setStudents, setFiltered, setBatches, setLevels, setCoaches, setSchools, setBatchCoaches, setTournamentRegistrations, setWeeklyResults } = deps;
  if (!token) return;
  setLoading(true); setError('');
  try {
    if (navigator.onLine && !schemaCheckedForToken.has(token)) {
      await ensureStudentSchema(token);
      schemaCheckedForToken.add(token);
    }
    const [rows, options, registrationRows, weeklyRows] = await Promise.all([
      loadStudentRows(token),
      loadStudentOptions(token, SHEET_ID),
      readSheet(token, SHEET_ID, `'${TABS.TOURNAMENT_REGISTRATIONS}'!A:J`).catch(() => []),
      readSheet(token, SHEET_ID, `'${TABS.WEEKLY_ONLINE_TOURNAMENTS}'!A:N`).catch(() => []),
    ]);
    const headerMap = rows.length > 0 ? createHeaderMap(rows[0]) : undefined;
    const data = rows.slice(1).map((row, index) => rowToStudent(row, index + 2, headerMap)).filter(student => student.name.trim());
    setStudents(data); setFiltered(data);
    setBatches(options.batches.values.length > 0 ? options.batches.values : [...DEFAULT_BATCHES]);
    setLevels(options.levels.values);
    setCoaches(options.coaches.values.length > 0 ? options.coaches.values : [...DEFAULT_COACHES]);
    setSchools(options.schools.values);
    setBatchCoaches(options.batchCoaches?.map ?? {});
    setTournamentRegistrations(registrationRows.slice(1).map((row, index) => rowToRegistration(row, index + 2)).filter(item => item.playing));
    setWeeklyResults(weeklyRows.slice(1).map((row, index) => rowToSavedWeeklyOnlineTournament(row, index + 2)).filter(item => item.name));
  } catch(e:any) {
    if(e.message==='TOKEN_EXPIRED'){logout();return;}
    setError(e.message);
  } finally { setLoading(false); }
}

async function addStudent(deps: Readonly<{
  token: string | null; form: FormData; toast: ToastApi;
  setSaving: (value: boolean) => void; setStudents: StudentsSetter;
  setShowAdd: (value: boolean) => void; setForm: (value: FormData) => void;
}>) {
  const { token, form, toast, setSaving, setStudents, setShowAdd, setForm } = deps;
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
    await ensureStudentSchema(token);
    rowIndex = await appendRows(token, SHEET_ID, `'${TABS.STUDENTS}'!A:AG`, [[
      form.name, form.dob, '=IF(INDEX(B:B,ROW())="","",DATEDIF(INDEX(B:B,ROW()),TODAY(),"Y"))',
      form.gender, form.grade, form.batch, form.level,
      form.joiningDate, form.status, form.parent1Name, phoneForSheet(form.parent1Phone),
      phoneForSheet(form.parent1WhatsApp), form.parent1Email, form.parent2Name, phoneForSheet(form.parent2Phone),
      form.emergencyContact, phoneForSheet(form.emergencyPhone), form.address, form.photoConsent,
      '=SUMIFS(\'Monthly Attendance\'!$C:$C,\'Monthly Attendance\'!$A:$A,INDEX(A:A,ROW()),\'Monthly Attendance\'!$B:$B,DATE(YEAR(TODAY()),MONTH(TODAY()),1))',
      form.notes,
      form.school, form.standard, form.tnscaId, form.fideId, form.aicfId,
      form.ratingClassical, form.ratingRapid, form.ratingBlitz, form.coachName,
      form.chessComUsername.trim(), form.lichessUsername.trim(), form.photoUrl,
    ]]);
    await confirmUniqueStudentAppend(token, form.name, rowIndex, () => { rowIndex = null; });
    const savedRow = rowIndex;
    const values = studentRowValues(form);
    const attendanceSynced = await syncStudentProfile(
      token,
      SHEET_ID,
      `'${TABS.STUDENTS}'!A${savedRow}:AG${savedRow}`,
      values,
      { name: form.name, batch: form.batch, level: form.level, parentName: form.parent1Name },
      { name: form.name, batch: form.batch, level: form.level, parentName: form.parent1Name },
    );
    setStudents(prev => [...prev, formToStudent(form, savedRow)]);
    clearSheetReadCache(SHEET_ID);
    void recordAudit(token, 'CREATE', 'Students', form.name, `Row ${savedRow}`).catch(() => undefined);
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
}

async function editStudent(deps: Readonly<{
  token: string | null; selected: Student | null; form: FormData; toast: ToastApi;
  setSaving: (value: boolean) => void; setStudents: StudentsSetter; setForm: (value: FormData) => void;
  setSelected: (value: Student | null) => void; setEditMode: (value: boolean) => void;
}>) {
  const { token, selected, form, toast, setSaving, setStudents, setForm, setSelected, setEditMode } = deps;
  if (!token || !selected) return;
  const validationError = formValidationError(form);
  if (validationError) { toast.error(validationError); return; }
  setSaving(true);
  try {
    const row = selected.rowIndex; const tab = TABS.STUDENTS;
    const [currentRows, currentNames] = await Promise.all([
      readSheetLive(token, SHEET_ID, `'${tab}'!A${row}:AG${row}`),
      readSheetLive(token, SHEET_ID, `'${tab}'!A:A`),
    ]);
    const currentStudent = rowToStudent(currentRows[0] ?? [], row);
    const { merged: mergedForm, conflictingFields } = mergeStudentEdits(
      studentToForm(selected),
      form,
      studentToForm(currentStudent),
    );
    if (conflictingFields.length > 0) {
      toast.info('The same student fields were changed elsewhere. Latest values were loaded; review and try again.');
      setForm(studentToForm(currentStudent));
      setStudents(prev => prev.map(student => student.rowIndex === row ? currentStudent : student));
      setSelected(currentStudent);
      return;
    }
    if (currentNames.slice(1).some((nameRow, index) => index + 2 !== row
      && nameRow[0]?.trim().toLocaleLowerCase() === mergedForm.name.trim().toLocaleLowerCase())) {
      toast.error('A student with this name already exists. Use a distinct name before saving.');
      return;
    }
    await ensureStudentSchema(token);
    const attendanceSynced = await syncStudentProfile(
      token,
      SHEET_ID,
      `'${tab}'!A${row}:AG${row}`,
      studentRowValues(mergedForm),
      { name: currentStudent.name, batch: currentStudent.batch, level: currentStudent.level, parentName: currentStudent.parent1Name },
      { name: mergedForm.name, batch: mergedForm.batch, level: mergedForm.level, parentName: mergedForm.parent1Name },
    );
    clearSheetReadCache(SHEET_ID);
    const updated = formToStudent(mergedForm, row, currentStudent);
    setStudents(prev => prev.map(student => student.rowIndex === row ? updated : student));
    setEditMode(false);
    setSelected(updated);
    void recordAudit(token, 'UPDATE', 'Students', updated.name, `Row ${row}`).catch(() => undefined);
    if (attendanceSynced) toast.success(`${updated.name}'s changes were updated successfully.`);
    else toast.error(`${updated.name}'s profile was updated, but Attendance could not update. Open Attendance while online to retry.`);
  } catch(e:any) { toast.error('Save failed: '+e.message); }
  finally { setSaving(false); }
}

async function deleteStudent(deps: Readonly<{
  token: string | null; selected: Student | null; toast: ToastApi;
  setDeleting: (value: boolean) => void; setStudents: StudentsSetter; setSelected: (value: Student | null) => void;
}>) {
  const { token, selected, toast, setDeleting, setStudents, setSelected } = deps;
  if (!token || !selected) return;
  const confirmed = window.confirm(
    `Remove ${selected.name}? Their student profile will be removed, but historical fees, attendance, and tournament records will be retained.`,
  );
  if (!confirmed) return;
  setDeleting(true);
  try {
    const row = selected.rowIndex;
    const tab = TABS.STUDENTS;
    const currentRows = await readSheetLive(token, SHEET_ID, `'${tab}'!A${row}:AG${row}`);
    const currentStudent = rowToStudent(currentRows[0] ?? [], row);
    if (!sameStudentForm(studentToForm(currentStudent), studentToForm(selected))) {
      toast.info('This student was changed on another device. Reload the list before removing it.');
      return;
    }
    await clearSheetRange(token, SHEET_ID, `'${tab}'!A${row}:AG${row}`);
    clearSheetReadCache(SHEET_ID);
    setStudents(prev => prev.filter(student => student.rowIndex !== row));
    void recordAudit(token, 'DELETE', 'Students', selected.name, `Row ${row}`).catch(() => undefined);
    setSelected(null);
    toast.success(`${selected.name} was removed from Students.`);
  } catch (e: any) { toast.error('Remove failed: ' + e.message); }
  finally { setDeleting(false); }
}

async function batchImportStudents(deps: Readonly<{
  token: string | null;
  importList: FormData[];
  existingStudents: Student[];
  coachName: string;
  toast: ToastApi;
  setSaving: (value: boolean) => void;
  setStudents: StudentsSetter;
  setFiltered: StudentsSetter;
  setImportPreview: (value: FormData[] | null) => void;
}>) {
  const { token, importList, existingStudents, coachName, toast, setSaving, setStudents, setFiltered, setImportPreview } = deps;
  if (!token || importList.length === 0) return;
  setSaving(true);
  try {
    await ensureStudentSchema(token);
    const existingNames = new Set(existingStudents.map(s => normalizedName(s.name)));
    const newItems = importList.filter(item => item.name.trim() && !existingNames.has(normalizedName(item.name)));
    if (newItems.length === 0) {
      toast.info('All students in this spreadsheet already exist in the roster.');
      setImportPreview(null);
      return;
    }

    const currentNames = await readSheetLive(token, SHEET_ID, `'${TABS.STUDENTS}'!A:A`);
    const liveNames = new Set(currentNames.slice(1).map(r => normalizedName(r[0] ?? '')));
    const filteredToAppend = newItems.filter(item => !liveNames.has(normalizedName(item.name)));

    if (filteredToAppend.length === 0) {
      toast.info('All students in this spreadsheet already exist in Google Sheets.');
      setImportPreview(null);
      return;
    }

    const rowsToAppend = filteredToAppend.map(item => studentRowValues(item));
    await appendRows(token, SHEET_ID, `'${TABS.STUDENTS}'!A:AG`, rowsToAppend);

    // Reflect the newly written students immediately so the list never appears stuck,
    // regardless of whether the reconciliation read below succeeds or is delayed.
    const optimisticStudents = filteredToAppend.map((item, idx) => formToStudent(item, -1 - idx));
    setStudents(prev => [...prev, ...optimisticStudents]);
    setFiltered(prev => [...prev, ...optimisticStudents]);

    // Immediately synchronize all newly imported students to Weekend Attendance sheet
    try {
      const attRows = await readSheetLive(token, SHEET_ID, `'${TABS.ATTENDANCE}'!A:B`);
      const existingAttNames = new Set(attRows.slice(1).map(r => normalizedName(r[0] ?? '')));
      const attToAppend = filteredToAppend.filter(item => !existingAttNames.has(normalizedName(item.name)));
      if (attToAppend.length > 0) {
        await appendRows(token, SHEET_ID, `'${TABS.ATTENDANCE}'!A:B`, attToAppend.map(item => [item.name, item.batch]));
      }
    } catch { /* best effort attendance sync */ }

    // Clear session reconcile cache
    try {
      sessionStorage.removeItem(`att-reconciled-${SHEET_ID}`);
    } catch { /* sessionStorage fallback */ }

    // Clear Google Sheets read cache
    clearSheetReadCache(SHEET_ID);

    // Reload from live sheet so all indices, formulas, and data are 100% verified and retained.
    // A failure here must not undo the already-persisted import or the optimistic update above.
    try {
      const freshRows = await readSheetLive(token, SHEET_ID, `'${TABS.STUDENTS}'!A:AG`);
      const freshHeaderMap = freshRows.length > 0 ? createHeaderMap(freshRows[0]) : undefined;
      const freshData = freshRows.slice(1).map((row, index) => rowToStudent(row, index + 2, freshHeaderMap)).filter(s => s.name.trim());
      setStudents(freshData);
      setFiltered(freshData);
    } catch { /* optimistic students already reflect what was saved; reconciliation will retry on next sync */ }

    void recordAudit(token, 'CREATE', 'Students', `Imported ${filteredToAppend.length} students from Excel/CSV`, coachName).catch(() => undefined);
    toast.success(`Successfully saved ${filteredToAppend.length} student${filteredToAppend.length === 1 ? '' : 's'} to Google Sheets!`);
    setImportPreview(null);
  } catch (e: any) {
    toast.error('Import failed: ' + e.message);
  } finally {
    setSaving(false);
  }
}

function StudentChessTab({ selected, registrations, weeklyResults }: Readonly<{
  selected: Student;
  registrations: TournamentRegistration[];
  weeklyResults: SavedWeeklyOnlineTournament[];
}>) {
  return (
    <>
      <InfoSection title="Chess Profile" copyText={sectionCopyText(selected.name, 'Chess Profile', [
        ['Classical', selected.ratingClassical], ['Rapid', selected.ratingRapid], ['Blitz', selected.ratingBlitz],
        ['Coach', selected.coachName], ['Joined', selected.joiningDate],
        ['TNSCA ID', selected.tnscaId], ['FIDE ID', selected.fideId], ['AICF ID', selected.aicfId],
        ['Chess.com', selected.chessComUsername], ['Lichess', selected.lichessUsername],
      ])}>
        {(selected.ratingClassical||selected.ratingRapid||selected.ratingBlitz) && (
          <div className="grid grid-cols-3 gap-2 mb-3">
            {selected.ratingClassical && <RatingBox label="Classical" value={selected.ratingClassical}/>}
            {selected.ratingRapid     && <RatingBox label="Rapid"     value={selected.ratingRapid}/>}
            {selected.ratingBlitz     && <RatingBox label="Blitz"     value={selected.ratingBlitz}/>}
          </div>
        )}
        <Row label="Coach"       value={selected.coachName}/>
        <Row label="Joined"      value={selected.joiningDate}/>
        <Row label="This month"  value={`${selected.thisMonthAttended||0} days attended`}/>
        <Row label="TNSCA ID"    value={selected.tnscaId}/>
        <Row label="FIDE ID">
          {selected.fideId ? <a href={`https://ratings.fide.com/profile/${encodeURIComponent(selected.fideId)}`} target="_blank" rel="noopener noreferrer" className="font-medium text-chess-blue underline">{selected.fideId}</a> : null}
        </Row>
        <Row label="AICF ID"     value={selected.aicfId}/>
        <Row label="Chess.com">
          {selected.chessComUsername ? <a href={`https://www.chess.com/member/${encodeURIComponent(selected.chessComUsername)}`} target="_blank" rel="noopener noreferrer" className="font-medium text-chess-blue underline">{selected.chessComUsername}</a> : null}
        </Row>
        <Row label="Lichess">
          {selected.lichessUsername ? <a href={`https://lichess.org/@/${encodeURIComponent(selected.lichessUsername)}`} target="_blank" rel="noopener noreferrer" className="font-medium text-chess-blue underline">{selected.lichessUsername}</a> : null}
        </Row>
      </InfoSection>
      <TournamentAttendance studentName={selected.name} lichessUsername={selected.lichessUsername} chessComUsername={selected.chessComUsername} registrations={registrations} weeklyResults={weeklyResults} />
    </>
  );
}

function StudentContactTab({ selected }: Readonly<{ selected: Student }>) {
  return (
    <>
      <InfoSection title="Parent / Guardian" copyText={sectionCopyText(selected.name, 'Parent / Guardian', [
        ['Name', selected.parent1Name], ['Phone', selected.parent1Phone],
        ['WhatsApp', selected.parent1WhatsApp], ['Email', selected.parent1Email],
      ])}>
        <Row label="Name" value={selected.parent1Name}/>
        <Row label="Phone">
          {selected.parent1Phone ? <a href={`tel:${selected.parent1Phone}`} className="font-medium text-chess-blue underline">{selected.parent1Phone}</a> : null}
        </Row>
        <Row label="WhatsApp">
          {selected.parent1WhatsApp ? <a href={`https://wa.me/91${selected.parent1WhatsApp.replace(/\D/g,'').slice(-10)}`} target="_blank" rel="noopener noreferrer" className="font-medium text-green-600 underline">{selected.parent1WhatsApp} 💬</a> : null}
        </Row>
        <Row label="Email" value={selected.parent1Email}/>
      </InfoSection>
      {(selected.parent2Name||selected.parent2Phone) && (
        <InfoSection title="Parent 2" copyText={sectionCopyText(selected.name, 'Parent 2', [['Name', selected.parent2Name], ['Phone', selected.parent2Phone]])}>
          <Row label="Name" value={selected.parent2Name}/>
          <Row label="Phone">
            {selected.parent2Phone ? <a href={`tel:${selected.parent2Phone}`} className="font-medium text-chess-blue underline">{selected.parent2Phone}</a> : null}
          </Row>
        </InfoSection>
      )}
      {(selected.emergencyContact||selected.emergencyPhone) && (
        <InfoSection title="Emergency" copyText={sectionCopyText(selected.name, 'Emergency', [['Name', selected.emergencyContact], ['Phone', selected.emergencyPhone]])}>
          <Row label="Name"  value={selected.emergencyContact}/>
          <Row label="Phone">
            {selected.emergencyPhone ? <a href={`tel:${selected.emergencyPhone}`} className="font-medium text-chess-blue underline">{selected.emergencyPhone}</a> : null}
          </Row>
        </InfoSection>
      )}
    </>
  );
}

function StudentInfoTab({ selected }: Readonly<{ selected: Student }>) {
  return (
    <>
      <InfoSection title="Personal" copyText={sectionCopyText(selected.name, 'Personal', [
        ['DOB', selected.dob], ['Age', selected.age ? `${selected.age} yrs` : ''], ['Gender', selected.gender],
      ])}>
        <Row label="DOB"    value={selected.dob}/>
        <Row label="Age"    value={selected.age ? `${selected.age} yrs` : ''}/>
        <Row label="Gender" value={selected.gender}/>
      </InfoSection>
      <InfoSection title="Academic" copyText={sectionCopyText(selected.name, 'Academic', [
        ['School', selected.school || selected.grade], ['Standard', selected.standard], ['Combined', selected.school && selected.grade ? selected.grade : ''],
      ])}>
        <Row label="School"   value={selected.school||selected.grade}/>
        <Row label="Standard" value={selected.standard}/>
        {selected.school && selected.grade && <Row label="Combined" value={selected.grade}/>}
      </InfoSection>
      {selected.address && <InfoSection title="Address" copyText={`*${selected.name} – Address*\n${selected.address}`}><p className="text-sm text-gray-700 break-words leading-5">{selected.address}</p></InfoSection>}
      {selected.notes   && <InfoSection title="Notes" copyText={`*${selected.name} – Notes*\n${selected.notes}`}><p className="text-sm text-gray-700">{selected.notes}</p></InfoSection>}
    </>
  );
}

function matchesStudentSearch(s: Student, q: string): boolean {
  if (!q) return true;
  return s.name.toLowerCase().includes(q) ||
    s.batch.toLowerCase().includes(q) ||
    s.tnscaId.toLowerCase().includes(q) ||
    s.fideId.toLowerCase().includes(q) ||
    s.school.toLowerCase().includes(q) ||
    s.standard.toLowerCase().includes(q) ||
    s.coachName.toLowerCase().includes(q);
}

function matchesStudentBatchAndCat(s: Student, batches: string[], categories: string[]): boolean {
  if (batches.length > 0) {
    const sb = s.batch.trim().toLowerCase();
    const matchesBatch = batches.some(b => {
      const target = b.trim().toLowerCase();
      return sb === target || sb.startsWith(target);
    });
    if (!matchesBatch) return false;
  }
  if (categories.length > 0) {
    const sc = getCategory(s.age).toLowerCase();
    if (!categories.some(c => c.toLowerCase() === sc)) return false;
  }
  return true;
}

function matchesStudentCoachAndMeta(s: Student, coaches: string[], schools: string[], statuses: string[]): boolean {
  if (coaches.length > 0) {
    const sc = s.coachName.trim().toLowerCase();
    const matchesCoach = coaches.some(c => {
      const target = c.trim().toLowerCase();
      return sc.includes(target) || target.includes(sc);
    });
    if (!matchesCoach) return false;
  }
  if (schools.length > 0) {
    const sch = (s.school || s.grade).trim().toLowerCase();
    if (!schools.some(sc => sch.includes(sc.trim().toLowerCase()))) return false;
  }
  if (statuses.length > 0) {
    const st = (s.status || 'Active').trim().toLowerCase();
    if (!statuses.some(item => item.trim().toLowerCase() === st)) return false;
  }
  return true;
}

function matchesStudentFilters(
  s: Student,
  q: string,
  batches: string[],
  categories: string[],
  coaches: string[],
  schools: string[],
  statuses: string[],
): boolean {
  if (!matchesStudentSearch(s, q)) return false;
  if (!matchesStudentBatchAndCat(s, batches, categories)) return false;
  return matchesStudentCoachAndMeta(s, coaches, schools, statuses);
}

function sortStudents(list: Student[], sortKey: 'name' | 'batch' | 'status' | 'attendance'): Student[] {
  return [...list].sort((a, b) => {
    if (sortKey === 'name') return a.name.localeCompare(b.name);
    if (sortKey === 'batch') return a.batch.localeCompare(b.batch);
    if (sortKey === 'status') return a.status === 'Active' ? -1 : 1;
    if (sortKey === 'attendance') return Number.parseInt(b.thisMonthAttended || '0') - Number.parseInt(a.thisMonthAttended || '0');
    return 0;
  });
}

const DETAIL_TAB_LABELS: Record<'info' | 'contact' | 'chess', string> = {
  info: '👤 Info',
  contact: '📞 Contact',
  chess: '♟ Chess',
};

export function Students() {
  const { token, logout } = useAuth();
  const { coachName } = useCoachName();
  const navigate = useNavigate();
  const [students, setStudents] = useState<Student[]>([]);
  const [tournamentRegistrations, setTournamentRegistrations] = useState<TournamentRegistration[]>([]);
  const [weeklyResults, setWeeklyResults] = useState<SavedWeeklyOnlineTournament[]>([]);
  const [filtered, setFiltered] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchParams] = useSearchParams();
  const [search, setSearch] = useState(() => searchParams.get('search') ?? '');
  const [selected, setSelected] = useState<Student | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState<FormData>({ ...EMPTY });
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [batches, setBatches] = useState([...DEFAULT_BATCHES]);
  const [coaches, setCoaches] = useState([...DEFAULT_COACHES]);
  const [schools, setSchools] = useState<string[]>([]);
  const [batchCoaches, setBatchCoaches] = useState<Record<string, string>>({});
  const [selectedBatches, setSelectedBatches] = useState<string[]>([]);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [selectedCoaches, setSelectedCoaches] = useState<string[]>([]);
  const [selectedSchools, setSelectedSchools] = useState<string[]>([]);
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>([]);
  const [showFilterModal, setShowFilterModal] = useState(false);
  const [sortKey, setSortKey] = useState<'name'|'batch'|'status'|'attendance'>('name');
  const [detailTab, setDetailTab] = useState<'chess'|'contact'|'info'>('info');
  const [syncing, setSyncing] = useState(false);
  const [importPreview, setImportPreview] = useState<FormData[] | null>(null);
  const [importFileName, setImportFileName] = useState('');
  const [importingFile, setImportingFile] = useState(false);
  const toast = useToast();

  const load = () => loadStudents({
    token, logout, setLoading, setError, setStudents, setFiltered,
    setBatches, setLevels: () => {}, setCoaches, setSchools, setBatchCoaches, setTournamentRegistrations, setWeeklyResults,
  });

  const availableSchools = useMemo(() => {
    return Array.from(new Set([...schools, ...students.map(s => (s.school || s.grade).trim())].filter(Boolean))).sort((a, b) => a.localeCompare(b));
  }, [schools, students]);

  const activeFilterCount = selectedBatches.length + selectedCategories.length + selectedCoaches.length + selectedSchools.length + selectedStatuses.length;

  const resetAllFilters = () => {
    setSelectedBatches([]);
    setSelectedCategories([]);
    setSelectedCoaches([]);
    setSelectedSchools([]);
    setSelectedStatuses([]);
  };

  const filterSections: FilterSection[] = [
    {
      id: 'batches',
      title: 'Batch',
      multiSelect: true,
      selectedValues: selectedBatches,
      onChange: setSelectedBatches,
      options: batches.map(b => ({
        value: b,
        count: students.filter(s => s.batch.toLowerCase().startsWith(b.toLowerCase())).length,
      })),
    },
    {
      id: 'categories',
      title: 'Age Category',
      multiSelect: true,
      selectedValues: selectedCategories,
      onChange: setSelectedCategories,
      options: ['Under 7', 'Under 9', 'Under 11', 'Under 13', 'Under 15', 'Under 17', 'Under 19', 'Open'].map(cat => ({
        value: cat,
        count: students.filter(s => getCategory(s.age).toLowerCase() === cat.toLowerCase()).length,
      })),
    },
    {
      id: 'coaches',
      title: 'Assigned Coach',
      multiSelect: true,
      selectedValues: selectedCoaches,
      onChange: setSelectedCoaches,
      options: coaches.map(c => ({
        value: c,
        count: students.filter(s => s.coachName.trim().toLowerCase().includes(c.toLowerCase()) || c.toLowerCase().includes(s.coachName.trim().toLowerCase())).length,
      })),
    },
    {
      id: 'statuses',
      title: 'Status',
      multiSelect: true,
      selectedValues: selectedStatuses,
      onChange: setSelectedStatuses,
      options: ['Active', 'Inactive', 'On Hold'].map(st => ({
        value: st,
        count: students.filter(s => (s.status || 'Active').toLowerCase() === st.toLowerCase()).length,
      })),
    },
    ...(availableSchools.length > 0 ? [{
      id: 'schools',
      title: 'School / Standard',
      multiSelect: true,
      selectedValues: selectedSchools,
      onChange: setSelectedSchools,
      options: availableSchools.map(sch => ({
        value: sch,
        count: students.filter(s => (s.school || s.grade).trim().toLowerCase() === sch.toLowerCase()).length,
      })),
    }] : []),
  ];

  useEffect(() => { load(); }, [token]);
  useEffect(() => {
    const q = search.toLowerCase();
    setFiltered(students.filter(s => matchesStudentFilters(
      s, q, selectedBatches, selectedCategories, selectedCoaches, selectedSchools, selectedStatuses
    )));
  }, [search, students, selectedBatches, selectedCategories, selectedCoaches, selectedSchools, selectedStatuses]);

  const handleAdd = () => addStudent({ token, form, toast, setSaving, setStudents, setShowAdd, setForm });

  const handleEdit = () => editStudent({ token, selected, form, toast, setSaving, setStudents, setForm, setSelected, setEditMode });

  const handleDelete = () => deleteStudent({ token, selected, toast, setDeleting, setStudents, setSelected });

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setImportingFile(true);
    try {
      const parsed = await parseExcelOrCsvFile(file, coachName);
      setImportFileName(file.name);
      setImportPreview(parsed);
      toast.info(`Parsed ${parsed.length} students from ${file.name}. Review and confirm to import.`);
    } catch (err: any) {
      toast.error('File parse error: ' + (err.message || 'Could not parse Excel/CSV.'));
    } finally {
      setImportingFile(false);
      event.target.value = '';
    }
  };

  const handleBatchImport = () => {
    if (!importPreview) return;
    void batchImportStudents({
      token,
      importList: importPreview,
      existingStudents: students,
      coachName,
      toast,
      setSaving,
      setStudents,
      setFiltered,
      setImportPreview,
    });
  };

  // Sheets reads are cached briefly for performance, so another coach's edits
  // may not appear immediately — this forces a fresh fetch on demand.
  const sync = () => {
    clearSheetReadCache(SHEET_ID);
    setSyncing(true);
    void load().finally(() => setSyncing(false));
  };

  if (loading) return <Layout title="Students"><PageSkeleton /></Layout>;

  // Edit mode
  if (selected && editMode) {
    return (
      <Layout title="Edit Student" onBack={() => setEditMode(false)} action={
        <button type="button" onClick={() => setEditMode(false)} className="header-action">Cancel</button>
      }>
        <div className="p-4 pb-28 space-y-3 overflow-y-auto">
          <StudentForm form={form} setForm={setForm} batches={batches} schoolOptions={schools} coachOptions={coaches} batchCoaches={batchCoaches} />
        </div>
        <div className="fixed bottom-16 left-0 right-0 bg-white dark:bg-slate-900 border-t border-gray-200 dark:border-slate-800 p-4 z-50 shadow-lg">
          {formValidationError(form) && <p role="alert" className="text-xs text-red-600 mb-2">{formValidationError(form)}</p>}
          <button type="button" onClick={handleEdit} disabled={saving}
            className="primary-action w-full">
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
    const parentWa = selected.parent1WhatsApp.replace(/\D/g,'').slice(-10);
    return (
      <Layout title={selected.name} onBack={() => setSelected(null)} action={
        <StudentDetailActions student={selected}
          onEdit={() => { setForm(studentToForm(selected)); setEditMode(true); }} />
      }>
        <div className="flex flex-col min-h-full">
          {/* Identity bar — photo + chips + quick-contact */}
          <div className="bg-white dark:bg-slate-900 border-b border-gray-100 dark:border-slate-800 px-4 py-3 space-y-2.5">
            <div className="flex items-center gap-3">
              <div className="min-w-0 flex-1 flex flex-wrap gap-1.5 items-center">
                <span className={selected.status==='Active'?'badge-green':'badge-gray'}>{selected.status}</span>
                {category && <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${CATEGORY_COLOR[category]??'badge-blue'}`}>{category}</span>}
                <span className="text-xs text-gray-500 dark:text-gray-400">{selected.batch}</span>
              </div>
            </div>
            {(selected.parent1Phone || (selected.parent1WhatsApp && parentWa)) && (
              <div className="flex flex-wrap gap-2 items-center">
                {selected.parent1Phone && (
                  <a href={`tel:${selected.parent1Phone}`}
                    className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-gray-300">
                    📞 Call parent
                  </a>
                )}
                {/* plain span keeps exact-text findability for tests */}
                {selected.parent1Phone && <span className="text-xs text-gray-400">{selected.parent1Phone}</span>}
                {selected.parent1WhatsApp && parentWa && (
                  <a href={`https://wa.me/91${parentWa}`} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-green-50 dark:bg-green-950/40 text-green-700 dark:text-green-300 border border-green-200 dark:border-green-800">
                    💬 WhatsApp
                  </a>
                )}
              </div>
            )}
          </div>

          {/* Tab bar */}
          <div className="flex bg-white dark:bg-slate-900 border-b border-gray-100 dark:border-slate-800">
            {(['info','contact','chess'] as const).map(tab => (
              <button key={tab} type="button" onClick={() => setDetailTab(tab)}
                className={`flex-1 py-2.5 text-xs font-bold uppercase tracking-wide border-b-2 transition-colors
                  ${detailTab===tab ? 'border-chess-blue text-chess-blue' : 'border-transparent text-gray-400'}`}>
                {DETAIL_TAB_LABELS[tab]}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div className="flex-1 p-4 space-y-3 overflow-y-auto pb-4">
            {detailTab === 'chess' && <StudentChessTab selected={selected} registrations={tournamentRegistrations} weeklyResults={weeklyResults} />}
            {detailTab === 'contact' && <StudentContactTab selected={selected} />}
            {detailTab === 'info' && <StudentInfoTab selected={selected} />}

            {/* Actions */}
            <button type="button" onClick={() => navigate(`/timeline?student=${encodeURIComponent(selected.name)}`)} className="w-full border border-chess-blue/30 text-chess-blue py-2.5 rounded-xl font-semibold flex items-center justify-center gap-2">
              <FileChartColumn size={16} /> View Timeline &amp; Export PDF
            </button>
            <button type="button" onClick={handleDelete} disabled={deleting}
              className="danger-action">
              <Trash2 size={18} aria-hidden="true" />
              {deleting ? 'Removing student…' : 'Remove Student'}
            </button>
          </div>
        </div>
      </Layout>
    );
  }

  // List view
  return (
    <Layout title="Students" action={
      <>
        <label className="icon-button cursor-pointer" aria-label="Import students from Excel or CSV" title="Import from Excel / CSV">
          <Upload size={16} className={importingFile ? 'animate-spin' : ''} aria-hidden="true" />
          <input type="file" accept=".xlsx,.xls,.csv" className="sr-only" onChange={handleFileUpload} />
        </label>
        <button type="button" onClick={sync} disabled={syncing} aria-label="Sync latest changes" title="Sync latest changes"
          className="icon-button"><RefreshCw size={16} className={syncing ? 'animate-spin' : ''} aria-hidden="true" /></button>
        <button type="button" onClick={() => {
          const initialBatch = batches[0] ?? 'Beginner';
          const defaultCoach = batchCoaches[initialBatch] || coachName || coaches[0] || 'Coach Anand';
          setForm({
            ...EMPTY,
            batch: initialBatch,
            level: initialBatch,
            coachName: defaultCoach,
          });
          setShowAdd(true);
        }}
          aria-label="Add student"
          className="icon-button-add"><Plus size={18} aria-hidden="true" /></button>
      </>
    }>
      <div className="students-workspace p-4 space-y-3">
        {error && <p className="text-red-600 text-sm bg-red-50 p-3 rounded-xl">{error}</p>}
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search by name, batch, FIDE ID, school, coach…"
          className="input student-search"/>

        {/* Active Filter Chips */}
        {activeFilterCount > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
            {selectedBatches.map(b => (
              <span key={b} className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-blue-50 text-blue-800 dark:bg-blue-950/50 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                {b}
                <button type="button" onClick={() => setSelectedBatches(prev => prev.filter(v => v !== b))} aria-label={`Remove ${b} batch filter`}><X size={12} /></button>
              </span>
            ))}
            {selectedCategories.map(c => (
              <span key={c} className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-50 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                {c}
                <button type="button" onClick={() => setSelectedCategories(prev => prev.filter(v => v !== c))} aria-label={`Remove ${c} category filter`}><X size={12} /></button>
              </span>
            ))}
            {selectedCoaches.map(coach => (
              <span key={coach} className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-purple-50 text-purple-800 dark:bg-purple-950/50 dark:text-purple-300 border border-purple-200 dark:border-purple-800">
                {coach}
                <button type="button" onClick={() => setSelectedCoaches(prev => prev.filter(v => v !== coach))} aria-label={`Remove ${coach} filter`}><X size={12} /></button>
              </span>
            ))}
            {selectedSchools.map(sch => (
              <span key={sch} className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                {sch}
                <button type="button" onClick={() => setSelectedSchools(prev => prev.filter(v => v !== sch))} aria-label={`Remove ${sch} filter`}><X size={12} /></button>
              </span>
            ))}
            {selectedStatuses.map(st => (
              <span key={st} className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300 border border-gray-200 dark:border-gray-700">
                {st}
                <button type="button" onClick={() => setSelectedStatuses(prev => prev.filter(v => v !== st))} aria-label={`Remove ${st} status filter`}><X size={12} /></button>
              </span>
            ))}
            <button
              type="button"
              onClick={resetAllFilters}
              className="text-[11px] font-bold text-red-600 dark:text-red-400 hover:underline px-1.5 py-0.5"
            >
              Clear all
            </button>
          </div>
        )}

        <div className="student-list-controls flex gap-2 items-center">
          <p className="text-xs text-gray-400 flex-1 truncate">{filtered.filter(student => (student.status || 'Active').toLowerCase() === 'active').length} active · {filtered.length} total</p>
          <CopyButton text={studentRosterText(sortStudents(filtered, sortKey))} label="Copy student names, batches and FIDE IDs" />
          <button
            type="button"
            onClick={() => setShowFilterModal(true)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
              activeFilterCount > 0
                ? 'bg-amber-50 text-amber-900 border-amber-300 dark:bg-amber-950/40 dark:text-amber-200 dark:border-amber-800'
                : 'bg-white dark:bg-slate-800 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-slate-750'
            }`}
            aria-label="Filter students"
            title="Filter by batch, category, coach, school and status"
          >
            <Filter size={14} />
            <span>Filters</span>
            {activeFilterCount > 0 && (
              <span className="w-5 h-5 rounded-full bg-navy dark:bg-amber-500 text-white dark:text-slate-950 text-[10px] font-bold flex items-center justify-center">
                {activeFilterCount}
              </span>
            )}
          </button>
          <select value={sortKey} onChange={e=>setSortKey(e.target.value as typeof sortKey)}
            className="text-xs border border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1.5 focus:outline-none bg-white dark:bg-slate-800 font-medium"
            aria-label="Sort students">
            <option value="name">A → Z</option>
            <option value="batch">By Batch</option>
            <option value="status">Active First</option>
            <option value="attendance">Attendance ↓</option>
          </select>
        </div>
        {sortStudents(filtered, sortKey).map(s => {
          const cat = getCategory(s.age);
          const cm = currentMonthKey();
          const hasTournament = tournamentRegistrations.some(r => r.month === cm && normalizedName(r.studentName) === normalizedName(s.name));
          return (
            <button type="button" key={s.name+s.rowIndex} onClick={() => { setSelected(s); setDetailTab('info'); }}
              className="student-list-row card-btn w-full bg-white dark:bg-slate-900 rounded-xl px-3 py-3 shadow-sm border border-gray-100 dark:border-slate-800 text-left flex items-center gap-3 active:bg-gray-50 dark:active:bg-slate-800/60">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <p className="font-semibold text-gray-900 dark:text-gray-100">{s.name}</p>
                  {hasTournament && <span title="Playing tournament this month" className="text-sm leading-none">🏆</span>}
                </div>
                <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400 flex flex-wrap gap-x-2 items-center">
                  <span>{s.batch}</span>
                  {cat && <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${CATEGORY_COLOR[cat]??'badge-blue'}`}>{cat}</span>}
                  {s.coachName && <span className="text-purple-600 dark:text-purple-400 font-medium text-[10px]">{s.coachName}</span>}
                  {s.fideId && <span className="text-gray-400">FIDE: {s.fideId}</span>}
                </p>
              </div>
              <div className="flex flex-shrink-0 items-center gap-1.5">
                <span className={s.status==='Active'?'badge-green':'badge-gray'}>{s.status}</span>
                <ChevronRight size={16} className="hover-arrow text-gray-400" aria-hidden="true" />
              </div>
            </button>
          );
        })}
      </div>
      <StudentAddModal
        show={showAdd}
        form={form}
        setForm={setForm}
        batches={batches}
        schoolOptions={schools}
        coachOptions={coaches}
        batchCoaches={batchCoaches}
        saving={saving}
        onClose={() => setShowAdd(false)}
        onAdd={handleAdd}
      />
      {importPreview && (
        <ImportPreviewModal
          importPreview={importPreview}
          importFileName={importFileName}
          saving={saving}
          onClose={() => setImportPreview(null)}
          onImport={handleBatchImport}
        />
      )}
      {showFilterModal && (
        <FilterModal
          title="Filter Students"
          sections={filterSections}
          totalResults={filtered.length}
          activeFilterCount={activeFilterCount}
          onResetAll={resetAllFilters}
          onClose={() => setShowFilterModal(false)}
        />
      )}
    </Layout>
  );
}

function ImportPreviewModal({
  importPreview,
  importFileName,
  saving,
  onClose,
  onImport,
}: Readonly<{
  importPreview: FormData[];
  importFileName: string;
  saving: boolean;
  onClose: () => void;
  onImport: () => void;
}>) {
  return (
    <Modal title={`Import Students (${importPreview.length} found)`} onClose={onClose}>
      <div className="space-y-3">
        <div className="p-3 bg-amber-50 dark:bg-amber-950/30 rounded-xl border border-amber-200 dark:border-amber-900/40 text-xs text-amber-900 dark:text-amber-200">
          <p className="font-bold flex items-center gap-1.5"><FileSpreadsheet size={15} /> Source: {importFileName}</p>
          <p className="mt-1">Review the parsed records below. Existing students in the roster will be skipped automatically.</p>
        </div>

        <div className="max-h-[50vh] overflow-y-auto divide-y divide-gray-100 dark:divide-gray-800 border dark:border-gray-800 rounded-xl">
          {importPreview.map((item, idx) => (
            <div key={`${item.name}-${idx}`} className="p-2.5 text-xs flex items-center justify-between gap-2">
              <div className="min-w-0 flex-1">
                <strong className="block text-gray-900 dark:text-white truncate">{idx + 1}. {item.name}</strong>
                <span className="text-gray-500 block truncate">DOB: {item.dob} · {item.batch} · Parent: {item.parent1Name} ({item.parent1Phone})</span>
                {(item.tnscaId || item.fideId || item.ratingClassical) && (
                  <span className="text-[10px] text-chess-blue block truncate">
                    {[item.tnscaId ? `TNSCA: ${item.tnscaId}` : '', item.fideId ? `FIDE: ${item.fideId}` : '', item.ratingClassical ? `Rating: ${item.ratingClassical}` : ''].filter(Boolean).join(' · ')}
                  </span>
                )}
              </div>
              <span className="badge-green flex-shrink-0 text-[10px]">Ready</span>
            </div>
          ))}
        </div>

        <button type="button" onClick={onImport} disabled={saving} className="primary-action w-full">
          {saving && <span className="button-spinner" aria-hidden="true"/>}
          {saving ? 'Importing & Synchronizing…' : `Import ${importPreview.length} Students to Academy`}
        </button>
      </div>
    </Modal>
  );
}

function StudentAddModal({
  show,
  form,
  setForm,
  batches,
  schoolOptions,
  coachOptions,
  batchCoaches,
  saving,
  onClose,
  onAdd,
}: Readonly<{
  show: boolean;
  form: FormData;
  setForm: (form: FormData) => void;
  batches: string[];
  schoolOptions?: string[];
  coachOptions: string[];
  batchCoaches?: Record<string, string>;
  saving: boolean;
  onClose: () => void;
  onAdd: () => void;
}>) {
  if (!show) return null;
  const error = formValidationError(form);
  return (
    <Modal title="Add Student" onClose={onClose}>
      <div className="max-h-[65vh] overflow-y-auto pr-1">
        <StudentForm form={form} setForm={setForm} batches={batches} schoolOptions={schoolOptions} coachOptions={coachOptions} batchCoaches={batchCoaches} />
      </div>
      {error && <p role="alert" className="text-xs text-red-600 mt-3">{error}</p>}
      <button type="button" onClick={onAdd} disabled={saving} className="primary-action mt-4 w-full">
        {saving && <span className="button-spinner" aria-hidden="true"/>}
        {saving ? 'Adding student…' : 'Add Student'}
      </button>
    </Modal>
  );
}

function StudentForm({ form, setForm, batches, schoolOptions = [], coachOptions = [], batchCoaches = {} }: Readonly<{
  form: FormData;
  setForm: (form: FormData) => void;
  batches: string[];
  schoolOptions?: string[];
  coachOptions?: string[];
  batchCoaches?: Record<string, string>;
}>) {
  const [sameAsPhone, setSameAsPhone] = useState(
    Boolean(form.parent1Phone && form.parent1WhatsApp && form.parent1Phone === form.parent1WhatsApp)
  );

  const f = <K extends keyof FormData>(k: K) =>
    (e: React.ChangeEvent<HTMLInputElement|HTMLSelectElement|HTMLTextAreaElement>) => setForm({ ...form, [k]: e.target.value });
  
  const handlePhoneChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const val = digitsOnly(event.target.value).slice(0, 15);
    if (sameAsPhone) {
      setForm({ ...form, parent1Phone: val, parent1WhatsApp: val });
    } else {
      setForm({ ...form, parent1Phone: val });
    }
  };

  const handleWhatsAppChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const val = digitsOnly(event.target.value).slice(0, 15);
    if (sameAsPhone && val !== form.parent1Phone) {
      setSameAsPhone(false);
    }
    setForm({ ...form, parent1WhatsApp: val });
  };

  const handleToggleSameAsPhone = (e: React.ChangeEvent<HTMLInputElement>) => {
    const checked = e.target.checked;
    setSameAsPhone(checked);
    if (checked) {
      setForm({ ...form, parent1WhatsApp: form.parent1Phone });
    }
  };

  const handleBatchChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newBatch = e.target.value;
    const assignedCoach = batchCoaches[newBatch];
    setForm({
      ...form,
      batch: newBatch,
      level: newBatch,
      coachName: assignedCoach || form.coachName,
    });
  };

  const phone = (key: 'parent2Phone' | 'emergencyPhone') =>
    (event: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [key]: digitsOnly(event.target.value).slice(0, 15) });
  
  // Compute auto values from DOB/age
  const dobDate = form.dob ? new Date(form.dob) : null;
  const rawAge = dobDate && !Number.isNaN(dobDate.getTime())
    ? Math.floor((Date.now() - dobDate.getTime()) / (365.25 * 86400000))
    : null;
  const computedAge = rawAge !== null && rawAge >= 0 ? rawAge : null;
  const category = computedAge !== null ? getCategory(String(computedAge)) : '';

  return (
    <div className="space-y-4">
      {/* Core — always required */}
      <Section title="Basic Info">
        <Field label="Full Name *"><input required maxLength={100} value={form.name} onChange={f('name')} className="input"/></Field>
        <Field label="Date of Birth *">
          <input required type="date" value={form.dob} onChange={f('dob')} className="input"/>
          {computedAge !== null && (
            <div className="flex gap-2 mt-1">
              <span className="text-xs text-gray-500">Age: <strong>{computedAge}</strong></span>
              {category && <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${CATEGORY_COLOR[category]??'badge-blue'}`}>🏆 {category}</span>}
            </div>
          )}
        </Field>
        <div className="grid grid-cols-2 gap-2">
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
        </div>
      </Section>

      {/* Chess */}
      <Section title="Chess Profile">
        <Field label="Batch">
          <select value={form.batch} onChange={handleBatchChange} className="input">
            {!batches.includes(form.batch) && form.batch && <option>{form.batch}</option>}
            {batches.map(option => <option key={option}>{option}</option>)}
          </select>
        </Field>
        <Field label="Assigned Coach">
          <select
            value={form.coachName}
            onChange={f('coachName')}
            className="input"
            aria-label="Assigned Coach"
          >
            <option value="">Select coach…</option>
            {!coachOptions.includes(form.coachName) && form.coachName && <option value={form.coachName}>{form.coachName}</option>}
            {coachOptions.map(coach => (
              <option key={coach} value={coach}>{coach}</option>
            ))}
          </select>
        </Field>
      </Section>

      {/* Parent — required */}
      <Section title="Parent / Guardian">
        <Field label="Parent / Guardian Name *"><input required maxLength={100} value={form.parent1Name} onChange={f('parent1Name')} className="input"/></Field>
        <Field label="Phone *"><input required type="tel" inputMode="numeric" pattern="[0-9]*" maxLength={15} value={form.parent1Phone} onChange={handlePhoneChange} className="input"/></Field>
        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="field-label mb-0">WhatsApp</span>
            <label className="inline-flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-400 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={sameAsPhone}
                onChange={handleToggleSameAsPhone}
                className="rounded border-gray-300 text-gold focus:ring-gold dark:bg-slate-800 dark:border-gray-700"
                aria-label="Same as phone number"
              />
              <span>Same as phone number</span>
            </label>
          </div>
          <input
            type="tel"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={15}
            value={form.parent1WhatsApp}
            onChange={handleWhatsAppChange}
            className="input"
            placeholder="WhatsApp number"
            aria-label="WhatsApp"
          />
        </div>
        <Field label="Email"><input type="email" maxLength={254} value={form.parent1Email} onChange={f('parent1Email')} className="input"/></Field>
        <Field label="Parent 2 Name"><input maxLength={100} value={form.parent2Name} onChange={f('parent2Name')} className="input"/></Field>
        <Field label="Parent 2 Phone"><input type="tel" inputMode="numeric" pattern="[0-9]*" maxLength={15} value={form.parent2Phone} onChange={phone('parent2Phone')} className="input"/></Field>
      </Section>

      {/* Ratings */}
      <Section title="Ratings">
        <div className="grid grid-cols-3 gap-2">
          <Field label="Classical Rating"><input type="number" min="0" max="4000" step="1" value={form.ratingClassical} onChange={f('ratingClassical')} className="input" placeholder="e.g. 1200"/></Field>
          <Field label="Rapid Rating"><input type="number" min="0" max="4000" step="1" value={form.ratingRapid} onChange={f('ratingRapid')} className="input" placeholder="e.g. 1100"/></Field>
          <Field label="Blitz Rating"><input type="number" min="0" max="4000" step="1" value={form.ratingBlitz} onChange={f('ratingBlitz')} className="input" placeholder="e.g. 950"/></Field>
        </div>
      </Section>

      {/* IDs + Online Chess */}
      <Section title="IDs &amp; Online">
        <Field label="TNSCA ID"><input value={form.tnscaId} onChange={f('tnscaId')} className="input" placeholder="TNSCA registration number"/></Field>
        <Field label="FIDE ID"><input value={form.fideId} onChange={f('fideId')} className="input" placeholder="FIDE registration ID"/></Field>
        <Field label="AICF ID"><input value={form.aicfId} onChange={f('aicfId')} className="input" placeholder="All India Chess Federation ID"/></Field>
        <Field label="Chess.com Username"><input maxLength={25} autoCapitalize="none" autoCorrect="off" value={form.chessComUsername} onChange={f('chessComUsername')} className="input" placeholder="e.g. hikaru"/></Field>
        <Field label="Lichess Username"><input maxLength={20} autoCapitalize="none" autoCorrect="off" value={form.lichessUsername} onChange={f('lichessUsername')} className="input" placeholder="e.g. DrNykterstein"/></Field>
      </Section>

      {/* Academic */}
      <Section title="School &amp; Academic">
        <Field label="School Name">
          <select value={form.school} onChange={f('school')} className="input">
            <option value="">Select school…</option>
            {!schoolOptions.includes(form.school) && form.school && <option value={form.school}>{form.school}</option>}
            {schoolOptions.filter(Boolean).map(school => <option key={school} value={school}>{school}</option>)}
          </select>
        </Field>
        <Field label="Standard / Class">
          <select value={form.standard} onChange={f('standard')} className="input">
            <option value="">Select…</option>
            {STANDARDS.map(o=><option key={o}>{o}</option>)}
          </select>
        </Field>
      </Section>

      {/* Emergency + Address + Other */}
      <Section title="Emergency &amp; Other">
        <Field label="Emergency Contact Name"><input maxLength={100} value={form.emergencyContact} onChange={f('emergencyContact')} className="input"/></Field>
        <Field label="Emergency Phone"><input type="tel" inputMode="numeric" pattern="[0-9]*" maxLength={15} value={form.emergencyPhone} onChange={phone('emergencyPhone')} className="input"/></Field>
        <Field label="Home Address"><input value={form.address} onChange={f('address')} className="input"/></Field>
        <Field label="Photo Consent">
          <select value={form.photoConsent} onChange={f('photoConsent')} className="input"><option>Yes</option><option>No</option></select>
        </Field>
        <Field label="Notes"><textarea value={form.notes} onChange={f('notes')} className="input" rows={2}/></Field>
      </Section>
    </div>
  );
}

function Section({ title, children }: Readonly<{ title: string; children: React.ReactNode }>) {
  return (
    <div>
      <p className="text-xs font-bold text-navy uppercase tracking-wider mb-2 border-b border-gray-100 pb-1">{title}</p>
      <div className="space-y-3">{children}</div>
    </div>
  );
}
function Field({ label, children }: Readonly<{ label: string; children: React.ReactNode }>) {
  return <label className="block"><span className="text-xs font-medium text-gray-500 mb-1 block">{label}</span>{children}</label>;
}

function InfoSection({ title, copyText, children }: Readonly<{ title: string; copyText?: string; children: React.ReactNode }>) {
  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-slate-800">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-bold text-navy dark:text-gray-100 uppercase tracking-wider">{title}</h3>
        {copyText && <CopyButton text={copyText} label={`Copy ${title}`} />}
      </div>
      <div className="space-y-2">{children}</div>
    </div>
  );
}
function Row({ label, value, children }: Readonly<{ label: string; value?: string; children?: React.ReactNode }>) {
  if (!value && !children) return null;
  return (
    <div className="grid grid-cols-[minmax(88px,0.45fr)_minmax(0,1fr)] gap-3 items-start text-sm">
      <span className="text-gray-500 leading-5">{label}</span>
      {children
        ? <div className="min-w-0 text-right break-words leading-5">{children}</div>
        : <span className="min-w-0 font-medium text-gray-900 text-right break-words leading-5">{value}</span>}
    </div>
  );
}
function RatingBox({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <div className="bg-gray-50 rounded-xl p-2 text-center border border-gray-100">
      <p className="text-xs text-gray-500">{label}</p>
      <p className="font-bold text-navy text-lg">{value}</p>
    </div>
  );
}

interface AttendanceItem { key: string; sortKey: string; summary: string; node: React.ReactNode }

function TournamentAttendance({ studentName, lichessUsername, chessComUsername, registrations, weeklyResults }: Readonly<{
  studentName: string; lichessUsername: string; chessComUsername: string;
  registrations: TournamentRegistration[]; weeklyResults: SavedWeeklyOnlineTournament[];
}>) {
  const offline: AttendanceItem[] = registrations
    .filter(item => normalizedName(item.studentName) === normalizedName(studentName))
    .map(item => ({
      key: `offline-${item.tournamentId}-${item.rowIndex}`,
      sortKey: item.tournamentDate || item.month,
      summary: `• [Offline] ${item.tournamentName} – ${item.tournamentDate || monthLabel(item.month)} · Fee ${item.feePaid ? 'paid' : 'pending'}`,
      node: (
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5"><span className="badge-blue">Offline</span><p className="text-sm font-semibold text-gray-900 truncate">{item.tournamentName}</p></div>
            <p className="mt-1 text-xs text-gray-500">{item.tournamentDate || 'Date not recorded'} · Fee {item.feePaid ? 'paid' : 'pending'}{item.entryFee ? ` · ₹${item.entryFee}` : ''}</p>
          </div>
          <span className="flex-none text-xs font-semibold text-chess-blue">{monthLabel(item.month)}</span>
        </div>
      ),
    }));

  const online: AttendanceItem[] = matchOnlineTournamentResults(weeklyResults, [{ name: studentName, lichessUsername, chessComUsername }])
    .map(match => {
      const tournament = match.tournament;
      const dateValue = tournament.completedAt || tournament.startedAt;
      const dateLabel = dateValue && !Number.isNaN(new Date(dateValue).getTime())
        ? new Date(dateValue).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
        : 'Date not recorded';
      const sourceLabel = match.source === 'chess.com' ? 'Chess.com' : 'Lichess';
      const pointsSuffix = match.score ? ` · ${match.score} pts` : '';
      return {
        key: `online-${tournament.rowIndex}`,
        sortKey: dateValue,
        summary: `• [Online · ${sourceLabel}] ${tournament.name} – ${dateLabel} · Place ${ordinal(match.rank)}${pointsSuffix}`,
        node: (
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-1.5"><span className="badge-green">Online</span><span className="badge-gray">{sourceLabel}</span><p className="text-sm font-semibold text-gray-900 truncate">{tournament.name}</p></div>
              <p className="mt-1 text-xs text-gray-500">{dateLabel} · Place {ordinal(match.rank)}{pointsSuffix}</p>
            </div>
          </div>
        ),
      };
    });

  const attended = [...offline, ...online].sort((left, right) => right.sortKey.localeCompare(left.sortKey));
  const copyText = attended.length > 0
    ? [`*${studentName} \u2013 Tournament Attendance*`, ...attended.map(item => item.summary)].join('\n')
    : '';
  return <InfoSection title="Tournament Attendance" copyText={copyText}>
    {attended.length === 0 && <p className="text-xs text-gray-400">No tournament attendance recorded.</p>}
    {attended.map(item => <div key={item.key} className="border-b border-gray-100 pb-2 last:border-0 last:pb-0">{item.node}</div>)}
  </InfoSection>;
}
function Modal({ title, onClose, children }: Readonly<{ title: string; onClose: () => void; children: React.ReactNode }>) {
  return (
    <div className="fixed inset-0 flex items-end z-50">
      <button type="button" onClick={onClose} aria-label="Close student form" className="absolute inset-0 w-full h-full bg-black/50" />
      <dialog open aria-labelledby="student-modal-title" className="relative m-0 border-0 bg-white dark:bg-slate-900 text-gray-900 dark:text-gray-100 w-full rounded-t-2xl p-5 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 id="student-modal-title" className="font-bold text-lg text-navy dark:text-gray-100">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 text-2xl leading-none">×</button>
        </div>
        {children}
      </dialog>
    </div>
  );
}

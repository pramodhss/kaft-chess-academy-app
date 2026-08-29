import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronLeft, ChevronRight, Copy, MessageCircle, Pencil, Plus, Search, Trash2, X } from 'lucide-react';
import { Layout } from '../components/Layout';
import { PageSkeleton } from '../components/Skeleton';
import { useAuth } from '../context/AuthContext';
import { readSheet, readSheetLive, appendRows, batchWrite, clearSheetRange, SheetConflictError } from '../lib/sheets';
import { useToast } from '../context/ToastContext';
import { SHEET_ID, TABS } from '../config';
import { parseSheetNumber } from '../lib/values';
import { calculateFeeBalance, calculateRosterPayment, normalizeFeeMonth } from '../lib/feeRules';
import { dateValidationError, moneyValidationError } from '../lib/validation';
import type { FeeDraft } from '../lib/feeRules';
import { useCoachName } from '../hooks/useCoachName';
import type { FeeEntry } from '../types';
import { recordAudit } from '../lib/audit';

type FeeForm = { studentName:string; feeMonth:string; feeType:string; amountDue:string;
  amountPaid:string; paymentMethod:string; paymentStatus:string; dueDate:string;
  paymentDate:string; reference:string; notes:string };

const EMPTY_F: FeeForm = { studentName:'', feeMonth:'', feeType:'Monthly Tuition',
  amountDue:'', amountPaid:'', paymentMethod:'UPI', paymentStatus:'Pending',
  dueDate:'', paymentDate:'', reference:'', notes:'' };

function rosterValidationError(amountDue: number, amountPaid: number): string {
  if (!Number.isFinite(amountDue) || !Number.isFinite(amountPaid)) return 'Enter valid numeric fee amounts.';
  if (amountDue > 10_000_000 || amountPaid > 10_000_000) return 'Fee amounts cannot exceed ₹1,00,00,000.';
  if (amountPaid < 0 || (amountDue > 0 && amountPaid > amountDue)) {
    return `Paid amount must be between ₹0 and ₹${amountDue}.`;
  }
  if (amountDue <= 0) return 'Enter a monthly fee amount greater than zero.';
  return '';
}

function feeAmountValidationError(form: FeeForm): string {
  const dueError = moneyValidationError(form.amountDue, 'Amount due', true);
  if (dueError) return dueError;
  const paidError = moneyValidationError(form.amountPaid, 'Amount paid');
  if (paidError) return paidError;
  const amountDue = Number(form.amountDue);
  const amountPaid = form.amountPaid.trim() ? Number(form.amountPaid) : 0;
  if (amountDue <= 0) return 'Amount due must be greater than zero.';
  if (amountDue > 10_000_000 || amountPaid > 10_000_000) return 'Fee amounts cannot exceed ₹1,00,00,000.';
  if (amountPaid > amountDue) return 'Amount paid cannot be greater than amount due.';
  return paymentStatusValidationError(form.paymentStatus, amountDue, amountPaid);
}

function paymentStatusValidationError(status: string, amountDue: number, amountPaid: number): string {
  if (status === 'Paid' && amountPaid !== amountDue) return 'Paid status requires the full amount to be paid.';
  if (status === 'Partial' && (amountPaid <= 0 || amountPaid >= amountDue)) return 'Partial status requires an amount between zero and the amount due.';
  if (status === 'Pending' && amountPaid !== 0) return 'Pending status requires amount paid to be zero.';
  return '';
}

function feeFormValidationError(form: FeeForm): string {
  if (!form.studentName.trim()) return 'Select a student.';
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(form.feeMonth)) return 'Select a valid fee month.';
  if (!form.feeType.trim()) return 'Select a fee type.';
  const fieldError = [
    feeAmountValidationError(form),
    dateValidationError(form.dueDate, 'Due date'),
    dateValidationError(form.paymentDate, 'Payment date'),
  ].find(Boolean);
  if (fieldError) return fieldError;
  if (form.reference.trim().length > 100) return 'Reference must be 100 characters or fewer.';
  if (form.notes.trim().length > 500) return 'Notes must be 500 characters or fewer.';
  return '';
}

function localIsoDate(date = new Date()): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

function localMonth(date = new Date()): string {
  return localIsoDate(date).slice(0, 7);
}

function newReceiptNumber(): string {
  return `RCT-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
}

function paymentStatusBadge(status: string): string {
  if (status === 'Paid') return 'badge-green';
  if (status === 'Partial') return 'badge-amber';
  if (status === 'Overdue') return 'badge-red';
  if (status === 'Waived') return 'badge-blue';
  return 'badge-gray';
}

function formatCurrency(value: number | string): string {
  return `₹ ${parseSheetNumber(value).toLocaleString('en-IN')}`;
}

function normalized(value: string): string {
  return value.trim().toLocaleLowerCase();
}

function sameFeeIdentity(fee: FeeEntry, studentName: string, feeMonth: string, feeType: string): boolean {
  return normalized(fee.studentName) === normalized(studentName)
    && normalizeFeeMonth(fee.feeMonth) === normalizeFeeMonth(feeMonth)
    && normalized(fee.feeType) === normalized(feeType);
}

function feeRowsToEntries(rows: string[][]): FeeEntry[] {
  return rows.slice(1)
    .map((row, index) => rowToFee(row, index))
    .filter(fee => fee.studentName.trim());
}

function paymentButtonLabel(isEdit: boolean, saving: boolean): string {
  if (saving) return isEdit ? 'Updating payment…' : 'Saving payment…';
  return isEdit ? 'Update Payment' : 'Save Payment';
}

function dateInputValue(value: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const parts = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(value);
  if (!parts) return '';
  return `${parts[3]}-${parts[2].padStart(2, '0')}-${parts[1].padStart(2, '0')}`;
}

function rowToFee(row: string[], idx: number): FeeEntry {
  return {
    receiptNo:row[0]??'', studentName:row[1]??'', batch:row[2]??'',
    feeMonth:row[3]??'', feeType:row[4]??'', amountDue:row[5]??'',
    amountPaid:row[6]??'', balance:row[7]??'', dueDate:row[8]??'',
    paymentDate:row[9]??'', paymentMethod:row[10]??'', paymentStatus:row[11]??'',
    reference:row[12]??'', notes:row[13]??'', rowIndex:idx+2,
  };
}
function feeToForm(f: FeeEntry): FeeForm {
  return { studentName:f.studentName, feeMonth:normalizeFeeMonth(f.feeMonth), feeType:f.feeType,
    amountDue:String(parseSheetNumber(f.amountDue)), amountPaid:String(parseSheetNumber(f.amountPaid)), paymentMethod:f.paymentMethod,
    paymentStatus:f.paymentStatus, dueDate:dateInputValue(f.dueDate), paymentDate:dateInputValue(f.paymentDate),
    reference:f.reference, notes:f.notes };
}

function canonicalFee(fee: FeeEntry) {
  return {
    receiptNo: fee.receiptNo.trim(),
    studentName: normalized(fee.studentName),
    batch: normalized(fee.batch),
    feeMonth: normalizeFeeMonth(fee.feeMonth),
    feeType: normalized(fee.feeType),
    amountDue: parseSheetNumber(fee.amountDue),
    amountPaid: parseSheetNumber(fee.amountPaid),
    balance: parseSheetNumber(fee.balance),
    dueDate: dateInputValue(fee.dueDate),
    paymentDate: dateInputValue(fee.paymentDate),
    paymentMethod: normalized(fee.paymentMethod),
    paymentStatus: normalized(fee.paymentStatus),
    reference: fee.reference.trim(),
    notes: fee.notes.trim(),
  };
}

function sameFeeRecord(left: FeeEntry, right: FeeEntry): boolean {
  return JSON.stringify(canonicalFee(left)) === JSON.stringify(canonicalFee(right));
}

function rosterPaymentMatches(
  fee: FeeEntry,
  amountDue: number,
  amountPaid: number,
  balance: number,
  status: string,
): boolean {
  return parseSheetNumber(fee.amountDue) === amountDue
    && parseSheetNumber(fee.amountPaid) === amountPaid
    && parseSheetNumber(fee.balance) === balance
    && fee.paymentStatus.trim() === status;
}

type RosterPaymentDetails = {
  due: number;
  amountPaid: number;
  balance: number;
  status: string;
  paymentDate: string;
};

async function updateRosterPayment(
  token: string,
  existing: FeeEntry,
  payment: RosterPaymentDetails,
  coachName: string,
): Promise<FeeEntry> {
  const { due, amountPaid, balance, status, paymentDate } = payment;
  const tab = TABS.FEES;
  const currentRows = await readSheetLive(token, SHEET_ID, `'${tab}'!A${existing.rowIndex}:N${existing.rowIndex}`);
  const currentFee = rowToFee(currentRows[0] ?? [], existing.rowIndex - 2);
  if (!sameFeeRecord(currentFee, existing)) {
    throw new SheetConflictError('This payment changed on another device. The latest values were loaded — review and save again.', currentFee);
  }

  const note = `Roster updated by ${coachName} on ${new Date().toLocaleDateString('en-IN')}`;
  await batchWrite(token, SHEET_ID, [
    {range:`'${tab}'!F${existing.rowIndex}`,value:due},
    {range:`'${tab}'!G${existing.rowIndex}`,value:amountPaid},
    {range:`'${tab}'!H${existing.rowIndex}`,value:balance},
    {range:`'${tab}'!J${existing.rowIndex}`,value:paymentDate},
    {range:`'${tab}'!L${existing.rowIndex}`,value:status},
    {range:`'${tab}'!N${existing.rowIndex}`,value:note},
  ]);

  const confirmedRows = await readSheetLive(token, SHEET_ID, `'${tab}'!A${existing.rowIndex}:N${existing.rowIndex}`);
  const confirmedFee = rowToFee(confirmedRows[0] ?? [], existing.rowIndex - 2);
  if (!rosterPaymentMatches(confirmedFee, due, amountPaid, balance, status)) {
    throw new Error('Google Sheets did not confirm the updated payment. Reload Fees and try again.');
  }
  return confirmedFee;
}

async function appendRosterPayment(
  token: string,
  student: string,
  selectedMonth: string,
  batch: string,
  payment: RosterPaymentDetails,
  coachName: string,
): Promise<FeeEntry> {
  const { due, amountPaid, balance, status, paymentDate } = payment;
  const tab = TABS.FEES;
  const liveFees = feeRowsToEntries(await readSheetLive(token, SHEET_ID, `'${tab}'!A:N`));
  const existingFee = liveFees.find(fee => sameFeeIdentity(fee, student, selectedMonth, 'Monthly Tuition'));
  if (existingFee) {
    throw new SheetConflictError('A monthly fee was already added for this student on another device. The latest values were loaded \u2014 review and save again.', existingFee);
  }

  const receipt = newReceiptNumber();
  const rowIndex = await appendRows(token, SHEET_ID, `'${tab}'!A:N`, [[
    receipt, student, batch, selectedMonth, 'Monthly Tuition', due,
    amountPaid, balance, '', paymentDate, 'UPI', status, '', `Roster added by ${coachName}`,
  ]]);
  const confirmedFees = feeRowsToEntries(await readSheetLive(token, SHEET_ID, `'${tab}'!A:N`));
  const confirmedFee = confirmedFees
    .filter(fee => sameFeeIdentity(fee, student, selectedMonth, 'Monthly Tuition'))
    .sort((left, right) => left.rowIndex - right.rowIndex)[0];
  if (confirmedFee?.rowIndex !== rowIndex) {
    await clearSheetRange(token, SHEET_ID, `'${tab}'!A${rowIndex}:N${rowIndex}`);
    throw new Error('This monthly fee was added elsewhere at the same time. The duplicate row was removed.');
  }
  if (!rosterPaymentMatches(confirmedFee, due, amountPaid, balance, status)) {
    throw new Error('Google Sheets did not confirm the saved payment. Reload Fees and try again.');
  }
  return confirmedFee;
}

function rosterSaveButtonLabel(isSaving: boolean, hasExistingFee: boolean): string {
  if (isSaving) return 'Saving…';
  return hasExistingFee ? 'Update Fee' : 'Save Fee';
}

function paymentStatusIcon(status: string): string {
  if (status === 'Paid') return '\u2705';
  if (status === 'Partial') return '\ud83d\udd36';
  if (status === 'Overdue') return '\ud83d\udd34';
  return '\u23f3';
}

function paymentReportAmount(paid: number, due: number): string {
  if (paid <= 0) return '';
  const dueSuffix = due > paid ? `/${due.toLocaleString('en-IN')}` : '';
  return ` (\u20b9${paid.toLocaleString('en-IN')}${dueSuffix})`;
}

export function Fees() {
  const { token, logout } = useAuth();
  const { coachName: savedCoachName } = useCoachName();
  const [fees, setFees]           = useState<FeeEntry[]>([]);
  const [students, setStudents]   = useState<string[]>([]);
  const [batchMap, setBatchMap]   = useState<Map<string,string>>(new Map());
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState('');
  const [showAdd, setShowAdd]     = useState(false);
  const [editTarget, setEditTarget] = useState<FeeEntry|null>(null);
  const [form, setForm]           = useState<FeeForm>({ ...EMPTY_F });
  const [saving, setSaving]       = useState(false);
  const [deleting, setDeleting]   = useState<number|null>(null);
  const [feeSearch, setFeeSearch] = useState('');
  const [selectedMonth, setSelectedMonth] = useState(localMonth);
  const [drafts, setDrafts] = useState<Map<string, FeeDraft>>(new Map());
  const [rosterSaving, setRosterSaving] = useState('');
  const [expandedStudent, setExpandedStudent] = useState<string | null>(null);
  const toast = useToast();
  const coachName = savedCoachName || 'Coach';

  const load = async () => {
    if (!token) return;
    setLoading(true); setError('');
    try {
      const [feeRows, studentRows] = await Promise.all([
        readSheet(token, SHEET_ID, `'${TABS.FEES}'!A:N`),
        readSheet(token, SHEET_ID, `'${TABS.STUDENTS}'!A:AG`),
      ]);
      setFees(feeRowsToEntries(feeRows));
      const uniqueStudents = new Map<string, string>();
      studentRows.slice(1).forEach(row => {
        const name = row[0]?.trim();
        if (name && !uniqueStudents.has(normalized(name))) uniqueStudents.set(normalized(name), name);
      });
      const names = Array.from(uniqueStudents.values());
      setStudents(names);
      const batches = new Map<string,string>();
      studentRows.slice(1).forEach(r => { if(r[0]) batches.set(r[0], r[5]??''); });
      setBatchMap(batches);
    } catch(e:any) {
      if(e.message==='TOKEN_EXPIRED'){logout();return;}
      setError(e.message);
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [token]);

  const handleAdd = async () => {
    if (!token) return;
    const validationError = feeFormValidationError(form);
    if (validationError) { toast.error(validationError); return; }
    const amountDue = parseSheetNumber(form.amountDue);
    const amountPaid = parseSheetNumber(form.amountPaid);
    if (amountDue <= 0) { toast.error('Amount due must be greater than zero.'); return; }
    if (amountPaid < 0 || amountPaid > amountDue) { toast.error('Amount paid must be between zero and the amount due.'); return; }
    setSaving(true);
    try {
      const liveRows = await readSheetLive(token, SHEET_ID, `'${TABS.FEES}'!A:N`);
      if (feeRowsToEntries(liveRows).some(fee => sameFeeIdentity(fee, form.studentName, form.feeMonth, form.feeType))) {
        toast.info('This fee already exists for the selected student, month, and fee type. Edit the existing entry instead.');
        return;
      }
      const receipt = newReceiptNumber();
      const balance = calculateFeeBalance(amountDue, amountPaid, form.paymentStatus);
      const paymentDate = form.paymentDate || localIsoDate();
      const rowIndex = await appendRows(token, SHEET_ID, `'${TABS.FEES}'!A:N`, [[
        receipt, form.studentName, batchMap.get(form.studentName) ?? '', form.feeMonth, form.feeType,
        amountDue, amountPaid, balance,
        form.dueDate, paymentDate,
        form.paymentMethod, form.paymentStatus, form.reference,
        form.notes ? `${form.notes} [by ${coachName}]` : `Added by ${coachName}`,
      ]]);
      const confirmedFees = feeRowsToEntries(await readSheetLive(token, SHEET_ID, `'${TABS.FEES}'!A:N`));
      const firstMatchingRow = confirmedFees
        .filter(fee => sameFeeIdentity(fee, form.studentName, form.feeMonth, form.feeType))
        .sort((left, right) => left.rowIndex - right.rowIndex)[0]?.rowIndex;
      if (firstMatchingRow !== rowIndex) {
        await clearSheetRange(token, SHEET_ID, `'${TABS.FEES}'!A${rowIndex}:N${rowIndex}`);
        toast.info('This fee was added on another device at the same time. The duplicate row was not saved.');
        return;
      }
      const added: FeeEntry = {
        receiptNo: receipt, studentName: form.studentName, batch: batchMap.get(form.studentName) ?? '', feeMonth: form.feeMonth,
        feeType: form.feeType, amountDue: form.amountDue, amountPaid: form.amountPaid || '0',
        balance: String(balance), dueDate: form.dueDate,
        paymentDate,
        paymentMethod: form.paymentMethod, paymentStatus: form.paymentStatus,
        reference: form.reference, notes: form.notes, rowIndex,
      };
      setFees(prev => [...prev, added]);
      void recordAudit(token, 'CREATE', 'Fees', added.receiptNo, `${added.studentName} · ${added.feeMonth}`).catch(() => undefined);
      setShowAdd(false);
      setForm({...EMPTY_F});
      toast.success(`Payment for ${added.studentName} was saved successfully.`);
    } catch(e:any) { toast.error('Save failed: '+e.message); }
    finally { setSaving(false); }
  };

  const handleEdit = async () => {
    if (!token||!editTarget) return;
    const validationError = feeFormValidationError(form);
    if (validationError) { toast.error(validationError); return; }
    const amountDue = parseSheetNumber(form.amountDue);
    const amountPaid = parseSheetNumber(form.amountPaid);
    if (amountDue <= 0) { toast.error('Amount due must be greater than zero.'); return; }
    if (amountPaid < 0 || amountPaid > amountDue) { toast.error('Amount paid must be between zero and the amount due.'); return; }
    setSaving(true);
    try {
      const row=editTarget.rowIndex, tab=TABS.FEES;
      const [currentRows, allRows] = await Promise.all([
        readSheetLive(token, SHEET_ID, `'${tab}'!A${row}:N${row}`),
        readSheetLive(token, SHEET_ID, `'${tab}'!A:N`),
      ]);
      const currentFee = rowToFee(currentRows[0] ?? [], row - 2);
      if (!sameFeeRecord(currentFee, editTarget)) {
        setFees(prev => prev.map(fee => fee.rowIndex === row ? currentFee : fee));
        setEditTarget(currentFee);
        setForm(feeToForm(currentFee));
        toast.info('This payment was changed on another device. The latest values were loaded — review and save again.');
        return;
      }
      if (feeRowsToEntries(allRows).some(fee => fee.rowIndex !== row
        && sameFeeIdentity(fee, form.studentName, form.feeMonth, form.feeType))) {
        toast.info('This fee already exists for the selected student, month, and fee type. Edit or remove the other entry first.');
        return;
      }
      const balance = calculateFeeBalance(amountDue, amountPaid, form.paymentStatus);
      const savedNotes = `${form.notes} [edited by ${coachName}]`.trim();
      await batchWrite(token, SHEET_ID, [
        {range:`'${tab}'!B${row}`,value:form.studentName},
        {range:`'${tab}'!C${row}`,value:batchMap.get(form.studentName) ?? ''},
        {range:`'${tab}'!D${row}`,value:form.feeMonth},
        {range:`'${tab}'!E${row}`,value:form.feeType},
        {range:`'${tab}'!F${row}`,value:amountDue},
        {range:`'${tab}'!G${row}`,value:amountPaid},
        {range:`'${tab}'!H${row}`,value:balance},
        {range:`'${tab}'!I${row}`,value:form.dueDate},
        {range:`'${tab}'!J${row}`,value:form.paymentDate},
        {range:`'${tab}'!K${row}`,value:form.paymentMethod},
        {range:`'${tab}'!L${row}`,value:form.paymentStatus},
        {range:`'${tab}'!M${row}`,value:form.reference},
        {range:`'${tab}'!N${row}`,value:savedNotes},
      ]);
      setFees(prev => prev.map(fee => fee.rowIndex === row ? {
        ...fee, studentName: form.studentName, batch: batchMap.get(form.studentName) ?? '', feeMonth: form.feeMonth, feeType: form.feeType,
        amountDue: form.amountDue, amountPaid: form.amountPaid || '0', balance: String(balance),
        dueDate: form.dueDate, paymentDate: form.paymentDate, paymentMethod: form.paymentMethod,
        paymentStatus: form.paymentStatus, reference: form.reference, notes: savedNotes,
      } : fee));
      setEditTarget(null);
      void recordAudit(token, 'UPDATE', 'Fees', editTarget.receiptNo, `${form.studentName} · ${form.feeMonth}`).catch(() => undefined);
      setForm({...EMPTY_F});
      toast.success(`${form.studentName}'s payment details were updated.`);
    } catch(e:any) { toast.error('Save failed: '+e.message); }
    finally { setSaving(false); }
  };

  const removeFee = async (fee: FeeEntry) => {
    if (!token || !window.confirm(`Remove receipt ${fee.receiptNo} for ${fee.studentName}? This cannot be undone.`)) return;
    setDeleting(fee.rowIndex);
    try {
      const tab = TABS.FEES;
      const currentRows = await readSheetLive(token, SHEET_ID, `'${tab}'!A${fee.rowIndex}:N${fee.rowIndex}`);
      const currentFee = rowToFee(currentRows[0] ?? [], fee.rowIndex - 2);
      if (!sameFeeRecord(currentFee, fee)) {
        setFees(prev => prev.map(entry => entry.rowIndex === fee.rowIndex ? currentFee : entry));
        toast.info('This payment was changed on another device. The latest values were loaded — review and try removing it again.');
        return;
      }
      await clearSheetRange(token, SHEET_ID, `'${tab}'!A${fee.rowIndex}:N${fee.rowIndex}`);
      setFees(prev => prev.filter(entry => entry.rowIndex !== fee.rowIndex));
      void recordAudit(token, 'DELETE', 'Fees', fee.receiptNo, fee.studentName).catch(() => undefined);
      toast.success(`Receipt ${fee.receiptNo} was removed.`);
    } catch (e: any) { toast.error('Remove failed: ' + e.message); }
    finally { setDeleting(null); }
  };

  const { monthlyByStudent, duplicateMonthlyFees, orphanedFees, totalCollected, totalOutstanding, otherFees } = useMemo(() => {
    const map = new Map<string, FeeEntry>();
    const monthly = fees
      .filter(fee => fee.feeType === 'Monthly Tuition' && normalizeFeeMonth(fee.feeMonth) === selectedMonth)
      .sort((l, r) => l.rowIndex - r.rowIndex);
    monthly.forEach(fee => map.set(normalized(fee.studentName), fee));
    const dupes = monthly.filter(fee => map.get(normalized(fee.studentName)) !== fee);

    const knownStudents = new Set(students.map(s => normalized(s)));
    // fee records for deleted students — excluded from summary, shown separately for cleanup
    const orphaned = monthly.filter(fee => !knownStudents.has(normalized(fee.studentName)) && !dupes.includes(fee));

    // Summary counts only active students, includes draft state for in-progress saves
    let collected = 0, outstanding = 0;
    for (const [normName, fee] of map.entries()) {
      if (!knownStudents.has(normName)) continue;
      const draft = drafts.get(fee.studentName);
      if (draft) {
        const due = parseSheetNumber(draft.amountDue);
        const payment = calculateRosterPayment(fee, draft, due);
        collected += payment.amountPaid;
        outstanding += Math.max(payment.balance, 0);
      } else {
        collected += parseSheetNumber(fee.amountPaid);
        outstanding += Math.max(parseSheetNumber(fee.balance), 0);
      }
    }

    return {
      monthlyByStudent: map,
      duplicateMonthlyFees: dupes,
      orphanedFees: orphaned,
      totalCollected: collected,
      totalOutstanding: outstanding,
      otherFees: fees.filter(f => normalizeFeeMonth(f.feeMonth) === selectedMonth && f.feeType !== 'Monthly Tuition'),
    };
  }, [fees, selectedMonth, drafts, students]);

  const visibleStudents = useMemo(() =>
    students.filter(s => !feeSearch || s.toLowerCase().includes(feeSearch.toLowerCase())),
    [students, feeSearch]
  );

  const knownAmountDue = (student: string): number => {
    const studentFee = fees
      .filter(fee => fee.studentName === student && fee.feeType === 'Monthly Tuition')
      .sort((left, right) => right.rowIndex - left.rowIndex)[0];
    if (studentFee) return parseSheetNumber(studentFee.amountDue);
    const batch = batchMap.get(student);
    const batchFee = fees
      .filter(fee => fee.batch === batch && fee.feeType === 'Monthly Tuition')
      .sort((left, right) => right.rowIndex - left.rowIndex)[0];
    return batchFee ? parseSheetNumber(batchFee.amountDue) : 0;
  };

  const feeDraft = (student: string): FeeDraft => {
    const fee = monthlyByStudent.get(normalized(student));
    const amountDue = fee ? String(parseSheetNumber(fee.amountDue)) : String(knownAmountDue(student) || '');
    return drafts.get(student) ?? {
      paid: fee?.paymentStatus === 'Paid' || fee?.paymentStatus === 'Waived',
      amountDue,
      amountPaid: fee ? String(parseSheetNumber(fee.amountPaid)) : '',
    };
  };

  const updateDraft = (student: string, next: FeeDraft) => {
    setDrafts(current => new Map(current).set(student, next));
  };

  const saveRosterFee = async (student: string, overrideDraft?: FeeDraft) => {
    if (!token) return;
    const existing = monthlyByStudent.get(normalized(student));
    const draft = overrideDraft ?? feeDraft(student);
    const due = parseSheetNumber(draft.amountDue);
    const payment = calculateRosterPayment(existing, draft, due);
    const { amountPaid } = payment;
    const validationError = rosterValidationError(due, amountPaid);
    if (validationError) {
      toast.info(validationError.replace('this student', student));
      return;
    }

    setRosterSaving(student);
    try {
      const paymentDate = amountPaid > 0 ? localIsoDate() : '';
      const { status, balance } = payment;
      const paymentDetails = { due, amountPaid, balance, status, paymentDate };
      const confirmedFee = existing
        ? await updateRosterPayment(token, existing, paymentDetails, coachName)
        : await appendRosterPayment(token, student, selectedMonth, batchMap.get(student) ?? '', paymentDetails, coachName);
      setFees(current => existing
        ? current.map(fee => fee.rowIndex === existing.rowIndex ? confirmedFee : fee)
        : [...current, confirmedFee]);
      setDrafts(current => { const next = new Map(current); next.delete(student); return next; });
      void recordAudit(token, existing ? 'UPDATE' : 'CREATE', 'Fees', `${student} · ${selectedMonth}`, 'Monthly roster').catch(() => undefined);
      toast.success(existing ? `${student}'s fee was updated and verified.` : `${student}'s fee was saved and verified.`);
    } catch (e: any) {
      if (e instanceof SheetConflictError) {
        setFees(current => current.some(fee => fee.rowIndex === e.live.rowIndex)
          ? current.map(fee => fee.rowIndex === e.live.rowIndex ? e.live : fee)
          : [...current, e.live]);
        toast.info(e.message);
        return;
      }
      toast.error('Save failed: ' + e.message);
    }
    finally { setRosterSaving(''); }
  };

  const markAsPaid = async (student: string) => {
    const draft = feeDraft(student);
    const due = parseSheetNumber(draft.amountDue);
    if (due <= 0) {
      toast.info(`No fee amount set for ${student} yet — expand the card to set it.`);
      setExpandedStudent(student);
      return;
    }
    const paidDraft: FeeDraft = { paid: true, amountDue: draft.amountDue, amountPaid: String(due) };
    updateDraft(student, paidDraft);
    setExpandedStudent(student);
    await saveRosterFee(student, paidDraft);
  };

  const [yearNum, monthNum] = selectedMonth.split('-').map(Number);
  const monthDisplay = new Date(yearNum, monthNum - 1, 1)
    .toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
  const shiftMonth = (delta: number) => {
    const d = new Date(yearNum, monthNum - 1 + delta, 1);
    setSelectedMonth(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`);
    setDrafts(new Map()); setExpandedStudent(null);
  };
  const copyFeeReport = () => {
    const lines = [
      `*KAFT Chess Academy \u2013 Fee Report*`,
      `*Month:* ${monthDisplay}`,
      ``,
      `Collected: \u20b9${totalCollected.toLocaleString('en-IN')} \u00b7 Balance: \u20b9${totalOutstanding.toLocaleString('en-IN')}`,
      ``,
      `*Students (${visibleStudents.length})*`,
      ...visibleStudents.map(s => {
        const fee = monthlyByStudent.get(normalized(s));
        const status = fee?.paymentStatus ?? 'No record';
        const paid = parseSheetNumber(fee?.amountPaid ?? '0');
        const due = parseSheetNumber(feeDraft(s).amountDue);
        const e = paymentStatusIcon(status);
        const money = paymentReportAmount(paid, due);
        return `${e} ${s}${money}`;
      }),
      ``,
      `\u2014 KAFT Chess Academy`,
    ];
    void navigator.clipboard.writeText(lines.join('\n')).then(
      () => toast.success('Fee report copied \u2014 ready to paste in WhatsApp.'),
      () => toast.error('Could not copy to clipboard.')
    );
  };

  const notifyPending = () => {
    const pending = visibleStudents.filter(s => {
      const st = monthlyByStudent.get(normalized(s))?.paymentStatus;
      return !st || st === 'Pending' || st === 'Overdue' || st === 'Partial';
    }).filter(s => parseSheetNumber(feeDraft(s).amountDue) > 0);
    if (pending.length === 0) { toast.info('No pending fees to remind for this month.'); return; }
    const lines = [
      `*KAFT Chess Academy – Fee Reminder*`,
      `*Month:* ${monthDisplay}`,
      ``,
      `The following students have pending fees:`,
      ...pending.map(s => {
        const fee = monthlyByStudent.get(normalized(s));
        const due = parseSheetNumber(feeDraft(s).amountDue);
        const paid = parseSheetNumber(fee?.amountPaid ?? '0');
        const bal = Math.max(due - paid, 0);
        return `• ${s} – ₹${bal.toLocaleString('en-IN')} pending`;
      }),
      ``,
      `Please arrange payment at the earliest.`,
      `Thank you — KAFT Chess Academy`,
    ].join('\n');
    void navigator.clipboard.writeText(lines).then(
      () => toast.success(`Reminder copied for ${pending.length} student${pending.length === 1 ? '' : 's'}.`),
      () => toast.error('Could not copy to clipboard.')
    );
  };

  if (loading) return <Layout title="Fees"><PageSkeleton /></Layout>;

  return (
    <Layout title="Fees" action={
      <button type="button" onClick={()=>{setForm({...EMPTY_F, feeMonth:selectedMonth});setShowAdd(true);}}
        aria-label="Add special fee" title="Add admission, tournament, van, or other fee"
        className="header-action"><Plus size={15} /></button>
    }>
      <div className="fee-workspace page-stack mx-auto w-full max-w-4xl">
        {error && <div role="alert" className="error-state">{error}</div>}

        {/* Month navigation */}
        <div className="surface-card flex items-center gap-2 px-3 py-2.5">
          <button type="button" onClick={() => shiftMonth(-1)} className="icon-button" aria-label="Previous month"><ChevronLeft size={18}/></button>
          <div className="flex-1 text-center">
            <p className="text-sm font-bold text-gray-900" data-testid="fee-month-heading">{monthDisplay}</p>
          </div>
          <button type="button" onClick={() => shiftMonth(1)} className="icon-button" aria-label="Next month"><ChevronRight size={18}/></button>
        </div>

        {/* Summary + copy report */}
        <div className="fee-summary bg-white border border-gray-200 rounded-lg px-3 py-2.5 flex items-center">
          <div className="flex-1 pr-3 border-r border-gray-200">
            <p className="text-[11px] font-medium text-gray-500">Collected</p>
            <p className="text-lg font-bold text-green-700">{formatCurrency(totalCollected)}</p>
          </div>
          <div className="flex-1 px-3">
            <p className="text-[11px] font-medium text-gray-500">Balance</p>
            <p className="text-lg font-bold text-amber-700">{formatCurrency(totalOutstanding)}</p>
          </div>
          <button type="button" onClick={copyFeeReport}
            className="icon-button ml-2" aria-label="Copy fee report for WhatsApp" title="Copy monthly fee summary">
            <Copy size={16} />
          </button>
          <button type="button" onClick={notifyPending}
            className="icon-button ml-1" aria-label="Copy fee reminders for WhatsApp" title="Remind pending students">
            <MessageCircle size={16} />
          </button>
        </div>

        <label className="relative block"><Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" /><input value={feeSearch} onChange={e=>setFeeSearch(e.target.value)}
          placeholder="Search students" aria-label="Search students"
          className="input input-with-icon"/></label>

        <div className="flex items-end justify-between gap-3 pt-1">
          <div>
            <h2 className="font-bold text-navy">Student fees</h2>
            <p className="text-xs text-gray-500">{visibleStudents.length} students</p>
          </div>
        </div>

        {visibleStudents.length===0 && (
          <div className="text-center py-10 text-gray-400"><p>No students found.</p></div>
        )}

        <div className="space-y-2">
        {visibleStudents.map(student => {
          const fee = monthlyByStudent.get(normalized(student));
          const draft = feeDraft(student);
          const changed = drafts.has(student);
          const draftDue = parseSheetNumber(draft.amountDue);
          const payment = calculateRosterPayment(fee, draft, draftDue);
          const draftPaid = payment.amountPaid;
          const status = draftDue > 0 ? payment.status : 'Pending';
          const balance = payment.balance;
          const expanded = expandedStudent === student;
          return (
            <div key={student} className={`fee-row bg-white border rounded-lg overflow-hidden ${draft.paid?'border-green-300':'border-gray-200'}`}>
              <div className={`flex items-center gap-2 p-3 ${draft.paid?'bg-green-50/60':''}`}>
                <button type="button" onClick={()=>setExpandedStudent(expanded ? null : student)}
                  aria-expanded={expanded} aria-controls={`fee-details-${student}`}
                  className="min-w-0 flex-1 text-left flex items-center gap-2">
                  {expanded ? <ChevronDown size={18} className="shrink-0 text-gray-500" /> : <ChevronRight size={18} className="shrink-0 text-gray-500" />}
                  <span className="min-w-0 flex-1">
                    <span className="font-semibold text-sm text-gray-900 break-words block">{student}</span>
                    <span className="text-xs text-gray-500 mt-0.5 break-words block">{batchMap.get(student)||'No batch'}</span>
                    <span className="text-xs text-gray-600 mt-1 block">
                      Due {formatCurrency(draftDue)} · Paid {formatCurrency(draftPaid)}
                    </span>
                  </span>
                </button>
                <span className={`shrink-0 text-[11px] font-semibold px-2 py-1 rounded-md ${paymentStatusBadge(status)}`}>{status}</span>
                {status !== 'Paid' && (
                  <button type="button"
                    onClick={() => markAsPaid(student)}
                    disabled={rosterSaving === student}
                    className="shrink-0 h-9 px-2.5 rounded-lg bg-green-50 text-green-700 text-xs font-bold border border-green-200 disabled:opacity-50"
                    aria-label={`Mark ${student} as paid`}>
                    {rosterSaving === student ? '…' : '✓ Paid'}
                  </button>
                )}
              </div>

              {expanded && <div id={`fee-details-${student}`} className="p-3 pt-2 border-t border-gray-100">
              <div className="grid gap-2 min-[380px]:grid-cols-2">
                <label className="block">
                  <span className="text-[11px] font-medium text-gray-500 block mb-1">Fee amount</span>
                  <div className="h-10 flex rounded-lg border border-gray-200 overflow-hidden focus-within:border-chess-blue">
                    <span className="w-9 shrink-0 flex items-center justify-center border-r border-gray-200 text-sm text-gray-600">₹</span>
                    <input type="number" min="0" value={draft.amountDue} aria-label={`${student} fee amount`}
                      onChange={event=>updateDraft(student,{...draft,amountDue:event.target.value,
                        paid:draft.paid || parseSheetNumber(draft.amountPaid)>=parseSheetNumber(event.target.value)})}
                      className="min-w-0 flex-1 px-2 bg-transparent text-sm outline-none" /></div>
                </label>
                <label className="block">
                  <span className="text-[11px] font-medium text-gray-500 block mb-1">Paid amount</span>
                  <div className="h-10 flex rounded-lg border border-gray-200 overflow-hidden focus-within:border-chess-blue">
                    <span className="w-9 shrink-0 flex items-center justify-center border-r border-gray-200 text-sm text-gray-600">₹</span>
                    <input type="number" min="0" value={draftPaid} aria-label={`${student} paid amount`}
                      onChange={event=>updateDraft(student,{...draft,amountPaid:event.target.value,paid:parseSheetNumber(event.target.value)>=parseSheetNumber(draft.amountDue)&&parseSheetNumber(draft.amountDue)>0})}
                      className="min-w-0 flex-1 px-2 bg-transparent text-sm outline-none" /></div>
                </label>
              </div>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-gray-100 pt-2">
                <label className="inline-flex items-center gap-2 text-sm text-gray-700">
                  <input type="checkbox" checked={draft.paid} aria-label={`${student} paid in full`}
                    onChange={event=>updateDraft(student,{...draft,paid:event.target.checked,amountPaid:event.target.checked?draft.amountDue:'0'})}
                    className="w-5 h-5 accent-green-600" />
                  {' '}
                  Paid in full
                </label>
                <span className={`text-xs ${balance>0?'text-amber-700':'text-green-700'}`}>{balance>0?`Balance ${formatCurrency(balance)}`:'No balance'}</span>
              </div>
              <div className="mt-2 flex items-center gap-1.5">
                <button type="button" onClick={()=>saveRosterFee(student)} disabled={!changed || rosterSaving===student}
                  className="primary-action h-9 flex-1 px-3 text-xs">
                  {rosterSaveButtonLabel(rosterSaving === student, Boolean(fee))}
                </button>
                {fee && <button type="button"
                  onClick={() => { setEditTarget(fee); setForm(feeToForm(fee)); }}
                  aria-label={`Edit all fields for ${student}`} title="Edit all fee details"
                  className="icon-button"><Pencil size={15}/></button>}
                {fee && <button type="button" onClick={()=>removeFee(fee)} disabled={deleting===fee.rowIndex}
                  aria-label={`Remove monthly fee for ${student}`} title="Remove fee"
                  className="icon-button-danger"><Trash2 size={15}/></button>}
              </div>
              </div>}
            </div>
          );
        })}
        </div>

        {orphanedFees.length > 0 && (
          <div className="surface-card border-l-4 border-l-orange-500 rounded-lg p-3">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-orange-500" aria-hidden="true">⚠</span>
              <h2 className="font-bold text-gray-900 text-sm">Fee records for removed students</h2>
            </div>
            <p className="text-xs text-gray-500 mb-3">These students no longer exist in the roster. Remove their records to clear the balance.</p>
            <div className="divide-y divide-gray-100">
              {orphanedFees.map(fee => (
                <div key={fee.rowIndex} className="py-2.5 flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-sm text-gray-900">{fee.studentName}</p>
                    <p className="text-xs text-gray-500 mt-0.5">Receipt {fee.receiptNo} &middot; {formatCurrency(fee.balance)} unpaid</p>
                  </div>
                  <button type="button" onClick={() => removeFee(fee)} disabled={deleting === fee.rowIndex}
                    aria-label={`Remove fee record for ${fee.studentName}`}
                    className="shrink-0 h-9 px-3 rounded-lg bg-red-600 text-white text-xs font-semibold hover:bg-red-700 disabled:opacity-50">
                    {deleting === fee.rowIndex ? 'Removing…' : 'Remove'}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {duplicateMonthlyFees.length>0 && <div className="surface-card border-l-4 border-l-red-500 rounded-lg p-3">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-red-500" aria-hidden="true">⚠</span>
            <h2 className="font-bold text-gray-900 text-sm">Duplicate monthly fees</h2>
          </div>
          <p className="text-xs text-gray-500 mb-3">Keep the correct entry and remove the extras below.</p>
          <div className="divide-y divide-red-200">
            {duplicateMonthlyFees.map(fee=><div key={fee.rowIndex} className="py-2 flex items-center gap-2">
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-sm text-gray-900 truncate">{fee.studentName}</p>
                <p className="text-xs text-gray-600">Receipt {fee.receiptNo} · {formatCurrency(fee.amountPaid)} paid</p>
              </div>
              <button type="button" onClick={()=>{setEditTarget(fee);setForm(feeToForm(fee));}}
                aria-label={`Edit duplicate fee for ${fee.studentName}`} className="w-8 h-8 flex items-center justify-center text-gray-600">
                <Pencil size={15} aria-hidden="true" />
              </button>
              <button type="button" onClick={()=>removeFee(fee)} disabled={deleting===fee.rowIndex}
                aria-label={`Remove duplicate fee for ${fee.studentName}`} className="w-8 h-8 flex items-center justify-center text-red-700 disabled:opacity-50">
                <Trash2 size={16} aria-hidden="true" />
              </button>
            </div>)}
          </div>
        </div>}

        {otherFees.length>0 && <div className="pt-3">
          <h2 className="font-bold text-navy mb-2">Other fees</h2>
          <div className="bg-white border border-gray-200 rounded-lg divide-y divide-gray-100">
            {otherFees.map(fee=><div key={fee.rowIndex} className="px-3 py-2.5 flex items-center gap-2">
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-sm truncate">{fee.studentName}</p>
                <p className="text-xs text-gray-500 truncate">{fee.feeType} · {formatCurrency(fee.amountPaid)} paid</p>
              </div>
              <button type="button" onClick={()=>{setEditTarget(fee);setForm(feeToForm(fee));}} aria-label={`Edit ${fee.feeType} fee`}
                className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-500"><Pencil size={15}/></button>
              <button type="button" onClick={()=>removeFee(fee)} disabled={deleting===fee.rowIndex} aria-label={`Remove ${fee.feeType} fee`}
                className="w-8 h-8 flex items-center justify-center rounded-lg text-red-600 disabled:opacity-50"><Trash2 size={16}/></button>
            </div>)}
          </div>
        </div>}
      </div>

      {showAdd && <FeeModal title="Add Payment" onClose={() => setShowAdd(false)} form={form} setForm={setForm}
        students={students} onSave={handleAdd} saving={saving} coachName={coachName} />}
      {editTarget && <FeeModal title="Edit Payment" onClose={() => setEditTarget(null)} form={form} setForm={setForm}
        students={students} onSave={handleEdit} saving={saving} coachName={coachName} />}
    </Layout>
  );
}

function FeeModal({title,onClose,form,setForm,students,onSave,saving,coachName}:
  Readonly<{title:string;onClose:()=>void;form:FeeForm;setForm:(f:FeeForm)=>void;students:string[];onSave:()=>void;saving:boolean;coachName:string}>) {
  const u=(k:keyof FeeForm)=>(e:React.ChangeEvent<HTMLInputElement|HTMLSelectElement>)=>setForm({...form,[k]:e.target.value});
  const isEdit = title.startsWith('Edit');
  const buttonLabel = paymentButtonLabel(isEdit, saving);
  return (
    <div className="modal-backdrop items-end justify-center sm:items-center">
      <button type="button" onClick={onClose} aria-label="Close payment form" className="absolute inset-0 h-full w-full" />
      <dialog open aria-labelledby="fee-modal-title" className="modal-panel relative m-0 flex max-h-[92vh] max-w-lg flex-col overflow-hidden p-0">
        <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
          <h2 id="fee-modal-title" className="text-base font-semibold text-navy">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="icon-button"><X size={18} /></button>
        </div>
        <div className="form-grid overflow-y-auto px-4 py-3">
          <F label="Student *"><select value={form.studentName} onChange={u('studentName')} className="input"><option value="">Select…</option>{students.map(s=><option key={s}>{s}</option>)}</select></F>
          <F label="Fee Month"><input type="month" value={form.feeMonth} onChange={u('feeMonth')} className="input"/></F>
          <F label="Fee Type"><select value={form.feeType} onChange={u('feeType')} className="input">{['Monthly Tuition','Admission','Tournament','Van','Materials','Other'].map(o=><option key={o}>{o}</option>)}</select></F>
          <div className="grid gap-2 min-[380px]:grid-cols-2">
            <F label="Amount Due *"><input type="number" min="0.01" max="10000000" step="0.01" value={form.amountDue} onChange={u('amountDue')} className="input" placeholder="₹"/></F>
            <F label="Amount Paid"><input type="number" min="0" max="10000000" step="0.01" value={form.amountPaid} onChange={u('amountPaid')} className="input" placeholder="₹"/></F>
          </div>
          <F label="Payment Method"><select value={form.paymentMethod} onChange={u('paymentMethod')} className="input">{['Cash','UPI','Bank Transfer','Card','Cheque'].map(o=><option key={o}>{o}</option>)}</select></F>
          <F label="Payment Status"><select value={form.paymentStatus} onChange={u('paymentStatus')} className="input">{['Paid','Partial','Pending','Overdue','Waived'].map(o=><option key={o}>{o}</option>)}</select></F>
          <div className="grid gap-2 min-[380px]:grid-cols-2">
            <F label="Due Date"><input type="date" value={form.dueDate} onChange={u('dueDate')} className="input"/></F>
            <F label="Payment Date"><input type="date" value={form.paymentDate} onChange={u('paymentDate')} className="input"/></F>
          </div>
          <F label="Reference / Receipt No."><input maxLength={100} value={form.reference} onChange={u('reference')} className="input"/></F>
          <p className="text-xs text-gray-400">Will be tracked to: <strong>{coachName}</strong></p>
          {feeFormValidationError(form) && <p role="alert" className="text-xs text-red-600">{feeFormValidationError(form)}</p>}
        </div>
        <div className="border-t border-gray-100 bg-white p-4">
          <button type="button" onClick={onSave} disabled={saving} className="primary-action w-full">
            <span className="inline-flex items-center justify-center gap-2">
              {saving && <span className="button-spinner" aria-hidden="true"/>}
              {buttonLabel}
            </span>
          </button>
        </div>
      </dialog>
    </div>
  );
}
function F({label,children}:Readonly<{label:string;children:React.ReactNode}>) {
  return <label className="block"><span className="field-label">{label}</span>{children}</label>;
}

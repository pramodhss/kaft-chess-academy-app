import { useEffect, useState } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { Layout } from '../components/Layout';
import { Spinner } from '../components/Spinner';
import { useAuth } from '../context/AuthContext';
import { readSheet, readSheetLive, appendRows, batchWrite, clearSheetRange } from '../lib/sheets';
import { useToast } from '../context/ToastContext';
import { SHEET_ID, TABS } from '../config';
import { parseSheetNumber } from '../lib/values';
import type { FeeEntry } from '../types';

type FeeForm = { studentName:string; feeMonth:string; feeType:string; amountDue:string;
  amountPaid:string; paymentMethod:string; paymentStatus:string; dueDate:string;
  paymentDate:string; reference:string; notes:string };

const EMPTY_F: FeeForm = { studentName:'', feeMonth:'', feeType:'Monthly Tuition',
  amountDue:'', amountPaid:'', paymentMethod:'UPI', paymentStatus:'Pending',
  dueDate:'', paymentDate:'', reference:'', notes:'' };

type FeeDraft = { paid: boolean; amount: string };

function rosterAmountPaid(draft: FeeDraft, amountDue: number): number {
  if (!draft.paid) return parseSheetNumber(draft.amount);
  return parseSheetNumber(draft.amount) || amountDue;
}

function rosterValidationError(existing: FeeEntry | undefined, amountDue: number, amountPaid: number): string {
  if (amountPaid < 0 || (amountDue > 0 && amountPaid > amountDue)) {
    return `Paid amount must be between ₹0 and ₹${amountDue}.`;
  }
  if (!existing && amountDue <= 0) return 'Add this student\'s monthly fee amount first.';
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

function paymentStatus(amountPaid: number, amountDue: number): string {
  if (amountPaid >= amountDue) return 'Paid';
  return amountPaid > 0 ? 'Partial' : 'Pending';
}

function normalized(value: string): string {
  return value.trim().toLocaleLowerCase();
}

function sameFeeIdentity(fee: FeeEntry, studentName: string, feeMonth: string, feeType: string): boolean {
  return normalized(fee.studentName) === normalized(studentName)
    && normalized(fee.feeMonth) === normalized(feeMonth)
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
  return { studentName:f.studentName, feeMonth:f.feeMonth, feeType:f.feeType,
    amountDue:f.amountDue, amountPaid:f.amountPaid, paymentMethod:f.paymentMethod,
    paymentStatus:f.paymentStatus, dueDate:dateInputValue(f.dueDate), paymentDate:dateInputValue(f.paymentDate),
    reference:f.reference, notes:f.notes };
}

export function Fees() {
  const { token, logout } = useAuth();
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
  const [batchFilter, setBatchFilter] = useState('All');
  const [drafts, setDrafts] = useState<Map<string, FeeDraft>>(new Map());
  const [rosterSaving, setRosterSaving] = useState('');
  const toast = useToast();
  const coachName = localStorage.getItem('chess_coach_name') ?? 'Coach';

  const load = async () => {
    if (!token) return;
    setLoading(true); setError('');
    try {
      const [feeRows, studentRows] = await Promise.all([
        readSheet(token, SHEET_ID, `'${TABS.FEES}'!A:N`),
        readSheet(token, SHEET_ID, `'${TABS.STUDENTS}'!A:L`),
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
    if (!token||!form.studentName||!form.amountDue) return;
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
      const balance = amountDue - amountPaid;
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
      setShowAdd(false);
      setForm({...EMPTY_F});
      toast.success(`Payment for ${added.studentName} was saved successfully.`);
    } catch(e:any) { toast.error('Save failed: '+e.message); }
    finally { setSaving(false); }
  };

  const handleEdit = async () => {
    if (!token||!editTarget||!form.studentName) return;
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
      if (currentFee.receiptNo !== editTarget.receiptNo || JSON.stringify(feeToForm(currentFee)) !== JSON.stringify(feeToForm(editTarget))) {
        toast.info('This payment was changed on another device. Reload Fees before editing again.');
        return;
      }
      if (feeRowsToEntries(allRows).some(fee => fee.rowIndex !== row
        && sameFeeIdentity(fee, form.studentName, form.feeMonth, form.feeType))) {
        toast.info('This fee already exists for the selected student, month, and fee type. Edit or remove the other entry first.');
        return;
      }
      const balance = amountDue - amountPaid;
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
      if (currentFee.receiptNo !== fee.receiptNo || JSON.stringify(feeToForm(currentFee)) !== JSON.stringify(feeToForm(fee))) {
        toast.info('This payment was changed on another device. Reload Fees before removing it.');
        return;
      }
      await clearSheetRange(token, SHEET_ID, `'${tab}'!A${fee.rowIndex}:N${fee.rowIndex}`);
      setFees(prev => prev.filter(entry => entry.rowIndex !== fee.rowIndex));
      toast.success(`Receipt ${fee.receiptNo} was removed.`);
    } catch (e: any) { toast.error('Remove failed: ' + e.message); }
    finally { setDeleting(null); }
  };

  const monthlyByStudent = new Map<string, FeeEntry>();
  const selectedMonthlyFees = fees
    .filter(fee => fee.feeType === 'Monthly Tuition' && fee.feeMonth === selectedMonth)
    .sort((left, right) => left.rowIndex - right.rowIndex);
  selectedMonthlyFees.forEach(fee => monthlyByStudent.set(normalized(fee.studentName), fee));
  const duplicateMonthlyFees = selectedMonthlyFees.filter(fee => monthlyByStudent.get(normalized(fee.studentName)) !== fee);

  const batches = Array.from(new Set(students.map(student => batchMap.get(student)).filter(Boolean) as string[]))
    .sort((left, right) => left.localeCompare(right));
  const visibleStudents = students.filter(student =>
    (batchFilter === 'All' || batchMap.get(student) === batchFilter)
    && (!feeSearch || student.toLowerCase().includes(feeSearch.toLowerCase()))
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
    return drafts.get(student) ?? {
      paid: fee?.paymentStatus === 'Paid' || fee?.paymentStatus === 'Waived',
      amount: fee?.amountPaid || '',
    };
  };

  const updateDraft = (student: string, next: FeeDraft) => {
    setDrafts(current => new Map(current).set(student, next));
  };

  const saveRosterFee = async (student: string) => {
    if (!token) return;
    const existing = monthlyByStudent.get(normalized(student));
    const draft = feeDraft(student);
    const due = existing ? parseSheetNumber(existing.amountDue) : knownAmountDue(student);
    const amountPaid = rosterAmountPaid(draft, due);
    const validationError = rosterValidationError(existing, due, amountPaid);
    if (validationError) {
      toast.info(validationError.replace('this student', student));
      return;
    }

    setRosterSaving(student);
    try {
      const paymentDate = amountPaid > 0 ? localIsoDate() : '';
      const status = paymentStatus(amountPaid, due);
      const balance = Math.max(due - amountPaid, 0);
      if (existing) {
        const currentRows = await readSheetLive(token, SHEET_ID, `'${TABS.FEES}'!A${existing.rowIndex}:N${existing.rowIndex}`);
        const currentFee = rowToFee(currentRows[0] ?? [], existing.rowIndex - 2);
        if (currentFee.receiptNo !== existing.receiptNo || JSON.stringify(feeToForm(currentFee)) !== JSON.stringify(feeToForm(existing))) {
          toast.info('This payment changed on another device. Fees have been reloaded.');
          await load();
          return;
        }
        const note = `Roster updated by ${coachName} on ${new Date().toLocaleDateString('en-IN')}`;
        await batchWrite(token, SHEET_ID, [
          {range:`'${TABS.FEES}'!G${existing.rowIndex}`,value:amountPaid},
          {range:`'${TABS.FEES}'!H${existing.rowIndex}`,value:balance},
          {range:`'${TABS.FEES}'!J${existing.rowIndex}`,value:paymentDate},
          {range:`'${TABS.FEES}'!L${existing.rowIndex}`,value:status},
          {range:`'${TABS.FEES}'!N${existing.rowIndex}`,value:note},
        ]);
        setFees(current => current.map(fee => fee.rowIndex === existing.rowIndex
          ? {...fee, amountPaid:String(amountPaid), balance:String(balance), paymentDate, paymentStatus:status, notes:note}
          : fee));
      } else {
        const liveRows = await readSheetLive(token, SHEET_ID, `'${TABS.FEES}'!A:N`);
        if (feeRowsToEntries(liveRows).some(fee => sameFeeIdentity(fee, student, selectedMonth, 'Monthly Tuition'))) {
          toast.info('A monthly fee was added on another device. Fees have been reloaded.');
          await load();
          return;
        }
        const receipt = newReceiptNumber();
        const rowIndex = await appendRows(token, SHEET_ID, `'${TABS.FEES}'!A:N`, [[
          receipt, student, batchMap.get(student) ?? '', selectedMonth, 'Monthly Tuition', due,
          amountPaid, balance, '', paymentDate, 'UPI', status, '', `Roster added by ${coachName}`,
        ]]);
        const confirmedFees = feeRowsToEntries(await readSheetLive(token, SHEET_ID, `'${TABS.FEES}'!A:N`));
        const firstMatchingRow = confirmedFees
          .filter(fee => sameFeeIdentity(fee, student, selectedMonth, 'Monthly Tuition'))
          .sort((left, right) => left.rowIndex - right.rowIndex)[0]?.rowIndex;
        if (firstMatchingRow !== rowIndex) {
          await clearSheetRange(token, SHEET_ID, `'${TABS.FEES}'!A${rowIndex}:N${rowIndex}`);
          toast.info('This monthly fee was added elsewhere at the same time. The duplicate row was not saved.');
          await load();
          return;
        }
        setFees(current => [...current, {
          receiptNo:receipt, studentName:student, batch:batchMap.get(student) ?? '', feeMonth:selectedMonth,
          feeType:'Monthly Tuition', amountDue:String(due), amountPaid:String(amountPaid), balance:String(balance),
          dueDate:'', paymentDate, paymentMethod:'UPI', paymentStatus:status, reference:'',
          notes:`Roster added by ${coachName}`, rowIndex,
        }]);
      }
      setDrafts(current => { const next = new Map(current); next.delete(student); return next; });
      toast.success(`${student}'s fee was updated.`);
    } catch (e: any) { toast.error('Save failed: ' + e.message); }
    finally { setRosterSaving(''); }
  };

  const selectedFees = Array.from(monthlyByStudent.values());
  const totalCollected = selectedFees.reduce((sum, fee) => sum + parseSheetNumber(fee.amountPaid), 0);
  const totalOutstanding = selectedFees.reduce((sum, fee) => sum + Math.max(parseSheetNumber(fee.balance), 0), 0);
  const otherFees = fees.filter(fee => fee.feeMonth === selectedMonth && fee.feeType !== 'Monthly Tuition');

  if (loading) return <Layout title="Fees"><Spinner /></Layout>;

  return (
    <Layout title="Fees" action={
      <button type="button" onClick={()=>{setForm({...EMPTY_F, feeMonth:selectedMonth});setShowAdd(true);}}
        aria-label="Add fee" title="Add fee" className="w-9 h-9 flex items-center justify-center rounded-lg bg-white/10 text-white">
        <Plus size={20} aria-hidden="true" />
      </button>
    }>
      <div className="p-4 space-y-3">
        {error && <p className="text-red-600 text-sm bg-red-50 p-3 rounded-xl">{error}</p>}

        <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
          <input type="month" value={selectedMonth} onChange={event=>{setSelectedMonth(event.target.value);setDrafts(new Map());}}
            aria-label="Fee month" className="input min-w-0" />
          <select value={batchFilter} onChange={event=>setBatchFilter(event.target.value)} aria-label="Filter by batch"
            className="input w-28">
            <option>All</option>
            {batches.map(batch=><option key={batch}>{batch}</option>)}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="bg-green-700 text-white rounded-lg p-3">
            <p className="text-xs opacity-80">Collected</p>
            <p className="text-xl font-bold">₹{totalCollected.toLocaleString('en-IN')}</p>
          </div>
          <div className="bg-amber-600 text-white rounded-lg p-3">
            <p className="text-xs opacity-80">Outstanding</p>
            <p className="text-xl font-bold">₹{totalOutstanding.toLocaleString('en-IN')}</p>
          </div>
        </div>

        <input value={feeSearch} onChange={e=>setFeeSearch(e.target.value)}
          placeholder="Search students"
          className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-chess-blue"/>

        <div className="flex items-end justify-between gap-3 pt-1">
          <div>
            <h2 className="font-bold text-navy">Monthly tuition</h2>
            <p className="text-xs text-gray-500">{visibleStudents.length} students</p>
          </div>
          <div className="grid grid-cols-[52px_82px] gap-2 text-[10px] font-semibold uppercase text-gray-400 text-center">
            <span>Paid</span><span>Amount</span>
          </div>
        </div>

        {visibleStudents.length===0 && (
          <div className="text-center py-10 text-gray-400"><p>No students found.</p></div>
        )}

        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden divide-y divide-gray-100">
        {visibleStudents.map(student => {
          const fee = monthlyByStudent.get(normalized(student));
          const draft = feeDraft(student);
          const due = fee ? parseSheetNumber(fee.amountDue) : knownAmountDue(student);
          const changed = drafts.has(student);
          const balance = Math.max(due - parseSheetNumber(draft.amount), 0);
          return (
            <div key={student} className={`px-3 py-3 ${draft.paid?'bg-green-50/60':''}`}>
              <div className="grid grid-cols-[minmax(0,1fr)_52px_82px] gap-2 items-center">
                <div className="min-w-0">
                  <p className="font-semibold text-sm text-gray-900 truncate">{student}</p>
                  <p className="text-[11px] text-gray-500 truncate">{batchMap.get(student)||'No batch'} · Due ₹{due||'—'}</p>
                </div>
                <label className="flex justify-center">
                  <input type="checkbox" checked={draft.paid} aria-label={`${student} paid`}
                    onChange={event=>updateDraft(student, {
                      paid:event.target.checked,
                      amount:event.target.checked ? String(due || parseSheetNumber(draft.amount) || '') : '0',
                    })}
                    className="w-6 h-6 accent-green-600" />
                </label>
                <div className="relative">
                  <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-gray-400">₹</span>
                  <input type="number" min="0" value={draft.amount} aria-label={`${student} paid amount`}
                    onChange={event=>{
                      const amount=event.target.value;
                      updateDraft(student,{paid:due>0&&parseSheetNumber(amount)>=due,amount});
                    }}
                    className="w-full h-9 pl-5 pr-1 rounded-lg border border-gray-200 text-sm text-right focus:outline-none focus:border-chess-blue" />
                </div>
              </div>
              {(changed || fee) && (
                <div className="flex items-center justify-between gap-2 mt-2 pl-0.5">
                  <span className={`text-xs ${balance>0?'text-amber-700':'text-green-700'}`}>
                    {balance>0?`Balance ₹${balance}`:'Paid in full'}
                  </span>
                  <div className="flex items-center gap-1">
                  {changed && (
                    <button type="button" onClick={()=>saveRosterFee(student)} disabled={rosterSaving===student}
                      className="h-8 px-3 rounded-lg bg-navy text-white text-xs font-semibold disabled:opacity-50">
                      {rosterSaving===student?'Saving…':'Save'}
                    </button>
                  )}
                  {fee && <button type="button" onClick={()=>{setEditTarget(fee);setForm(feeToForm(fee));}}
                    aria-label={`Edit fee for ${student}`} title="Edit details"
                    className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100">
                    <Pencil size={15} aria-hidden="true" />
                  </button>
                  }
                  {fee && <button type="button" onClick={()=>removeFee(fee)} disabled={deleting===fee.rowIndex}
                    aria-label={`Remove monthly fee for ${student}`} title="Remove fee"
                    className="w-8 h-8 flex items-center justify-center rounded-lg text-red-600 hover:bg-red-50 disabled:opacity-50">
                    <Trash2 size={16} aria-hidden="true" />
                  </button>}
                </div>
                </div>
              )}
            </div>
          );
        })}
        </div>

        {duplicateMonthlyFees.length>0 && <div className="border border-red-200 bg-red-50 rounded-lg p-3">
          <h2 className="font-bold text-red-800 text-sm">Duplicate monthly fees</h2>
          <p className="text-xs text-red-700 mt-0.5 mb-2">Keep the correct entry and remove the extras below.</p>
          <div className="divide-y divide-red-200">
            {duplicateMonthlyFees.map(fee=><div key={fee.rowIndex} className="py-2 flex items-center gap-2">
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-sm text-gray-900 truncate">{fee.studentName}</p>
                <p className="text-xs text-gray-600">Receipt {fee.receiptNo} · ₹{fee.amountPaid||'0'} paid</p>
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
                <p className="text-xs text-gray-500 truncate">{fee.feeType} · ₹{fee.amountPaid||'0'} paid</p>
              </div>
              <button type="button" onClick={()=>{setEditTarget(fee);setForm(feeToForm(fee));}} aria-label={`Edit ${fee.feeType} fee`}
                className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-500"><Pencil size={15}/></button>
              <button type="button" onClick={()=>removeFee(fee)} disabled={deleting===fee.rowIndex} aria-label={`Remove ${fee.feeType} fee`}
                className="w-8 h-8 flex items-center justify-center rounded-lg text-red-600 disabled:opacity-50"><Trash2 size={16}/></button>
            </div>)}
          </div>
        </div>}
      </div>

      {showAdd&&<FeeModal title="Add Payment" onClose={()=>setShowAdd(false)} form={form} setForm={setForm} students={students} onSave={handleAdd} saving={saving} disabled={!form.studentName||!form.amountDue} coachName={coachName}/>}
      {editTarget&&<FeeModal title="Edit Payment" onClose={()=>setEditTarget(null)} form={form} setForm={setForm} students={students} onSave={handleEdit} saving={saving} disabled={!form.studentName} coachName={coachName}/>}
    </Layout>
  );
}

function FeeModal({title,onClose,form,setForm,students,onSave,saving,disabled,coachName}:
  Readonly<{title:string;onClose:()=>void;form:FeeForm;setForm:(f:FeeForm)=>void;students:string[];onSave:()=>void;saving:boolean;disabled:boolean;coachName:string}>) {
  const u=(k:keyof FeeForm)=>(e:React.ChangeEvent<HTMLInputElement|HTMLSelectElement>)=>setForm({...form,[k]:e.target.value});
  const isEdit = title.startsWith('Edit');
  const buttonLabel = paymentButtonLabel(isEdit, saving);
  return (
    <div className="fixed inset-0 flex items-end z-50">
      <button type="button" onClick={onClose} aria-label="Close payment form" className="absolute inset-0 w-full h-full bg-black/50" />
      <dialog open aria-labelledby="fee-modal-title" className="relative m-0 border-0 bg-white w-full rounded-t-2xl p-5 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 id="fee-modal-title" className="font-bold text-lg text-navy">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="text-gray-500 text-2xl leading-none">×</button>
        </div>
        <div className="space-y-3">
          <F label="Student *"><select value={form.studentName} onChange={u('studentName')} className="input"><option value="">Select…</option>{students.map(s=><option key={s}>{s}</option>)}</select></F>
          <F label="Fee Month"><input type="month" value={form.feeMonth} onChange={u('feeMonth')} className="input"/></F>
          <F label="Fee Type"><select value={form.feeType} onChange={u('feeType')} className="input">{['Monthly Tuition','Admission','Tournament','Van','Materials','Other'].map(o=><option key={o}>{o}</option>)}</select></F>
          <div className="grid grid-cols-2 gap-2">
            <F label="Amount Due *"><input type="number" value={form.amountDue} onChange={u('amountDue')} className="input" placeholder="₹"/></F>
            <F label="Amount Paid"><input type="number" value={form.amountPaid} onChange={u('amountPaid')} className="input" placeholder="₹"/></F>
          </div>
          <F label="Payment Method"><select value={form.paymentMethod} onChange={u('paymentMethod')} className="input">{['Cash','UPI','Bank Transfer','Card','Cheque'].map(o=><option key={o}>{o}</option>)}</select></F>
          <F label="Payment Status"><select value={form.paymentStatus} onChange={u('paymentStatus')} className="input">{['Paid','Partial','Pending','Overdue','Waived'].map(o=><option key={o}>{o}</option>)}</select></F>
          <div className="grid grid-cols-2 gap-2">
            <F label="Due Date"><input type="date" value={form.dueDate} onChange={u('dueDate')} className="input"/></F>
            <F label="Payment Date"><input type="date" value={form.paymentDate} onChange={u('paymentDate')} className="input"/></F>
          </div>
          <F label="Reference / Receipt No."><input value={form.reference} onChange={u('reference')} className="input"/></F>
          <p className="text-xs text-gray-400">Will be tracked to: <strong>{coachName}</strong></p>
        </div>
        <button type="button" onClick={onSave} disabled={saving||disabled} className="w-full bg-navy text-white py-3 rounded-xl font-semibold mt-4 disabled:opacity-50">
          <span className="inline-flex items-center justify-center gap-2">
            {saving && <span className="button-spinner" aria-hidden="true"/>}
            {buttonLabel}
          </span>
        </button>
      </dialog>
    </div>
  );
}
function F({label,children}:Readonly<{label:string;children:React.ReactNode}>) {
  return <label className="block"><span className="text-xs font-medium text-gray-500 mb-1 block">{label}</span>{children}</label>;
}

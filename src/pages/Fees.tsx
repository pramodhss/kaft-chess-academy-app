import { useEffect, useState } from 'react';
import { Layout } from '../components/Layout';
import { Spinner } from '../components/Spinner';
import { useAuth } from '../context/AuthContext';
import { readSheet, appendRows, batchWrite } from '../lib/sheets';
import { useToast } from '../context/ToastContext';
import { EmptyState, ErrorState } from '../components/EmptyState';
import { SHEET_ID, TABS } from '../config';
import type { FeeEntry } from '../types';

const FEE_TYPES   = ['Monthly Tuition','Admission','Tournament','Van','Materials','Other'];
const PAY_METHODS = ['Cash','UPI','Bank Transfer','Card','Cheque'];
const PAY_STATUS  = ['Paid','Partial','Pending','Overdue','Waived'];

type FeeForm = { studentName:string; feeMonth:string; feeType:string; amountDue:string;
  amountPaid:string; paymentMethod:string; paymentStatus:string; dueDate:string;
  paymentDate:string; reference:string; notes:string };

const EMPTY_F: FeeForm = { studentName:'', feeMonth:'', feeType:'Monthly Tuition',
  amountDue:'', amountPaid:'', paymentMethod:'UPI', paymentStatus:'Pending',
  dueDate:'', paymentDate:'', reference:'', notes:'' };

const STATUS_COLOR: Record<string,string> = {
  Paid:'badge-green', Partial:'badge-amber', Pending:'badge-amber', Overdue:'badge-red', Waived:'badge-gray'
};

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
    paymentStatus:f.paymentStatus, dueDate:f.dueDate, paymentDate:f.paymentDate,
    reference:f.reference, notes:f.notes };
}

export function Fees() {
  const { token, logout } = useAuth();
  const [fees, setFees]           = useState<FeeEntry[]>([]);
  const [students, setStudents]   = useState<string[]>([]);
  const [waMap, setWaMap]         = useState<Map<string,string>>(new Map());
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState('');
  const [filter, setFilter]       = useState('');
  const [showAdd, setShowAdd]     = useState(false);
  const [editTarget, setEditTarget] = useState<FeeEntry|null>(null);
  const [form, setForm]           = useState<FeeForm>({ ...EMPTY_F });
  const [saving, setSaving]       = useState(false);
  const [marking, setMarking]     = useState<number|null>(null);
  const [feeSearch, setFeeSearch] = useState('');
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
      setFees(feeRows.slice(1).filter(r=>r[1]?.trim()).map(rowToFee));
      const names = studentRows.slice(1).map(r=>r[0]).filter(Boolean);
      setStudents(names);
      const wa = new Map<string,string>();
      studentRows.slice(1).forEach(r => { if(r[0]) wa.set(r[0], r[11]??''); }); // L=WhatsApp
      setWaMap(wa);
    } catch(e:any) {
      if(e.message==='TOKEN_EXPIRED'){logout();return;}
      setError(e.message);
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [token]);

  const handleAdd = async () => {
    if (!token||!form.studentName||!form.amountDue) return;
    setSaving(true);
    try {
      const receipt = `RCT-${Date.now().toString().slice(-6)}`;
      const balance = parseFloat(form.amountDue)-(parseFloat(form.amountPaid||'0'));
      await appendRows(token, SHEET_ID, `'${TABS.FEES}'!A:N`, [[
        receipt, form.studentName, '', form.feeMonth, form.feeType,
        parseFloat(form.amountDue), parseFloat(form.amountPaid||'0'), balance,
        form.dueDate, form.paymentDate||new Date().toLocaleDateString('en-IN'),
        form.paymentMethod, form.paymentStatus, form.reference,
        form.notes ? `${form.notes} [by ${coachName}]` : `Added by ${coachName}`,
      ]]);
      setShowAdd(false); setForm({...EMPTY_F}); await load(); toast.success('Payment added!');
    } catch(e:any) { toast.error('Save failed: '+e.message); }
    finally { setSaving(false); }
  };

  const handleEdit = async () => {
    if (!token||!editTarget||!form.studentName) return;
    setSaving(true);
    try {
      const row=editTarget.rowIndex, tab=TABS.FEES;
      const balance=parseFloat(form.amountDue)-(parseFloat(form.amountPaid||'0'));
      await batchWrite(token, SHEET_ID, [
        {range:`'${tab}'!B${row}`,value:form.studentName},
        {range:`'${tab}'!D${row}`,value:form.feeMonth},
        {range:`'${tab}'!E${row}`,value:form.feeType},
        {range:`'${tab}'!F${row}`,value:parseFloat(form.amountDue)||0},
        {range:`'${tab}'!G${row}`,value:parseFloat(form.amountPaid||'0')||0},
        {range:`'${tab}'!H${row}`,value:balance},
        {range:`'${tab}'!I${row}`,value:form.dueDate},
        {range:`'${tab}'!J${row}`,value:form.paymentDate},
        {range:`'${tab}'!K${row}`,value:form.paymentMethod},
        {range:`'${tab}'!L${row}`,value:form.paymentStatus},
        {range:`'${tab}'!M${row}`,value:form.reference},
        {range:`'${tab}'!N${row}`,value:`${form.notes} [edited by ${coachName}]`.trim()},
      ]);
      setEditTarget(null); await load(); toast.success('Payment updated!');
    } catch(e:any) { toast.error('Save failed: '+e.message); }
    finally { setSaving(false); }
  };

  // Quick mark as paid directly from the card
  const markPaid = async (fee: FeeEntry) => {
    if (!token) return;
    setMarking(fee.rowIndex);
    try {
      const tab = TABS.FEES;
      await batchWrite(token, SHEET_ID, [
        {range:`'${tab}'!G${fee.rowIndex}`,value:parseFloat(fee.amountDue)||0},
        {range:`'${tab}'!H${fee.rowIndex}`,value:0},
        {range:`'${tab}'!J${fee.rowIndex}`,value:new Date().toLocaleDateString('en-IN')},
        {range:`'${tab}'!K${fee.rowIndex}`,value:'Cash'},
        {range:`'${tab}'!L${fee.rowIndex}`,value:'Paid'},
        {range:`'${tab}'!N${fee.rowIndex}`,value:`Marked paid by ${coachName} on ${new Date().toLocaleDateString('en-IN')}`},
      ]);
      await load(); toast.success('Fee marked as Paid ✓');
    } catch(e:any) { toast.error(e.message); }
    finally { setMarking(null); }
  };

  const waLink = (studentName: string, fee: FeeEntry) => {
    const phone = waMap.get(studentName)?.replace(/[^0-9]/g,'') ?? '';
    if (!phone) return null;
    const num = phone.startsWith('91') ? phone : `91${phone}`;
    const msg = encodeURIComponent(
      `Dear Parent, this is a friendly reminder that the ${fee.feeType} fee of ₹${fee.balance||fee.amountDue} for *${studentName}* at KAFT Chess Academy is pending. Kindly make the payment at your earliest convenience. Thank you! 🙏♟`
    );
    return `https://wa.me/${num}?text=${msg}`;
  };

  const STATUS_SORT:{[k:string]:number}={'Overdue':0,'Partial':1,'Pending':2,'Paid':3,'Waived':4};
  const visible = fees
    .filter(f => (!filter || f.paymentStatus===filter) && (!feeSearch || f.studentName.toLowerCase().includes(feeSearch.toLowerCase())))
    .sort((a,b) => (STATUS_SORT[a.paymentStatus]??5)-(STATUS_SORT[b.paymentStatus]??5));
  const totalCollected   = fees.reduce((s,f)=>s+(parseFloat(f.amountPaid)||0),0);
  const totalOutstanding = fees.reduce((s,f)=>s+Math.max(parseFloat(f.balance)||0,0),0);

  if (loading) return <Layout title="Fees"><Spinner /></Layout>;

  return (
    <Layout title="Fees" action={
      <button onClick={()=>{setForm({...EMPTY_F});setShowAdd(true);}}
        className="bg-white text-navy text-sm font-bold px-3 py-1 rounded-full">+ Add</button>
    }>
      <div className="p-4 space-y-3">
        {error && <p className="text-red-600 text-sm bg-red-50 p-3 rounded-xl">{error}</p>}

        {/* Summary */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-green-600 text-white rounded-xl p-3">
            <p className="text-xs opacity-80">Collected</p>
            <p className="text-xl font-bold">₹{totalCollected.toLocaleString('en-IN')}</p>
          </div>
          <div className="bg-amber-500 text-white rounded-xl p-3">
            <p className="text-xs opacity-80">Outstanding</p>
            <p className="text-xl font-bold">₹{totalOutstanding.toLocaleString('en-IN')}</p>
          </div>
        </div>

        {/* Status filter */}
        <input value={feeSearch} onChange={e=>setFeeSearch(e.target.value)}
          placeholder="Search by student name…"
          className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-chess-blue"/>
        <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
          {['','Pending','Overdue','Partial','Paid','Waived'].map(s=>(
            <button key={s} onClick={()=>setFilter(s)}
              className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors
                ${filter===s?'bg-navy text-white':'bg-gray-100 text-gray-600'}`}>
              {s||'All'} ({s?fees.filter(f=>f.paymentStatus===s).length:fees.length})
            </button>
          ))}
        </div>

        {visible.length===0 && (
          <div className="text-center py-10 text-gray-400"><p className="text-3xl mb-2">💰</p><p>No fee entries yet.</p></div>
        )}

        {visible.map((f,i) => {
          const link = waLink(f.studentName, f);
          const isPaid = f.paymentStatus==='Paid'||f.paymentStatus==='Waived';
          return (
            <div key={i} className={`bg-white rounded-xl shadow-sm border overflow-hidden
              ${f.paymentStatus==='Overdue'?'border-red-200':f.paymentStatus==='Paid'?'border-green-100':'border-gray-100'}`}>
              {/* Student name banner */}
              <div className={`px-4 py-2 flex items-center justify-between
                ${f.paymentStatus==='Paid'?'bg-green-50':f.paymentStatus==='Overdue'?'bg-red-50':'bg-gray-50'}`}>
                <p className="font-bold text-gray-900 text-base">{f.studentName}</p>
                <span className={STATUS_COLOR[f.paymentStatus]??'badge-gray'}>{f.paymentStatus}</span>
              </div>
              {/* Fee details */}
              <div className="px-4 py-3">
                <p className="text-sm text-gray-600">{f.feeType}{f.feeMonth?` · ${f.feeMonth}`:''}</p>
                <div className="flex gap-4 mt-1 text-sm">
                  <span className="text-gray-500">Due: <strong>₹{f.amountDue}</strong></span>
                  <span className="text-green-700">Paid: <strong>₹{f.amountPaid||'0'}</strong></span>
                  {parseFloat(f.balance)>0 && <span className="text-red-600 font-bold">Bal: ₹{f.balance}</span>}
                </div>
                {/* Action buttons */}
                <div className="flex gap-2 mt-3">
                  {!isPaid && (
                    <button onClick={()=>markPaid(f)} disabled={marking===f.rowIndex}
                      className="flex-1 bg-green-500 text-white text-sm font-semibold py-2 rounded-xl disabled:opacity-50">
                      {marking===f.rowIndex?'…':'✓ Mark Paid'}
                    </button>
                  )}
                  {!isPaid && link && (
                    <a href={link} target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-1 bg-green-100 text-green-800 text-sm font-medium px-3 py-2 rounded-xl">
                      💬 WhatsApp
                    </a>
                  )}
                  <button onClick={()=>{setEditTarget(f);setForm(feeToForm(f));}}
                    className="px-3 py-2 bg-gray-100 text-gray-600 rounded-xl text-sm">
                    ✏️
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {showAdd&&<FeeModal title="Add Payment" onClose={()=>setShowAdd(false)} form={form} setForm={setForm} students={students} onSave={handleAdd} saving={saving} disabled={!form.studentName||!form.amountDue} coachName={coachName}/>}
      {editTarget&&<FeeModal title="Edit Payment" onClose={()=>setEditTarget(null)} form={form} setForm={setForm} students={students} onSave={handleEdit} saving={saving} disabled={!form.studentName} coachName={coachName}/>}
    </Layout>
  );
}

function FeeModal({title,onClose,form,setForm,students,onSave,saving,disabled,coachName}:
  {title:string;onClose:()=>void;form:FeeForm;setForm:(f:FeeForm)=>void;students:string[];onSave:()=>void;saving:boolean;disabled:boolean;coachName:string}) {
  const u=(k:keyof FeeForm)=>(e:React.ChangeEvent<HTMLInputElement|HTMLSelectElement>)=>setForm({...form,[k]:e.target.value});
  return (
    <div className="fixed inset-0 bg-black/50 flex items-end z-50" onClick={onClose}>
      <div className="bg-white w-full rounded-t-2xl p-5 max-h-[90vh] overflow-y-auto" onClick={e=>e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-bold text-lg text-navy">{title}</h2>
          <button onClick={onClose} className="text-gray-400 text-2xl leading-none">×</button>
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
        <button onClick={onSave} disabled={saving||disabled} className="w-full bg-navy text-white py-3 rounded-xl font-semibold mt-4 disabled:opacity-50">
          {saving?'Saving…':'💾 Save'}
        </button>
      </div>
    </div>
  );
}
function F({label,children}:{label:string;children:React.ReactNode}) {
  return <div><label className="text-xs font-medium text-gray-500 mb-1 block">{label}</label>{children}</div>;
}

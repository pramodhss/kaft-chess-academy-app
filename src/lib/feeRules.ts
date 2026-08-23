import { parseSheetNumber } from './values';

export interface FeeDraft {
  paid: boolean;
  amountDue: string;
  amountPaid: string;
}

interface ExistingFee {
  paymentStatus: string;
  amountPaid: string;
}

export interface RosterPayment {
  amountPaid: number;
  balance: number;
  status: string;
}

export function calculateFeeBalance(amountDue: number, amountPaid: number, status: string): number {
  return status === 'Waived' ? 0 : Math.max(amountDue - amountPaid, 0);
}

export function normalizeFeeMonth(value: string): string {
  const month = value.trim().toLocaleLowerCase();
  const iso = /^(\d{4})-(\d{1,2})(?:-\d{1,2})?$/.exec(month);
  if (iso) return `${iso[1]}-${iso[2].padStart(2, '0')}`;
  const named = /^([a-z]+)[ -]+(\d{4})$/.exec(month);
  if (!named) return month;
  const monthIndex = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
    .indexOf(named[1].slice(0, 3));
  return monthIndex < 0 ? month : `${named[2]}-${String(monthIndex + 1).padStart(2, '0')}`;
}

export function calculateRosterPayment(
  existing: ExistingFee | undefined,
  draft: FeeDraft,
  amountDue: number,
): RosterPayment {
  let amountPaid = draft.paid ? amountDue : parseSheetNumber(draft.amountPaid);
  if (existing?.paymentStatus === 'Waived' && draft.paid) {
    amountPaid = parseSheetNumber(existing.amountPaid);
  }

  let status = 'Pending';
  if (amountPaid >= amountDue) status = 'Paid';
  else if (amountPaid > 0) status = 'Partial';
  if (existing?.paymentStatus === 'Waived' && draft.paid) status = 'Waived';
  if (existing?.paymentStatus === 'Overdue' && amountPaid < amountDue) status = 'Overdue';

  return {
    amountPaid,
    balance: calculateFeeBalance(amountDue, amountPaid, status),
    status,
  };
}
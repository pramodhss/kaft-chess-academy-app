/**
 * Dynamic Schema and Column Header Mapper.
 * Prevents positional index breakages if columns are reordered or added in Google Sheets.
 */

import { normalizeDateInput } from './dates';
import type { Student, FeeEntry } from '../types';

export type HeaderIndexMap = Record<string, number>;

export function createHeaderMap(headers: string[] = []): HeaderIndexMap {
  const map: HeaderIndexMap = {};
  headers.forEach((header, idx) => {
    if (typeof header === 'string') {
      const clean = header.trim().toLowerCase();
      if (clean) map[clean] = idx;
    }
  });
  return map;
}

export function getCellValue(
  row: string[],
  map: HeaderIndexMap | null | undefined,
  possibleHeaders: string | string[],
  fallbackIndex = 0,
): string {
  if (!row) return '';
  if (map) {
    const headerList = Array.isArray(possibleHeaders) ? possibleHeaders : [possibleHeaders];
    for (const header of headerList) {
      const key = header.trim().toLowerCase();
      if (map[key] !== undefined && row[map[key]] !== undefined) {
        return row[map[key]] ?? '';
      }
    }
  }
  return row[fallbackIndex] ?? '';
}

export function parseStudentRow(
  row: string[],
  rowIndex: number,
  headerMap?: HeaderIndexMap,
): Student {
  const get = (headers: string | string[], fallback: number) =>
    getCellValue(row, headerMap, headers, fallback);

  return {
    name: get(['Full Name', 'Name', 'Student Name'], 0),
    dob: normalizeDateInput(get(['DOB', 'Date of Birth', 'Birth Date'], 1)),
    age: get(['Age'], 2),
    gender: get(['Gender', 'Sex'], 3),
    grade: get(['Grade / School', 'Grade', 'Class'], 4),
    batch: get(['Batch', 'Group'], 5),
    level: get(['Level'], 6),
    joiningDate: normalizeDateInput(get(['Joining Date', 'Joined Date', 'Admission Date'], 7)),
    status: get(['Status'], 8) || 'Active',
    parent1Name: get(['Parent Name', 'Parent 1 Name', 'Guardian Name', 'Father Name', 'Mother Name'], 9),
    parent1Phone: get(['Parent Phone', 'Parent 1 Phone', 'Phone', 'Mobile'], 10),
    parent1WhatsApp: get(['Parent WhatsApp', 'WhatsApp', 'Parent 1 WhatsApp'], 11),
    parent1Email: get(['Parent Email', 'Email', 'Parent 1 Email'], 12),
    parent2Name: get(['Parent 2 Name', 'Father Name', 'Mother Name'], 13),
    parent2Phone: get(['Parent 2 Phone', 'Secondary Phone'], 14),
    emergencyContact: get(['Emergency Contact', 'Emergency Name'], 15),
    emergencyPhone: get(['Emergency Phone', 'Emergency Mobile'], 16),
    address: get(['Address', 'Home Address', 'Location'], 17),
    photoConsent: get(['Photo Consent'], 18) || 'Yes',
    thisMonthAttended: get(['This Month Attended', 'Attended', 'Monthly Attendance'], 19),
    notes: get(['Notes', 'Remarks'], 20),
    school: get(['School', 'School Name'], 21),
    standard: get(['Standard', 'Standard / Class'], 22),
    tnscaId: get(['TNSCA ID', 'TNSCA'], 23),
    fideId: get(['FIDE ID', 'FIDE'], 24),
    aicfId: get(['AICF ID', 'AICF'], 25),
    ratingClassical: get(['Classical Rating', 'Classical'], 26),
    ratingRapid: get(['Rapid Rating', 'Rapid'], 27),
    ratingBlitz: get(['Blitz Rating', 'Blitz'], 28),
    coachName: get(['Coach Name', 'Assigned Coach', 'Coach'], 29),
    chessComUsername: get(['Chess.com Username', 'Chess.com', 'ChessCom'], 30),
    lichessUsername: get(['Lichess Username', 'Lichess'], 31),
    photoUrl: get(['Photo URL', 'Photo'], 32),
    rowIndex,
  };
}

export function parseFeeRow(
  row: string[],
  rowIndex: number,
  headerMap?: HeaderIndexMap,
): FeeEntry {
  const get = (headers: string | string[], fallback: number) =>
    getCellValue(row, headerMap, headers, fallback);

  return {
    receiptNo: get(['Receipt No', 'Receipt', 'Receipt #', 'Invoice No'], 0),
    studentName: get(['Student Name', 'Name', 'Student'], 1),
    batch: get(['Batch', 'Group'], 2),
    feeMonth: get(['Fee Month', 'Month'], 3),
    feeType: get(['Fee Type', 'Type'], 4) || 'Monthly Tuition',
    amountDue: get(['Amount Due', 'Due Amount', 'Total Due', 'Due'], 5),
    amountPaid: get(['Amount Paid', 'Paid Amount', 'Paid'], 6),
    balance: get(['Balance', 'Pending', 'Remaining'], 7),
    dueDate: get(['Due Date'], 8),
    paymentDate: get(['Payment Date', 'Paid Date', 'Date'], 9),
    paymentMethod: get(['Payment Method', 'Method', 'Mode'], 10) || 'UPI',
    paymentStatus: get(['Payment Status', 'Status'], 11) || 'Pending',
    reference: get(['Reference No', 'Reference', 'Ref #', 'Transaction ID'], 12),
    notes: get(['Notes', 'Remarks'], 13),
    rowIndex,
  };
}

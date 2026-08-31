import { describe, expect, it } from 'vitest';
import { createHeaderMap, getCellValue, parseFeeRow, parseStudentRow } from './schemaMapper';

describe('schemaMapper', () => {
  it('creates case-insensitive header mapping', () => {
    const map = createHeaderMap(['Full Name', 'DOB', 'Batch', 'Coach Name']);
    expect(map['full name']).toBe(0);
    expect(map['dob']).toBe(1);
    expect(map['batch']).toBe(2);
    expect(map['coach name']).toBe(3);
  });

  it('retrieves cell values using header name synonyms', () => {
    const map = createHeaderMap(['Student Name', 'Parent 1 Phone', 'Batch']);
    const row = ['Aarav Kumar', '9876543210', 'Beginner'];
    expect(getCellValue(row, map, ['Name', 'Student Name', 'Full Name'], 0)).toBe('Aarav Kumar');
    expect(getCellValue(row, map, ['Parent Phone', 'Parent 1 Phone', 'Phone'], 10)).toBe('9876543210');
  });

  it('correctly maps student even when columns are reordered in Google Sheets', () => {
    // Custom order: Batch (0), Full Name (1), Parent Phone (2), DOB (3), Status (4)
    const headers = ['Batch', 'Full Name', 'Parent Phone', 'DOB', 'Status'];
    const map = createHeaderMap(headers);
    const row = ['Advanced', 'Ishva S', '9988776655', '2010-06-15', 'Active'];

    const student = parseStudentRow(row, 5, map);
    expect(student.name).toBe('Ishva S');
    expect(student.batch).toBe('Advanced');
    expect(student.parent1Phone).toBe('9988776655');
    expect(student.dob).toBe('2010-06-15');
    expect(student.status).toBe('Active');
    expect(student.rowIndex).toBe(5);
  });

  it('correctly maps fee rows with dynamic headers', () => {
    const headers = ['Receipt No', 'Student Name', 'Amount Due', 'Amount Paid', 'Fee Month'];
    const map = createHeaderMap(headers);
    const row = ['KAFT-202608-001', 'Diya Shah', '1500', '1500', '2026-08'];

    const fee = parseFeeRow(row, 2, map);
    expect(fee.receiptNo).toBe('KAFT-202608-001');
    expect(fee.studentName).toBe('Diya Shah');
    expect(fee.amountDue).toBe('1500');
    expect(fee.amountPaid).toBe('1500');
    expect(fee.feeMonth).toBe('2026-08');
  });
});

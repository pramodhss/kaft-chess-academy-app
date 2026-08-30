import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { parseExcelOrCsvFile } from './excelStudentImport';

describe('parseExcelOrCsvFile', () => {
  it('parses student records from an Excel workbook and normalizes fields', async () => {
    const wb = XLSX.utils.book_new();
    const studentData = [
      ['Name', 'Parent Name', 'Contact Number', 'DOB', 'TNSCA ID'],
      ['Ashika', 'Senthilkumar', '7539 35723', '16/11/2012', '8829 CUD 2026'],
      ['Vetrivel', 'Shanmugam', '9443497631', '21/10/2016', '4487 CUD 2026'],
      ['[Unclear]', 'Rajkumar', '8838425540', '21/04/2012', '4840 CUD 2025'],
    ];
    const ws = XLSX.utils.aoa_to_sheet(studentData);
    XLSX.utils.book_append_sheet(wb, ws, 'Student Details');

    const buffer = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
    const results = await parseExcelOrCsvFile(buffer, 'Coach Meera');

    expect(results).toHaveLength(3);
    expect(results[0].name).toBe('Ashika');
    expect(results[0].parent1Name).toBe('Senthilkumar');
    expect(results[0].dob).toBe('2012-11-16');
    expect(results[0].parent1Phone).toHaveLength(10);
    expect(results[0].tnscaId).toBe('8829 CUD 2026');

    expect(results[1].name).toBe('Vetrivel');
    expect(results[1].dob).toBe('2016-10-21');
    expect(results[1].parent1Phone).toBe('9443497631');

    // Replaced [Unclear] with parent placeholder name
    expect(results[2].name).toBe('Student Rajkumar');
    expect(results[2].dob).toBe('2012-04-21');
  });

  it('handles duplicate student names in imported files by disambiguating with parent or index', async () => {
    const wb = XLSX.utils.book_new();
    const studentData = [
      ['Name', 'Parent Name', 'Contact Number', 'DOB'],
      ['Ashika', 'Senthilkumar', '7539 35723', '16/11/2012'],
      ['Ashika', 'Shanmugam', '868899562', '11/06/2014'],
      ['[Unclear]', 'Sathyanarayanan', '9607819952', '18/01/2012'],
      ['[Unclear]', 'Sathyanarayanan', '9607819952', '02/04/2014'],
    ];
    const ws = XLSX.utils.aoa_to_sheet(studentData);
    XLSX.utils.book_append_sheet(wb, ws, 'Student Details');
    const buffer = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
    const results = await parseExcelOrCsvFile(buffer, 'Coach Meera');

    expect(results).toHaveLength(4);
    const names = results.map(r => r.name);
    const uniqueNames = new Set(names.map(n => n.toLowerCase()));
    expect(uniqueNames.size).toBe(4);
  });
});

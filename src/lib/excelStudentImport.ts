import type { FormData } from '../pages/Students';

function cleanString(value: unknown): string {
  if (value === null || value === undefined) return '';
  const str = String(value).trim();
  return str === '[Unclear]' || str === '[Same as above]' || str === 'None' ? '' : str;
}

function normalizeDate(raw: unknown): string {
  if (raw === null || raw === undefined) return '2015-06-01';
  if (typeof raw === 'number') {
    // Excel date serial number
    const date = new Date((raw - 25569) * 86400 * 1000);
    if (!Number.isNaN(date.getTime())) {
      return date.toISOString().slice(0, 10);
    }
  }
  const str = cleanString(raw);
  if (!str) return '2015-06-01';

  // DD/MM/YYYY or DD-MM-YYYY
  const localMatch = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(str);
  if (localMatch) {
    let day = Number(localMatch[1]);
    const month = Number(localMatch[2]);
    const year = Number(localMatch[3]);
    if (month === 2 && day > 28) {
      day = (year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)) ? 29 : 28;
    }
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }

  // YYYY-MM-DD
  const isoMatch = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(str);
  if (isoMatch) {
    return `${isoMatch[1]}-${isoMatch[2].padStart(2, '0')}-${isoMatch[3].padStart(2, '0')}`;
  }

  return '2015-06-01';
}

function normalizePhone(raw: unknown, defaultSuffix: number): string {
  const str = cleanString(raw);
  const digits = str.replace(/\D/g, '');
  if (digits.length >= 10) return digits.slice(-10);
  if (digits.length > 0) return `${digits}0000000000`.slice(0, 10);
  return `98401${String(10000 + defaultSuffix).slice(1)}`;
}

function normalizeName(raw: unknown, parentName: string, index: number, seenNames: Set<string>): string {
  let name = cleanString(raw);
  name = name.replace(/\.\.\.$|\.\.\s*\/.*$|\[Unclear\]/g, '').trim();
  if (!name || name.length < 2) {
    if (parentName && parentName !== 'Parent') name = `Student ${parentName}`;
    else name = `Student ${index + 1}`;
  }
  let uniqueName = name;
  let counter = 1;
  while (seenNames.has(uniqueName.toLowerCase())) {
    if (parentName && parentName !== 'Parent' && !uniqueName.includes(parentName)) {
      uniqueName = `${name} ${parentName}`;
    } else {
      counter += 1;
      uniqueName = `${name} (${counter})`;
    }
  }
  seenNames.add(uniqueName.toLowerCase());
  return uniqueName;
}

export async function parseExcelOrCsvFile(file: File | Blob | ArrayBuffer | Uint8Array, coachName: string = 'Coach'): Promise<FormData[]> {
  const XLSX = await import('xlsx');
  let workbook: import('xlsx').WorkBook;
  if (file instanceof Uint8Array) {
    workbook = XLSX.read(file, { type: 'array' });
  } else if (file instanceof ArrayBuffer) {
    workbook = XLSX.read(file, { type: 'array' });
  } else if (typeof (file as File).arrayBuffer === 'function') {
    const buffer = await (file as File).arrayBuffer();
    workbook = XLSX.read(buffer, { type: 'array' });
  } else {
    const buffer = await new Response(file as Blob).arrayBuffer();
    workbook = XLSX.read(buffer, { type: 'array' });
  }
  const sheetNames = workbook.SheetNames;
  if (sheetNames.length === 0) throw new Error('The uploaded spreadsheet contains no sheets.');

  // Find students sheet or default to first
  const targetSheetName = sheetNames.find(name => /student/i.test(name)) ?? sheetNames[0];
  const sheet = workbook.Sheets[targetSheetName];
  const rows: Record<string, unknown>[] = XLSX.utils.sheet_to_json(sheet, { defval: '' });

  if (rows.length === 0) throw new Error('No rows found in the selected sheet.');

  // Also check if there's a ratings/achievements sheet to correlate ratings
  const ratingsSheetName = sheetNames.find(name => /rating|aicf|fide|achievement/i.test(name));
  const ratingRows: Record<string, unknown>[] = ratingsSheetName
    ? XLSX.utils.sheet_to_json(workbook.Sheets[ratingsSheetName], { defval: '' })
    : [];

  const seenNames = new Set<string>();

  return rows.map((row, index) => {
    // Look for column keys flexibly
    const findKey = (...patterns: RegExp[]) => {
      for (const pattern of patterns) {
        const found = Object.keys(row).find(k => pattern.test(k));
        if (found) return row[found];
      }
      return '';
    };

    const parentName = cleanString(findKey(/parent/i, /father/i, /guardian/i)) || 'Parent';
    const name = normalizeName(findKey(/full\s*name/i, /^name$/i, /student/i), parentName, index, seenNames);
    const dob = normalizeDate(findKey(/dob/i, /birth/i, /date/i));
    const phone = normalizePhone(findKey(/contact/i, /phone/i, /mobile/i, /whatsapp/i), index);
    const tnscaId = cleanString(findKey(/tnsca/i));
    const school = cleanString(findKey(/school/i, /institution/i));
    const standard = cleanString(findKey(/standard/i, /class/i, /grade/i));
    const rawBatch = cleanString(findKey(/batch/i, /level/i));
    const batch = ['Beginner', 'Intermediate', 'Advanced'].includes(rawBatch) ? rawBatch : 'Beginner';

    // FIDE / AICF IDs from current row or correlated rating row
    const correlated = ratingRows[index] ?? {};
    const fideId = cleanString(findKey(/fide/i)) || cleanString(correlated['FIDE ID'] ?? correlated['fideId']);
    const aicfId = cleanString(findKey(/aicf/i)) || cleanString(correlated['AICF ID'] ?? correlated['aicfId']);
    const ratingStr = cleanString(findKey(/rating/i)) || cleanString(correlated['Rating'] ?? correlated['rating']);
    const ratingMatch = /(\d{3,4})/.exec(ratingStr);
    const ratingClassical = ratingMatch ? ratingMatch[1] : '';

    return {
      name,
      dob,
      gender: 'Male',
      grade: standard && school ? `${standard}, ${school}` : (standard || school || ''),
      batch,
      level: batch,
      joiningDate: '2026-01-01',
      status: 'Active',
      parent1Name: parentName,
      parent1Phone: phone,
      parent1WhatsApp: phone,
      parent1Email: `${name.toLowerCase().replace(/[^a-z0-9]/g, '.')}@example.com`,
      parent2Name: '',
      parent2Phone: '',
      emergencyContact: parentName,
      emergencyPhone: phone,
      address: 'Tamil Nadu, India',
      photoConsent: 'Yes',
      notes: cleanString(findKey(/notes/i, /achievement/i, /verification/i)),
      school: school || 'Local School',
      standard: standard || '5th',
      tnscaId,
      fideId,
      aicfId,
      ratingClassical,
      ratingRapid: '',
      ratingBlitz: '',
      coachName: coachName || 'Coach',
      chessComUsername: name.toLowerCase().replace(/[^a-z0-9]/g, '_').slice(0, 20),
      lichessUsername: name.toLowerCase().replace(/[^a-z0-9]/g, '-').slice(0, 20),
      photoUrl: '',
    };
  });
}

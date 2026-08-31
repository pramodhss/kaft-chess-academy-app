import { TABS } from '../config';
import { appendRows, batchWriteRanges, readSheetLive } from './sheets';
import type { SheetValue } from './sheets';

export interface StudentLink {
  name: string;
  batch: string;
  level: string;
  parentName: string;
}

interface SyncTarget {
  range: string;
  nameIndex: number;
  nameColumn: string;
  batchColumn?: string;
  levelColumn?: string;
  parentColumn?: string;
}

const TARGETS: SyncTarget[] = [
  { range: `'${TABS.ATTENDANCE}'!A:B`, nameIndex: 0, nameColumn: 'A', batchColumn: 'B' },
  { range: `'${TABS.FEES}'!B:C`, nameIndex: 0, nameColumn: 'B', batchColumn: 'C' },
  { range: `'${TABS.TOURNAMENTS}'!B:D`, nameIndex: 0, nameColumn: 'B', batchColumn: 'C', levelColumn: 'D' },
  { range: `'${TABS.VAN}'!B:D`, nameIndex: 0, nameColumn: 'B', batchColumn: 'C', parentColumn: 'D' },
  { range: `'${TABS.MONTHLY_ATT}'!A:A`, nameIndex: 0, nameColumn: 'A' },
  { range: `'${TABS.METRICS}'!A:C`, nameIndex: 0, nameColumn: 'A', batchColumn: 'C' },
];

function normalizedName(value: string): string {
  return value.trim().toLocaleLowerCase();
}

function matchingUpdates(target: SyncTarget, rows: string[][], previous: StudentLink, next: StudentLink) {
  const previousName = normalizedName(previous.name);
  return rows.slice(1).flatMap((row, index) => {
    if (normalizedName(row[target.nameIndex] ?? '') !== previousName) return [];
    const rowNumber = index + 2;
    const tabPrefix = target.range.slice(0, target.range.indexOf('!') + 1);
    const updates = [{ range: `${tabPrefix}${target.nameColumn}${rowNumber}`, values: [[next.name]] }];
    if (target.batchColumn) updates.push({ range: `${tabPrefix}${target.batchColumn}${rowNumber}`, values: [[next.batch]] });
    if (target.levelColumn) updates.push({ range: `${tabPrefix}${target.levelColumn}${rowNumber}`, values: [[next.level]] });
    if (target.parentColumn) updates.push({ range: `${tabPrefix}${target.parentColumn}${rowNumber}`, values: [[next.parentName]] });
    return updates;
  });
}

async function ensureAttendanceStudent(token: string, sheetId: string, student: StudentLink) {
  const rows = await readSheetLive(token, sheetId, `'${TABS.ATTENDANCE}'!A:B`);
  const matchIndex = rows.slice(1).findIndex(row => normalizedName(row[0] ?? '') === normalizedName(student.name));
  if (matchIndex < 0) {
    await appendRows(token, sheetId, `'${TABS.ATTENDANCE}'!A:B`, [[student.name, student.batch]]);
    return;
  }
  const rowNumber = matchIndex + 2;
  if ((rows[rowNumber - 1]?.[1] ?? '').trim() !== student.batch) {
    await batchWriteRanges(token, sheetId, [{
      range: `'${TABS.ATTENDANCE}'!A${rowNumber}:B${rowNumber}`,
      values: [[student.name, student.batch]],
    }]);
  }
}

export async function syncStudentProfile(
  token: string,
  sheetId: string,
  masterRange: string,
  masterValues: SheetValue[],
  previous: StudentLink,
  next: StudentLink,
) {
  const targetRows = await Promise.all(TARGETS.map(target => readSheetLive(token, sheetId, target.range)));
  const attendanceExists = targetRows[0].slice(1)
    .some(row => normalizedName(row[0] ?? '') === normalizedName(previous.name));
  const dependentUpdates = TARGETS.flatMap((target, index) => matchingUpdates(target, targetRows[index], previous, next));
  await batchWriteRanges(token, sheetId, [
    { range: masterRange, values: [masterValues] },
    ...dependentUpdates,
  ]);
  if (attendanceExists) return true;
  try {
    await ensureAttendanceStudent(token, sheetId, next);
    return true;
  } catch {
    return false;
  }
}

const RECONCILE_INTERVAL_MS = 30 * 60 * 1000;

export async function reconcileAttendanceRoster(token: string, sheetId: string) {
  try {
    const lastKey = `att-reconciled-${sheetId}`;
    const last = Number(sessionStorage.getItem(lastKey) ?? 0);
    if (Date.now() - last < RECONCILE_INTERVAL_MS) return { added: 0, updated: 0 };
    sessionStorage.setItem(lastKey, String(Date.now()));
  } catch { /* sessionStorage unavailable in some private-mode browsers */ }
  const [studentRows, attendanceRows] = await Promise.all([
    readSheetLive(token, sheetId, `'${TABS.STUDENTS}'!A:I`),
    readSheetLive(token, sheetId, `'${TABS.ATTENDANCE}'!A:B`),
  ]);
  const activeStudents = studentRows.slice(1)
    .filter(row => row[0]?.trim() && (row[8] ?? 'Active').trim().toLocaleLowerCase() !== 'inactive')
    .map(row => ({ name: row[0].trim(), batch: row[5]?.trim() ?? '' }));
  const attendanceByName = new Map(
    attendanceRows.slice(1).map((row, index) => [normalizedName(row[0] ?? ''), { row, rowNumber: index + 2 }]),
  );
  const missing = activeStudents.filter(student => !attendanceByName.has(normalizedName(student.name)));
  const updates = activeStudents.flatMap(student => {
    const existing = attendanceByName.get(normalizedName(student.name));
    if (!existing || (existing.row[1] ?? '').trim() === student.batch) return [];
    return [{
      range: `'${TABS.ATTENDANCE}'!A${existing.rowNumber}:B${existing.rowNumber}`,
      values: [[student.name, student.batch]],
    }];
  });
  if (updates.length > 0) await batchWriteRanges(token, sheetId, updates);
  if (missing.length > 0) {
    await appendRows(token, sheetId, `'${TABS.ATTENDANCE}'!A:B`, missing.map(student => [student.name, student.batch]));
  }
  return { added: missing.length, updated: updates.length };
}
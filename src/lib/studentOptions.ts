import { TABS } from '../config';
import { createHeaderMap } from './schemaMapper';
import { appendRows, batchWriteRanges, clearSheetReadCache, ensureSheet, readSheet, readSheetLive } from './sheets';

export const DEFAULT_BATCHES = ['Beginner', 'Intermediate', 'Advanced'];
export const DEFAULT_COACHES = ['Coach Anand', 'Coach Meera', 'Coach Rajesh', 'Coach Ramesh'];
const DEFAULT_LEVELS = ['Beginner', 'Intermediate', 'Advanced'];

export type StudentOptionKey = 'student_batches' | 'student_levels' | 'student_coaches' | 'student_batch_coaches';

export interface VersionedOptions {
  values: string[];
  version: string;
}

export interface BatchCoachMapping {
  map: Record<string, string>;
  version: string;
}

export interface StudentOptions {
  batches: VersionedOptions;
  levels: VersionedOptions;
  coaches: VersionedOptions;
  batchCoaches: BatchCoachMapping;
}

const HEADERS = ['Key', 'Values JSON', 'Version', 'Base Version', 'Updated By', 'Updated At'];

function cleanValues(values: string[]) {
  const unique = new Map<string, string>();
  values.forEach(value => {
    const trimmed = value.trim();
    if (trimmed) unique.set(trimmed.toLocaleLowerCase(), trimmed);
  });
  return [...unique.values()];
}

function latestFor(rows: string[][], key: StudentOptionKey, defaults: string[]): VersionedOptions {
  for (let index = rows.length - 1; index >= 1; index -= 1) {
    if (rows[index][0] !== key) continue;
    try {
      const parsed = JSON.parse(rows[index][1] ?? '[]');
      if (!Array.isArray(parsed)) continue;
      const values = cleanValues(parsed.filter(value => typeof value === 'string'));
      if (values.length > 0) return { values, version: rows[index][2] ?? '' };
    } catch { /* ignore malformed historical settings rows */ }
  }
  return { values: [...defaults], version: '' };
}

function latestBatchCoaches(rows: string[][]): BatchCoachMapping {
  for (let index = rows.length - 1; index >= 1; index -= 1) {
    if (rows[index][0] !== 'student_batch_coaches') continue;
    try {
      const parsed = JSON.parse(rows[index][1] ?? '{}');
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return { map: parsed, version: rows[index][2] ?? '' };
      }
    } catch { /* ignore malformed historical settings rows */ }
  }
  return { map: {}, version: '' };
}

function parseOptions(rows: string[][]): StudentOptions {
  return {
    batches: latestFor(rows, 'student_batches', DEFAULT_BATCHES),
    levels: latestFor(rows, 'student_levels', DEFAULT_LEVELS),
    coaches: latestFor(rows, 'student_coaches', DEFAULT_COACHES),
    batchCoaches: latestBatchCoaches(rows),
  };
}

export async function ensureStudentOptionsSheet(token: string, sheetId: string) {
  await ensureSheet(token, sheetId, TABS.SETTINGS, HEADERS);
}

export async function loadStudentOptions(token: string, sheetId: string, live = false): Promise<StudentOptions> {
  try {
    const read = live ? readSheetLive : readSheet;
    return parseOptions(await read(token, sheetId, `'${TABS.SETTINGS}'!A:F`));
  } catch {
    return parseOptions([]);
  }
}

function defaultValuesFor(key: StudentOptionKey): string[] {
  if (key === 'student_batches') return DEFAULT_BATCHES;
  if (key === 'student_coaches') return DEFAULT_COACHES;
  return DEFAULT_LEVELS;
}

export async function saveStudentOptionList(
  token: string,
  sheetId: string,
  key: StudentOptionKey,
  values: string[],
  expectedVersion: string,
  coachName: string,
) {
  const cleaned = cleanValues(values);
  if (cleaned.length === 0) throw new Error('Keep at least one option.');

  await ensureStudentOptionsSheet(token, sheetId);
  const beforeRows = await readSheetLive(token, sheetId, `'${TABS.SETTINGS}'!A:F`);
  const defaults = defaultValuesFor(key);
  const current = latestFor(beforeRows, key, defaults);
  if (current.version !== expectedVersion) {
    throw new Error('SETTINGS_CONFLICT');
  }

  const version = crypto.randomUUID();
  await appendRows(token, sheetId, `'${TABS.SETTINGS}'!A:F`, [[
    key,
    JSON.stringify(cleaned),
    version,
    expectedVersion,
    coachName,
    new Date().toISOString(),
  ]]);

  const afterRows = await readSheetLive(token, sheetId, `'${TABS.SETTINGS}'!A:F`);
  const competingUpdates = afterRows.slice(1).filter(row => row[0] === key && row[3] === expectedVersion);
  const latest = latestFor(afterRows, key, defaults);
  return { latest, concurrentUpdate: competingUpdates.length > 1 || latest.version !== version };
}

export async function saveBatchCoachAssignments(
  token: string,
  sheetId: string,
  batchCoaches: Record<string, string>,
  expectedVersion: string,
  coachName: string,
) {
  await ensureStudentOptionsSheet(token, sheetId);
  const beforeRows = await readSheetLive(token, sheetId, `'${TABS.SETTINGS}'!A:F`);
  const current = latestBatchCoaches(beforeRows);
  if (current.version && expectedVersion && current.version !== expectedVersion) {
    throw new Error('SETTINGS_CONFLICT');
  }

  const version = crypto.randomUUID();
  await appendRows(token, sheetId, `'${TABS.SETTINGS}'!A:F`, [[
    'student_batch_coaches',
    JSON.stringify(batchCoaches),
    version,
    expectedVersion,
    coachName,
    new Date().toISOString(),
  ]]);

  return { version, concurrentUpdate: false };
}

function getColumnLetter(colIndex: number): string {
  let temp = colIndex;
  let letter = '';
  while (temp >= 0) {
    letter = String.fromCodePoint((temp % 26) + 65) + letter;
    temp = Math.floor(temp / 26) - 1;
  }
  return letter;
}

export async function syncBatchCoachesToStudents(
  token: string,
  sheetId: string,
  batchCoachMap: Record<string, string>,
): Promise<{ updatedCount: number; batchCounts: Record<string, number> }> {
  const studentRows = await readSheetLive(token, sheetId, `'${TABS.STUDENTS}'!A:AG`);
  if (studentRows.length <= 1) return { updatedCount: 0, batchCounts: {} };

  const headerMap = createHeaderMap(studentRows[0]);
  const coachColIndex = headerMap['coach name'] ?? headerMap['assigned coach'] ?? headerMap['coach'] ?? 29;
  const batchColIndex = headerMap['batch'] ?? headerMap['group'] ?? 5;
  const coachColLetter = getColumnLetter(coachColIndex);

  const updates: { range: string; values: string[][] }[] = [];
  const batchCounts: Record<string, number> = {};

  studentRows.slice(1).forEach((row, index) => {
    const rowNumber = index + 2;
    const studentBatch = (row[batchColIndex] ?? '').trim();
    if (!studentBatch) return;

    const matchedBatchKey = Object.keys(batchCoachMap).find(b => {
      const target = b.trim().toLowerCase();
      const sb = studentBatch.toLowerCase();
      return target && (sb === target || sb.startsWith(target));
    });

    if (matchedBatchKey && batchCoachMap[matchedBatchKey]) {
      const assignedCoach = batchCoachMap[matchedBatchKey].trim();
      const currentCoach = (row[coachColIndex] ?? '').trim();
      if (assignedCoach && currentCoach !== assignedCoach) {
        updates.push({
          range: `'${TABS.STUDENTS}'!${coachColLetter}${rowNumber}`,
          values: [[assignedCoach]],
        });
        batchCounts[matchedBatchKey] = (batchCounts[matchedBatchKey] ?? 0) + 1;
      }
    }
  });

  if (updates.length > 0) {
    await batchWriteRanges(token, sheetId, updates);
    clearSheetReadCache(sheetId);
  }

  return { updatedCount: updates.length, batchCounts };
}

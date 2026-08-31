import { TABS } from '../config';
import { appendRows, ensureSheet, readSheet, readSheetLive } from './sheets';

export const DEFAULT_BATCHES = ['Beginner', 'Intermediate', 'Advanced'];
export const DEFAULT_COACHES = ['Coach Anand', 'Coach Meera', 'Coach Rajesh', 'Coach Ramesh'];
const DEFAULT_LEVELS = ['Beginner', 'Intermediate', 'Advanced'];

export type StudentOptionKey = 'student_batches' | 'student_levels' | 'student_coaches';

export interface VersionedOptions {
  values: string[];
  version: string;
}

export interface StudentOptions {
  batches: VersionedOptions;
  levels: VersionedOptions;
  coaches: VersionedOptions;
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

function parseOptions(rows: string[][]): StudentOptions {
  return {
    batches: latestFor(rows, 'student_batches', DEFAULT_BATCHES),
    levels: latestFor(rows, 'student_levels', DEFAULT_LEVELS),
    coaches: latestFor(rows, 'student_coaches', DEFAULT_COACHES),
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

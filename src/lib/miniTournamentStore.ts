import { TABS } from '../config';
import { appendRows, batchWriteRanges, clearSheetReadCache, clearSheetRange, ensureSheet, ensureSheetColumns, readSheet, readSheetLive, writeRange } from './sheets';
import { applyRoundResults, createInitialHistory, type BoardPairing, type PairingHistory, type PairingParticipant } from './pairingEngine';

export interface MiniTournamentSession {
  sessionId: string;
  name: string;
  date: string;
  status: 'active' | 'completed';
  mode: 'individual' | 'team';
  teamSize: number;
  ratingMode: 'rated' | 'casual';
  format: 'practical' | 'swiss';
  totalRounds: number;
  participants: PairingParticipant[];
  rounds: BoardPairing[][];
  rowIndex: number;
}

export function historyFromSession(session: MiniTournamentSession): PairingHistory {
  let history = createInitialHistory(session.participants);
  session.rounds.forEach((round) => {
    const complete = round.every(
      (board) => board.black === null || board.result,
    );
    if (complete) history = applyRoundResults(history, round);
  });
  return history;
}

const HEADERS = ['Session ID', 'Name', 'Date', 'Status', 'Participants JSON', 'Rounds JSON', 'Created By', 'Updated At', 'Mode', 'Team Size', 'Rating Mode', 'Format', 'Total Rounds'];

function safeParseArray<T>(value: string | undefined): T[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed as T[] : [];
  } catch {
    return [];
  }
}

function rowToSession(row: string[], rowIndex: number): MiniTournamentSession {
  return {
    sessionId: row[0] ?? '',
    name: row[1] ?? '',
    date: row[2] ?? '',
    status: row[3] === 'completed' ? 'completed' : 'active',
    mode: row[8] === 'team' ? 'team' : 'individual',
    teamSize: Number(row[9]) || 2,
    ratingMode: row[10] === 'casual' ? 'casual' : 'rated',
    format: row[11] === 'swiss' ? 'swiss' : 'practical',
    totalRounds: Math.max(1, Number(row[12]) || 3),
    participants: safeParseArray<PairingParticipant>(row[4]),
    rounds: safeParseArray<BoardPairing[]>(row[5]),
    rowIndex,
  };
}

export async function ensureMiniTournamentSheet(token: string, sheetId: string): Promise<void> {
  await ensureSheet(token, sheetId, TABS.MINI_TOURNAMENTS, HEADERS);
  await ensureSheetColumns(token, sheetId, TABS.MINI_TOURNAMENTS, HEADERS.length);
  const header = await readSheetLive(token, sheetId, `'${TABS.MINI_TOURNAMENTS}'!K1:M1`);
  if (!header[0]?.[0] || !header[0]?.[1] || !header[0]?.[2]) {
    await writeRange(token, sheetId, `'${TABS.MINI_TOURNAMENTS}'!K1:M1`, [['Rating Mode', 'Format', 'Total Rounds']]);
  }
}

export async function loadMiniTournamentSessions(token: string, sheetId: string, live = false): Promise<MiniTournamentSession[]> {
  const read = live ? readSheetLive : readSheet;
  const rows = await read(token, sheetId, `'${TABS.MINI_TOURNAMENTS}'!A:M`);
  return rows.slice(1).map((row, index) => rowToSession(row, index + 2)).filter(session => session.sessionId);
}

export async function createMiniTournamentSession(
  token: string,
  sheetId: string,
  session: Omit<MiniTournamentSession, 'rowIndex'>,
  createdBy: string,
): Promise<number> {
  const rowIndex = await appendRows(token, sheetId, `'${TABS.MINI_TOURNAMENTS}'!A:M`, [[
    session.sessionId, session.name, session.date, session.status,
    JSON.stringify(session.participants), JSON.stringify(session.rounds),
    createdBy, new Date().toISOString(), session.mode, session.teamSize, session.ratingMode, session.format, session.totalRounds,
  ]]);
  clearSheetReadCache(sheetId);
  return rowIndex;
}

export async function updateMiniTournamentDetails(token: string, sheetId: string, session: MiniTournamentSession): Promise<void> {
  await batchWriteRanges(token, sheetId, [
    { range: `'${TABS.MINI_TOURNAMENTS}'!B${session.rowIndex}:C${session.rowIndex}`, values: [[session.name, session.date]] },
    { range: `'${TABS.MINI_TOURNAMENTS}'!I${session.rowIndex}:M${session.rowIndex}`, values: [[session.mode, session.teamSize, session.ratingMode, session.format, session.totalRounds]] },
  ]);
  clearSheetReadCache(sheetId);
}

export async function deleteMiniTournamentSession(token: string, sheetId: string, rowIndex: number): Promise<void> {
  await clearSheetRange(token, sheetId, `'${TABS.MINI_TOURNAMENTS}'!A${rowIndex}:M${rowIndex}`);
  clearSheetReadCache(sheetId);
}

export async function saveMiniTournamentSession(token: string, sheetId: string, session: MiniTournamentSession): Promise<void> {
  await batchWriteRanges(token, sheetId, [
    { range: `'${TABS.MINI_TOURNAMENTS}'!D${session.rowIndex}:F${session.rowIndex}`, values: [[
      session.status, JSON.stringify(session.participants), JSON.stringify(session.rounds),
    ]] },
    { range: `'${TABS.MINI_TOURNAMENTS}'!H${session.rowIndex}`, values: [[new Date().toISOString()]] },
  ]);
  clearSheetReadCache(sheetId);
}

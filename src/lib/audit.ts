import { appendRows, ensureSheet } from './sheets';
import { SHEET_ID, TABS } from '../config';

const HEADERS = ['Timestamp', 'Editor', 'Action', 'Area', 'Record', 'Details'];

export async function recordAudit(token: string, action: string, area: string, record: string, details = '') {
  const stored = localStorage.getItem('chess_auth');
  const email = stored ? (JSON.parse(stored).email ?? '') : '';
  await ensureSheet(token, SHEET_ID, TABS.AUDIT, HEADERS);
  await appendRows(token, SHEET_ID, `'${TABS.AUDIT}'!A:F`, [[new Date().toISOString(), email, action, area, record, details]]);
}
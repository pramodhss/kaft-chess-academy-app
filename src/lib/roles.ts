import { appendRows, ensureSheet, readSheetLive } from './sheets';
import { TABS } from '../config';

export type AppRole = 'admin' | 'coach' | 'finance' | 'transport' | 'viewer';
export interface RoleEntry { email: string; role: AppRole }
const HEADERS = ['Key', 'Values JSON', 'Version', 'Base Version', 'Updated By', 'Updated At'];

export async function loadRoles(token: string, sheetId: string): Promise<RoleEntry[]> {
  try {
    const rows = await readSheetLive(token, sheetId, `'${TABS.SETTINGS}'!A:F`);
    for (let index = rows.length - 1; index >= 1; index -= 1) {
      if (rows[index][0] !== 'user_roles') continue;
      const parsed = JSON.parse(rows[index][1] ?? '{}') as Record<string, AppRole>;
      return Object.entries(parsed).map(([email, role]) => ({ email, role }));
    }
  } catch { /* an unconfigured installation defaults existing users to admin */ }
  return [];
}

export async function saveRoles(token: string, sheetId: string, roles: RoleEntry[], updatedBy: string) {
  await ensureSheet(token, sheetId, TABS.SETTINGS, HEADERS);
  const values = Object.fromEntries(roles.filter(entry => entry.email.trim()).map(entry => [entry.email.trim().toLowerCase(), entry.role]));
  await appendRows(token, sheetId, `'${TABS.SETTINGS}'!A:F`, [['user_roles', JSON.stringify(values), crypto.randomUUID(), '', updatedBy, new Date().toISOString()]]);
}
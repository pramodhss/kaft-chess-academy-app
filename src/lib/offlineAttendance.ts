import { batchWrite, readSheetLive, type SheetValue } from './sheets';

const KEY = 'kaft_attendance_queue_v1';
const MAX_QUEUED_UPDATES = 1_000;
export interface QueuedAttendanceUpdate { range: string; base: boolean; value: boolean }
interface QueueItem { id: string; createdAt: string; updates: QueuedAttendanceUpdate[] }

function loadQueue(): QueueItem[] { try { return JSON.parse(localStorage.getItem(KEY) ?? '[]') as QueueItem[]; } catch { return []; } }
function saveQueue(items: QueueItem[]) { localStorage.setItem(KEY, JSON.stringify(items)); window.dispatchEvent(new Event('kaft-attendance-queue')); }
export function queuedAttendanceCount(): number { return loadQueue().reduce((total, item) => total + item.updates.length, 0); }
export function queueAttendance(updates: QueuedAttendanceUpdate[]) {
  const compacted = new Map<string, QueuedAttendanceUpdate>();
  for (const update of [...loadQueue().flatMap(item => item.updates), ...updates]) {
    const existing = compacted.get(update.range);
    const merged = existing ? { ...existing, value: update.value } : update;
    if (merged.value === merged.base) compacted.delete(update.range);
    else compacted.set(update.range, merged);
  }
  if (compacted.size > MAX_QUEUED_UPDATES) throw new Error(`Offline Attendance is limited to ${MAX_QUEUED_UPDATES} pending cells. Reconnect and sync before saving more.`);
  const pending = Array.from(compacted.values());
  saveQueue(pending.length === 0 ? [] : [{ id: crypto.randomUUID(), createdAt: new Date().toISOString(), updates: pending }]);
}

export async function flushAttendanceQueue(token: string, sheetId: string): Promise<{ saved: number; conflicts: number }> {
  const updates = loadQueue().flatMap(item => item.updates);
  if (updates.length === 0) return { saved: 0, conflicts: 0 };
  const current = await Promise.all(updates.map(update => readSheetLive(token, sheetId, update.range)));
  const conflicts: QueuedAttendanceUpdate[] = [];
  const safe: QueuedAttendanceUpdate[] = [];
  updates.forEach((update, index) => {
    const liveValue = (current[index][0]?.[0] ?? '').toString().toUpperCase() === 'TRUE';
    (liveValue === update.base ? safe : conflicts).push(update);
  });
  if (safe.length > 0) await batchWrite(token, sheetId, safe.map(update => ({ range: update.range, value: update.value as SheetValue })));
  saveQueue(conflicts.length === 0 ? [] : [{ id: crypto.randomUUID(), createdAt: new Date().toISOString(), updates: conflicts }]);
  return { saved: safe.length, conflicts: conflicts.length };
}
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushAttendanceQueue, queueAttendance, queuedAttendanceCount } from './offlineAttendance';

describe('offline Attendance queue', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('replays a change when its live value still matches the baseline', async () => {
    queueAttendance([{ range: "'Weekend Attendance'!C2", base: false, value: true }]);
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({ values: [['FALSE']] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ totalUpdatedRows: 1 }), { status: 200 }));

    await expect(flushAttendanceQueue('token', 'sheet')).resolves.toEqual({ saved: 1, conflicts: 0 });
    expect(queuedAttendanceCount()).toBe(0);
    expect(fetchMock.mock.calls[1][1]?.method).toBe('POST');
  });

  it('preserves a queued change when the live value changed', async () => {
    queueAttendance([{ range: "'Weekend Attendance'!C2", base: false, value: true }]);
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ values: [['TRUE']] }), { status: 200 }));

    await expect(flushAttendanceQueue('token', 'sheet')).resolves.toEqual({ saved: 0, conflicts: 1 });
    expect(queuedAttendanceCount()).toBe(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('compacts repeated edits while preserving the original baseline', () => {
    queueAttendance([{ range: "'Weekend Attendance'!C2", base: false, value: true }]);
    queueAttendance([{ range: "'Weekend Attendance'!C2", base: true, value: false }]);
    expect(queuedAttendanceCount()).toBe(0);
  });

  it('syncs safe cells while retaining only conflicting cells', async () => {
    queueAttendance([
      { range: "'Weekend Attendance'!C2", base: false, value: true },
      { range: "'Weekend Attendance'!C3", base: false, value: true },
    ]);
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({ values: [['FALSE']] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ values: [['TRUE']] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ totalUpdatedRows: 1 }), { status: 200 }));

    await expect(flushAttendanceQueue('token', 'sheet')).resolves.toEqual({ saved: 1, conflicts: 1 });
    expect(queuedAttendanceCount()).toBe(1);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
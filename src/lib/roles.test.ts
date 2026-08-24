import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadRoles } from './roles';

describe('loadRoles', () => {
  afterEach(() => vi.restoreAllMocks());

  it('loads the newest versioned role mapping and normalizes it to entries', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ values: [
      ['Key', 'Values JSON'],
      ['user_roles', '{"old@example.com":"viewer"}'],
      ['user_roles', '{"admin@example.com":"admin","coach@example.com":"coach"}'],
    ] }), { status: 200 }));

    await expect(loadRoles('token', 'sheet')).resolves.toEqual([
      { email: 'admin@example.com', role: 'admin' },
      { email: 'coach@example.com', role: 'coach' },
    ]);
  });
});
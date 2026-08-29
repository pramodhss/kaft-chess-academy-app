import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchWeeklyOnlineTournament, weeklyTournamentWhatsAppMessage } from './weeklyOnlineTournament';

describe('weekly online tournament importer', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('loads and formats the first five final Lichess standings', async () => {
    const players = Array.from({ length: 6 }, (_, index) => ({ rank: index + 1, name: `Player ${index + 1}`, score: 10 - index }));
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      id: 'weekly123', fullName: 'KAFT Weekly Arena', isFinished: true, finishesAt: 1_725_000_000_000,
      standing: { players },
    }), { status: 200 })));

    const result = await fetchWeeklyOnlineTournament('https://lichess.org/weekly123');

    expect(result.name).toBe('KAFT Weekly Arena');
    expect(result.standings).toHaveLength(5);
    expect(result.standings[4]).toEqual({ rank: 5, playerName: 'Player 5', score: '6' });
    expect(weeklyTournamentWhatsAppMessage(result)).toContain('🥇 Player 1 - 10 points');
  });

  it('rejects unsupported tournament providers before fetching', async () => {
    await expect(fetchWeeklyOnlineTournament('https://chess-results.com/event')).rejects.toThrow('currently support completed Lichess arena or Swiss links');
  });

  it('uses the Swiss endpoint for Lichess Swiss links', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
      name: 'KAFT Swiss', status: 'finished', standing: { players: [{ rank: 1, name: 'Winner', score: 4 }] },
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response('{"rank":1,"username":"Winner","points":4}\n', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchWeeklyOnlineTournament('https://lichess.org/swiss/weekly123');

    expect(fetchMock).toHaveBeenCalledWith('https://lichess.org/api/swiss/weekly123', expect.any(Object));
    expect(fetchMock).toHaveBeenCalledWith('https://lichess.org/api/swiss/weekly123/results', expect.any(Object));
    expect(result.standings).toEqual([{ rank: 1, playerName: 'Winner', score: '4' }]);
  });
});
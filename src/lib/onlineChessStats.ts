export interface OnlineProfileRatings {
  chessCom: { rapid?: number; blitz?: number; bullet?: number; daily?: number };
  lichess: { rapid?: number; blitz?: number; bullet?: number; classical?: number };
}

export interface MonthlyOnlineStats {
  games: number;
  wins: number;
  draws: number;
  losses: number;
  ratingStart?: number;
  ratingEnd?: number;
  ratingDifference?: number;
}

function monthBounds(month: string) {
  const [year, monthNumber] = month.split('-').map(Number);
  const start = Date.UTC(year, monthNumber - 1, 1);
  const end = Date.UTC(year, monthNumber, 1) - 1;
  return { start, end };
}

function weekBounds(date: string) {
  const selected = new Date(`${date}T00:00:00Z`);
  const day = selected.getUTCDay();
  const startDate = new Date(selected);
  startDate.setUTCDate(selected.getUTCDate() - (day === 0 ? 6 : day - 1));
  const endDate = new Date(startDate);
  endDate.setUTCDate(startDate.getUTCDate() + 7);
  return { start: startDate.getTime(), end: endDate.getTime() - 1 };
}

function resultStats(results: { result: string; rating?: number }[]): MonthlyOnlineStats {
  const stats = results.reduce((current, item) => {
    const normalized = item.result.toLowerCase();
    if (normalized === 'win') current.wins += 1;
    else if (normalized === 'draw' || normalized === 'stalemate' || normalized === 'agreed') current.draws += 1;
    else if (normalized === 'loss' || normalized === 'checkmated' || normalized === 'timeout' || normalized === 'resigned') current.losses += 1;
    current.games += 1;
    if (typeof item.rating === 'number') {
      current.ratingStart ??= item.rating;
      current.ratingEnd = item.rating;
    }
    return current;
  }, { games: 0, wins: 0, draws: 0, losses: 0 } as MonthlyOnlineStats);
  if (stats.ratingStart !== undefined && stats.ratingEnd !== undefined) stats.ratingDifference = stats.ratingEnd - stats.ratingStart;
  return stats;
}

function addStats(left: MonthlyOnlineStats, right: MonthlyOnlineStats): MonthlyOnlineStats {
  const combined = {
    games: left.games + right.games,
    wins: left.wins + right.wins,
    draws: left.draws + right.draws,
    losses: left.losses + right.losses,
  };
  const ratingStart = left.ratingStart ?? right.ratingStart;
  const ratingEnd = right.ratingEnd ?? left.ratingEnd;
  return { ...combined, ratingStart, ratingEnd, ratingDifference: ratingStart !== undefined && ratingEnd !== undefined ? ratingEnd - ratingStart : undefined };
}

export async function fetchOnlineProfileRatings(chessComUsername: string, lichessUsername: string): Promise<OnlineProfileRatings> {
  const ratings: OnlineProfileRatings = { chessCom: {}, lichess: {} };
  await Promise.all([
    chessComUsername.trim() ? fetch(`https://api.chess.com/pub/player/${encodeURIComponent(chessComUsername.trim())}/stats`).then(response => response.ok ? response.json() : null).then(data => {
      ratings.chessCom = {
        rapid: data?.chess_rapid?.last?.rating,
        blitz: data?.chess_blitz?.last?.rating,
        bullet: data?.chess_bullet?.last?.rating,
        daily: data?.chess_daily?.last?.rating,
      };
    }).catch(() => undefined) : Promise.resolve(),
    lichessUsername.trim() ? fetch(`https://lichess.org/api/user/${encodeURIComponent(lichessUsername.trim())}`).then(response => response.ok ? response.json() : null).then(data => {
      ratings.lichess = {
        rapid: data?.perfs?.rapid?.rating,
        blitz: data?.perfs?.blitz?.rating,
        bullet: data?.perfs?.bullet?.rating,
        classical: data?.perfs?.classical?.rating,
      };
    }).catch(() => undefined) : Promise.resolve(),
  ]);
  return ratings;
}

async function fetchChessComStats(username: string, bounds: { start: number; end: number }): Promise<MonthlyOnlineStats> {
  if (!username.trim()) return { games: 0, wins: 0, draws: 0, losses: 0 };
  const archiveResponse = await fetch(`https://api.chess.com/pub/player/${encodeURIComponent(username.trim())}/games/archives`);
  if (!archiveResponse.ok) throw new Error('Chess.com games are unavailable for this ID.');
  const archives = (await archiveResponse.json()).archives ?? [];
  const archiveMonths = archives.filter((url: string) => {
    const match = url.match(/(\d{4})\/(\d{2})$/);
    if (!match) return false;
    const archiveStart = Date.UTC(Number(match[1]), Number(match[2]) - 1, 1);
    return archiveStart <= bounds.end && new Date(Date.UTC(Number(match[1]), Number(match[2]), 1)).getTime() > bounds.start;
  });
  const usernameLower = username.trim().toLowerCase();
  let stats: MonthlyOnlineStats = { games: 0, wins: 0, draws: 0, losses: 0 };
  for (const archive of archiveMonths) {
    const response = await fetch(archive);
    if (!response.ok) throw new Error('Chess.com games are unavailable.');
    const games = (await response.json()).games ?? [];
    stats = games.reduce((current: MonthlyOnlineStats, game: any) => {
      const white = String(game.white?.username ?? '').toLowerCase() === usernameLower;
      const black = String(game.black?.username ?? '').toLowerCase() === usernameLower;
      const timestamp = Number(game.end_time ?? game.start_time ?? 0) * 1000;
      if ((!white && !black) || timestamp < bounds.start || timestamp > bounds.end) return current;
      const player = white ? game.white : game.black;
      return addStats(current, resultStats([{ result: player?.result ?? '', rating: typeof player?.rating === 'number' ? player.rating : undefined }]));
    }, stats);
  }
  return stats;
}

async function fetchLichessStats(username: string, bounds: { start: number; end: number }): Promise<MonthlyOnlineStats> {
  if (!username.trim()) return { games: 0, wins: 0, draws: 0, losses: 0 };
  const response = await fetch(`https://lichess.org/api/games/user/${encodeURIComponent(username.trim())}?since=${bounds.start}&until=${bounds.end}&max=500&clocks=false&evals=false&opening=false`, { headers: { Accept: 'application/x-ndjson' } });
  if (!response.ok) throw new Error('Lichess monthly games are unavailable.');
  const body = await response.text();
  return body.split('\n').filter(Boolean).reduce((stats, line) => {
    try {
      const game = JSON.parse(line);
      const usernameLower = username.trim().toLowerCase();
      const player = game.players?.white?.user?.name?.toLowerCase() === usernameLower ? game.players.white : game.players?.black?.user?.name?.toLowerCase() === usernameLower ? game.players.black : null;
      return player ? addStats(stats, resultStats([{ result: game.status === 'draw' ? 'draw' : player.result ?? '', rating: typeof player.rating === 'number' ? player.rating : undefined }])) : stats;
    } catch {
      return stats;
    }
  }, { games: 0, wins: 0, draws: 0, losses: 0 });
}

export function fetchChessComMonthlyStats(username: string, month: string) {
  return fetchChessComStats(username, monthBounds(month));
}

export function fetchLichessMonthlyStats(username: string, month: string) {
  return fetchLichessStats(username, monthBounds(month));
}

export function fetchChessComWeeklyStats(username: string, date: string) {
  return fetchChessComStats(username, weekBounds(date));
}

export function fetchLichessWeeklyStats(username: string, date: string) {
  return fetchLichessStats(username, weekBounds(date));
}

export interface OnlineTournamentStanding {
  rank: number;
  playerName: string;
  score: string;
}

export interface WeeklyOnlineTournament {
  name: string;
  format: string;
  variant: string;
  timeControl: string;
  rounds: string;
  playerCount: string;
  organizer: string;
  startedAt: string;
  completedAt: string;
  description: string;
  sourceUrl: string;
  standings: OnlineTournamentStanding[];
}

export interface SavedWeeklyOnlineTournament extends WeeklyOnlineTournament {
  savedBy: string;
  savedAt: string;
  rowIndex: number;
}

export const WEEKLY_ONLINE_TOURNAMENT_HEADERS = [
  'Tournament Name', 'Format', 'Variant', 'Time Control', 'Rounds', 'Players', 'Organizer',
  'Started At', 'Completed At', 'Description', 'Source Link', 'Top 5 Standings', 'Saved By', 'Saved At',
];

export function weeklyTournamentValues(tournament: WeeklyOnlineTournament, savedBy: string, savedAt: string): string[] {
  return [
    tournament.name, tournament.format, tournament.variant, tournament.timeControl, tournament.rounds, tournament.playerCount,
    tournament.organizer, tournament.startedAt, tournament.completedAt, tournament.description, tournament.sourceUrl,
    JSON.stringify(tournament.standings), savedBy, savedAt,
  ];
}

export function rowToSavedWeeklyOnlineTournament(row: string[], rowIndex: number): SavedWeeklyOnlineTournament {
  let standings: OnlineTournamentStanding[] = [];
  try {
    const parsed = JSON.parse(row[11] ?? '[]');
    if (Array.isArray(parsed)) standings = parsed.filter(item =>
      typeof item?.rank === 'number' && typeof item?.playerName === 'string' && typeof item?.score === 'string'
    );
  } catch { /* preserve the saved event even if an older row has invalid standings data */ }
  return {
    name: row[0] ?? '', format: row[1] ?? '', variant: row[2] ?? '', timeControl: row[3] ?? '',
    rounds: row[4] ?? '', playerCount: row[5] ?? '', organizer: row[6] ?? '', startedAt: row[7] ?? '',
    completedAt: row[8] ?? '', description: row[9] ?? '', sourceUrl: row[10] ?? '', standings,
    savedBy: row[12] ?? '', savedAt: row[13] ?? '', rowIndex,
  };
}

interface LichessTournamentLink {
  id: string;
  type: 'arena' | 'swiss';
}

/** The site a saved weekly result came from \u2014 derived from the stored source
 * link so no extra sheet column is needed for existing rows. */
export function weeklyTournamentSource(sourceUrl: string): 'lichess' | 'chess.com' | 'unknown' {
  try {
    const hostname = new URL(sourceUrl.trim()).hostname;
    if (hostname === 'lichess.org' || hostname === 'www.lichess.org') return 'lichess';
    if (hostname === 'chess.com' || hostname === 'www.chess.com') return 'chess.com';
  } catch { /* fall through to unknown for malformed/legacy links */ }
  return 'unknown';
}

function lichessTournamentLink(sourceUrl: string): LichessTournamentLink {
  let parsed: URL;
  try {
    parsed = new URL(sourceUrl.trim());
  } catch {
    throw new Error('Paste a valid Lichess tournament link.');
  }

  const path = parsed.pathname.split('/').filter(Boolean);
  const isSwiss = path[0] === 'swiss';
  const tournamentId = isSwiss ? path[1] : path[0];
  if (!tournamentId || tournamentId === 'api' || tournamentId === 'tournament') {
    throw new Error('Paste a Lichess arena or Swiss tournament link.');
  }
  return { id: tournamentId, type: isSwiss ? 'swiss' : 'arena' };
}

function chesscomTournamentId(sourceUrl: string): string {
  const path = new URL(sourceUrl.trim()).pathname.split('/').filter(Boolean);
  const tournamentIndex = path.indexOf('tournament');
  const afterTournament = path.slice(tournamentIndex + 1).filter(segment => segment !== 'live');
  const id = afterTournament[0];
  if (!id) throw new Error('Paste a Chess.com tournament link.');
  return id;
}

/** Chess.com only reports a placement label per player (e.g. "1st", "4th-5th",
 * "winner") \u2014 not a numeric score, so we parse a rank out of that label. */
function chesscomPlacementRank(status: string): number | null {
  if (status === 'winner') return 1;
  const match = /^(\d+)(st|nd|rd|th)?/.exec(status);
  return match ? Number(match[1]) : null;
}

function chesscomTimeControl(timeControl: unknown): string {
  if (typeof timeControl !== 'string') return '';
  if (timeControl.includes('/')) {
    const seconds = Number(timeControl.split('/')[1]);
    if (!Number.isFinite(seconds)) return timeControl;
    const days = seconds / 86400;
    return `${days} day${days === 1 ? '' : 's'}/move`;
  }
  const [base, increment] = timeControl.split('+');
  const baseSeconds = Number(base);
  if (!Number.isFinite(baseSeconds)) return timeControl;
  const minutes = baseSeconds >= 60 ? baseSeconds / 60 : baseSeconds;
  return increment ? `${minutes} + ${increment}` : `${minutes}`;
}

async function fetchChesscomTournament(sourceUrl: string): Promise<WeeklyOnlineTournament> {
  const id = chesscomTournamentId(sourceUrl);
  let response: Response;
  try {
    response = await fetch(`https://api.chess.com/pub/tournament/${encodeURIComponent(id)}`, {
      headers: { Accept: 'application/json' },
    });
  } catch {
    throw new Error('Could not reach Chess.com. Check your connection and try again.');
  }

  if (response.status === 404) throw new Error('Chess.com could not find that tournament. Check that the event is public and the full link was copied.');
  if (!response.ok) throw new Error('Chess.com could not load this tournament right now.');

  const payload = await response.json();
  if (payload.status !== 'finished') throw new Error('This tournament has not completed yet. Paste the link after it finishes.');

  const players = Array.isArray(payload.players) ? payload.players : [];
  const standings = players
    .map((player: { username?: string; status?: string }) => ({
      rank: typeof player.status === 'string' ? chesscomPlacementRank(player.status) : null,
      playerName: typeof player.username === 'string' ? player.username : 'Unknown player',
      score: '',
    }))
    .filter((player: { rank: number | null }): player is { rank: number; playerName: string; score: string } => player.rank !== null)
    .sort((left: { rank: number }, right: { rank: number }) => left.rank - right.rank);
  if (standings.length === 0) throw new Error('No final standings are available for this tournament.');

  const settings = payload.settings ?? {};
  return {
    name: typeof payload.name === 'string' ? payload.name : id,
    format: typeof settings.type === 'string' ? settings.type.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase()) : 'Tournament',
    variant: typeof settings.rules === 'string' ? settings.rules.replace(/\b\w/g, (c: string) => c.toUpperCase()) : 'Chess',
    timeControl: chesscomTimeControl(settings.time_control),
    rounds: typeof settings.total_rounds === 'number' ? String(settings.total_rounds) : '',
    playerCount: typeof settings.registered_user_count === 'number' ? String(settings.registered_user_count) : String(players.length),
    organizer: typeof payload.creator === 'string' ? payload.creator : '',
    startedAt: '',
    completedAt: typeof payload.finish_time === 'number' ? new Date(payload.finish_time * 1000).toISOString() : '',
    description: typeof payload.description === 'string' ? payload.description.trim() : '',
    sourceUrl: sourceUrl.trim(),
    standings: standings.slice(0, 5),
  };
}

async function fetchSwissStandings(tournamentId: string): Promise<unknown[]> {
  let response: Response;
  try {
    response = await fetch(`https://lichess.org/api/swiss/${encodeURIComponent(tournamentId)}/results`, {
      headers: { Accept: 'application/x-ndjson, application/json' },
    });
  } catch {
    throw new Error('Could not reach Lichess results. Check your connection and try again.');
  }
  if (!response.ok) throw new Error('Lichess could not load the final Swiss standings right now.');

  const responseText = await response.text();
  if (!responseText.trim()) return [];
  try {
    const parsed = JSON.parse(responseText);
    if (Array.isArray(parsed)) return parsed;
    if (Array.isArray(parsed.players)) return parsed.players;
    return typeof parsed === 'object' && parsed !== null ? [parsed] : [];
  } catch {
    return responseText.split('\n').filter(Boolean).flatMap(line => {
      try { return [JSON.parse(line)]; } catch { return []; }
    });
  }
}

function timestamp(value: unknown): string {
  return typeof value === 'number' ? new Date(value).toISOString() : '';
}

function timeControl(clock: unknown): string {
  if (!clock || typeof clock !== 'object') return '';
  const value = clock as { limit?: unknown; increment?: unknown };
  if (typeof value.limit !== 'number') return '';
  const minutes = value.limit >= 60 ? value.limit / 60 : value.limit;
  const increment = typeof value.increment === 'number' ? ` + ${value.increment}` : '';
  return `${minutes}${increment}`;
}

export async function fetchWeeklyOnlineTournament(sourceUrl: string): Promise<WeeklyOnlineTournament> {
  const source = weeklyTournamentSource(sourceUrl);
  if (source === 'chess.com') return fetchChesscomTournament(sourceUrl);
  if (source !== 'lichess') throw new Error('Weekly imports currently support completed Lichess or Chess.com tournament links.');

  const tournament = lichessTournamentLink(sourceUrl);
  const endpoint = tournament.type === 'swiss' ? 'swiss' : 'tournament';
  let response: Response;
  try {
    response = await fetch(`https://lichess.org/api/${endpoint}/${encodeURIComponent(tournament.id)}`, {
      headers: { Accept: 'application/json' },
    });
  } catch {
    throw new Error('Could not reach Lichess. Check your connection and try again.');
  }

  if (response.status === 404) throw new Error('Lichess could not find that tournament. Check that the event is public and the full link was copied.');
  if (!response.ok) throw new Error('Lichess could not load this tournament right now.');

  const payload = await response.json();
  const completed = payload.isFinished === true || payload.finished === true || payload.status === 'finished';
  if (!completed) throw new Error('This tournament has not completed yet. Paste the link after it finishes.');

  const players = tournament.type === 'swiss'
    ? await fetchSwissStandings(tournament.id)
    : (Array.isArray(payload.standing?.players) ? payload.standing.players : []);
  if (players.length === 0) throw new Error('No final standings are available for this tournament.');

  return {
    name: typeof payload.fullName === 'string' ? payload.fullName : (typeof payload.name === 'string' ? payload.name : payload.id),
    format: tournament.type === 'swiss' ? 'Swiss' : 'Arena',
    variant: typeof payload.variant?.name === 'string' ? payload.variant.name : (typeof payload.variant === 'string' ? payload.variant : 'Standard'),
    timeControl: timeControl(payload.clock),
    rounds: typeof payload.nbRounds === 'number' ? String(payload.nbRounds) : '',
    playerCount: typeof payload.nbPlayers === 'number' ? String(payload.nbPlayers) : '',
    organizer: typeof payload.createdBy === 'string' ? payload.createdBy : '',
    startedAt: timestamp(payload.startsAt),
    completedAt: timestamp(payload.finishesAt) || timestamp(payload.finishedAt),
    description: typeof payload.description === 'string' ? payload.description.trim() : '',
    sourceUrl: sourceUrl.trim(),
    standings: players.slice(0, 5).map((player: { rank?: number; name?: string; username?: string; score?: number; points?: number }, index: number) => ({
      rank: typeof player.rank === 'number' ? player.rank : index + 1,
      playerName: typeof player.name === 'string' ? player.name : (typeof player.username === 'string' ? player.username : 'Unknown player'),
      score: typeof player.score === 'number' ? String(player.score) : (typeof player.points === 'number' ? String(player.points) : ''),
    })),
  };
}

export function weeklyTournamentWhatsAppMessage(tournament: WeeklyOnlineTournament): string {
  const date = tournament.completedAt
    ? new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(tournament.completedAt))
    : 'Completed event';
  return [
    '*Weekly Online Tournament Results*',
    tournament.name,
    date,
    [tournament.format, tournament.variant, tournament.timeControl].filter(Boolean).join(' | '),
    tournament.rounds ? `Rounds: ${tournament.rounds}` : '',
    tournament.playerCount ? `Players: ${tournament.playerCount}` : '',
    tournament.organizer ? `Organized by: ${tournament.organizer}` : '',
    '',
    '*Top 5 standings*',
    ...tournament.standings.map(player => {
      const score = player.score ? ` - ${player.score} points` : '';
      const placement = ({ 1: '🥇', 2: '🥈', 3: '🥉' } as Record<number, string>)[player.rank] ?? `${player.rank}.`;
      return `${placement} ${player.playerName}${score}`;
    }),
    '',
    'KAFT Chess Academy',
    tournament.sourceUrl,
  ].join('\n');
}
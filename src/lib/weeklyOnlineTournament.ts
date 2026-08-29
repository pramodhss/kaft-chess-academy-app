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

function lichessTournamentLink(sourceUrl: string): LichessTournamentLink {
  let parsed: URL;
  try {
    parsed = new URL(sourceUrl.trim());
  } catch {
    throw new Error('Paste a valid Lichess tournament link.');
  }

  if (parsed.hostname !== 'lichess.org' && parsed.hostname !== 'www.lichess.org') {
    throw new Error('Weekly imports currently support completed Lichess arena or Swiss links.');
  }

  const path = parsed.pathname.split('/').filter(Boolean);
  const isSwiss = path[0] === 'swiss';
  const tournamentId = isSwiss ? path[1] : path[0];
  if (!tournamentId || tournamentId === 'api' || tournamentId === 'tournament') {
    throw new Error('Paste a Lichess arena or Swiss tournament link.');
  }
  return { id: tournamentId, type: isSwiss ? 'swiss' : 'arena' };
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
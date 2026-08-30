import { weeklyTournamentSource, type SavedWeeklyOnlineTournament } from './weeklyOnlineTournament';

export function ordinal(rank: number): string {
  const remainder = rank % 100;
  if (remainder >= 11 && remainder <= 13) return `${rank}th`;
  const suffix = ['th', 'st', 'nd', 'rd'][rank % 10] ?? 'th';
  return `${rank}${suffix}`;
}

export interface OnlinePlayerDirectory {
  name: string;
  lichessUsername: string;
  chessComUsername: string;
}

export interface MatchedOnlineResult {
  studentName: string;
  tournament: SavedWeeklyOnlineTournament;
  rank: number;
  score: string;
  source: 'lichess' | 'chess.com';
}

/** Cross-references saved Lichess/Chess.com standings against every student's
 * stored username so tournament attendance tracks online results automatically. */
export function matchOnlineTournamentResults(
  weeklyResults: SavedWeeklyOnlineTournament[],
  students: OnlinePlayerDirectory[],
): MatchedOnlineResult[] {
  const results: MatchedOnlineResult[] = [];
  for (const tournament of weeklyResults) {
    const source = weeklyTournamentSource(tournament.sourceUrl);
    if (source === 'unknown') continue;
    for (const student of students) {
      const username = (source === 'chess.com' ? student.chessComUsername : student.lichessUsername).trim().toLocaleLowerCase();
      if (!username) continue;
      const standing = tournament.standings.find(entry => entry.playerName.trim().toLocaleLowerCase() === username);
      if (standing) results.push({ studentName: student.name, tournament, rank: standing.rank, score: standing.score, source });
    }
  }
  return results;
}

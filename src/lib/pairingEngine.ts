// Simplified Swiss-style pairing engine for in-class mini tournaments.
// Not a FIDE Dutch-system implementation — no color-balance floaters or
// tie-break math beyond points/rating. Intended for small (roughly 4-24
// player) single-session groupings where "good enough, no repeat pairings"
// matters more than tournament-director-grade accuracy.

export interface PairingParticipant {
  name: string;
  rating: number;
}

export type GameResult = '1-0' | '0-1' | '1/2-1/2' | '';

export interface BoardPairing {
  board: number;
  white: string;
  black: string | null; // null = bye
  result: GameResult;
}

export interface PairingHistory {
  points: Record<string, number>;
  opponents: Record<string, string[]>;
  byes: string[];
  whiteCounts: Record<string, number>;
}

export function createInitialHistory(participants: readonly PairingParticipant[]): PairingHistory {
  const points: Record<string, number> = {};
  const opponents: Record<string, string[]> = {};
  const whiteCounts: Record<string, number> = {};
  participants.forEach(participant => {
    points[participant.name] = 0;
    opponents[participant.name] = [];
    whiteCounts[participant.name] = 0;
  });
  return { points, opponents, byes: [], whiteCounts };
}

/** Folds a completed round's results into history. Throws if any non-bye board is missing a result. */
export function applyRoundResults(history: PairingHistory, pairings: readonly BoardPairing[]): PairingHistory {
  const points = { ...history.points };
  const opponents: Record<string, string[]> = {};
  Object.entries(history.opponents).forEach(([name, list]) => { opponents[name] = [...list]; });
  const whiteCounts = { ...history.whiteCounts };
  const byes = [...history.byes];

  pairings.forEach(pairing => {
    if (pairing.black === null) {
      points[pairing.white] = (points[pairing.white] ?? 0) + 1;
      byes.push(pairing.white);
      return;
    }
    if (!pairing.result) throw new Error(`Board ${pairing.board} is missing a result.`);
    opponents[pairing.white] = [...(opponents[pairing.white] ?? []), pairing.black];
    opponents[pairing.black] = [...(opponents[pairing.black] ?? []), pairing.white];
    whiteCounts[pairing.white] = (whiteCounts[pairing.white] ?? 0) + 1;
    if (pairing.result === '1-0') points[pairing.white] = (points[pairing.white] ?? 0) + 1;
    else if (pairing.result === '0-1') points[pairing.black] = (points[pairing.black] ?? 0) + 1;
    else { points[pairing.white] = (points[pairing.white] ?? 0) + 0.5; points[pairing.black] = (points[pairing.black] ?? 0) + 0.5; }
  });

  return { points, opponents, byes, whiteCounts };
}

function sortForRound(participants: readonly PairingParticipant[], history: PairingHistory, roundNumber: number): string[] {
  const byName = new Map(participants.map(participant => [participant.name, participant]));
  return [...participants]
    .sort((left, right) => {
      if (roundNumber > 1) {
        const pointsDiff = (history.points[right.name] ?? 0) - (history.points[left.name] ?? 0);
        if (pointsDiff !== 0) return pointsDiff;
      }
      const ratingDiff = right.rating - left.rating;
      if (ratingDiff !== 0) return ratingDiff;
      return left.name.localeCompare(right.name);
    })
    .map(participant => byName.get(participant.name)!.name);
}

function pickByeCandidate(order: readonly string[], history: PairingHistory): string {
  for (let index = order.length - 1; index >= 0; index -= 1) {
    if (!history.byes.includes(order[index])) return order[index];
  }
  return order[order.length - 1];
}

function assignColors(first: string, second: string, history: PairingHistory): { white: string; black: string } {
  const firstWhites = history.whiteCounts[first] ?? 0;
  const secondWhites = history.whiteCounts[second] ?? 0;
  if (firstWhites < secondWhites) return { white: first, black: second };
  if (secondWhites < firstWhites) return { white: second, black: first };
  return { white: first, black: second };
}

export function generateNextRound(
  participants: readonly PairingParticipant[],
  history: PairingHistory,
  roundNumber: number,
): BoardPairing[] {
  if (participants.length === 0) return [];
  const order = sortForRound(participants, history, roundNumber);
  const remaining = new Set(order);
  let byeName: string | null = null;

  if (order.length % 2 === 1) {
    byeName = pickByeCandidate(order, history);
    remaining.delete(byeName);
  }

  const pairs: [string, string][] = [];

  if (roundNumber === 1) {
    const pool = order.filter(name => remaining.has(name));
    const half = Math.ceil(pool.length / 2);
    const top = pool.slice(0, half);
    const bottom = pool.slice(half);
    for (let index = 0; index < Math.min(top.length, bottom.length); index += 1) {
      pairs.push([top[index], bottom[index]]);
      remaining.delete(top[index]);
      remaining.delete(bottom[index]);
    }
    // Odd leftover from an uneven fold (only possible when byeName is already set for the
    // true odd-total case) — nothing further to do; any single unmatched name here means
    // top/bottom split by one, which pickByeCandidate above already accounted for.
  } else {
    const pool = order.filter(name => remaining.has(name));
    pool.forEach(name => {
      if (!remaining.has(name)) return;
      remaining.delete(name);
      const opponentHistory = history.opponents[name] ?? [];
      const candidates = pool.filter(other => remaining.has(other));
      const freshOpponent = candidates.find(other => !opponentHistory.includes(other));
      const partner = freshOpponent ?? candidates[0];
      if (partner) {
        remaining.delete(partner);
        pairs.push([name, partner]);
      } else {
        // No partner left unpaired — this player becomes the bye if one hasn't been assigned yet.
        byeName ??= name;
      }
    });
  }

  const boards: BoardPairing[] = pairs.map(([left, right], index) => {
    const { white, black } = assignColors(left, right, history);
    return { board: index + 1, white, black, result: '' };
  });
  boards.sort((left, right) => (history.points[right.white] + (history.points[right.black ?? ''] ?? 0))
    - (history.points[left.white] + (history.points[left.black ?? ''] ?? 0)));
  boards.forEach((board, index) => { board.board = index + 1; });

  if (byeName) boards.push({ board: boards.length + 1, white: byeName, black: null, result: '' });

  return boards;
}

export interface StandingRow {
  rank: number;
  name: string;
  rating: number;
  points: number;
  games: number;
}

export function computeStandings(participants: readonly PairingParticipant[], history: PairingHistory): StandingRow[] {
  const rows = participants
    .map(participant => ({
      name: participant.name,
      rating: participant.rating,
      points: history.points[participant.name] ?? 0,
      games: (history.opponents[participant.name] ?? []).length,
    }))
    .sort((left, right) => (right.points - left.points) || (right.rating - left.rating) || left.name.localeCompare(right.name));
  return rows.map((row, index) => ({ ...row, rank: index + 1 }));
}

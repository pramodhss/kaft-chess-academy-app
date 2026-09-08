// Practical Swiss pairing engine for small in-class tournaments.
// It is deliberately deterministic and suitable for roughly 4-24 players;
// it is not a federation-certified Dutch-system implementation.

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
  resultPoints: Record<string, Record<string, number>>;
}

export function createInitialHistory(participants: readonly PairingParticipant[]): PairingHistory {
  const points: Record<string, number> = {};
  const opponents: Record<string, string[]> = {};
  const whiteCounts: Record<string, number> = {};
  const resultPoints: Record<string, Record<string, number>> = {};
  participants.forEach(participant => {
    points[participant.name] = 0;
    opponents[participant.name] = [];
    whiteCounts[participant.name] = 0;
    resultPoints[participant.name] = {};
  });
  return { points, opponents, byes: [], whiteCounts, resultPoints };
}

/** Folds a completed round's results into history. Throws if any non-bye board is missing a result. */
export function applyRoundResults(history: PairingHistory, pairings: readonly BoardPairing[]): PairingHistory {
  const points = { ...history.points };
  const opponents: Record<string, string[]> = {};
  Object.entries(history.opponents).forEach(([name, list]) => { opponents[name] = [...list]; });
  const whiteCounts = { ...history.whiteCounts };
  const byes = [...history.byes];
  const resultPoints: Record<string, Record<string, number>> = {};
  Object.entries(history.resultPoints ?? {}).forEach(([name, results]) => { resultPoints[name] = { ...results }; });

  pairings.forEach(pairing => {
    if (pairing.black === null) {
      points[pairing.white] = (points[pairing.white] ?? 0) + 1;
      byes.push(pairing.white);
      return;
    }
    if (!pairing.result) throw new Error(`Board ${pairing.board} is missing a result.`);
    opponents[pairing.white] = [...(opponents[pairing.white] ?? []), pairing.black];
    opponents[pairing.black] = [...(opponents[pairing.black] ?? []), pairing.white];
    const whiteScore = pairing.result === '1-0' ? 1 : pairing.result === '1/2-1/2' ? 0.5 : 0;
    const blackScore = pairing.result === '0-1' ? 1 : pairing.result === '1/2-1/2' ? 0.5 : 0;
    resultPoints[pairing.white] = { ...(resultPoints[pairing.white] ?? {}), [pairing.black]: whiteScore };
    resultPoints[pairing.black] = { ...(resultPoints[pairing.black] ?? {}), [pairing.white]: blackScore };
    whiteCounts[pairing.white] = (whiteCounts[pairing.white] ?? 0) + 1;
    if (pairing.result === '1-0') points[pairing.white] = (points[pairing.white] ?? 0) + 1;
    else if (pairing.result === '0-1') points[pairing.black] = (points[pairing.black] ?? 0) + 1;
    else { points[pairing.white] = (points[pairing.white] ?? 0) + 0.5; points[pairing.black] = (points[pairing.black] ?? 0) + 0.5; }
  });

  return { points, opponents, byes, whiteCounts, resultPoints };
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

function pairSwissPool(pool: readonly string[], history: PairingHistory): [string, string][] {
  if (pool.length === 0) return [];
  const first = pool[0];
  const candidates = pool.slice(1).sort((left, right) => {
    const leftRepeat = (history.opponents[first] ?? []).includes(left) ? 1 : 0;
    const rightRepeat = (history.opponents[first] ?? []).includes(right) ? 1 : 0;
    const leftScoreGap = Math.abs((history.points[first] ?? 0) - (history.points[left] ?? 0));
    const rightScoreGap = Math.abs((history.points[first] ?? 0) - (history.points[right] ?? 0));
    return (leftRepeat - rightRepeat) || (leftScoreGap - rightScoreGap) || left.localeCompare(right);
  });
  for (const candidate of candidates) {
    const rest = pool.filter(name => name !== first && name !== candidate);
    const tail = pairSwissPool(rest, history);
    if (rest.length === 0 || tail.length === Math.floor(rest.length / 2)) return [[first, candidate], ...tail];
  }
  return [];
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
    const swissPairs = pairSwissPool(pool, history);
    swissPairs.forEach(([left, right]) => {
      pairs.push([left, right]);
      remaining.delete(left);
      remaining.delete(right);
    });
    if (remaining.size > 0) byeName ??= [...remaining][0];
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
  buchholz: number;
  sonnebornBerger: number;
}

function opponentPoints(name: string, history: PairingHistory): number {
  return (history.opponents[name] ?? []).reduce((total, opponent) => total + (history.points[opponent] ?? 0), 0);
}

function sonnebornBerger(name: string, history: PairingHistory): number {
  return Object.entries(history.resultPoints?.[name] ?? {})
    .reduce((total, [opponent, result]) => total + result * (history.points[opponent] ?? 0), 0);
}

export function computeStandings(participants: readonly PairingParticipant[], history: PairingHistory): StandingRow[] {
  const rows = participants
    .map(participant => ({
      name: participant.name,
      rating: participant.rating,
      points: history.points[participant.name] ?? 0,
      games: (history.opponents[participant.name] ?? []).length,
      buchholz: opponentPoints(participant.name, history),
      sonnebornBerger: sonnebornBerger(participant.name, history),
    }))
    .sort((left, right) => (right.points - left.points)
      || (right.buchholz - left.buchholz)
      || (right.sonnebornBerger - left.sonnebornBerger)
      || (right.rating - left.rating)
      || left.name.localeCompare(right.name));
  return rows.map((row, index) => ({ ...row, rank: index + 1 }));
}

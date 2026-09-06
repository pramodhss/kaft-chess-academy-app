import { describe, expect, it } from 'vitest';
import {
  applyRoundResults,
  computeStandings,
  createInitialHistory,
  generateNextRound,
  type PairingParticipant,
} from './pairingEngine';

const players: PairingParticipant[] = [
  { name: 'Aarav', rating: 1600 },
  { name: 'Bala', rating: 1550 },
  { name: 'Chitra', rating: 1500 },
  { name: 'Deepa', rating: 1450 },
  { name: 'Esha', rating: 1400 },
  { name: 'Farhan', rating: 1350 },
];

describe('pairingEngine', () => {
  it('round 1 pairs the top half against the bottom half by rating', () => {
    const history = createInitialHistory(players);
    const round1 = generateNextRound(players, history, 1);
    expect(round1).toHaveLength(3);
    expect(round1.every(board => board.black !== null)).toBe(true);
    expect(round1.map(board => [board.white, board.black])).toEqual([
      ['Aarav', 'Deepa'],
      ['Bala', 'Esha'],
      ['Chitra', 'Farhan'],
    ]);
  });

  it('gives exactly one bye for an odd number of players and never repeats it', () => {
    const odd = players.slice(0, 5);
    const history = createInitialHistory(odd);
    const round1 = generateNextRound(odd, history, 1);
    const byeBoards = round1.filter(board => board.black === null);
    expect(byeBoards).toHaveLength(1);
  });

  it('never repeats an opponent pairing across rounds when an alternative exists', () => {
    let history = createInitialHistory(players);
    const round1 = generateNextRound(players, history, 1);
    const resolvedRound1 = round1.map(board => ({ ...board, result: '1-0' as const }));
    history = applyRoundResults(history, resolvedRound1);

    const round2 = generateNextRound(players, history, 2);
    const round1Pairs = new Set(round1.map(board => [board.white, board.black].sort().join('|')));
    round2.forEach(board => {
      if (!board.black) return;
      const key = [board.white, board.black].sort().join('|');
      expect(round1Pairs.has(key)).toBe(false);
    });
  });

  it('computes standings ordered by points then rating', () => {
    let history = createInitialHistory(players);
    const round1 = generateNextRound(players, history, 1);
    const resolved = round1.map(board => ({ ...board, result: '1-0' as const }));
    history = applyRoundResults(history, resolved);

    const standings = computeStandings(players, history);
    expect(standings[0].name).toBe('Aarav');
    expect(standings[0].points).toBe(1);
    expect(standings.find(row => row.name === 'Deepa')?.points).toBe(0);
  });

  it('awards a full point for a bye', () => {
    const odd = players.slice(0, 5);
    let history = createInitialHistory(odd);
    const round1 = generateNextRound(odd, history, 1);
    const resolved = round1.map(board => board.black ? { ...board, result: '1/2-1/2' as const } : board);
    history = applyRoundResults(history, resolved);
    const byeBoard = round1.find(board => board.black === null)!;
    expect(history.points[byeBoard.white]).toBe(1);
  });
});

import { describe, expect, it } from 'vitest';
import { calculateStudentBadges } from './studentBadges';
import type { Student } from '../types';

const baseStudent: Student = {
  name: 'Test Student',
  dob: '2015-05-10',
  age: '11',
  gender: 'Male',
  grade: '5th',
  batch: 'Intermediate',
  level: 'Intermediate',
  joiningDate: '2025-01-01',
  status: 'Active',
  parent1Name: 'Parent',
  parent1Phone: '9876543210',
  parent1WhatsApp: '9876543210',
  parent1Email: 'test@example.com',
  parent2Name: '',
  parent2Phone: '',
  emergencyContact: '',
  emergencyPhone: '',
  address: '',
  photoConsent: 'Yes',
  thisMonthAttended: '8',
  notes: '',
  school: '',
  standard: '5th',
  tnscaId: '',
  fideId: '46623264',
  aicfId: '',
  ratingClassical: '1250',
  ratingRapid: '1200',
  ratingBlitz: '',
  coachName: 'Coach Meera',
  chessComUsername: 'test_player',
  lichessUsername: 'test_player',
  photoUrl: '',
  rowIndex: 2,
};

describe('calculateStudentBadges', () => {
  it('awards attendance star and rated prodigy badges', () => {
    const badges = calculateStudentBadges(baseStudent, [], [], []);
    expect(badges.some(b => b.id === 'attendance-star')).toBe(true);
    expect(badges.some(b => b.id === 'rated-prodigy')).toBe(true);
    expect(badges.some(b => b.id === 'dedicated-scholar')).toBe(true);
  });

  it('awards champion badge when student has Gold medal', () => {
    const badges = calculateStudentBadges(baseStudent, [{
      month: '2026-08',
      studentName: 'Test Student',
      batch: 'Intermediate',
      level: 'Intermediate',
      tournamentName: 'District Chess',
      type: 'District',
      date: '2026-08-15',
      venue: 'Chennai',
      roundsPlayed: '5',
      wins: '5',
      draws: '0',
      losses: '0',
      position: '1',
      ratingBefore: '1200',
      ratingAfter: '1250',
      ratingChange: '50',
      medal: 'Gold',
      prizeAmount: '',
      certificate: '',
      coachNotes: '',
      parentNotified: '',
      rowIndex: 2,
    }], [], []);

    expect(badges.some(b => b.id === 'tournament-champion')).toBe(true);
  });
});

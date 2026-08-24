export const TOURNAMENT_HEADERS = [
  'Tournament Name', 'Type', 'Date', 'Reg Deadline', 'Venue', 'Entry Fee',
  'Eligibility', 'Link', 'Notes', 'Status', 'Added By', 'Added On', 'Tournament ID',
];

export const REGISTRATION_HEADERS = [
  'Tournament ID', 'Tournament Name', 'Tournament Date', 'Month', 'Student Name',
  'Playing', 'Fee Paid', 'Entry Fee', 'Updated By', 'Updated At',
  'Van Required', 'Student Notes',
];

export interface ManagedTournament {
  id: string;
  name: string;
  type: string;
  date: string;
  deadline: string;
  venue: string;
  fee: string;
  eligibility: string;
  link: string;
  notes: string;
  status: string;
  addedBy: string;
  addedOn: string;
  rowIndex: number;
}

export interface TournamentRegistration {
  tournamentId: string;
  tournamentName: string;
  tournamentDate: string;
  month: string;
  studentName: string;
  playing: boolean;
  feePaid: boolean;
  entryFee: string;
  updatedBy: string;
  updatedAt: string;
  vanRequired: boolean;
  studentNotes: string;
  rowIndex: number;
}

export interface TournamentDraft {
  name: string;
  date: string;
  fee: string;
}

export const EMPTY_TOURNAMENT: TournamentDraft = { name: '', date: '', fee: '' };

export function rowToManagedTournament(row: string[], rowIndex: number): ManagedTournament {
  return {
    name: row[0] ?? '', type: row[1] || 'Open', date: row[2] ?? '', deadline: row[3] ?? '',
    venue: row[4] ?? '', fee: row[5] ?? '', eligibility: row[6] || 'All Levels', link: row[7] ?? '',
    notes: row[8] ?? '', status: row[9] || 'Upcoming', addedBy: row[10] ?? '', addedOn: row[11] ?? '',
    id: row[12] ?? '', rowIndex,
  };
}

export function rowToRegistration(row: string[], rowIndex: number): TournamentRegistration {
  return {
    tournamentId: row[0] ?? '', tournamentName: row[1] ?? '', tournamentDate: row[2] ?? '', month: row[3] ?? '',
    studentName: row[4] ?? '', playing: row[5] === 'Yes', feePaid: row[6] === 'Yes', entryFee: row[7] ?? '',
    updatedBy: row[8] ?? '', updatedAt: row[9] ?? '',
    vanRequired: row[10] === 'Yes', studentNotes: row[11] ?? '',
    rowIndex,
  };
}

export function tournamentValues(tournament: ManagedTournament): string[] {
  return [
    tournament.name, tournament.type, tournament.date, tournament.deadline, tournament.venue, tournament.fee,
    tournament.eligibility, tournament.link, tournament.notes, tournament.status, tournament.addedBy,
    tournament.addedOn, tournament.id,
  ];
}

export function registrationValues(registration: TournamentRegistration): string[] {
  return [
    registration.tournamentId, registration.tournamentName, registration.tournamentDate, registration.month,
    registration.studentName, registration.playing ? 'Yes' : 'No', registration.feePaid ? 'Yes' : 'No',
    registration.entryFee, registration.updatedBy, registration.updatedAt,
    registration.vanRequired ? 'Yes' : 'No', registration.studentNotes,
  ];
}

export function tournamentMonth(date: string): string {
  return /^\d{4}-\d{2}/.test(date) ? date.slice(0, 7) : '';
}

export function monthLabel(month: string): string {
  const match = /^(\d{4})-(\d{2})$/.exec(month);
  if (!match) return month || 'Date not recorded';
  return new Intl.DateTimeFormat('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, 1)));
}

export function tournamentValidationError(draft: TournamentDraft): string {
  if (!draft.name.trim()) return 'Enter the tournament name.';
  if (draft.name.trim().length > 120) return 'Tournament name must be 120 characters or fewer.';
  if (!draft.date) return 'Select the tournament date.';
  if (Number.isNaN(new Date(`${draft.date}T00:00:00`).getTime())) return 'Enter a valid tournament date.';
  if (draft.fee && (!/^\d+(?:\.\d{1,2})?$/.test(draft.fee) || Number(draft.fee) < 0)) return 'Entry fee must be zero or a positive amount.';
  return '';
}
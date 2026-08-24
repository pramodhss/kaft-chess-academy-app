export interface Student {
  name: string;
  dob: string;
  age: string;
  gender: string;
  grade: string;
  batch: string;
  level: string;
  joiningDate: string;
  status: string;
  parent1Name: string;
  parent1Phone: string;
  parent1WhatsApp: string;
  parent1Email: string;
  parent2Name: string;
  parent2Phone: string;
  emergencyContact: string;
  emergencyPhone: string;
  address: string;
  photoConsent: string;
  thisMonthAttended: string;
  notes: string;
  school: string;
  standard: string;
  tnscaId: string;
  fideId: string;
  aicfId: string;
  ratingClassical: string;
  ratingRapid: string;
  ratingBlitz: string;
  coachName: string;
  chessComUsername: string;
  lichessUsername: string;
  photoUrl: string;
  rowIndex: number;
}

export interface AttendanceRow {
  name: string;
  batch: string;
  attendance: boolean[]; // index matches dateHeaders index
  rowIndex: number;
}

export interface FeeEntry {
  receiptNo: string;
  studentName: string;
  batch: string;
  feeMonth: string;
  feeType: string;
  amountDue: string;
  amountPaid: string;
  balance: string;
  dueDate: string;
  paymentDate: string;
  paymentMethod: string;
  paymentStatus: string;
  reference: string;
  notes: string;
  rowIndex: number;
}

export interface TournamentEntry {
  month: string;
  studentName: string;
  batch: string;
  level: string;
  tournamentName: string;
  type: string;
  date: string;
  venue: string;
  roundsPlayed: string;
  wins: string;
  draws: string;
  losses: string;
  position: string;
  ratingBefore: string;
  ratingAfter: string;
  ratingChange: string;
  medal: string;
  prizeAmount: string;
  certificate: string;
  coachNotes: string;
  parentNotified: string;
  rowIndex: number;
}

export interface VanEntry {
  vanId: string;
  studentName: string;
  batch: string;
  parent: string;
  pickupLocation: string;
  pickupTime: string;
  dropLocation: string;
  dropTime: string;
  driverName: string;
  driverPhone: string;
  vanFee: string;
  vanFeeStatus: string;
  notes: string;
  rowIndex: number;
}

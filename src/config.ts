export const SHEET_ID       = '1NFpFlMl6dID0X5kEkXRO_eV2CfqyHME3oHagmKv6uTc';
export const GOOGLE_CLIENT_ID = '16060935138-l3bdagved67grnreahq96fbmjge7pamu.apps.googleusercontent.com';
export const SCOPES         = 'https://www.googleapis.com/auth/spreadsheets';

export const TABS = {
  STUDENTS:    "Students & Parents",
  ATTENDANCE:  "Weekend Attendance",
  MONTHLY_ATT: "Monthly Attendance",
  FEES:        "Fee Register",
  EXTRA:       "Extra Sessions",
  TIMETABLE:   "Timetable",
  VAN:         "Van Allotment",
  METRICS:     "Monthly Metrics",
  TOURNAMENTS: "Tournament Achievements",
  UPCOMING:    "Upcoming Tournaments",
  RESOURCES:   "Resources",
} as const;

export const ATT_DATE_START = 2;

export const SOCIAL = {
  facebook:  'https://www.facebook.com/',
  instagram: 'https://www.instagram.com/kaft_chess_academy/',
  youtube:   'https://www.youtube.com/',
  whatsapp:  'https://wa.me/',
};

export const ACADEMY_LINKS = {
  fideRatings: 'https://ratings.fide.com/index.phtml',
  tamilChess: 'https://tamilchess.com/',
  easyPayChess: 'https://easypaychess.com/',
  aicfEvents: 'https://aicf.in/all-events/',
} as const;

export const ACADEMY_NAME = 'Kaft Chess Academy';
export const ACADEMY_PHONE = '919000000000'; // update with real WhatsApp number (country code + number, no +)

// Free image hosting — get your key at https://api.imgbb.com (free account)
// Paste your key here to enable one-tap photo upload in Tournament entries
export const IMGBB_API_KEY = ''; // e.g. 'abc123def456...'

const FALLBACK_SHEET_ID = '1NFpFlMl6dID0X5kEkXRO_eV2CfqyHME3oHagmKv6uTc';
const FALLBACK_GOOGLE_CLIENT_ID = '16060935138-l3bdagved67grnreahq96fbmjge7pamu.apps.googleusercontent.com';

export const APP_ENV = import.meta.env.VITE_APP_ENV ?? (import.meta.env.DEV ? 'development' : 'production');
export const SHEET_ID = import.meta.env.VITE_SHEET_ID ?? FALLBACK_SHEET_ID;
export const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID ?? FALLBACK_GOOGLE_CLIENT_ID;
export const IS_PRODUCTION_SHEET = SHEET_ID === FALLBACK_SHEET_ID;
export const IS_DEVELOPMENT_BUILD = APP_ENV !== 'production' || import.meta.env.DEV;
export const SCOPES         = 'https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive.file';

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
  TOURNAMENT_REGISTRATIONS: "Tournament Registrations",
  WEEKLY_ONLINE_TOURNAMENTS: "Weekly Online Tournaments",
  RESOURCES:   "Resources",
  SETTINGS:    "App Settings",
  AUDIT:       "Audit Log",
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
  chessResults: 'https://chess-results.com/',
  tamilChess: 'https://tamilchess.com/',
  easyPayChess: 'https://easypaychess.com/',
  aicfEvents: 'https://aicf.in/all-events/',
} as const;

// ── Sheet ID and OAuth ────────────────────────────────────────────────────────
export const SHEET_ID = '1NFpFlMl6dID0X5kEkXRO_eV2CfqyHME3oHagmKv6uTc';

// Paste your OAuth Client ID here after creating it in Google Cloud Console
export const GOOGLE_CLIENT_ID = '16060935138-l3bdagved67grnreahq96fbmjge7pamu.apps.googleusercontent.com';

export const SCOPES = 'https://www.googleapis.com/auth/spreadsheets';

// Sheet tab names — must exactly match the Google Sheet tab names
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
} as const;

// Update these with your academy's actual social media handles
export const SOCIAL = {
  facebook:  'https://www.facebook.com/',
  instagram: 'https://www.instagram.com/',
  youtube:   'https://www.youtube.com/',
  whatsapp:  'https://wa.me/',
};

// Weekend Attendance column layout
export const ATT_NAME_COL  = 0;  // A = Student Name
export const ATT_BATCH_COL = 1;  // B = Batch
export const ATT_DATE_START = 2; // C = first date column
export const ATT_STUDENT_ROWS = 100; // rows 2–101

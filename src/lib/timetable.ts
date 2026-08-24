export const TIMETABLE_HEADERS = ['Day', 'Batch', 'Level', 'Start Time', 'End Time', 'Coach', 'Coordinator', 'Room', 'Capacity', 'Enrolled', 'Seats Available', 'Status', 'Notes'];
export const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export interface TimetableEntry {
  day: string;
  batch: string;
  level: string;
  start: string;
  end: string;
  coach: string;
  coordinator: string;
  room: string;
  capacity: string;
  enrolled: string;
  seats: string;
  status: string;
  notes: string;
  rowIndex: number;
}

export type TimetableDraft = Omit<TimetableEntry, 'rowIndex'>;

export const EMPTY_TIMETABLE: TimetableDraft = {
  day: '', batch: '', level: '', start: '', end: '', coach: '', coordinator: '', room: '',
  capacity: '', enrolled: '', seats: '', status: 'Active', notes: '',
};

export function timetableRow(row: string[], rowIndex: number): TimetableEntry {
  return {
    day: row[0] ?? '', batch: row[1] ?? '', level: row[2] ?? '', start: row[3] ?? '', end: row[4] ?? '',
    coach: row[5] ?? '', coordinator: row[6] ?? '', room: row[7] ?? '', capacity: row[8] ?? '',
    enrolled: row[9] ?? '', seats: row[10] ?? '', status: row[11] ?? '', notes: row[12] ?? '', rowIndex,
  };
}

export function timetableValues(entry: TimetableDraft): string[] {
  return [entry.day, entry.batch, entry.level, entry.start, entry.end, entry.coach, entry.coordinator, entry.room,
    entry.capacity, entry.enrolled, entry.seats, entry.status, entry.notes];
}

export function normalizeTimetableRows(rows: string[][]) {
  const legacy = rows.length > 0 && rows[0][1] === 'Time';
  const values = legacy ? rows.slice(1).map(row => {
    const [start = '', end = ''] = (row[1] ?? '').split(/[-–]/).map(value => value.trim());
    return [row[0] ?? '', row[2] ?? '', '', start, end, row[3] ?? '', '', row[4] ?? '', '', '', '', 'Active', 'Migrated from legacy timetable'];
  }) : rows.slice(1);
  return { legacy, values, entries: values.map((row, index) => timetableRow(row, index + 2)).filter(entry => entry.day.trim()) };
}

export function timetableValidationError(entry: TimetableDraft) {
  if (!entry.day) return 'Select a day.';
  if (!entry.batch.trim()) return 'Enter a batch.';
  if (!entry.start) return 'Enter a start time.';
  if (!entry.end) return 'Enter an end time.';
  if (entry.end <= entry.start) return 'End time must be after start time.';
  if (!entry.coach.trim()) return 'Enter the coach name.';
  return '';
}

function nextClassOccurrence(entry: TimetableEntry, now = new Date()) {
  const weekday = WEEKDAYS.findIndex(day => day.toLowerCase() === entry.day.trim().toLowerCase());
  if (weekday < 0 || !/^\d{1,2}:\d{2}$/.test(entry.start)) return null;
  const targetDay = (weekday + 1) % 7;
  const [hours, minutes] = entry.start.split(':').map(Number);
  const date = new Date(now);
  date.setHours(hours, minutes, 0, 0);
  let daysAhead = (targetDay - now.getDay() + 7) % 7;
  if (daysAhead === 0 && date <= now) daysAhead = 7;
  date.setDate(date.getDate() + daysAhead);
  return date;
}

export function upcomingClasses(entries: TimetableEntry[], now = new Date()) {
  return entries
    .filter(entry => !entry.status || entry.status.toLowerCase() === 'active' || entry.status.toLowerCase() === 'scheduled')
    .map(entry => ({ entry, date: nextClassOccurrence(entry, now) }))
    .filter((item): item is { entry: TimetableEntry; date: Date } => Boolean(item.date))
    .sort((left, right) => left.date.getTime() - right.date.getTime());
}
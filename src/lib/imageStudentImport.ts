import { createWorker } from 'tesseract.js';

export type ImageStudentFields = Partial<Record<
  | 'name' | 'dob' | 'gender' | 'grade' | 'batch' | 'joiningDate' | 'status'
  | 'parent1Name' | 'parent1Phone' | 'parent1WhatsApp' | 'parent1Email'
  | 'school' | 'standard' | 'tnscaId' | 'fideId' | 'aicfId'
  | 'ratingClassical' | 'ratingRapid' | 'ratingBlitz' | 'coachName'
  | 'chessComUsername' | 'lichessUsername' | 'address' | 'notes', string
>>;

const LABELS: Array<[keyof ImageStudentFields, RegExp]> = [
  ['name', /^(?:full\s*name|student\s*name|name)\s*[:\-]?\s*(.+)$/i],
  ['dob', /^(?:date\s*of\s*birth|dob)\s*[:\-]?\s*(.+)$/i],
  ['gender', /^gender\s*[:\-]?\s*(.+)$/i],
  ['grade', /^(?:grade|school\s*class)\s*[:\-]?\s*(.+)$/i],
  ['batch', /^batch\s*[:\-]?\s*(.+)$/i],
  ['joiningDate', /^(?:joining\s*date|date\s*joined)\s*[:\-]?\s*(.+)$/i],
  ['status', /^status\s*[:\-]?\s*(.+)$/i],
  ['parent1Name', /^(?:parent|parent\s*name|guardian)\s*[:\-]?\s*(.+)$/i],
  ['parent1Phone', /^(?:parent\s*phone|phone|mobile)\s*[:\-]?\s*(.+)$/i],
  ['parent1WhatsApp', /^(?:whatsapp|parent\s*whatsapp)\s*[:\-]?\s*(.+)$/i],
  ['parent1Email', /^(?:parent\s*email|email)\s*[:\-]?\s*(.+)$/i],
  ['school', /^(?:school|school\s*name)\s*[:\-]?\s*(.+)$/i],
  ['standard', /^(?:standard|class)\s*[:\-]?\s*(.+)$/i],
  ['tnscaId', /^tnsca\s*(?:id)?\s*[:\-]?\s*(.+)$/i],
  ['fideId', /^fide\s*(?:id)?\s*[:\-]?\s*(.+)$/i],
  ['aicfId', /^aicf\s*(?:id)?\s*[:\-]?\s*(.+)$/i],
  ['ratingClassical', /^(?:classical\s*rating|classical)\s*[:\-]?\s*(.+)$/i],
  ['ratingRapid', /^(?:rapid\s*rating|rapid)\s*[:\-]?\s*(.+)$/i],
  ['ratingBlitz', /^(?:blitz\s*rating|blitz)\s*[:\-]?\s*(.+)$/i],
  ['coachName', /^(?:coach|coach\s*name)\s*[:\-]?\s*(.+)$/i],
  ['chessComUsername', /^(?:chess\.com|chesscom)\s*(?:username|id)?\s*[:\-]?\s*(.+)$/i],
  ['lichessUsername', /^(?:lichess|lichess\.org)\s*(?:username|id)?\s*[:\-]?\s*(.+)$/i],
  ['address', /^(?:address|home\s*address)\s*[:\-]?\s*(.+)$/i],
  ['notes', /^(?:notes|remarks)\s*[:\-]?\s*(.+)$/i],
];

function cleanValue(value: string): string {
  return value.replace(/[|]/g, 'I').replace(/\s+/g, ' ').trim();
}

export function parseStudentDetailsText(text: string): ImageStudentFields {
  const fields: ImageStudentFields = {};
  text.split(/\r?\n/).map(cleanValue).filter(Boolean).forEach((line) => {
    const match = LABELS.find(([, pattern]) => pattern.test(line));
    if (match) fields[match[0]] = cleanValue(line.match(match[1])?.[1] ?? '');
  });
  return fields;
}

export async function parseStudentDetailsImage(file: File, onProgress?: (value: number) => void): Promise<ImageStudentFields> {
  const worker = await createWorker('eng', 1, {
    logger: (message) => {
      if (message.status === 'recognizing text' && typeof message.progress === 'number') onProgress?.(message.progress);
    },
  });
  try {
    const result = await worker.recognize(file);
    return parseStudentDetailsText(result.data.text);
  } finally {
    await worker.terminate();
  }
}

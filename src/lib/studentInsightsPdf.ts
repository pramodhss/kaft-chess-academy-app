import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

export interface ProgressPdfPoint {
  label: string;
  attendance: number;
  overall: number;
}

export interface TimelinePdfItem {
  date: string;
  type: string;
  title: string;
  details: string[];
}

type PdfWithTable = jsPDF & { lastAutoTable?: { finalY?: number } };

const NAVY: [number, number, number] = [13, 13, 26];
const GOLD: [number, number, number] = [201, 151, 10];
const PALE_GOLD: [number, number, number] = [250, 245, 228];

function addHeader(doc: jsPDF, title: string, subtitle: string) {
  doc.setFillColor(...NAVY);
  doc.rect(0, 0, 210, 30, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text(title, 14, 13);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(subtitle, 14, 21);
}

function addFooter(doc: jsPDF) {
  const pageCount = doc.getNumberOfPages();
  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page);
    doc.setDrawColor(225, 228, 232);
    doc.line(14, 286, 196, 286);
    doc.setTextColor(120, 128, 138);
    doc.setFontSize(8);
    doc.text('KAFT Chess Academy - Confidential student report', 14, 291);
    doc.text(`Page ${page} of ${pageCount}`, 196, 291, { align: 'right' });
  }
}

function filenamePart(value: string) {
  return value.trim().replace(/[^a-z0-9]+/gi, '_').replace(/^_|_$/g, '');
}

export function downloadStudentProgressPdf(studentName: string, points: ProgressPdfPoint[]) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' }) as PdfWithTable;
  const recordedAttendance = points.filter(point => point.attendance > 0);
  const recordedRatings = points.filter(point => point.overall > 0);
  const averageAttendance = recordedAttendance.length
    ? Math.round(recordedAttendance.reduce((sum, point) => sum + point.attendance, 0) / recordedAttendance.length)
    : 0;
  const latestRating = recordedRatings.reduce((_latest, point) => point.overall, 0);

  addHeader(doc, studentName, 'Student Progress Report | Last 12 months');
  autoTable(doc, {
    startY: 39,
    theme: 'grid',
    body: [
      ['Average attendance', recordedAttendance.length ? `${averageAttendance}%` : 'Not recorded'],
      ['Latest overall rating', latestRating ? `${latestRating.toFixed(1)} / 5` : 'Not assessed'],
      ['Months with activity', String(new Set([...recordedAttendance, ...recordedRatings].map(point => point.label)).size)],
    ],
    styles: { font: 'helvetica', fontSize: 10, cellPadding: 4 },
    columnStyles: { 0: { fillColor: PALE_GOLD, textColor: NAVY, fontStyle: 'bold', cellWidth: 62 } },
  });
  autoTable(doc, {
    startY: (doc.lastAutoTable?.finalY ?? 74) + 10,
    theme: 'striped',
    head: [['Month', 'Attendance', 'Overall rating']],
    body: points.map(point => [
      point.label,
      point.attendance > 0 ? `${point.attendance}%` : 'Not recorded',
      point.overall > 0 ? `${point.overall.toFixed(1)} / 5` : 'Not assessed',
    ]),
    headStyles: { fillColor: NAVY, textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [247, 249, 252] },
    styles: { font: 'helvetica', fontSize: 9, cellPadding: 3 },
  });
  addFooter(doc);
  doc.save(`KAFT_${filenamePart(studentName)}_Progress_Report.pdf`);
}

export function downloadStudentTimelinePdf(studentName: string, items: TimelinePdfItem[]) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  addHeader(doc, studentName, 'Attendance, Fees and Tournament Timeline');
  autoTable(doc, {
    startY: 39,
    theme: 'striped',
    head: [['Date / Month', 'Type', 'Event', 'Details']],
    body: items.map(item => [item.date || 'Not recorded', item.type, item.title, item.details.join('\n')]),
    headStyles: { fillColor: NAVY, textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [247, 249, 252] },
    styles: { font: 'helvetica', fontSize: 8.5, cellPadding: 3, overflow: 'linebreak' },
    columnStyles: { 0: { cellWidth: 30 }, 1: { cellWidth: 24 }, 2: { cellWidth: 48 }, 3: { cellWidth: 80 } },
  });
  if (items.length === 0) {
    doc.setTextColor(...GOLD);
    doc.text('No timeline records are available for this student.', 14, 48);
  }
  addFooter(doc);
  doc.save(`KAFT_${filenamePart(studentName)}_Timeline_Report.pdf`);
}
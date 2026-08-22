import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { StudentReport } from '../pages/MonthlyReport';
import { parseSheetNumber } from './values';

interface MonthlyPerformancePdfOptions {
  month: string;
  coachName: string;
  reports: StudentReport[];
}

type PdfWithTable = jsPDF & { lastAutoTable?: { finalY?: number } };

const NAVY: [number, number, number] = [23, 54, 93];
const GOLD: [number, number, number] = [201, 151, 10];
const LIGHT_GOLD: [number, number, number] = [250, 245, 228];
const GRAY: [number, number, number] = [82, 92, 104];

function attendanceLabel(report: StudentReport) {
  if (report.daysScheduled === 0) return 'Not recorded';
  const percentage = Math.round(report.attendancePct * 100);
  return `${report.daysAttended}/${report.daysScheduled} classes (${percentage}%)`;
}

function feeLabel(report: StudentReport) {
  if (!report.feeStatus) return 'Not recorded';
  const balance = parseSheetNumber(report.feeBalance);
  return balance > 0 ? `${report.feeStatus} - INR ${balance.toLocaleString('en-IN')} due` : report.feeStatus;
}

function ratingLabel(value: string) {
  const rating = parseSheetNumber(value);
  return rating > 0 ? `${rating.toFixed(1)} / 5` : 'Not assessed';
}

function performanceBand(report: StudentReport) {
  const rating = parseSheetNumber(report.overallRating);
  if (rating >= 4.5) return 'Outstanding';
  if (rating >= 4) return 'Strong progress';
  if (rating >= 3) return 'Developing well';
  if (rating > 0) return 'Foundation building';
  return 'Not assessed';
}

function developmentFocus(report: StudentReport) {
  const focus: string[] = [];
  const skills = [
    ['opening preparation', report.openingSkill],
    ['middlegame planning', report.middlegameSkill],
    ['endgame technique', report.endgameSkill],
    ['tactical calculation', report.tacticsSkill],
    ['sportsmanship', report.sportsmanship],
  ].map(([label, value]) => ({ label, rating: parseSheetNumber(value) }))
    .filter(skill => skill.rating > 0)
    .sort((left, right) => left.rating - right.rating);

  if (skills.length > 0) focus.push(`Prioritise ${skills.slice(0, 2).map(skill => skill.label).join(' and ')}.`);
  if (report.daysScheduled > 0 && report.attendancePct < 0.75) focus.push('Improve class attendance and learning continuity.');
  if (report.parentMeeting.toLowerCase() === 'yes') focus.push('Schedule a parent-coach progress discussion.');
  return focus.length > 0 ? focus.join(' ') : 'Continue the current training plan and review progress next month.';
}

function addPageHeader(doc: jsPDF, title: string, subtitle: string) {
  doc.setFillColor(...NAVY);
  doc.rect(0, 0, 210, 29, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text(title, 14, 12);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(subtitle, 14, 20);
}

function addTextSection(doc: jsPDF, heading: string, text: string, startY: number) {
  doc.setTextColor(...NAVY);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text(heading.toUpperCase(), 14, startY);
  doc.setTextColor(...GRAY);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  const lines = doc.splitTextToSize(text || 'Not recorded', 180) as string[];
  doc.text(lines, 14, startY + 6);
  return startY + 8 + lines.length * 4.5;
}

function addStudentPage(doc: PdfWithTable, report: StudentReport, month: string) {
  doc.addPage();
  addPageHeader(doc, report.name, `${month} Student Performance | ${report.batch || 'Batch not recorded'}`);

  autoTable(doc, {
    startY: 36,
    theme: 'grid',
    head: [['Performance area', 'Monthly result']],
    body: [
      ['Overall performance', `${performanceBand(report)} (${ratingLabel(report.overallRating)})`],
      ['Attendance', attendanceLabel(report)],
      ['Fee status', feeLabel(report)],
      ['Parent meeting', report.parentMeeting || 'Not required'],
    ],
    headStyles: { fillColor: NAVY, textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [247, 249, 252] },
    styles: { font: 'helvetica', fontSize: 9, cellPadding: 3 },
    columnStyles: { 0: { cellWidth: 52, fontStyle: 'bold' } },
  });

  const summaryEnd = doc.lastAutoTable?.finalY ?? 76;
  autoTable(doc, {
    startY: summaryEnd + 8,
    theme: 'grid',
    head: [['Skill assessment', 'Rating']],
    body: [
      ['Opening', ratingLabel(report.openingSkill)],
      ['Middlegame', ratingLabel(report.middlegameSkill)],
      ['Endgame', ratingLabel(report.endgameSkill)],
      ['Tactics', ratingLabel(report.tacticsSkill)],
      ['Sportsmanship', ratingLabel(report.sportsmanship)],
    ],
    headStyles: { fillColor: GOLD, textColor: NAVY, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: LIGHT_GOLD },
    styles: { font: 'helvetica', fontSize: 9, cellPadding: 3 },
    columnStyles: { 0: { cellWidth: 52 } },
  });

  let nextY = (doc.lastAutoTable?.finalY ?? 132) + 10;
  const achievements = [...report.medals, report.prize].filter(Boolean).join(', ') || 'No achievement recorded this month.';
  nextY = addTextSection(doc, 'Achievements', achievements, nextY);
  nextY = addTextSection(doc, 'Coach observations', report.coachSummary || 'No coach observation recorded this month.', nextY + 3);
  addTextSection(doc, 'Focus for next month', developmentFocus(report), nextY + 3);
}

export function downloadMonthlyPerformancePdf({ month, coachName, reports }: MonthlyPerformancePdfOptions) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' }) as PdfWithTable;
  const generatedOn = new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
  const averageAttendance = reports.length > 0
    ? Math.round(reports.reduce((sum, report) => sum + report.attendancePct, 0) / reports.length * 100)
    : 0;
  const achievements = reports.reduce((sum, report) => sum + report.medals.length + (report.prize ? 1 : 0), 0);
  const attentionCount = reports.filter(report => report.daysScheduled > 0 && report.attendancePct < 0.5).length;

  addPageHeader(doc, 'KAFT Chess Academy', `${month} Monthly Performance Report`);
  doc.setTextColor(...GRAY);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(`Prepared by ${coachName} | Generated ${generatedOn}`, 14, 37);

  autoTable(doc, {
    startY: 44,
    theme: 'grid',
    body: [
      ['Students', String(reports.length), 'Average attendance', `${averageAttendance}%`],
      ['Achievements', String(achievements), 'Attendance attention', String(attentionCount)],
    ],
    styles: { font: 'helvetica', fontSize: 10, cellPadding: 4 },
    columnStyles: {
      0: { fillColor: LIGHT_GOLD, textColor: NAVY, fontStyle: 'bold' },
      2: { fillColor: LIGHT_GOLD, textColor: NAVY, fontStyle: 'bold' },
    },
  });

  autoTable(doc, {
    startY: (doc.lastAutoTable?.finalY ?? 66) + 10,
    theme: 'striped',
    head: [['Student', 'Batch', 'Attendance', 'Overall', 'Fee status']],
    body: reports.map(report => [
      report.name,
      report.batch || '-',
      attendanceLabel(report),
      ratingLabel(report.overallRating),
      feeLabel(report),
    ]),
    headStyles: { fillColor: NAVY, textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [247, 249, 252] },
    styles: { font: 'helvetica', fontSize: 7.5, cellPadding: 2.5, overflow: 'linebreak' },
    columnStyles: {
      0: { cellWidth: 35 },
      1: { cellWidth: 28 },
      2: { cellWidth: 40 },
      3: { cellWidth: 26 },
      4: { cellWidth: 49 },
    },
  });

  reports.forEach(report => addStudentPage(doc, report, month));

  const pageCount = doc.getNumberOfPages();
  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page);
    doc.setDrawColor(225, 228, 232);
    doc.line(14, 286, 196, 286);
    doc.setTextColor(120, 128, 138);
    doc.setFontSize(8);
    doc.text('KAFT Chess Academy - Confidential student performance report', 14, 291);
    doc.text(`Page ${page} of ${pageCount}`, 196, 291, { align: 'right' });
  }

  doc.save(`KAFT_${month.replace(/\s+/g, '_')}_Performance_Report.pdf`);
}
import { useState, useEffect } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { Award, CalendarCheck, Lock, MessageCircle, Trophy, Wallet } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { readSheet } from '../lib/sheets';
import { SHEET_ID, TABS } from '../config';
import { buildWhatsAppUrl } from '../lib/whatsapp';
import { parseSheetNumber } from '../lib/values';
import { calculateStudentBadges, type StudentMilestoneBadge } from '../lib/studentBadges';
import { rowToRegistration } from '../lib/tournamentManagement';
import { rowToSavedWeeklyOnlineTournament } from '../lib/weeklyOnlineTournament';
import type { Student, TournamentEntry } from '../types';

function extractPin(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  return digits.length >= 4 ? digits.slice(-4) : '';
}

export function ParentPortal() {
  const { token } = useAuth();
  const [searchParams] = useSearchParams();
  const [studentNameInput, setStudentNameInput] = useState(() => searchParams.get('student') ?? '');
  const [pinInput, setPinInput] = useState(() => searchParams.get('pin') ?? '');
  const [verifiedStudent, setVerifiedStudent] = useState<Student | null>(null);
  const [studentBadges, setStudentBadges] = useState<StudentMilestoneBadge[]>([]);
  const [feeStatus, setFeeStatus] = useState<{ status: string; balance: number; month: string } | null>(null);
  const [tournaments, setTournaments] = useState<TournamentEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const attemptVerify = async (name: string, pin: string) => {
    if (!name.trim() || !pin.trim()) {
      setError('Please enter the student name and 4-digit PIN.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      // In authenticated coach mode or public view with cached sheet data
      const effectiveToken = token || '';
      const [studentRows, feeRows, tRows, regRows, weeklyRows] = await Promise.all([
        readSheet(effectiveToken, SHEET_ID, `'${TABS.STUDENTS}'!A:AG`).catch(() => []),
        readSheet(effectiveToken, SHEET_ID, `'${TABS.FEES}'!A:N`).catch(() => []),
        readSheet(effectiveToken, SHEET_ID, `'${TABS.TOURNAMENTS}'!A:U`).catch(() => []),
        readSheet(effectiveToken, SHEET_ID, `'${TABS.TOURNAMENT_REGISTRATIONS}'!A:J`).catch(() => []),
        readSheet(effectiveToken, SHEET_ID, `'${TABS.WEEKLY_ONLINE_TOURNAMENTS}'!A:N`).catch(() => []),
      ]);

      const foundRow = studentRows.slice(1).find(r => r[0]?.trim().toLowerCase() === name.trim().toLowerCase());
      if (!foundRow) {
        setError('Student not found. Check the spelling or ask your coach for the direct link.');
        return;
      }

      const p1Phone = foundRow[10] ?? '';
      const p1Wa = foundRow[11] ?? '';
      const validPins = [extractPin(p1Phone), extractPin(p1Wa)].filter(Boolean);

      // Verify PIN against last 4 digits of phone
      if (validPins.length > 0 && !validPins.includes(pin.trim())) {
        setError('Incorrect PIN. Enter the last 4 digits of your registered phone number.');
        return;
      }

      const student: Student = {
        name: foundRow[0] ?? '',
        dob: foundRow[1] ?? '',
        age: foundRow[2] ?? '',
        gender: foundRow[3] ?? '',
        grade: foundRow[4] ?? '',
        batch: foundRow[5] ?? '',
        level: foundRow[6] ?? '',
        joiningDate: foundRow[7] ?? '',
        status: foundRow[8] ?? '',
        parent1Name: foundRow[9] ?? '',
        parent1Phone: p1Phone,
        parent1WhatsApp: p1Wa,
        parent1Email: foundRow[12] ?? '',
        parent2Name: foundRow[13] ?? '',
        parent2Phone: foundRow[14] ?? '',
        emergencyContact: foundRow[15] ?? '',
        emergencyPhone: foundRow[16] ?? '',
        address: foundRow[17] ?? '',
        photoConsent: foundRow[18] ?? '',
        thisMonthAttended: foundRow[19] ?? '0',
        notes: foundRow[20] ?? '',
        school: foundRow[21] ?? '',
        standard: foundRow[22] ?? '',
        tnscaId: foundRow[23] ?? '',
        fideId: foundRow[24] ?? '',
        aicfId: foundRow[25] ?? '',
        ratingClassical: foundRow[26] ?? '',
        ratingRapid: foundRow[27] ?? '',
        ratingBlitz: foundRow[28] ?? '',
        coachName: foundRow[29] ?? '',
        chessComUsername: foundRow[30] ?? '',
        lichessUsername: foundRow[31] ?? '',
        photoUrl: foundRow[32] ?? '',
        rowIndex: 2,
      };

      const parsedTournaments = tRows.slice(1).map((r, i) => ({
        month: r[0] ?? '', studentName: r[1] ?? '', batch: r[2] ?? '', level: r[3] ?? '',
        tournamentName: r[4] ?? '', type: r[5] ?? '', date: r[6] ?? '', venue: r[7] ?? '',
        roundsPlayed: r[8] ?? '', wins: r[9] ?? '', draws: r[10] ?? '', losses: r[11] ?? '',
        position: r[12] ?? '', ratingBefore: r[13] ?? '', ratingAfter: r[14] ?? '', ratingChange: r[15] ?? '',
        medal: r[16] ?? '', prizeAmount: r[17] ?? '', certificate: r[18] ?? '', coachNotes: r[19] ?? '',
        parentNotified: r[20] ?? '', rowIndex: i + 2,
      })).filter(t => t.studentName.toLowerCase() === student.name.toLowerCase());

      const parsedRegistrations = regRows.slice(1).map((r, i) => rowToRegistration(r, i + 2));
      const parsedWeekly = weeklyRows.slice(1).map((r, i) => rowToSavedWeeklyOnlineTournament(r, i + 2));

      // Latest fee status
      const latestFee = feeRows.slice(1).reverse().find(r => r[1]?.trim().toLowerCase() === student.name.toLowerCase());
      if (latestFee) {
        setFeeStatus({
          status: latestFee[11] || 'Pending',
          balance: Math.max(0, parseSheetNumber(latestFee[7] ?? '')),
          month: latestFee[3] || 'Current Month',
        });
      }

      setVerifiedStudent(student);
      setTournaments(parsedTournaments);
      setStudentBadges(calculateStudentBadges(student, parsedTournaments, parsedRegistrations, parsedWeekly));
    } catch (e: any) {
      setError(e.message || 'Could not verify student details.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const urlStudent = searchParams.get('student');
    const urlPin = searchParams.get('pin');
    if (urlStudent && urlPin) {
      void attemptVerify(urlStudent, urlPin);
    }
  }, [searchParams]);

  return (
    <div className="min-h-screen bg-[#f8f7f4] text-[#18182a] dark:bg-[#0f0f1e] dark:text-[#eeeae0] p-4 sm:p-6 flex flex-col items-center">
      {/* Header */}
      <header className="w-full max-w-lg flex items-center justify-between mb-6 pb-4 border-b border-gray-200 dark:border-gray-800">
        <div className="flex items-center gap-3">
          <img src="logo.jpg" alt="" className="w-10 h-10 rounded-xl object-cover shadow-sm" />
          <div>
            <h1 className="text-base font-bold text-gray-900 dark:text-white">KAFT Chess Academy</h1>
            <p className="text-xs font-semibold text-chess-blue">Parent &amp; Student Portal</p>
          </div>
        </div>
        <Link to="/" className="text-xs font-semibold text-gray-500 hover:text-chess-blue">Coach Login</Link>
      </header>

      {/* Verification Form */}
      {!verifiedStudent && (
        <div className="surface-card w-full max-w-lg p-6 space-y-4">
          <div className="flex items-center gap-2 text-chess-blue mb-1">
            <Lock size={18} />
            <h2 className="text-sm font-bold uppercase tracking-wider">Secure Student Access</h2>
          </div>
          <p className="text-xs text-gray-500">
            Enter your child’s name and the 4-digit PIN (last 4 digits of your registered phone number).
          </p>

          {error && <div className="error-state">{error}</div>}

          <div className="space-y-3">
            <label className="block">
              <span className="field-label">Student Name</span>
              <input value={studentNameInput} onChange={e => setStudentNameInput(e.target.value)}
                placeholder="e.g. Ishaan Rao" className="input" />
            </label>
            <label className="block">
              <span className="field-label">4-Digit PIN</span>
              <input type="password" maxLength={4} inputMode="numeric" value={pinInput} onChange={e => setPinInput(e.target.value)}
                placeholder="••••" className="input text-center tracking-widest text-lg" />
            </label>
            <button type="button" onClick={() => void attemptVerify(studentNameInput, pinInput)} disabled={loading}
              className="primary-action w-full mt-2">
              {loading ? 'Verifying…' : 'View Progress Card'}
            </button>
          </div>
        </div>
      )}

      {/* Student Progress Card */}
      {verifiedStudent && (
        <div className="w-full max-w-lg space-y-4 animate-route-enter">
          {/* Identity & Status */}
          <div className="surface-card p-5 space-y-3">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-xl font-extrabold text-gray-900 dark:text-white">{verifiedStudent.name}</h2>
                <p className="text-xs text-gray-500 mt-0.5">{verifiedStudent.batch} Batch {verifiedStudent.coachName ? `· Coach ${verifiedStudent.coachName}` : ''}</p>
              </div>
              <span className={verifiedStudent.status === 'Active' ? 'badge-green' : 'badge-gray'}>{verifiedStudent.status}</span>
            </div>

            {/* Badges Carousel */}
            {studentBadges.length > 0 && (
              <div className="pt-2 border-t border-gray-100 dark:border-gray-800">
                <p className="section-label mb-2 flex items-center gap-1.5"><Award size={13} /> Earned Milestones</p>
                <div className="grid grid-cols-2 gap-2">
                  {studentBadges.map(b => (
                    <div key={b.id} className="surface-card p-2.5 flex items-center gap-2 border border-amber-200 dark:border-amber-900/40 bg-amber-50/40 dark:bg-amber-950/20">
                      <span className="text-2xl">{b.icon}</span>
                      <div className="min-w-0">
                        <strong className="block text-xs font-bold text-gray-900 dark:text-white truncate">{b.title}</strong>
                        <span className="block text-[10px] text-gray-500 truncate">{b.description}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Attendance & Fees Overview */}
          <div className="grid grid-cols-2 gap-3">
            <div className="surface-card p-4 space-y-1">
              <div className="flex items-center justify-between text-chess-blue">
                <CalendarCheck size={18} />
                <span className="text-xs font-bold font-mono">This Month</span>
              </div>
              <p className="text-2xl font-black text-gray-900 dark:text-white mt-1">{verifiedStudent.thisMonthAttended || '0'}</p>
              <p className="text-xs text-gray-500">Classes Attended</p>
            </div>

            <div className="surface-card p-4 space-y-1">
              <div className="flex items-center justify-between text-green-600">
                <Wallet size={18} />
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${feeStatus?.status === 'Paid' ? 'badge-green' : 'badge-amber'}`}>
                  {feeStatus?.status || 'Active'}
                </span>
              </div>
              <p className="text-2xl font-black text-gray-900 dark:text-white mt-1">
                {feeStatus?.balance ? `₹${feeStatus.balance}` : '₹0 Due'}
              </p>
              <p className="text-xs text-gray-500">Fee Balance ({feeStatus?.month || 'Tuition'})</p>
            </div>
          </div>

          {/* Tournament Record */}
          <div className="surface-card p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-navy dark:text-gold flex items-center gap-1.5">
                <Trophy size={14} /> Tournament History
              </h3>
              <span className="badge-blue text-[10px]">{tournaments.length} entries</span>
            </div>

            {tournaments.length === 0 ? (
              <p className="text-xs text-gray-400 py-3 text-center">No tournament records yet.</p>
            ) : (
              <div className="space-y-2">
                {tournaments.slice(0, 4).map(t => (
                  <div key={t.rowIndex} className="border-b border-gray-100 dark:border-gray-800 pb-2 last:border-0 last:pb-0">
                    <div className="flex items-start justify-between">
                      <p className="text-sm font-semibold text-gray-900 dark:text-white">{t.tournamentName}</p>
                      {t.medal && t.medal !== 'None' && <span className="text-xs font-bold text-amber-600">🎖 {t.medal}</span>}
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5">{t.date || t.month} · {t.position ? `Rank ${t.position}` : 'Completed'}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Academy Contact */}
          <div className="surface-card p-4 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <h4 className="text-xs font-bold text-gray-900 dark:text-white">Have questions?</h4>
              <p className="text-xs text-gray-500">Contact KAFT Academy coordinators</p>
            </div>
            <a href={buildWhatsAppUrl('9988776655', "Hello Coach, I have a question regarding my child's classes.")}
              target="_blank" rel="noopener noreferrer"
              className="primary-action text-xs px-3 py-2 flex items-center gap-1.5">
              <MessageCircle size={14} /> WhatsApp
            </a>
          </div>

          <button type="button" onClick={() => setVerifiedStudent(null)} className="text-xs text-gray-400 hover:underline block mx-auto py-2">
            Sign in as different student
          </button>
        </div>
      )}
    </div>
  );
}

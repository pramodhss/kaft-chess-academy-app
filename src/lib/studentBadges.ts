import type { Student, TournamentEntry } from '../types';
import type { TournamentRegistration } from './tournamentManagement';
import type { SavedWeeklyOnlineTournament } from './weeklyOnlineTournament';
import { matchOnlineTournamentResults } from './onlineTournamentMatch';

export interface StudentMilestoneBadge {
  id: string;
  title: string;
  description: string;
  icon: string;
  tone: 'gold' | 'blue' | 'green' | 'purple' | 'amber';
}

/** Evaluates earned milestone achievements for a student based on attendance,
 * ratings, tournament achievements, and tenure. */
export function calculateStudentBadges(
  student: Student,
  offlineTournaments: TournamentEntry[] = [],
  registrations: TournamentRegistration[] = [],
  weeklyResults: SavedWeeklyOnlineTournament[] = [],
): StudentMilestoneBadge[] {
  const badges: StudentMilestoneBadge[] = [];

  // 1. Attendance Star (100% or 8+ classes in current month)
  const attendedCount = Number.parseInt(student.thisMonthAttended || '0', 10);
  if (attendedCount >= 8) {
    badges.push({
      id: 'attendance-star',
      title: 'Attendance Star',
      description: `${attendedCount} classes attended this month`,
      icon: '🌟',
      tone: 'gold',
    });
  }

  // 2. Tournament Gold / Champion
  const studentOffline = offlineTournaments.filter(t => t.studentName.trim().toLowerCase() === student.name.trim().toLowerCase());
  const onlineMatches = matchOnlineTournamentResults(weeklyResults, [{
    name: student.name,
    lichessUsername: student.lichessUsername,
    chessComUsername: student.chessComUsername,
  }]);

  const hasGold = studentOffline.some(t => t.medal === 'Gold' || t.position === '1' || t.position === '1st');
  const hasOnlineWinner = onlineMatches.some(m => m.rank === 1);
  if (hasGold || hasOnlineWinner) {
    badges.push({
      id: 'tournament-champion',
      title: 'Tournament Champion',
      description: 'Won 1st place / Gold in academy or online tournaments',
      icon: '🥇',
      tone: 'gold',
    });
  } else {
    const hasPodium = studentOffline.some(t => ['Silver', 'Bronze'].includes(t.medal) || ['2', '2nd', '3', '3rd'].includes(t.position))
      || onlineMatches.some(m => m.rank <= 3);
    if (hasPodium) {
      badges.push({
        id: 'podium-finisher',
        title: 'Podium Finisher',
        description: 'Placed Top 3 in competitive tournaments',
        icon: '🥈',
        tone: 'blue',
      });
    }
  }

  // 3. Tournament Veteran (active player)
  const totalTournaments = studentOffline.length + registrations.filter(r => r.studentName.trim().toLowerCase() === student.name.trim().toLowerCase() && r.playing).length + onlineMatches.length;
  if (totalTournaments >= 3) {
    badges.push({
      id: 'tournament-veteran',
      title: 'Active Competitor',
      description: `Participated in ${totalTournaments} tournament events`,
      icon: '🏆',
      tone: 'purple',
    });
  }

  // 4. Rated Player / Prodigy
  const classical = Number.parseInt(student.ratingClassical || '0', 10);
  const rapid = Number.parseInt(student.ratingRapid || '0', 10);
  const blitz = Number.parseInt(student.ratingBlitz || '0', 10);
  const maxRating = Math.max(classical, rapid, blitz);

  if (student.fideId.trim() || maxRating >= 1200) {
    badges.push({
      id: 'rated-prodigy',
      title: 'FIDE Rated / 1200+',
      description: student.fideId ? `Official FIDE ID: ${student.fideId}` : `Highest rating: ${maxRating}`,
      icon: '♟',
      tone: 'amber',
    });
  } else if (student.aicfId.trim() || student.tnscaId.trim() || maxRating >= 1000) {
    badges.push({
      id: 'federation-player',
      title: 'Federation Member',
      description: student.tnscaId ? `TNSCA: ${student.tnscaId}` : `AICF: ${student.aicfId}`,
      icon: '🎖',
      tone: 'blue',
    });
  }

  // 5. Dedicated Scholar (joined over 90 days ago)
  if (student.joiningDate) {
    const joinDate = new Date(student.joiningDate);
    if (!Number.isNaN(joinDate.getTime())) {
      const daysSince = Math.round((Date.now() - joinDate.getTime()) / (1000 * 60 * 60 * 24));
      if (daysSince >= 90) {
        badges.push({
          id: 'dedicated-scholar',
          title: 'Dedicated Student',
          description: `Academy member for ${Math.floor(daysSince / 30)} months`,
          icon: '🎓',
          tone: 'green',
        });
      }
    }
  }

  return badges;
}

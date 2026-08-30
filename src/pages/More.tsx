import { useNavigate } from 'react-router-dom';
import {
  CalendarDays, ChevronRight, CircleUserRound,
  ExternalLink, Gauge, Library, LogOut, Medal,
  Moon, ReceiptText, SlidersHorizontal, Sun, TrendingUp, Trophy,
  Type,
} from 'lucide-react';
import { Layout } from '../components/Layout';
import { useAuth } from '../context/AuthContext';
import { useCoachName } from '../hooks/useCoachName';
import { useTheme } from '../hooks/useTheme';
import { useDensity } from '../hooks/useDensity';
import { useTextSize } from '../hooks/useTextSize';
import { ACADEMY_LINKS, SOCIAL } from '../config';

const PRIMARY_TILES = [
  {
    to: '/timetable',
    Icon: CalendarDays,
    label: 'Weekly Timetable',
    desc: 'Class schedule, batches & rooms',
    color: 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/30',
  },
  {
    to: '/progress',
    Icon: TrendingUp,
    label: 'Student Progress',
    desc: 'Attendance trends & skill charts',
    color: 'text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-950/30',
  },
  {
    to: '/operations',
    Icon: SlidersHorizontal,
    label: 'Operations & Broadcasts',
    desc: 'WhatsApp alerts, analytics & backup',
    color: 'text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-950/30',
  },
  {
    to: '/upcoming',
    Icon: Trophy,
    label: 'Tournament Events',
    desc: 'Rosters, fees & online imports',
    color: 'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30',
  },
  {
    to: '/tournaments',
    Icon: Medal,
    label: 'Results & Leaderboard',
    desc: 'Auto-tracked scores & medal standings',
    color: 'text-gold dark:text-gold bg-amber-50/60 dark:bg-amber-950/20',
  },
  {
    to: '/resources',
    Icon: Library,
    label: 'Study Materials',
    desc: 'PDFs, worksheets & Drive links',
    color: 'text-cyan-600 dark:text-cyan-400 bg-cyan-50 dark:bg-cyan-950/30',
  },
];

const SOCIALS = [
  { key:'whatsapp',  label:'WhatsApp', url:SOCIAL.whatsapp  },
  { key:'facebook',  label:'Facebook', url:SOCIAL.facebook  },
  { key:'instagram', label:'Instagram',url:SOCIAL.instagram },
  { key:'youtube',   label:'YouTube',  url:SOCIAL.youtube   },
].filter(({ key, url }) => {
  if (key === 'whatsapp') return /^https:\/\/wa\.me\/\d+/.test(url);
  try { return new URL(url).pathname !== '/'; } catch { return false; }
});

const USEFUL_LINKS = [
  { key:'fide', label:'FIDE Ratings', desc:'Official player profiles and ratings', Icon:Gauge, url:ACADEMY_LINKS.fideRatings },
  { key:'chess-results', label:'Chess-Results', desc:'Tournament pairings, standings and results', Icon:Trophy, url:ACADEMY_LINKS.chessResults },
  { key:'tamil', label:'Tamil Chess', desc:'Tamil Nadu chess news and tournaments', Icon:Trophy, url:ACADEMY_LINKS.tamilChess },
  { key:'easy-pay', label:'Easy Pay Chess', desc:'Tournament registration and payments', Icon:ReceiptText, url:ACADEMY_LINKS.easyPayChess },
  { key:'aicf', label:'AICF Events', desc:'All India Chess Federation events', Icon:CalendarDays, url:ACADEMY_LINKS.aicfEvents },
];

export function More() {
  const navigate = useNavigate();
  const { logout } = useAuth();
  const { coachName, setShowPrompt } = useCoachName();
  const { dark, toggle } = useTheme();
  const { density, toggleDensity } = useDensity();
  const { textSize, setTextSize } = useTextSize();

  return (
    <Layout title="More">
      <div className="space-y-4 p-4 md:p-6 max-w-4xl mx-auto">
        {/* 1. Coach Profile & Preferences */}
        <section className="surface-card p-4 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <span className="flex h-11 w-11 flex-none items-center justify-center rounded-2xl bg-amber-500/10 text-chess-blue">
                <CircleUserRound size={24} />
              </span>
              <div className="min-w-0">
                <strong className="block text-base font-bold text-gray-900 dark:text-white truncate">
                  {coachName || 'Coach'}
                </strong>
                <p className="text-xs text-gray-500 truncate">KAFT Chess Academy</p>
              </div>
            </div>
            <button type="button" onClick={() => setShowPrompt(true)}
              className="text-xs font-semibold text-chess-blue hover:underline flex-shrink-0 px-2 py-1">
              Edit Name
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-3 border-t border-gray-100 dark:border-gray-800">
            {/* Theme Toggle */}
            <div className="flex items-center justify-between p-2.5 rounded-xl bg-gray-50 dark:bg-gray-900/50 border border-gray-100 dark:border-gray-800">
              <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">{dark ? 'Dark mode' : 'Light mode'}</span>
              <button type="button" onClick={toggle} aria-pressed={dark}
                className="theme-toggle w-12 h-6 rounded-full transition-colors relative flex items-center px-0.5 flex-shrink-0">
                <span className={`w-5 h-5 rounded-full bg-white shadow transition-transform flex items-center justify-center ${dark ? 'translate-x-6 text-navy' : 'translate-x-0 text-gray-500'}`}>
                  {dark ? <Moon size={11} /> : <Sun size={11} />}
                </span>
              </button>
            </div>

            {/* Density Toggle */}
            <div className="flex items-center justify-between p-2.5 rounded-xl bg-gray-50 dark:bg-gray-900/50 border border-gray-100 dark:border-gray-800">
              <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">Density</span>
              <button type="button" onClick={toggleDensity} className="text-xs font-bold px-2 py-0.5 rounded-lg bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 border border-gray-200 dark:border-gray-700">
                {density === 'compact' ? 'Compact' : 'Normal'}
              </button>
            </div>

            {/* Text Size */}
            <div className="flex flex-col justify-center p-2.5 rounded-xl bg-gray-50 dark:bg-gray-900/50 border border-gray-100 dark:border-gray-800">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-1"><Type size={13} /> Text</span>
                <span className="text-[10px] font-mono font-bold text-gray-500">{textSize}%</span>
              </div>
              <input type="range" min="90" max="110" step="5" value={textSize} onChange={event => setTextSize(Number(event.target.value))} aria-label="Text size" className="text-size-slider w-full h-1" />
            </div>
          </div>
        </section>

        {/* 2. Primary Management Hub */}
        <section className="space-y-2">
          <p className="section-label px-1">Management Hub</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {PRIMARY_TILES.map(({ to, Icon, label, desc, color }) => (
              <button type="button" key={to} onClick={() => navigate(to)}
                className="surface-card card-btn flex items-center gap-3.5 p-4 text-left group">
                <span className={`flex h-11 w-11 flex-none items-center justify-center rounded-xl ${color}`}>
                  <Icon size={21} strokeWidth={1.8} aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-bold text-gray-900 dark:text-white truncate group-hover:text-chess-blue transition-colors">
                    {label}
                  </span>
                  <span className="block text-xs text-gray-400 truncate mt-0.5">{desc}</span>
                </span>
                <ChevronRight size={16} className="hover-arrow text-gray-300 dark:text-gray-600 flex-shrink-0" aria-hidden="true" />
              </button>
            ))}
          </div>
        </section>

        {/* 3. External Chess Links & Social */}
        <details className="surface-card overflow-hidden">
          <summary className="flex cursor-pointer list-none items-center justify-between p-4">
            <span className="min-w-0 flex-1">
              <strong className="section-label block text-navy dark:text-gold">Chess Portals &amp; Federation Links</strong>
              <span className="text-xs text-gray-400">Ratings, pairings, tournament registration &amp; social channels</span>
            </span>
            <ChevronRight size={17} className="timeline-chevron text-gray-400" />
          </summary>

          <div className="border-t border-gray-100 dark:border-gray-800 p-4 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {USEFUL_LINKS.map(({ key, label, desc, Icon, url }) => (
                <a key={key} href={url} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-3 rounded-xl border border-gray-100 dark:border-gray-800 bg-gray-50/70 dark:bg-gray-900/40 p-3 hover:border-chess-blue/40 transition-colors">
                  <span className="w-8 h-8 rounded-lg bg-navy/10 dark:bg-gold/10 text-navy dark:text-gold flex items-center justify-center flex-shrink-0">
                    <Icon size={16} strokeWidth={1.8} aria-hidden="true" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold text-gray-900 dark:text-white truncate">{label}</p>
                    <p className="text-[10px] text-gray-400 truncate">{desc}</p>
                  </div>
                  <ExternalLink size={14} className="text-gray-400" aria-hidden="true" />
                </a>
              ))}
            </div>

            {SOCIALS.length > 0 && (
              <div className="pt-2 border-t border-gray-100 dark:border-gray-800 flex flex-wrap gap-2 items-center">
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Social:</span>
                {SOCIALS.map(({ key, label, url }) => (
                  <a key={key} href={url} target="_blank" rel="noopener noreferrer"
                    className="text-xs font-semibold px-3 py-1 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:text-chess-blue flex items-center gap-1">
                    <ExternalLink size={11} /> {label}
                  </a>
                ))}
              </div>
            )}
          </div>
        </details>

        {/* 4. Sign Out */}
        <button type="button" onClick={logout}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-gray-200 dark:border-gray-800 bg-gray-100 dark:bg-gray-900 p-3.5 text-sm font-semibold text-gray-600 dark:text-gray-300 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/30 dark:hover:text-red-400 transition-colors">
          <LogOut size={16} aria-hidden="true" /> Sign Out from Academy
        </button>
      </div>
    </Layout>
  );
}

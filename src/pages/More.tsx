import { useNavigate } from 'react-router-dom';
import {
  BookOpenCheck, Bus, CalendarDays, ChartNoAxesCombined, ChevronRight, CircleUserRound,
  ExternalLink, Gauge, Library, LogOut, Medal,
  Moon, ReceiptText, Sun, Trophy, Workflow,
  Type,
} from 'lucide-react';
import { Layout } from '../components/Layout';
import { useAuth } from '../context/AuthContext';
import { useCoachName } from '../hooks/useCoachName';
import { useTheme } from '../hooks/useTheme';
import { useDensity } from '../hooks/useDensity';
import { useTextSize } from '../hooks/useTextSize';
import { ACADEMY_LINKS, SOCIAL } from '../config';

const ITEMS = [
  { to:'/operations', Icon:Workflow, label:'Operations & Data', desc:'Follow-ups, quality, settings and exports', hi:true },
  { to:'/progress',       Icon:ChartNoAxesCombined, label:'Student Insights', desc:'Progress, timeline and PDF reports' },
  { to:'/leaderboard',    Icon:Medal, label:'Leaderboard', desc:'Tournament rankings by medals and wins' },
  { to:'/upcoming',       Icon:CalendarDays, label:'Upcoming Tournaments', desc:'Post and view upcoming events' },
  { to:'/resources',      Icon:Library, label:'Resources & eBooks', desc:'Share study material and links' },
  { to:'/curriculum',     Icon:BookOpenCheck, label:'Curriculum', desc:'Beginner to advanced chess syllabus' },
  { to:'/tournaments',    Icon:Trophy, label:'Tournament Results', desc:'Past results, ratings and medals' },
  { to:'/van',            Icon:Bus, label:'Tournament Transport', desc:'Assign students, vans and drivers' },
  { to:'/timetable',      Icon:CalendarDays, label:'Weekly Classes', desc:'Allocate batches, coaches, times and rooms' },
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
      <div className="space-y-4 p-4 md:p-6">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {ITEMS.map(({ to, Icon, label, desc, hi }) => (
            <button type="button" key={to} onClick={() => navigate(to)}
              className={`surface-card flex w-full items-center gap-3 p-3 text-left transition-colors hover:border-chess-blue/30 ${hi ? 'border-l-[3px] border-l-chess-blue' : ''}`}>
              <span className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg ${hi ? 'bg-navy text-chess-light' : 'bg-gray-100 text-navy'}`}>
                <Icon size={20} strokeWidth={1.8} aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <p className="font-semibold text-gray-900">{label}</p>
                <p className="truncate text-xs text-gray-400">{desc}</p>
              </div>
              <ChevronRight size={17} className="ml-auto flex-shrink-0 text-gray-300" aria-hidden="true" />
            </button>
          ))}
        </div>
        <div className="surface-card p-4">
          <p className="section-label mb-3 text-navy">Useful Chess Links</p>
          <div className="space-y-2">
            {USEFUL_LINKS.map(({ key, label, desc, Icon, url }) => (
              <a key={key} href={url} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-3 rounded-lg border border-gray-100 bg-gray-50 p-3 transition-colors hover:border-chess-blue/30">
                <span className="w-10 h-10 rounded-lg bg-navy text-chess-light flex items-center justify-center flex-shrink-0">
                  <Icon size={20} strokeWidth={1.8} aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-gray-900">{label}</span>
                  <span className="block text-xs text-gray-400 mt-0.5">{desc}</span>
                </span>
                <ExternalLink size={16} className="text-gray-400" aria-hidden="true" />
              </a>
            ))}
          </div>
        </div>
        {SOCIALS.length > 0 && (
          <div className="surface-card p-4">
            <p className="section-label mb-3 text-navy">Academy Social Media</p>
            <div className="grid grid-cols-2 gap-2">
              {SOCIALS.map(({ key, label, url }) => (
                <a key={key} href={url} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-2 rounded-lg border border-gray-100 bg-gray-50 p-3 text-sm font-medium text-gray-700">
                  <ExternalLink size={18} strokeWidth={1.8} className="text-navy" aria-hidden="true" />{label}
                </a>
              ))}
            </div>
          </div>
        )}
        <div className="surface-card p-4">
          <p className="section-label mb-2 text-navy">Logged in as</p>
          <p className="font-semibold text-gray-900 flex items-center gap-2"><CircleUserRound size={18} />{coachName || '—'}</p>
          <button type="button" onClick={() => setShowPrompt(true)} className="text-xs text-chess-blue mt-1">Change name</button>
          <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100">
            <span className="text-sm text-gray-600">{dark ? 'Dark mode' : 'Light mode'}</span>
            <button type="button" onClick={toggle}
              className={`w-14 h-7 rounded-full transition-colors relative flex items-center px-0.5 flex-shrink-0 ${dark ? 'bg-navy' : 'bg-gray-200'}`}>
              <span className={`w-6 h-6 rounded-full bg-white shadow transition-transform flex items-center justify-center ${dark ? 'translate-x-7' : 'translate-x-0'}`}>
                {dark ? <Moon size={13} /> : <Sun size={13} />}
              </span>
            </button>
          </div>
          <div className="mt-3 flex items-center justify-between border-t border-gray-100 pt-3">
            <span className="text-sm text-gray-600">Display density</span>
            <button type="button" onClick={toggleDensity} className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5 text-xs font-semibold text-gray-700">
              {density === 'compact' ? 'Compact' : 'Comfortable'}
            </button>
          </div>
          <div className="mt-3 border-t border-gray-100 pt-3">
            <div className="mb-2 flex items-center justify-between gap-3"><span className="flex items-center gap-2 text-sm text-gray-600"><Type size={16} />Text size</span><output className="text-xs font-semibold text-gray-600">{textSize}%</output></div>
            <input type="range" min="90" max="110" step="5" value={textSize} onChange={event => setTextSize(Number(event.target.value))} aria-label="Text size" className="text-size-slider w-full" />
            <div className="mt-1 flex justify-between text-[10px] text-gray-400"><span>Smaller</span><span>Larger</span></div>
          </div>
        </div>
        <button type="button" onClick={logout} className="flex w-full items-center justify-center gap-2 rounded-lg border border-gray-200 bg-gray-100 p-3 text-sm font-medium text-gray-600">
          <LogOut size={17} aria-hidden="true" /> Sign Out
        </button>
      </div>
    </Layout>
  );
}

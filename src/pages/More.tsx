import { useNavigate } from 'react-router-dom';
import {
  Bus, CalendarDays, Camera, ChartNoAxesCombined, ChevronRight, CircleUserRound,
  ExternalLink, FileChartColumn, Gauge, Library, LogOut, Medal,
  MessageCircle, Moon, Play, ReceiptText, Share2, Sun, Trophy,
} from 'lucide-react';
import { Layout } from '../components/Layout';
import { useAuth } from '../context/AuthContext';
import { useCoachName } from '../hooks/useCoachName';
import { useTheme } from '../hooks/useTheme';
import { ACADEMY_LINKS, SOCIAL } from '../config';

const ITEMS = [
  { to:'/progress',       Icon:ChartNoAxesCombined, label:'Student Progress', desc:'Attendance and skill rating trends' },
  { to:'/leaderboard',    Icon:Medal, label:'Leaderboard', desc:'Tournament rankings by medals and wins' },
  { to:'/monthly-report', Icon:FileChartColumn, label:'Monthly Report', desc:'Attendance, fees and achievements', hi:true },
  { to:'/upcoming',       Icon:CalendarDays, label:'Upcoming Tournaments', desc:'Post and view upcoming events' },
  { to:'/resources',      Icon:Library, label:'Resources & eBooks', desc:'Share study material and links' },
  { to:'/tournaments',    Icon:Trophy, label:'Tournament Results', desc:'Past results, ratings and medals' },
  { to:'/van',            Icon:Bus, label:'Van Allotment', desc:'Transport and route details' },
  { to:'/timetable',      Icon:CalendarDays, label:'Timetable', desc:'Weekend class schedule' },
];

const SOCIALS = [
  { key:'whatsapp',  label:'WhatsApp', Icon:MessageCircle, url:SOCIAL.whatsapp  },
  { key:'facebook',  label:'Facebook', Icon:Share2, url:SOCIAL.facebook  },
  { key:'instagram', label:'Instagram',Icon:Camera, url:SOCIAL.instagram },
  { key:'youtube',   label:'YouTube',  Icon:Play, url:SOCIAL.youtube   },
];

const USEFUL_LINKS = [
  { key:'fide', label:'FIDE Ratings', desc:'Official player profiles and ratings', Icon:Gauge, url:ACADEMY_LINKS.fideRatings },
  { key:'tamil', label:'Tamil Chess', desc:'Tamil Nadu chess news and tournaments', Icon:Trophy, url:ACADEMY_LINKS.tamilChess },
  { key:'easy-pay', label:'Easy Pay Chess', desc:'Tournament registration and payments', Icon:ReceiptText, url:ACADEMY_LINKS.easyPayChess },
  { key:'aicf', label:'AICF Events', desc:'All India Chess Federation events', Icon:CalendarDays, url:ACADEMY_LINKS.aicfEvents },
];

export function More() {
  const navigate = useNavigate();
  const { logout } = useAuth();
  const { coachName, setShowPrompt } = useCoachName();
  const { dark, toggle } = useTheme();
  return (
    <Layout title="More">
      <div className="p-4 space-y-3">
        {ITEMS.map(({ to, Icon, label, desc, hi }) => (
          <button type="button" key={to} onClick={() => navigate(to)}
            className={`w-full rounded-xl p-4 shadow-sm border text-left flex items-center gap-4 active:scale-[0.98] transition-transform
              ${hi ? 'bg-navy text-white border-navy' : 'bg-white border-gray-100'}`}>
            <span className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${hi ? 'bg-white/10' : 'bg-gray-100 text-navy'}`}>
              <Icon size={20} strokeWidth={1.8} aria-hidden="true" />
            </span>
            <div>
              <p className={`font-semibold ${hi ? 'text-white' : 'text-gray-900'}`}>{label}</p>
              <p className={`text-xs ${hi ? 'text-chess-light' : 'text-gray-400'}`}>{desc}</p>
            </div>
            <ChevronRight size={18} className={`ml-auto ${hi ? 'text-white/50' : 'text-gray-300'}`} aria-hidden="true" />
          </button>
        ))}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
          <p className="text-xs font-bold text-navy uppercase tracking-wider mb-3">Useful Chess Links</p>
          <div className="space-y-2">
            {USEFUL_LINKS.map(({ key, label, desc, Icon, url }) => (
              <a key={key} href={url} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-3 rounded-xl border border-gray-100 bg-gray-50 p-3">
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
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
          <p className="text-xs font-bold text-navy uppercase tracking-wider mb-3">Academy Social Media</p>
          <div className="grid grid-cols-2 gap-2">
            {SOCIALS.map(({ key, label, Icon, url }) => (
              <a key={key} href={url} target="_blank" rel="noopener noreferrer"
                className="bg-gray-50 text-gray-700 border border-gray-100 rounded-xl p-3 flex items-center gap-2 font-medium text-sm">
                <Icon size={18} strokeWidth={1.8} className="text-navy" aria-hidden="true" />{label}
              </a>
            ))}
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
          <p className="text-xs font-bold text-navy uppercase tracking-wider mb-2">Logged in as</p>
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
        </div>
        <button type="button" onClick={logout} className="w-full bg-gray-100 text-gray-600 rounded-xl p-4 text-sm font-medium flex items-center justify-center gap-2">
          <LogOut size={17} aria-hidden="true" /> Sign Out
        </button>
      </div>
    </Layout>
  );
}

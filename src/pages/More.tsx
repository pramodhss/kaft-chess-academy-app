import { useNavigate } from 'react-router-dom';
import { Layout } from '../components/Layout';
import { useAuth } from '../context/AuthContext';
import { useCoachName } from '../hooks/useCoachName';
import { useTheme } from '../hooks/useTheme';
import { SOCIAL } from '../config';

const ITEMS = [
  { to:'/progress',    icon:'📈', label:'Student Progress',    desc:'Attendance & skill rating trends per student'              },
  { to:'/leaderboard',    icon:'🏆', label:'Leaderboard',         desc:'Tournament rankings by medals & wins' },
  { to:'/monthly-report', icon:'📊', label:'Monthly Report',       desc:'Attendance + fees + achievements per student', hi:true as true },
  { to:'/upcoming',       icon:'📋', label:'Upcoming Tournaments', desc:'Post and view upcoming events'                        },
  { to:'/resources',      icon:'📚', label:'Resources & eBooks',   desc:'Share study material and links'                       },
  { to:'/tournaments',    icon:'🏆', label:'Tournament Results',   desc:'Past results, ratings & medals'                       },
  { to:'/van',            icon:'🚐', label:'Van Allotment',        desc:'Transport & route details'                            },
  { to:'/timetable',      icon:'📅', label:'Timetable',           desc:'Weekend class schedule'                               },
];

const SOCIALS = [
  { key:'whatsapp',  label:'WhatsApp', color:'bg-green-500', emoji:'💬', url:SOCIAL.whatsapp  },
  { key:'facebook',  label:'Facebook', color:'bg-blue-600',  emoji:'f',  url:SOCIAL.facebook  },
  { key:'instagram', label:'Instagram',color:'bg-pink-500',  emoji:'📸', url:SOCIAL.instagram },
  { key:'youtube',   label:'YouTube',  color:'bg-red-600',   emoji:'▶',  url:SOCIAL.youtube   },
];

export function More() {
  const navigate = useNavigate();
  const { logout } = useAuth();
  const { coachName, setShowPrompt } = useCoachName();
  const { dark, toggle } = useTheme();
  return (
    <Layout title="More">
      <div className="p-4 space-y-3">
        {ITEMS.map(({ to, icon, label, desc, hi }) => (
          <button key={to} onClick={() => navigate(to)}
            className={`w-full rounded-xl p-4 shadow-sm border text-left flex items-center gap-4 active:scale-[0.98] transition-transform
              ${hi ? 'bg-navy text-white border-navy' : 'bg-white border-gray-100'}`}>
            <span className="text-3xl w-10 text-center">{icon}</span>
            <div>
              <p className={`font-semibold ${hi ? 'text-white' : 'text-gray-900'}`}>{label}</p>
              <p className={`text-xs ${hi ? 'text-chess-light' : 'text-gray-400'}`}>{desc}</p>
            </div>
            <span className={`ml-auto text-xl ${hi ? 'text-white/50' : 'text-gray-300'}`}>›</span>
          </button>
        ))}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
          <p className="text-xs font-bold text-navy uppercase tracking-wider mb-3">Academy Social Media</p>
          <div className="grid grid-cols-2 gap-2">
            {SOCIALS.map(({ key, label, color, emoji, url }) => (
              <a key={key} href={url} target="_blank" rel="noopener noreferrer"
                className={`${color} text-white rounded-xl p-3 flex items-center gap-2 font-medium text-sm`}>
                <span className="text-lg">{emoji}</span>{label}
              </a>
            ))}
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
          <p className="text-xs font-bold text-navy uppercase tracking-wider mb-2">Logged in as</p>
          <p className="font-semibold text-gray-900">{coachName || '—'}</p>
          <button onClick={() => setShowPrompt(true)} className="text-xs text-chess-blue mt-1">Change name</button>
          <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100">
            <span className="text-sm text-gray-600">{dark ? 'Dark mode' : 'Light mode'}</span>
            <button onClick={toggle}
              className={`w-14 h-7 rounded-full transition-colors relative flex items-center px-0.5 flex-shrink-0 ${dark ? 'bg-navy' : 'bg-gray-200'}`}>
              <span className={`w-6 h-6 rounded-full bg-white shadow transition-transform flex items-center justify-center text-sm ${dark ? 'translate-x-7' : 'translate-x-0'}`}>{dark ? '🌙' : '☀️'}</span>
            </button>
          </div>
        </div>
        <button onClick={logout} className="w-full bg-gray-100 text-gray-600 rounded-xl p-4 text-sm font-medium flex items-center justify-center gap-2">
          🚪 Sign Out
        </button>
      </div>
    </Layout>
  );
}

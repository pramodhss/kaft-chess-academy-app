import { useNavigate } from 'react-router-dom';
import { Layout } from '../components/Layout';
import { useAuth } from '../context/AuthContext';
import { SOCIAL } from '../config';

const ITEMS = [
  { to: '/monthly-report', icon: '📊', label: 'Monthly Report',  desc: 'Attendance, fees & achievements per student', highlight: true },
  { to: '/tournaments',    icon: '🏆', label: 'Tournaments',     desc: 'Results, ratings & medals'   },
  { to: '/van',            icon: '🚐', label: 'Van Allotment',   desc: 'Transport & route details'   },
  { to: '/timetable',     icon: '📅', label: 'Timetable',       desc: 'Weekend class schedule'      },
];

const SOCIAL_BUTTONS = [
  { key: 'whatsapp',  label: 'WhatsApp', color: 'bg-green-500',   emoji: '💬', url: SOCIAL.whatsapp  },
  { key: 'facebook',  label: 'Facebook', color: 'bg-blue-600',    emoji: 'f',  url: SOCIAL.facebook  },
  { key: 'instagram', label: 'Instagram',color: 'bg-pink-500',    emoji: '📸', url: SOCIAL.instagram },
  { key: 'youtube',   label: 'YouTube',  color: 'bg-red-600',     emoji: '▶',  url: SOCIAL.youtube   },
];

export function More() {
  const navigate = useNavigate();
  const { logout } = useAuth();
  return (
    <Layout title="More">
      <div className="p-4 space-y-4">
        {/* Nav items */}
        {ITEMS.map(({ to, icon, label, desc, highlight }) => (
          <button key={to} onClick={() => navigate(to)}
            className={`w-full rounded-xl p-4 shadow-sm border text-left flex items-center gap-4 active:scale-[0.98] transition-transform
              ${highlight ? 'bg-navy text-white border-navy' : 'bg-white border-gray-100'}`}>
            <span className="text-3xl w-10 text-center">{icon}</span>
            <div>
              <p className={`font-semibold ${highlight ? 'text-white' : 'text-gray-900'}`}>{label}</p>
              <p className={`text-xs ${highlight ? 'text-chess-light' : 'text-gray-400'}`}>{desc}</p>
            </div>
            <span className={`ml-auto text-xl ${highlight ? 'text-white/50' : 'text-gray-300'}`}>›</span>
          </button>
        ))}

        {/* Social media */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
          <p className="text-xs font-bold text-navy uppercase tracking-wider mb-3">Academy Social Media</p>
          <p className="text-xs text-gray-400 mb-3">
            Update the links in <code className="bg-gray-100 px-1 rounded">src/config.ts</code> → SOCIAL
          </p>
          <div className="grid grid-cols-2 gap-2">
            {SOCIAL_BUTTONS.map(({ key, label, color, emoji, url }) => (
              <a key={key} href={url} target="_blank" rel="noopener noreferrer"
                className={`${color} text-white rounded-xl p-3 flex items-center gap-2 font-medium text-sm active:opacity-80`}>
                <span className="text-lg">{emoji}</span>
                {label}
              </a>
            ))}
          </div>
        </div>

        {/* Sign out */}
        <button onClick={logout}
          className="w-full bg-gray-100 text-gray-600 rounded-xl p-4 text-sm font-medium flex items-center justify-center gap-2">
          🚪 Sign Out
        </button>
      </div>
    </Layout>
  );
}

import { NavLink } from 'react-router-dom';

const NAV = [
  { to: '/',            icon: '📊', label: 'Dashboard' },
  { to: '/students',    icon: '👥', label: 'Students'  },
  { to: '/attendance',  icon: '✅', label: 'Attendance' },
  { to: '/fees',        icon: '💰', label: 'Fees'       },
  { to: '/more',        icon: '☰',  label: 'More'       },
];

export function BottomNav() {
  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 flex z-50 safe-area-pb">
      {NAV.map(({ to, icon, label }) => (
        <NavLink
          key={to}
          to={to}
          end={to === '/'}
          className={({ isActive }) =>
            `flex-1 flex flex-col items-center py-2 text-xs font-medium transition-colors
             ${isActive ? 'text-navy' : 'text-gray-400'}`
          }
        >
          <span className="text-xl leading-none mb-0.5">{icon}</span>
          <span>{label}</span>
        </NavLink>
      ))}
    </nav>
  );
}

import { NavLink } from 'react-router-dom';
import { BarChart3, CalendarCheck, SlidersHorizontal, Users, Wallet } from 'lucide-react';

const NAV = [
  { to: '/',             Icon: BarChart3,         label: 'Dashboard' },
  { to: '/students',     Icon: Users,             label: 'Students'  },
  { to: '/attendance',   Icon: CalendarCheck,     label: 'Attendance'},
  { to: '/fees',         Icon: Wallet,            label: 'Fees'       },
  { to: '/more',         Icon: SlidersHorizontal, label: 'More'       },
];

export function BottomNav() {
  return (
    <nav aria-label="Primary navigation" className="bottom-nav fixed bottom-0 left-0 right-0 z-40 flex items-center justify-around px-1.5 py-1 md:hidden">
      {NAV.map(({ to, Icon, label }) => (
        <NavLink
          key={to}
          to={to}
          end={to === '/'}
          className={({ isActive }) =>
            `bottom-nav-item relative flex flex-1 flex-col items-center justify-center py-1 px-1 rounded-2xl transition-all duration-200 active:scale-90 ${
              isActive
                ? 'text-amber-500 dark:text-amber-400 font-bold'
                : 'text-slate-600 dark:text-gray-400 hover:text-slate-900 dark:hover:text-gray-200 font-medium'
            }`
          }
        >
          {({ isActive }) => (
            <>
              <span className={`relative flex items-center justify-center w-11 h-7 rounded-full transition-all duration-200 ${
                isActive
                  ? 'bg-amber-500/15 dark:bg-amber-400/20 shadow-sm shadow-amber-500/10'
                  : 'bg-transparent'
              }`}>
                <Icon size={18} strokeWidth={isActive ? 2.4 : 1.8} aria-hidden="true" />
                {isActive && (
                  <span className="bottom-nav-indicator absolute -bottom-0.5 w-1.5 h-1.5 rounded-full bg-amber-500 dark:bg-amber-400 shadow-sm" />
                )}
              </span>
              <span className="text-[10px] tracking-tight leading-tight mt-0.5 truncate max-w-[56px]">{label}</span>
            </>
          )}
        </NavLink>
      ))}
    </nav>
  );
}

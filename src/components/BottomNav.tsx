import { NavLink } from 'react-router-dom';
import { CalendarCheck, LayoutDashboard, Menu, ReceiptIndianRupee, Users } from 'lucide-react';

const NAV = [
  { to: '/',            Icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/students',    Icon: Users, label: 'Students'  },
  { to: '/attendance',  Icon: CalendarCheck, label: 'Attendance' },
  { to: '/fees',        Icon: ReceiptIndianRupee, label: 'Fees'       },
  { to: '/more',        Icon: Menu, label: 'More'       },
];

export function BottomNav() {
  return (
    <nav aria-label="Primary navigation" className="bottom-nav fixed bottom-0 left-0 right-0 z-40 flex border-t md:hidden">
      {NAV.map(({ to, Icon, label }) => (
        <NavLink
          key={to}
          to={to}
          end={to === '/'}
          className={({ isActive }) =>
            `bottom-nav-item relative flex flex-1 flex-col items-center justify-center py-1.5 text-[11px] font-semibold transition-colors
             ${isActive ? 'text-chess-blue' : 'text-gray-400'}`
          }
        >
          {({ isActive }) => <>
            <span className={`bottom-nav-indicator absolute top-0 h-0.5 rounded-full ${isActive ? 'w-8 bg-chess-blue' : 'w-0 bg-transparent'}`} />
            <Icon size={20} strokeWidth={isActive ? 2.2 : 1.7} className="mb-0.5" aria-hidden="true" />
            <span>{label}</span>
          </>}
        </NavLink>
      ))}
    </nav>
  );
}

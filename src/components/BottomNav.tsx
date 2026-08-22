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
    <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 flex z-40">
      {NAV.map(({ to, Icon, label }) => (
        <NavLink
          key={to}
          to={to}
          end={to === '/'}
          className={({ isActive }) =>
            `relative flex-1 flex flex-col items-center py-2 text-[11px] font-medium transition-colors
             ${isActive ? 'text-navy' : 'text-gray-400'}`
          }
        >
          {({ isActive }) => <>
            <span className={`absolute top-0 h-0.5 w-8 rounded-full ${isActive ? 'bg-chess-blue' : 'bg-transparent'}`} />
            <Icon size={20} strokeWidth={isActive ? 2.25 : 1.75} className="mb-1" aria-hidden="true" />
            <span>{label}</span>
          </>}
        </NavLink>
      ))}
    </nav>
  );
}

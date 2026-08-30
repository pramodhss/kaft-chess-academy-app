import { NavLink } from 'react-router-dom';
import { BookOpen, CalendarCheck, GraduationCap, Home, LayoutGrid, Library, SlidersHorizontal, TrendingUp, Trophy, Wallet } from 'lucide-react';

const LINKS = [
  { to: '/', Icon: Home, label: 'Dashboard' },
  { to: '/students', Icon: GraduationCap, label: 'Students' },
  { to: '/attendance', Icon: CalendarCheck, label: 'Attendance' },
  { to: '/fees', Icon: Wallet, label: 'Fees' },
  { to: '/upcoming', Icon: Trophy, label: 'Tournaments' },
  { to: '/operations', Icon: SlidersHorizontal, label: 'Operations' },
  { to: '/progress', Icon: TrendingUp, label: 'Progress' },
  { to: '/resources', Icon: BookOpen, label: 'Resources' },
  { to: '/curriculum', Icon: Library, label: 'Curriculum' },
  { to: '/more', Icon: LayoutGrid, label: 'More' },
];

export function Sidebar() {
  return (
    <aside className="academy-sidebar fixed inset-y-0 left-0 z-40 hidden w-64 flex-col md:flex">
      <div className="academy-sidebar-brand flex h-20 items-center gap-3 px-5">
        <img src="logo.jpg" alt="" className="academy-sidebar-logo h-10 w-10 rounded-lg object-cover" />
        <div>
          <p className="text-sm font-bold text-white">KAFT Chess Academy</p>
          <p className="academy-sidebar-overline">Academy operations</p>
        </div>
      </div>
      <nav aria-label="Desktop navigation" className="academy-sidebar-nav flex-1">
        {LINKS.map(({ to, Icon, label }) => (
          <NavLink key={to} to={to} end={to === '/'}
            className={({ isActive }) => `academy-sidebar-link flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium ${isActive ? 'is-active' : ''}`}>
            {({ isActive }) => <><Icon size={19} strokeWidth={isActive ? 2.2 : 1.7} aria-hidden="true" />{label}</>}
          </NavLink>
        ))}
      </nav>
      <div className="academy-sidebar-footer px-5 py-4">KAFT Chess Academy</div>
    </aside>
  );
}
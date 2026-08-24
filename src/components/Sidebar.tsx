import { NavLink } from 'react-router-dom';
import { BookOpen, CalendarCheck, ChartNoAxesCombined, LayoutDashboard, Library, Menu, ReceiptIndianRupee, Users, Workflow } from 'lucide-react';

const LINKS = [
  { to: '/', Icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/students', Icon: Users, label: 'Students' },
  { to: '/attendance', Icon: CalendarCheck, label: 'Attendance' },
  { to: '/fees', Icon: ReceiptIndianRupee, label: 'Fees' },
  { to: '/operations', Icon: Workflow, label: 'Operations' },
  { to: '/progress', Icon: ChartNoAxesCombined, label: 'Progress' },
  { to: '/resources', Icon: BookOpen, label: 'Resources' },
  { to: '/curriculum', Icon: Library, label: 'Curriculum' },
  { to: '/more', Icon: Menu, label: 'More' },
];

export function Sidebar() {
  return (
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-60 flex-col border-r border-white/10 bg-navy text-white md:flex">
      <div className="flex h-20 items-center gap-3 border-b border-white/10 px-5">
        <img src="logo.jpg" alt="" className="h-10 w-10 rounded-lg object-cover" />
        <div>
          <p className="text-sm font-semibold">KAFT Chess</p>
          <p className="text-[11px] text-chess-light/65">Academy operations</p>
        </div>
      </div>
      <nav aria-label="Desktop navigation" className="flex-1 space-y-1 p-3">
        {LINKS.map(({ to, Icon, label }) => (
          <NavLink key={to} to={to} end={to === '/'}
            className={({ isActive }) => `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${isActive ? 'bg-white/10 text-gold' : 'text-white/65 hover:bg-white/5 hover:text-white'}`}>
            <Icon size={19} strokeWidth={1.8} aria-hidden="true" />{label}
          </NavLink>
        ))}
      </nav>
      <div className="border-t border-white/10 px-5 py-4 text-[11px] text-white/40">Kaft Chess Academy</div>
    </aside>
  );
}
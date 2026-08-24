import { useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, WifiOff } from 'lucide-react';
import { BottomNav } from './BottomNav';
import { useTheme } from '../hooks/useTheme';
import { useOnline } from '../hooks/useOnline';
import { useCoachName } from '../hooks/useCoachName';
import { Sidebar } from './Sidebar';
import { GlobalSearch } from './GlobalSearch';

interface LayoutProps {
  readonly title: string;
  readonly children: React.ReactNode;
  readonly action?: React.ReactNode;
  readonly showBack?: boolean;
}

export function Layout({ title, children, action, showBack }: LayoutProps) {
  useTheme();
  const online = useOnline();
  const navigate = useNavigate();
  const location = useLocation();
  const displayBack = showBack ?? location.pathname !== '/';
  const { coachName: coach } = useCoachName();
  return (
    <div className="app-shell flex h-full flex-col md:pl-60">
      <Sidebar />
      <header className="app-header flex-shrink-0 text-white">
        <div className="app-header-inner flex items-center gap-3">
          {displayBack && (
            <button type="button" onClick={() => navigate(-1)} aria-label="Go back" title="Go back"
              className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-white hover:bg-white/10">
              <ArrowLeft size={19} aria-hidden="true" />
            </button>
          )}
          <img src="logo.jpg" alt="" className={`app-logo h-9 w-9 flex-shrink-0 rounded-lg object-cover ${displayBack ? 'hidden sm:block' : ''}`} />
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-[15px] font-semibold leading-tight">{title}</h1>
            {coach && <p className="mt-0.5 truncate text-[11px] font-medium text-yellow-200/75">{coach}</p>}
          </div>
          <div className="flex flex-shrink-0 items-center gap-1.5">
            <GlobalSearch />
            {action}
          </div>
        </div>
      </header>
      {!online && (
        <output className="flex items-center justify-center gap-2 bg-amber-500 px-3 py-2 text-center text-xs font-semibold text-white">
          <WifiOff size={14} aria-hidden="true" /> Offline. Showing last synced data; changes are unavailable.
        </output>
      )}
      <main className="app-main no-scrollbar flex-1 overflow-y-auto pb-24 md:pb-0"><div key={location.pathname} className="route-view">{children}</div></main>
      <BottomNav />
    </div>
  );
}

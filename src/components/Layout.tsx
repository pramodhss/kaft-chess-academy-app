import { useEffect, useRef } from 'react';
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
  readonly onBack?: () => void;
  readonly hideMobileHeader?: boolean;
}

const routeScrollPositions = new Map<string, number>();

export function Layout({ title, children, action, showBack, onBack, hideMobileHeader }: LayoutProps) {
  useTheme();
  const online = useOnline();
  const navigate = useNavigate();
  const location = useLocation();
  const mainRef = useRef<HTMLElement>(null);
  const displayBack = showBack ?? location.pathname !== '/';
  const { coachName: coach } = useCoachName();
  const handleBack = () => {
    if (onBack) {
      onBack();
      return;
    }
    if (window.history.length > 1) {
      navigate(-1);
      return;
    }
    navigate('/');
  };
  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      mainRef.current?.scrollTo({ top: routeScrollPositions.get(location.pathname) ?? 0 });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [location.pathname]);
  const rememberScroll = () => routeScrollPositions.set(location.pathname, mainRef.current?.scrollTop ?? 0);
  return (
    <div className="app-shell flex h-full flex-col md:pl-64">
      <Sidebar />
      <header className={`app-header flex-shrink-0 sticky top-0 z-40 backdrop-blur-xl ${hideMobileHeader ? 'app-header-hide-mobile' : ''}`}>
        <div className="app-header-inner flex items-center gap-3">
          {displayBack && (
            <button type="button" onClick={handleBack} aria-label="Go back" title="Go back"
              className="app-back-button flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl transition-all duration-150 active:scale-90">
              <ArrowLeft size={18} aria-hidden="true" />
            </button>
          )}
          <img src="logo.jpg" alt="" className={`app-logo h-9 w-9 flex-shrink-0 rounded-xl object-cover ring-1 ring-black/10 dark:ring-white/10 shadow-sm md:hidden ${displayBack ? 'hidden sm:block' : ''}`} />
          <div className="min-w-0 flex-1">
            <p className="app-header-kicker hidden md:block">Academy operations</p>
            <h1 className="truncate text-[15px] font-bold tracking-tight leading-tight">{title}</h1>
            {coach && <p className="app-header-coach mt-0.5 truncate text-[11px] font-semibold tracking-wide md:hidden">{coach}</p>}
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
      <main ref={mainRef} onScroll={rememberScroll} className="app-main no-scrollbar flex-1 overflow-y-auto pb-24 md:pb-0"><div key={location.pathname} className="route-view">{children}</div></main>
      <BottomNav />
    </div>
  );
}

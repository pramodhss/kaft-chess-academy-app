import { useNavigate } from 'react-router-dom';
import { BottomNav } from './BottomNav';
import { useTheme } from '../hooks/useTheme';
import { useOnline } from '../hooks/useOnline';
import { useCoachName } from '../hooks/useCoachName';

interface LayoutProps {
  title: string;
  children: React.ReactNode;
  action?: React.ReactNode;
  showBack?: boolean;
}

export function Layout({ title, children, action, showBack }: LayoutProps) {
  useTheme();
  const online = useOnline();
  const navigate = useNavigate();
  const { coachName: coach } = useCoachName();
  return (
    <div className="flex flex-col h-full bg-gray-50">
      <header
        className="bg-navy text-white px-3 flex items-center gap-2 flex-shrink-0"
        style={{ paddingTop: 'env(safe-area-inset-top,0px)', minHeight: '56px' }}>
        {showBack && (
          <button onClick={() => navigate(-1)}
            className="w-9 h-9 flex items-center justify-center rounded-xl bg-white/10 text-white text-xl flex-shrink-0">
            ←
          </button>
        )}
        <img src="logo.jpg" alt="" className="w-8 h-8 rounded-lg flex-shrink-0 object-cover" />
        <div className="flex-1 min-w-0">
          <h1 className="text-sm font-bold leading-tight truncate">{title}</h1>
          {coach && <p className="text-[10px] text-yellow-200 opacity-80 truncate">{coach}</p>}
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          {action}

        </div>
      </header>
      {!online && (
        <div className="bg-amber-500 text-white text-xs font-semibold text-center py-1.5 flex items-center justify-center gap-1">
          <span>📵</span> Offline — showing last synced data; changes are unavailable
        </div>
      )}
      <main className="page-content flex-1 overflow-y-auto pb-20 no-scrollbar">{children}</main>
      <BottomNav />
    </div>
  );
}

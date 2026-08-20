import { BottomNav } from './BottomNav';

interface LayoutProps { title: string; children: React.ReactNode; action?: React.ReactNode }

export function Layout({ title, children, action }: LayoutProps) {
  const coach = localStorage.getItem('chess_coach_name');
  return (
    <div className="flex flex-col h-full bg-gray-50">
      <header className="bg-navy text-white px-4 flex items-center justify-between flex-shrink-0" style={{paddingTop:'env(safe-area-inset-top,0px)', minHeight:'56px'}}>
        <div className="flex items-center gap-2">
          <span className="text-2xl">♟</span>
          <div>
            <h1 className="text-base font-bold leading-tight">{title}</h1>
            {coach && <p className="text-xs text-chess-light opacity-80">{coach}</p>}
          </div>
        </div>
        {action && <div>{action}</div>}
      </header>
      <main className="flex-1 overflow-y-auto pb-20 no-scrollbar">{children}</main>
      <BottomNav />
    </div>
  );
}

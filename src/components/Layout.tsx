import { BottomNav } from './BottomNav';

interface LayoutProps {
  title: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}

export function Layout({ title, children, action }: LayoutProps) {
  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* Top bar */}
      <header className="bg-navy text-white px-4 pt-safe-top flex items-center justify-between h-14 flex-shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-2xl">♟</span>
          <h1 className="text-lg font-bold tracking-wide">{title}</h1>
        </div>
        {action && <div>{action}</div>}
      </header>

      {/* Scrollable content */}
      <main className="flex-1 overflow-y-auto pb-20 no-scrollbar">
        {children}
      </main>

      <BottomNav />
    </div>
  );
}

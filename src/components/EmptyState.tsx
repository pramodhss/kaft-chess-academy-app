interface EmptyStateProps {
  icon?: string;
  title: string;
  subtitle?: string;
  action?: { label: string; onClick: () => void };
}
export function EmptyState({ icon = '♙', title, subtitle, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 text-center animate-chess-slide">
      <span className="text-6xl mb-4 animate-chess-float inline-block">{icon}</span>
      <p className="font-bold text-gray-700 text-lg">{title}</p>
      {subtitle && <p className="text-gray-400 text-sm mt-1 max-w-xs">{subtitle}</p>}
      {action && (
        <button onClick={action.onClick} className="mt-5 bg-navy text-white px-6 py-2.5 rounded-xl text-sm font-semibold">
          {action.label}
        </button>
      )}
    </div>
  );
}

interface ErrorStateProps { message: string; onRetry: () => void }
export function ErrorState({ message, onRetry }: ErrorStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 text-center animate-chess-slide">
      <span className="text-6xl mb-4 animate-chess-pulse inline-block">♞</span>
      <p className="font-bold text-red-600 text-lg mb-1">Failed to load</p>
      <p className="text-gray-500 text-sm mb-5 max-w-xs">{message}</p>
      <button onClick={onRetry} className="bg-navy text-white px-6 py-2.5 rounded-xl text-sm font-semibold flex items-center gap-2">
        ↺ Try again
      </button>
    </div>
  );
}

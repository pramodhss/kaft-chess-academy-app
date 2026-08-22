import { CircleAlert, Inbox, RefreshCw } from 'lucide-react';

interface EmptyStateProps {
  readonly title: string;
  readonly subtitle?: string;
  readonly action?: { label: string; onClick: () => void };
}
export function EmptyState({ title, subtitle, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
      <span className="w-12 h-12 mb-4 rounded-xl bg-gray-100 text-gray-500 flex items-center justify-center">
        <Inbox size={23} strokeWidth={1.7} aria-hidden="true" />
      </span>
      <p className="font-semibold text-gray-700 text-base">{title}</p>
      {subtitle && <p className="text-gray-400 text-sm mt-1 max-w-xs">{subtitle}</p>}
      {action && (
        <button type="button" onClick={action.onClick} className="mt-5 bg-navy text-white px-5 py-2.5 rounded-lg text-sm font-semibold">
          {action.label}
        </button>
      )}
    </div>
  );
}

interface ErrorStateProps { readonly message: string; readonly onRetry: () => void }
export function ErrorState({ message, onRetry }: ErrorStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
      <span className="w-12 h-12 mb-4 rounded-xl bg-red-50 text-red-600 flex items-center justify-center">
        <CircleAlert size={23} strokeWidth={1.8} aria-hidden="true" />
      </span>
      <p className="font-semibold text-gray-800 text-base mb-1">Unable to load data</p>
      <p className="text-gray-500 text-sm mb-5 max-w-xs">{message}</p>
      <button type="button" onClick={onRetry} className="bg-navy text-white px-5 py-2.5 rounded-lg text-sm font-semibold flex items-center gap-2">
        <RefreshCw size={16} aria-hidden="true" /> Try again
      </button>
    </div>
  );
}

import { Component, type ReactNode } from 'react';
import { RefreshCw, ShieldAlert } from 'lucide-react';

interface State { hasError: boolean; message: string }

export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { hasError: false, message: '' };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, message: error.message };
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div className="min-h-screen bg-navy flex flex-col items-center justify-center p-8 text-center">
        <span className="w-14 h-14 mb-5 rounded-xl bg-white/10 text-chess-light flex items-center justify-center">
          <ShieldAlert size={27} strokeWidth={1.7} aria-hidden="true" />
        </span>
        <h1 className="text-white text-xl font-semibold mb-2">Something went wrong</h1>
        <p className="text-chess-light text-sm mb-6 max-w-xs">{this.state.message}</p>
        <button type="button" onClick={() => window.location.reload()}
          className="bg-white text-navy font-semibold px-5 py-2.5 rounded-lg flex items-center gap-2">
          <RefreshCw size={16} aria-hidden="true" /> Reload App
        </button>
      </div>
    );
  }
}

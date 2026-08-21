import { Component, type ReactNode } from 'react';

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
        <span className="text-7xl mb-6 animate-chess-pulse inline-block">♚</span>
        <h1 className="text-white text-2xl font-bold mb-2">Something went wrong</h1>
        <p className="text-chess-light text-sm mb-6 max-w-xs">{this.state.message}</p>
        <button onClick={() => window.location.reload()}
          className="bg-white text-navy font-bold px-6 py-3 rounded-xl">
          ↺ Reload App
        </button>
      </div>
    );
  }
}

import React from 'react';
import { AlertTriangle, RefreshCw, RotateCw } from 'lucide-react';

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
  showDetails: boolean;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null, showDetails: false };

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[Autometa] Unhandled error caught by ErrorBoundary:', error, info.componentStack);
  }

  handleTryAgain = () => {
    this.setState({ error: null, showDetails: false });
  };

  handleReload = () => {
    window.location.reload();
  };

  render() {
    const { error, showDetails } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="fixed inset-0 bg-[#060B1A] z-[9999] flex items-center justify-center p-6">
        <div className="w-full max-w-md bg-[#0a0f1d] border border-white/10 rounded-2xl p-6 flex flex-col gap-4 shadow-2xl select-none">
          <div className="flex flex-col items-center gap-4 text-center py-2">
            <div className="p-4 bg-gradient-to-br from-[#ff007f] to-[#ff5f6d] rounded-2xl shadow-glow-pink">
              <AlertTriangle className="w-7 h-7 text-black" />
            </div>
            <div>
              <h2 className="text-lg font-extrabold text-white">Something went wrong</h2>
              <p className="text-sm text-gray-400 mt-1">
                AUTOMETA hit an unexpected error. Your automaton data usually survives this — try recovering below.
              </p>
            </div>
          </div>

          <details
            open={showDetails}
            onToggle={(e) => this.setState({ showDetails: (e.target as HTMLDetailsElement).open })}
            className="bg-black/40 border border-white/5 rounded-lg px-3 py-2"
          >
            <summary className="text-xs text-gray-500 cursor-pointer select-none">Show details</summary>
            <p className="text-[11px] font-mono text-red-400 mt-2 whitespace-pre-wrap break-words">
              {error.message}
            </p>
          </details>

          <div className="flex gap-3">
            <button
              onClick={this.handleTryAgain}
              className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg font-bold text-sm bg-gradient-to-r from-[#00f0ff] to-[#0072ff] text-black hover:opacity-90 transition-all cursor-pointer border-none"
            >
              <RotateCw className="w-3.5 h-3.5" /> Try Again
            </button>
            <button
              onClick={this.handleReload}
              className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg font-bold text-sm glass-button text-gray-200 hover:text-white transition-all cursor-pointer border border-white/10"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Reload App
            </button>
          </div>
        </div>
      </div>
    );
  }
}

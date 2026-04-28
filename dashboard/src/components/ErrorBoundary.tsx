import React from "react";

type State = { error: Error | null };

export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("[ErrorBoundary]", error, info);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="min-h-screen p-6 bg-bg">
        <div className="max-w-2xl mx-auto bg-card rounded-2xl ring-1 ring-bad/30 p-6">
          <h2 className="text-lg font-bold text-bad mb-2">Something went wrong</h2>
          <p className="text-sm text-slate-600 mb-4">
            The dashboard hit an unhandled error. Reload to recover, or copy the trace
            below to debug.
          </p>
          <pre className="text-xs bg-slate-50 p-3 rounded overflow-auto whitespace-pre-wrap text-slate-800">
            {String(this.state.error?.stack ?? this.state.error)}
          </pre>
          <button
            onClick={() => location.reload()}
            className="mt-4 rounded-lg bg-accent text-white text-sm font-medium px-4 py-2"
          >
            Reload
          </button>
        </div>
      </div>
    );
  }
}

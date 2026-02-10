// =============================================================================
// Work Orders — Global Error Boundary
// =============================================================================
// Catches render-phase errors anywhere in the component tree.
// Prevents full white-screen crashes by showing a recovery UI.
//
// Usage: Wrap around <BrowserRouter> in App.tsx:
//   <ErrorBoundary><BrowserRouter>...</BrowserRouter></ErrorBoundary>
// =============================================================================

import { Component, type ReactNode, type ErrorInfo } from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary] Uncaught error:', error);
    console.error('[ErrorBoundary] Component stack:', info.componentStack);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
          <div className="text-center max-w-md">
            <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-6">
              <AlertCircle className="w-8 h-8 text-red-600" />
            </div>
            <h1 className="text-2xl font-bold text-slate-900 mb-2">
              Something went wrong
            </h1>
            <p className="text-sm text-slate-500 mb-6">
              The application encountered an unexpected error. Your data is safe —
              try refreshing the page to continue.
            </p>
            {this.state.error && (
              <pre className="text-xs text-left bg-slate-100 rounded-lg p-3 mb-6 overflow-auto max-h-32 text-slate-600">
                {this.state.error.message}
              </pre>
            )}
            <Button onClick={this.handleReset} size="lg" className="gap-2">
              <RefreshCw className="h-4 w-4" />
              Refresh Page
            </Button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

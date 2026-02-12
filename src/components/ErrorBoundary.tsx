import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RefreshCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

interface Props { children: ReactNode; }
interface State { error: Error | null; }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex min-h-screen items-center justify-center p-4 bg-background">
          <Card className="max-w-md w-full">
            <CardContent className="flex flex-col items-center text-center p-8 gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
                <AlertTriangle className="h-6 w-6 text-destructive" />
              </div>
              <div>
                <h2 className="text-lg font-semibold">Something went wrong</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {this.state.error.message || 'An unexpected error occurred.'}
                </p>
              </div>
              <Button onClick={() => window.location.reload()} className="gap-2">
                <RefreshCcw className="h-4 w-4" />
                Reload Page
              </Button>
            </CardContent>
          </Card>
        </div>
      );
    }
    return this.props.children;
  }
}

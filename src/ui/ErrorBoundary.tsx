import { AlertTriangle } from 'lucide-react';
import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Button } from '@/ui/button';

type State = { error: Error | null };

/**
 * Catches render errors so one broken view never blanks the whole app. Your books are saved
 * continuously, so reloading is always safe.
 */
export class ErrorBoundary extends Component<{ children: ReactNode; resetKey?: string }, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[Folio] Unexpected error', error, info.componentStack);
  }

  override componentDidUpdate(prev: { resetKey?: string }) {
    if (prev.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null });
  }

  override render() {
    if (!this.state.error) return this.props.children;
    return (
      <main role="alert" className="grid h-full place-items-center p-6">
        <div className="flex max-w-md flex-col items-center gap-4 text-center">
          <span className="grid size-12 place-items-center rounded-full bg-destructive/10 text-destructive">
            <AlertTriangle />
          </span>
          <h1 className="text-xl font-semibold">Something went wrong</h1>
          <p className="text-sm text-muted-foreground">
            Your work is saved automatically. Reloading usually fixes this.
          </p>
          <details className="w-full rounded-lg border bg-muted/40 p-3 text-left text-xs">
            <summary className="cursor-pointer font-medium">Technical details</summary>
            <pre className="mt-2 overflow-auto whitespace-pre-wrap">{this.state.error.message}</pre>
          </details>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => (window.location.hash = '#/')}>
              All books
            </Button>
            <Button onClick={() => window.location.reload()}>Reload</Button>
          </div>
        </div>
      </main>
    );
  }
}

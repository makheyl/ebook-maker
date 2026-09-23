import { lazy, Suspense } from 'react';
import { Route, Router, Switch, useLocation } from 'wouter';
import { useHashLocation } from 'wouter/use-hash-location';
import { Dashboard } from '@/dashboard/Dashboard';
import { ErrorBoundary } from '@/ui/ErrorBoundary';
import { Toaster } from '@/ui/sonner';
import { ThemeProvider } from '@/ui/theme';
import { TooltipProvider } from '@/ui/tooltip';

// The editor and wizard load on demand so the dashboard opens quickly.
const EditorRoute = lazy(() =>
  import('@/editor/EditorRoute').then((m) => ({ default: m.EditorRoute })),
);
const QuickCreateWizard = lazy(() =>
  import('@/wizard/QuickCreateWizard').then((m) => ({ default: m.QuickCreateWizard })),
);

function NotFound() {
  return (
    <main className="grid h-full place-items-center text-sm text-muted-foreground">
      Page not found.
    </main>
  );
}

function Loading() {
  return (
    <div className="grid h-full place-items-center text-sm text-muted-foreground" aria-busy="true">
      Loading…
    </div>
  );
}

/** Resets the error boundary whenever the route changes. */
function RouteErrorBoundary({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

export function App() {
  return (
    <ThemeProvider>
      <TooltipProvider delayDuration={300}>
        {/* Hash routing keeps the built app working from any static host or sub-path. */}
        <Router hook={useHashLocation}>
          <RouteErrorBoundary>
            <Suspense fallback={<Loading />}>
              <Switch>
                <Route path="/" component={Dashboard} />
                <Route path="/new" component={QuickCreateWizard} />
                <Route path="/p/:id/:mode?">
                  {(params) => <EditorRoute key={params.id} id={params.id} mode={params.mode} />}
                </Route>
                <Route component={NotFound} />
              </Switch>
            </Suspense>
          </RouteErrorBoundary>
        </Router>
        <Toaster position="bottom-center" />
      </TooltipProvider>
    </ThemeProvider>
  );
}

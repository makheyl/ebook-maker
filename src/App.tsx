import { Route, Router, Switch, useLocation } from 'wouter';
import { ErrorBoundary } from '@/ui/ErrorBoundary';
import { useHashLocation } from 'wouter/use-hash-location';
import { Dashboard } from '@/dashboard/Dashboard';
import { EditorRoute } from '@/editor/EditorRoute';
import { Toaster } from '@/ui/sonner';
import { QuickCreateWizard } from '@/wizard/QuickCreateWizard';
import { ThemeProvider } from '@/ui/theme';
import { TooltipProvider } from '@/ui/tooltip';

function NotFound() {
  return (
    <main className="grid h-full place-items-center text-sm text-muted-foreground">
      Page not found.
    </main>
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
            <Switch>
              <Route path="/" component={Dashboard} />
              <Route path="/new" component={QuickCreateWizard} />
              <Route path="/p/:id/:mode?">
                {(params) => <EditorRoute key={params.id} id={params.id} mode={params.mode} />}
              </Route>
              <Route component={NotFound} />
            </Switch>
          </RouteErrorBoundary>
        </Router>
        <Toaster position="bottom-center" />
      </TooltipProvider>
    </ThemeProvider>
  );
}

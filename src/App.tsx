import { Route, Router, Switch } from 'wouter';
import { useHashLocation } from 'wouter/use-hash-location';
import { Dashboard } from '@/dashboard/Dashboard';
import { EditorRoute } from '@/editor/EditorRoute';
import { Toaster } from '@/ui/sonner';
import { ThemeProvider } from '@/ui/theme';
import { TooltipProvider } from '@/ui/tooltip';

function NotFound() {
  return (
    <main className="grid h-full place-items-center text-sm text-muted-foreground">
      Page not found.
    </main>
  );
}

export function App() {
  return (
    <ThemeProvider>
      <TooltipProvider delayDuration={300}>
        {/* Hash routing keeps the built app working from any static host or sub-path. */}
        <Router hook={useHashLocation}>
          <Switch>
            <Route path="/" component={Dashboard} />
            <Route path="/p/:id/:mode?">
              {(params) => <EditorRoute key={params.id} id={params.id} mode={params.mode} />}
            </Route>
            <Route component={NotFound} />
          </Switch>
        </Router>
        <Toaster position="bottom-center" />
      </TooltipProvider>
    </ThemeProvider>
  );
}

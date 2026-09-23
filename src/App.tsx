import { Router, Route, Switch } from 'wouter';
import { useHashLocation } from 'wouter/use-hash-location';
import { PRODUCT_NAME } from '@/core/brand';
import { Toaster } from '@/ui/sonner';
import { ThemeProvider } from '@/ui/theme';
import { TooltipProvider } from '@/ui/tooltip';

function Home() {
  return (
    <main className="grid h-full place-items-center">
      <h1 className="text-3xl font-semibold tracking-tight">{PRODUCT_NAME}</h1>
    </main>
  );
}

export function App() {
  return (
    <ThemeProvider>
      <TooltipProvider delayDuration={300}>
        <Router hook={useHashLocation}>
          <Switch>
            <Route path="/" component={Home} />
          </Switch>
        </Router>
        <Toaster position="bottom-center" />
      </TooltipProvider>
    </ThemeProvider>
  );
}

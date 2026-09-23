import { BookHeart, BookOpen, Plus, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Link, useLocation } from 'wouter';
import { Button } from '@/ui/button';
import { Logo } from '@/ui/Logo';
import { ThemeToggle } from '@/ui/ThemeToggle';
import { NewBookDialog } from './NewBookDialog';
import { ProjectCard } from './ProjectCard';
import { createSampleBook } from './sample-book';
import { useProjects } from './useProjects';

export function Dashboard() {
  const state = useProjects();
  const [newOpen, setNewOpen] = useState(false);
  const [sampleBusy, setSampleBusy] = useState(false);
  const [, navigate] = useLocation();

  const openSample = async () => {
    setSampleBusy(true);
    try {
      navigate(`/p/${await createSampleBook()}`);
    } catch (err) {
      toast.error(
        `Could not create the sample: ${err instanceof Error ? err.message : String(err)}`,
      );
      setSampleBusy(false);
    }
  };

  return (
    <div className="min-h-full">
      <header className="sticky top-0 z-10 border-b bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-3 px-4 sm:px-6">
          <Logo />
          <div className="flex-1" />
          <ThemeToggle />
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        <div className="mb-8 flex flex-wrap items-end gap-4">
          <div className="flex-1">
            <h1 className="text-2xl font-semibold tracking-tight">Your books</h1>
            <p className="text-sm text-muted-foreground">
              Everything is saved in this browser automatically.
            </p>
          </div>
          <Button variant="outline" onClick={() => setNewOpen(true)}>
            <Plus /> Blank book
          </Button>
          <Button asChild>
            <Link href="/new">
              <Sparkles /> Quick create
            </Link>
          </Button>
        </div>

        {state.status === 'loading' && (
          <div className="grid grid-cols-2 gap-6 sm:grid-cols-3 lg:grid-cols-4" aria-busy="true">
            {Array.from({ length: 4 }, (_, i) => (
              <div key={i} className="aspect-[4/3] animate-pulse rounded-xl bg-muted" />
            ))}
          </div>
        )}

        {state.status === 'error' && (
          <div
            role="alert"
            className="rounded-xl border border-destructive/40 bg-destructive/5 p-6"
          >
            <p className="font-medium">Couldn’t open your saved books.</p>
            <p className="text-sm text-muted-foreground">
              Your browser may be blocking storage (for example in a private window).
            </p>
          </div>
        )}

        {state.status === 'ready' && state.projects.length === 0 && (
          <div className="flex flex-col items-center gap-4 rounded-2xl border border-dashed px-6 py-16 text-center">
            <span className="grid size-14 place-items-center rounded-2xl bg-accent text-accent-foreground">
              <BookOpen className="size-7" />
            </span>
            <div>
              <h2 className="text-lg font-semibold">Make your first book</h2>
              <p className="mx-auto max-w-md text-sm text-muted-foreground">
                Drop in a few images and a line of text for each page — we’ll lay them out, and you
                can animate and polish every page from there.
              </p>
            </div>
            <div className="flex flex-wrap justify-center gap-3">
              <Button asChild>
                <Link href="/new">
                  <Sparkles /> Quick create
                </Link>
              </Button>
              <Button variant="outline" onClick={() => setNewOpen(true)}>
                <Plus /> Start from blank
              </Button>
              <Button variant="ghost" onClick={openSample} disabled={sampleBusy}>
                <BookHeart /> {sampleBusy ? 'Preparing…' : 'Try a sample book'}
              </Button>
            </div>
          </div>
        )}

        {state.status === 'ready' && state.projects.length > 0 && (
          <div className="grid grid-cols-2 gap-x-6 gap-y-8 sm:grid-cols-3 lg:grid-cols-4">
            {state.projects.map((p) => (
              <ProjectCard key={p.id} project={p} />
            ))}
          </div>
        )}
      </main>

      <NewBookDialog open={newOpen} onOpenChange={setNewOpen} />
    </div>
  );
}

import { BookHeart, BookOpen, FileUp, Plus, Sparkles } from 'lucide-react';
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { Link, useLocation } from 'wouter';
import { PRODUCT_NAME } from '@/core/brand';
import { Button } from '@/ui/button';
import { Logo } from '@/ui/Logo';
import { ThemeToggle } from '@/ui/ThemeToggle';
import { NewBookDialog } from './NewBookDialog';
import { ProjectCard } from './ProjectCard';
import { IMPORT_ACCEPT } from './import/import-book';
import { ImportDialog } from './import/ImportDialog';
import { useImport } from './import/useImport';
import { createSampleBook } from './sample-book';
import { useProjects } from './useProjects';

export function Dashboard() {
  const state = useProjects();
  const [newOpen, setNewOpen] = useState(false);
  const [sampleBusy, setSampleBusy] = useState(false);
  const [, navigate] = useLocation();
  const importer = useImport();
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const hasFiles = (e: React.DragEvent) => e.dataTransfer.types.includes('Files');
  const importButton = (
    <Button variant="outline" onClick={() => fileRef.current?.click()}>
      <FileUp /> Import
    </Button>
  );

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
    <div
      className="relative min-h-full"
      onDragOver={(e) => {
        if (!hasFiles(e)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
        setDragging(true);
      }}
      onDragLeave={(e) => {
        if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
        setDragging(false);
      }}
      onDrop={(e) => {
        if (!hasFiles(e)) return;
        e.preventDefault();
        setDragging(false);
        const file = e.dataTransfer.files[0];
        if (file) importer.start(file);
      }}
    >
      <input
        ref={fileRef}
        type="file"
        accept={IMPORT_ACCEPT}
        hidden
        data-testid="import-input"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file) importer.start(file);
        }}
      />
      {dragging && (
        <div
          className="pointer-events-none fixed inset-3 z-50 grid place-items-center rounded-2xl border-2 border-dashed border-primary bg-background/80 backdrop-blur-sm"
          aria-hidden="true"
        >
          <p className="flex items-center gap-2 text-lg font-medium">
            <FileUp className="size-6" /> Drop a book exported by {PRODUCT_NAME} to import it
          </p>
        </div>
      )}
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
              Everything is saved in this browser automatically. Every export is also a backup you
              can import.
            </p>
          </div>
          {importButton}
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
              {importButton}
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
      <ImportDialog
        state={importer.state}
        onCancel={importer.cancel}
        onConfirm={importer.confirm}
      />
    </div>
  );
}

import { AlertTriangle, ArrowLeft, Download, Trash2 } from 'lucide-react';
import { Link, useLocation } from 'wouter';
import { toast } from 'sonner';
import { projectRepo } from '@/storage';
import { Button } from '@/ui/button';
import type { LoaderState } from './useProjectLoader';

function downloadJson(data: unknown, filename: string) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Shown when a book can't be opened: missing, corrupt, or storage failure. */
export function LoadErrorScreen({ projectId, state }: { projectId: string; state: LoaderState }) {
  const [, navigate] = useLocation();
  const title =
    state.status === 'not-found'
      ? 'This book doesn’t exist'
      : state.status === 'corrupt'
        ? 'This book couldn’t be opened'
        : 'Something went wrong';
  const detail =
    state.status === 'not-found'
      ? 'It may have been deleted, or it was created in another browser.'
      : state.status === 'corrupt'
        ? state.error.message
        : state.status === 'error'
          ? state.message
          : '';

  return (
    <main className="grid h-full place-items-center p-6">
      <div role="alert" className="flex max-w-lg flex-col items-center gap-4 text-center">
        <span className="grid size-12 place-items-center rounded-full bg-destructive/10 text-destructive">
          <AlertTriangle />
        </span>
        <h1 className="text-xl font-semibold">{title}</h1>
        <p className="text-sm text-muted-foreground">{detail}</p>
        {state.status === 'corrupt' && state.error.issues.length > 0 && (
          <details className="w-full rounded-lg border bg-muted/40 p-3 text-left text-xs">
            <summary className="cursor-pointer font-medium">Technical details</summary>
            <ul className="mt-2 list-disc pl-4 font-mono">
              {state.error.issues.map((issue) => (
                <li key={issue}>{issue}</li>
              ))}
            </ul>
          </details>
        )}
        <div className="flex flex-wrap justify-center gap-2">
          <Button variant="outline" asChild>
            <Link href="/">
              <ArrowLeft /> All books
            </Link>
          </Button>
          {state.status === 'corrupt' && (
            <>
              <Button
                variant="outline"
                onClick={async () =>
                  downloadJson(await projectRepo.loadRaw(projectId), `book-${projectId}.json`)
                }
              >
                <Download /> Download raw data
              </Button>
              <Button
                variant="destructive"
                onClick={async () => {
                  await projectRepo.delete(projectId);
                  toast.success('Book deleted');
                  navigate('/');
                }}
              >
                <Trash2 /> Delete book
              </Button>
            </>
          )}
        </div>
      </div>
    </main>
  );
}

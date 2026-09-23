import { Link } from 'wouter';
import { LoadErrorScreen } from './LoadErrorScreen';
import { useDocStore } from './store/doc-store';
import { useProjectLoader } from './useProjectLoader';

export function EditorRoute({ id }: { id: string }) {
  const state = useProjectLoader(id);
  const project = useDocStore((s) => s.project);

  if (state.status === 'loading') {
    return (
      <div className="grid h-full place-items-center text-sm text-muted-foreground">Opening…</div>
    );
  }
  if (state.status !== 'ready' || !project) return <LoadErrorScreen projectId={id} state={state} />;

  return (
    <main className="p-6">
      <Link href="/" className="text-sm text-muted-foreground hover:underline">
        ← All books
      </Link>
      <h1 className="mt-2 text-2xl font-semibold">{project.title}</h1>
    </main>
  );
}

import { Editor } from './Editor';
import { LoadErrorScreen } from './LoadErrorScreen';
import { useDocStore } from './store/doc-store';
import { useProjectLoader } from './useProjectLoader';

export function EditorRoute({ id }: { id: string }) {
  const state = useProjectLoader(id);
  const project = useDocStore((s) => s.project);

  if (state.status === 'loading' || (state.status === 'ready' && !project)) {
    return (
      <div className="grid h-full place-items-center text-sm text-muted-foreground" aria-busy="true">
        Opening…
      </div>
    );
  }
  if (state.status !== 'ready' || !project) return <LoadErrorScreen projectId={id} state={state} />;
  return <Editor />;
}

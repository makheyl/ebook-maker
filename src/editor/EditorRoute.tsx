import { Editor } from './Editor';
import { LoadErrorScreen } from './LoadErrorScreen';
import { useDocStore } from './store/doc-store';
import { useProjectLoader } from './useProjectLoader';
import { projectAssetIds } from '@/storage';
import { useEnsureAssets } from './assets/asset-urls';

export function EditorRoute({ id }: { id: string }) {
  const state = useProjectLoader(id);
  const project = useDocStore((s) => s.project);
  const assetsReady = useEnsureAssets(project ? projectAssetIds(project) : []);

  if (state.status === 'loading' || (state.status === 'ready' && (!project || !assetsReady))) {
    return (
      <div
        className="grid h-full place-items-center text-sm text-muted-foreground"
        aria-busy="true"
      >
        Opening…
      </div>
    );
  }
  if (state.status !== 'ready' || !project) return <LoadErrorScreen projectId={id} state={state} />;
  return <Editor />;
}

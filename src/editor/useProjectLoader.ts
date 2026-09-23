import { useEffect, useState } from 'react';
import type { ProjectLoadError } from '@/core/migrations';
import { projectRepo } from '@/storage';
import { useDocStore } from './store/doc-store';
import { useUiStore } from './store/ui-store';

export type LoaderState =
  | { status: 'loading' }
  | { status: 'ready' }
  | { status: 'not-found' }
  | { status: 'corrupt'; error: ProjectLoadError }
  | { status: 'error'; message: string };

/** Loads a book from storage into the document store (and clears it on unmount). */
export function useProjectLoader(projectId: string): LoaderState {
  const [state, setState] = useState<LoaderState>({ status: 'loading' });

  useEffect(() => {
    // The route is keyed by project id, so each id starts from the initial 'loading' state.
    let cancelled = false;
    projectRepo
      .load(projectId)
      .then((result) => {
        if (cancelled) return;
        if (!result) return setState({ status: 'not-found' });
        if (!result.ok) return setState({ status: 'corrupt', error: result.error });
        useDocStore.getState().load(result.project);
        useUiStore.getState().reset(result.project.pages[0]?.id ?? null);
        setState({ status: 'ready' });
      })
      .catch((err: unknown) => {
        if (!cancelled)
          setState({ status: 'error', message: err instanceof Error ? err.message : String(err) });
      });
    return () => {
      cancelled = true;
      useDocStore.getState().unload();
    };
  }, [projectId]);

  return state;
}

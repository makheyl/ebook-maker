import { useEffect, useState } from 'react';
import { projectRepo, type ProjectSummary } from '@/storage';

export type ProjectsState =
  | { status: 'loading' }
  | { status: 'ready'; projects: ProjectSummary[] }
  | { status: 'error'; error: unknown };

/** Live list of saved books (re-renders whenever any book is saved, renamed or deleted). */
export function useProjects(): ProjectsState {
  const [state, setState] = useState<ProjectsState>({ status: 'loading' });
  useEffect(
    () =>
      projectRepo.watchList(
        (projects) => setState({ status: 'ready', projects }),
        (error) => setState({ status: 'error', error }),
      ),
    [],
  );
  return state;
}

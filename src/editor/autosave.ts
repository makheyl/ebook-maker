import { useEffect } from 'react';
import { toast } from 'sonner';
import type { Project } from '@/core/schema';
import { projectRepo, StorageQuotaError } from '@/storage';
import { useDocStore } from './store/doc-store';
import { useUiStore } from './store/ui-store';

const DEBOUNCE_MS = 700;

/**
 * Debounced autosave of the open project. Saves after edits settle, flushes when the tab is
 * hidden, closed or the editor unmounts, and reports status to the top bar.
 */
export function useAutosave(): void {
  useEffect(() => {
    const initial = useDocStore.getState();
    // Track the latest document ourselves so a flush on unmount still has it, even if the
    // store was already cleared by a parent's cleanup.
    let latest: { project: Project | null; revision: number } = {
      project: initial.project,
      revision: initial.revision,
    };
    let savedRevision = initial.revision;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let inFlight: Promise<void> | null = null;
    let failing = false;
    const setStatus = useUiStore.getState().setSaveStatus;

    const save = async (): Promise<void> => {
      timer = undefined;
      if (inFlight) await inFlight;
      const { project, revision } = latest;
      if (!project || revision === savedRevision) return;
      setStatus('saving');
      inFlight = projectRepo
        .save(project)
        .then(() => {
          savedRevision = revision;
          failing = false;
          setStatus(latest.revision === revision ? 'saved' : 'unsaved');
        })
        .catch((err: unknown) => {
          const message =
            err instanceof StorageQuotaError
              ? err.message
              : `Couldn’t save: ${err instanceof Error ? err.message : String(err)}`;
          setStatus('error', message);
          // Tell the user once per failure streak (the top bar keeps showing "Not saved").
          if (!failing) toast.error(message, { duration: 10_000 });
          failing = true;
        })
        .finally(() => {
          inFlight = null;
        });
      await inFlight;
    };

    const schedule = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(
        () => void save().then(() => latest.revision !== savedRevision && schedule()),
        DEBOUNCE_MS,
      );
    };

    const unsubscribe = useDocStore.subscribe((state, prev) => {
      if (!state.project || state.revision === prev.revision) return;
      latest = { project: state.project, revision: state.revision };
      setStatus('unsaved');
      schedule();
    });

    const flush = () => {
      if (timer) clearTimeout(timer);
      if (latest.revision !== savedRevision) void save();
    };
    const onVisibility = () => document.visibilityState === 'hidden' && flush();
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      flush();
      if (latest.revision !== savedRevision) e.preventDefault();
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('beforeunload', onBeforeUnload);

    return () => {
      unsubscribe();
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('beforeunload', onBeforeUnload);
      flush();
    };
  }, []);
}

import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { useLocation } from 'wouter';
import { ImportError } from '@/core/import';
import {
  commitImport,
  prepareImport,
  type ImportMode,
  type ImportProgress,
  type PreparedImport,
} from './import-book';

export type ImportState =
  | { status: 'idle' }
  | { status: 'reading'; name: string; progress: ImportProgress | null }
  | { status: 'error'; name: string; message: string; details: string[] }
  | { status: 'ready'; name: string; prep: PreparedImport }
  | { status: 'saving'; name: string; prep: PreparedImport };

const describe = (err: unknown) =>
  err instanceof ImportError
    ? { message: err.message, details: err.details }
    : { message: err instanceof Error ? err.message : String(err), details: [] };

/** Import flow: read and check a file, show what's inside, then save it when confirmed. */
export function useImport() {
  const [state, setState] = useState<ImportState>({ status: 'idle' });
  const run = useRef(0);
  const [, navigate] = useLocation();

  const start = (file: File) => {
    const token = ++run.current;
    const name = file.name;
    setState({ status: 'reading', name, progress: null });
    prepareImport(file, (progress) => {
      if (run.current === token) setState({ status: 'reading', name, progress });
    }).then(
      (prep) => run.current === token && setState({ status: 'ready', name, prep }),
      (err: unknown) =>
        run.current === token && setState({ status: 'error', name, ...describe(err) }),
    );
  };

  const cancel = () => {
    if (state.status === 'saving') return;
    run.current++;
    setState({ status: 'idle' });
  };

  const confirm = async (mode: ImportMode) => {
    if (state.status !== 'ready') return;
    const { name, prep } = state;
    setState({ status: 'saving', name, prep });
    try {
      const id = await commitImport(prep, mode);
      toast.success(`Imported “${prep.parsed.project.title}”`);
      setState({ status: 'idle' });
      navigate(`/p/${id}`);
    } catch (err) {
      setState({ status: 'error', name, ...describe(err) });
    }
  };

  return { state, start, cancel, confirm };
}

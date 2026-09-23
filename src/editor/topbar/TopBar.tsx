import { AlertCircle, Check, Download, Loader2, Play, Redo2, Undo2 } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'wouter';
import { Button } from '@/ui/button';
import { LogoMark } from '@/ui/Logo';
import { ThemeToggle } from '@/ui/ThemeToggle';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/ui/tooltip';
import { IconButton } from '../IconButton';
import { MOD } from '../keys';
import { cn } from '@/ui/utils';
import { useDocStore } from '../store/doc-store';
import { useProject } from '../store/selectors';
import { useUiStore } from '../store/ui-store';

function TitleInput() {
  const title = useProject().title;
  const [draft, setDraft] = useState<string | null>(null);
  const commit = () => {
    if (draft === null) return;
    const next = draft.trim() || 'Untitled book';
    setDraft(null);
    if (next !== title) {
      useDocStore.getState().change((d) => void (d.title = next), { label: 'Rename book' });
    }
  };
  return (
    <input
      aria-label="Book title"
      value={draft ?? title}
      maxLength={200}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
        if (e.key === 'Escape') {
          setDraft(null);
          requestAnimationFrame(() => (e.target as HTMLInputElement).blur());
        }
      }}
      className="h-8 w-full max-w-72 min-w-0 truncate rounded-md bg-transparent px-2 text-sm font-medium outline-none hover:bg-accent focus:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
    />
  );
}

function SaveStatus() {
  const status = useUiStore((s) => s.saveStatus);
  const error = useUiStore((s) => s.saveError);
  const label =
    status === 'saving' || status === 'unsaved'
      ? 'Saving…'
      : status === 'error'
        ? 'Not saved'
        : 'Saved';
  return (
    <span
      role="status"
      aria-live="polite"
      title={error ?? undefined}
      data-testid="save-status"
      className={cn(
        'hidden items-center gap-1 text-xs text-muted-foreground sm:inline-flex',
        status === 'error' && 'text-destructive',
      )}
    >
      {status === 'error' ? (
        <AlertCircle className="size-3.5" />
      ) : status === 'saved' ? (
        <Check className="size-3.5" />
      ) : (
        <Loader2 className="size-3.5 animate-spin" />
      )}
      {label}
    </span>
  );
}

export function TopBar({ onPreview, onExport }: { onPreview: () => void; onExport: () => void }) {
  const canUndo = useDocStore((s) => s.canUndo);
  const canRedo = useDocStore((s) => s.canRedo);
  return (
    <header className="flex h-12 shrink-0 items-center gap-1 border-b bg-sidebar px-2">
      <Tooltip>
        <TooltipTrigger asChild>
          <Link
            href="/"
            aria-label="All books"
            className="rounded-md p-1 hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
          >
            <LogoMark className="size-6" />
          </Link>
        </TooltipTrigger>
        <TooltipContent>All books</TooltipContent>
      </Tooltip>
      <TitleInput />
      <SaveStatus />
      <div className="flex-1" />
      <IconButton
        label="Undo"
        shortcut={`${MOD}Z`}
        disabled={!canUndo}
        onClick={() => useDocStore.getState().undo()}
      >
        <Undo2 />
      </IconButton>
      <IconButton
        label="Redo"
        shortcut={`${MOD}⇧Z`}
        disabled={!canRedo}
        onClick={() => useDocStore.getState().redo()}
      >
        <Redo2 />
      </IconButton>
      <ThemeToggle />
      <Button variant="outline" size="sm" onClick={onPreview}>
        <Play /> <span className="hidden sm:inline">Preview</span>
      </Button>
      <Button size="sm" onClick={onExport}>
        <Download /> <span className="hidden sm:inline">Export</span>
      </Button>
    </header>
  );
}

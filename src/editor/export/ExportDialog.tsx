import { AlertTriangle, FileCode2, FolderArchive, Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { MADE_WITH_LABEL } from '@/core/brand';
import { SIZE_WARNING_BYTES, type ExportFormat, type SizeEstimate } from '@/core/export/build';
import { Button } from '@/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/ui/dialog';
import { formatBytes } from '@/ui/format';
import { Switch } from '@/ui/switch';
import { cn } from '@/ui/utils';
import { docStore } from '../store/doc-store';
import { useProject } from '../store/selectors';
import { downloadBlob, estimateExport, exportBook } from './export-book';

const FORMATS: { id: ExportFormat; title: string; body: string; icon: typeof FileCode2 }[] = [
  {
    id: 'html',
    title: 'Single HTML file',
    body: 'One file that opens offline with a double-click. Best for sharing.',
    icon: FileCode2,
  },
  {
    id: 'zip',
    title: 'ZIP folder',
    body: 'index.html plus an assets folder. Smaller, and ideal for web hosting.',
    icon: FolderArchive,
  },
];

export function ExportDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        {open && <ExportForm onDone={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}

function ExportForm({ onDone }: { onDone: () => void }) {
  const project = useProject();
  const { format, showBadge } = project.exportSettings;
  const [estimate, setEstimate] = useState<{ key: string; value: SizeEstimate | null }>({
    key: '',
    value: null,
  });
  const [busy, setBusy] = useState(false);
  const key = `${format}:${project.updatedAt}:${project.pages.length}:${Object.keys(project.assets).length}`;

  useEffect(() => {
    let cancelled = false;
    estimateExport(project, format)
      .then((value) => !cancelled && setEstimate({ key, value }))
      .catch(() => !cancelled && setEstimate({ key, value: null }));
    return () => {
      cancelled = true;
    };
  }, [project, format, key]);

  const setSettings = (patch: Partial<typeof project.exportSettings>) =>
    docStore.change((d) => void Object.assign(d.exportSettings, patch), {
      label: 'Export settings',
    });

  const size = estimate.key === key ? estimate.value : null;
  const tooBig = !!size && size.bytes > SIZE_WARNING_BYTES;

  const run = async () => {
    setBusy(true);
    try {
      const result = await exportBook(project, { format, showBadge });
      downloadBlob(result.blob, result.filename);
      toast.success(`Exported ${result.filename} (${formatBytes(result.bytes)})`);
      onDone();
    } catch (err) {
      toast.error(`Export failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>Export book</DialogTitle>
        <DialogDescription>
          Readers need nothing installed — no account, no internet. Animations and page turns work
          exactly like the preview.
        </DialogDescription>
      </DialogHeader>
      <div role="radiogroup" aria-label="Export format" className="grid gap-2">
        {FORMATS.map((f) => {
          const selected = f.id === format;
          const Icon = f.icon;
          return (
            <button
              key={f.id}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => setSettings({ format: f.id })}
              className={cn(
                'flex items-start gap-3 rounded-lg border p-3 text-left transition-colors focus-visible:ring-2 focus-visible:ring-ring',
                selected ? 'border-primary bg-accent/60 ring-1 ring-primary' : 'hover:bg-muted',
              )}
            >
              <Icon className="mt-0.5 size-5 shrink-0 text-primary" />
              <span>
                <span className="block text-sm font-medium">
                  {f.title}
                  {f.id === 'html' && (
                    <span className="ml-2 text-xs font-normal text-muted-foreground">
                      Recommended
                    </span>
                  )}
                </span>
                <span className="block text-xs text-muted-foreground">{f.body}</span>
              </span>
            </button>
          );
        })}
      </div>
      <label className="flex items-center justify-between gap-3 rounded-lg border p-3 text-sm">
        <span>
          Show “{MADE_WITH_LABEL}” badge
          <span className="block text-xs text-muted-foreground">
            A small label in the corner of the reader.
          </span>
        </span>
        <Switch
          checked={showBadge}
          onCheckedChange={(v) => setSettings({ showBadge: v })}
          aria-label="Show badge"
        />
      </label>
      <div className="text-sm" aria-live="polite" data-testid="export-estimate">
        {size ? (
          <span>
            Estimated size: <strong>{formatBytes(size.bytes)}</strong>
            <span className="text-muted-foreground">
              {' '}
              · images {formatBytes(size.images)}
              {size.audio > 0 && <> · sounds {formatBytes(size.audio)}</>} · fonts{' '}
              {formatBytes(size.fonts)}
            </span>
          </span>
        ) : (
          <span className="text-muted-foreground">Estimating size…</span>
        )}
      </div>
      {tooBig && (
        <p
          role="alert"
          className="flex gap-2 rounded-lg bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-300"
        >
          <AlertTriangle className="size-4 shrink-0" />
          This book is over 25 MB and may open slowly, especially on phones.
          {format === 'html'
            ? ' The ZIP format avoids inlining overhead.'
            : ' Try using fewer or smaller images.'}
        </p>
      )}
      <DialogFooter>
        <Button variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <Button onClick={run} disabled={busy}>
          {busy && <Loader2 className="animate-spin" />}
          {busy ? 'Preparing…' : format === 'zip' ? 'Download ZIP' : 'Download HTML'}
        </Button>
      </DialogFooter>
    </>
  );
}

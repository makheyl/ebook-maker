import { AlertTriangle, FileWarning, Loader2 } from 'lucide-react';
import { PRODUCT_NAME } from '@/core/brand';
import { voiceClips } from '@/core/voice';
import { useId, useLayoutEffect, useRef, useState } from 'react';
import { pageAssetIds, SCHEMA_VERSION } from '@/core/schema';
import { useEnsureAssets } from '@/editor/assets/asset-urls';
import { PageThumbnail } from '@/editor/stage/PageThumbnail';
import { Button } from '@/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/ui/dialog';
import { Label } from '@/ui/label';
import { Progress } from '@/ui/progress';
import { RadioGroup, RadioGroupItem } from '@/ui/radio-group';
import type { ImportMode, PreparedImport } from './import-book';
import type { ImportState } from './useImport';

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** Import a book exported by Inkbug (or Folio): progress, preview, then Keep both / Replace. */
export function ImportDialog({
  state,
  onCancel,
  onConfirm,
}: {
  state: ImportState;
  onCancel: () => void;
  onConfirm: (mode: ImportMode) => void;
}) {
  const open = state.status !== 'idle';
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="sm:max-w-lg" data-testid="import-dialog">
        {state.status === 'reading' && (
          <>
            <DialogHeader>
              <DialogTitle>Importing a book</DialogTitle>
              <DialogDescription>Reading “{state.name}”…</DialogDescription>
            </DialogHeader>
            <div className="grid gap-2" aria-live="polite">
              {state.progress && state.progress.total > 0 ? (
                <>
                  <Progress
                    value={(state.progress.done / state.progress.total) * 100}
                    aria-label="Import progress"
                  />
                  <p className="text-xs text-muted-foreground">
                    Checking pictures and sounds: {state.progress.done} / {state.progress.total}
                  </p>
                </>
              ) : (
                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" /> Opening the file…
                </p>
              )}
            </div>
          </>
        )}

        {state.status === 'error' && (
          <>
            <DialogHeader>
              <DialogTitle>Couldn’t import this file</DialogTitle>
              <DialogDescription>“{state.name}”</DialogDescription>
            </DialogHeader>
            <p role="alert" className="flex gap-2 text-sm">
              <FileWarning className="size-5 shrink-0 text-destructive" /> {state.message}
            </p>
            {state.details.length > 0 && (
              <details className="rounded-lg border bg-white/50 p-3 text-xs dark:bg-white/5">
                <summary className="cursor-pointer font-medium">Technical details</summary>
                <ul className="mt-2 list-disc pl-4 font-mono">
                  {state.details.map((d) => (
                    <li key={d}>{d}</li>
                  ))}
                </ul>
              </details>
            )}
            <DialogFooter>
              <Button onClick={onCancel}>OK</Button>
            </DialogFooter>
          </>
        )}

        {(state.status === 'ready' || state.status === 'saving') && (
          <ReadyView
            key={state.prep.parsed.project.id}
            prep={state.prep}
            saving={state.status === 'saving'}
            onCancel={onCancel}
            onConfirm={onConfirm}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function ReadyView({
  prep,
  saving,
  onCancel,
  onConfirm,
}: {
  prep: PreparedImport;
  saving: boolean;
  onCancel: () => void;
  onConfirm: (mode: ImportMode) => void;
}) {
  const { project, sourceSchema } = prep.parsed;
  const [mode, setMode] = useState<ImportMode>('keep-both');
  const keepId = useId();
  const replaceId = useId();
  const pictures = Object.keys(project.assets).length;
  const sounds = Object.keys(project.sounds).length;
  const voices = voiceClips(project).length;
  const tracks = Object.keys(project.music.tracks).length;
  const characters = Object.keys(project.characters).length;
  const summary = [
    plural(project.pages.length, 'page'),
    plural(pictures, 'picture'),
    ...(characters ? [plural(characters, 'character')] : []),
    ...(sounds ? [plural(sounds, 'sound')] : []),
    ...(voices ? [plural(voices, 'voice recording')] : []),
    ...(tracks ? [plural(tracks, 'music track')] : []),
  ].join(' · ');

  return (
    <>
      <DialogHeader>
        <DialogTitle>Import “{project.title}”?</DialogTitle>
        <DialogDescription>{summary}</DialogDescription>
      </DialogHeader>
      <CoverPreview prep={prep} />
      {sourceSchema < SCHEMA_VERSION && (
        <p className="text-xs text-muted-foreground">
          Made with an older version of {PRODUCT_NAME} — it will be upgraded as it’s imported.
        </p>
      )}
      {prep.missing.length > 0 && (
        <div
          role="alert"
          className="grid gap-1 rounded-lg bg-amber-500/10 p-3 text-xs text-amber-800 dark:text-amber-200"
        >
          <p className="flex items-center gap-2 font-medium">
            <AlertTriangle className="size-4" />
            {plural(prep.missing.length, 'file')} couldn’t be restored. The book still imports;
            those spots show a placeholder you can replace.
          </p>
          <ul className="list-disc pl-6" aria-label="Missing files">
            {prep.missing.slice(0, 5).map((m) => (
              <li key={m.id}>
                {m.name ??
                  (m.kind === 'voice'
                    ? 'A voice recording'
                    : m.kind === 'music'
                      ? 'A music track'
                      : m.kind === 'audio'
                        ? 'A sound'
                        : 'A picture')}
                : {m.reason}
              </li>
            ))}
            {prep.missing.length > 5 && <li>…and {prep.missing.length - 5} more</li>}
          </ul>
        </div>
      )}
      {prep.existing && (
        <fieldset className="grid gap-2 rounded-lg border p-3">
          <legend className="px-1 text-sm font-medium">This book is already here</legend>
          <RadioGroup
            value={mode}
            onValueChange={(v) => setMode(v as ImportMode)}
            aria-label="This book is already here"
            className="gap-2"
          >
            <div className="flex items-start gap-2">
              <RadioGroupItem value="keep-both" id={keepId} className="mt-0.5" />
              <Label htmlFor={keepId} className="grid gap-0.5 font-normal">
                Keep both
                <span className="text-xs text-muted-foreground">
                  Adds “{project.title} (imported)”; your copy stays as it is.
                </span>
              </Label>
            </div>
            <div className="flex items-start gap-2">
              <RadioGroupItem value="replace" id={replaceId} className="mt-0.5" />
              <Label htmlFor={replaceId} className="grid gap-0.5 font-normal">
                Replace my copy
                <span className="text-xs text-muted-foreground">
                  Your copy here becomes exactly what’s in the file.
                </span>
              </Label>
            </div>
          </RadioGroup>
          {mode === 'replace' && prep.localNewer && (
            <p role="alert" className="text-xs text-destructive">
              Your copy here was changed after this file was exported — replacing it loses those
              changes.
            </p>
          )}
        </fieldset>
      )}
      <DialogFooter>
        <Button variant="ghost" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
        <Button
          variant={mode === 'replace' && prep.existing ? 'destructive' : 'default'}
          onClick={() => onConfirm(mode)}
          disabled={saving}
        >
          {saving && <Loader2 className="animate-spin" />}
          {mode === 'replace' && prep.existing ? 'Replace my copy' : 'Import book'}
        </Button>
      </DialogFooter>
    </>
  );
}

function CoverPreview({ prep }: { prep: PreparedImport }) {
  const { project } = prep.parsed;
  const cover = project.pages[0]!;
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const ready = useEnsureAssets(pageAssetIds(cover));
  useLayoutEffect(() => {
    setWidth(Math.floor(ref.current?.clientWidth ?? 0));
  }, []);
  const { width: W, height: H } = project.pageSize;
  return (
    <div
      ref={ref}
      className="w-full overflow-hidden rounded-lg border bg-white"
      style={{ aspectRatio: `${W} / ${H}` }}
      data-testid="import-cover"
    >
      {width > 0 && ready && (
        <PageThumbnail
          page={cover}
          pageSize={project.pageSize}
          assets={project.assets}
          characters={project.characters}
          width={width}
        />
      )}
    </div>
  );
}

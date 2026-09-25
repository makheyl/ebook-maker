import { Check, CornerDownRight, FolderUp, TableProperties } from 'lucide-react';
import { useState } from 'react';
import type { Project } from '@/core/schema';
import { findElement } from '@/core/schema/tree';
import {
  defaultLanguageOf,
  lineStatus,
  matchVoiceFiles,
  pageVoiceLines,
  type VoiceFileMatch,
} from '@/core/voice';
import { Button } from '@/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/ui/dialog';
import { cn } from '@/ui/utils';
import { pickVoiceFiles } from '../assets/upload-voice';
import { useProject } from '../store/selectors';
import { applyBulkVoice, type BulkPlan } from './actions';
import { PreviewButton } from './PreviewButton';

type Row = {
  key: string;
  label: string;
  indent: boolean;
  line: Record<string, { id: string }> | undefined;
};

function rowsOf(project: Project): Row[] {
  return project.pages.flatMap((page, i) => {
    const lines = pageVoiceLines(page);
    const rows: Row[] = [
      { key: page.id, label: `Page ${i + 1}`, indent: false, line: page.voiceover },
    ];
    for (const { target, line } of lines) {
      if (target.kind === 'page') continue;
      const name = findElement(page.elements, target.elementId)?.name ?? 'Item';
      rows.push({
        key: JSON.stringify(target),
        label: target.kind === 'bubble' ? `${name} (bubble)` : `${name} (tap)`,
        indent: true,
        line,
      });
    }
    return rows;
  });
}

/** Book-wide grid of recordings (pages × languages) and bulk upload by file name. */
export function VoiceOverviewDialog() {
  const project = useProject();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState<{ files: File[]; matches: VoiceFileMatch[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const languages = project.voiceover.languages;
  const fallback = defaultLanguageOf(project);
  const short = (code: string | undefined) => code?.toUpperCase() ?? '';
  const rows = rowsOf(project);
  const pageRows = rows.filter((r) => !r.indent);

  const pick = async () => {
    const files = await pickVoiceFiles(true);
    if (!files.length) return;
    setPending({
      files,
      matches: matchVoiceFiles(
        files.map((f) => f.name),
        project.pages.length,
        languages,
        fallback,
      ),
    });
  };
  const plan: BulkPlan[] = pending
    ? pending.matches.flatMap((m, i) =>
        'page' in m
          ? [
              {
                file: pending.files[i]!,
                page: m.page,
                code: m.code,
                replaces: !!project.pages[m.page]?.voiceover?.[m.code],
              },
            ]
          : [],
      )
    : [];

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setPending(null);
      }}
    >
      <Button
        variant="outline"
        size="sm"
        className="justify-self-start"
        onClick={() => setOpen(true)}
      >
        <TableProperties /> Voiceover overview
      </Button>
      <DialogContent className="sm:max-w-3xl" data-testid="voice-overview">
        <DialogHeader>
          <DialogTitle>Voiceover overview</DialogTitle>
          <DialogDescription>
            Every recording in the book. “↩ {short(fallback)}” means the default language plays
            there. Upload many files at once by naming them like <code>page-03-tl.mp3</code>.
          </DialogDescription>
        </DialogHeader>

        {pending ? (
          <div className="grid max-h-[60vh] gap-2 overflow-auto">
            <table className="w-full text-xs" aria-label="Files to add">
              <thead>
                <tr className="text-left text-muted-foreground">
                  <th className="p-1 font-medium">File</th>
                  <th className="p-1 font-medium">Goes to</th>
                </tr>
              </thead>
              <tbody>
                {pending.matches.map((m, i) => (
                  <tr key={i} className="border-t" data-testid="bulk-row">
                    <td className="p-1">{m.name}</td>
                    <td className={cn('p-1', !('page' in m) && 'text-destructive')}>
                      {'page' in m
                        ? `Page ${m.page + 1} · ${languages.find((l) => l.code === m.code)?.name}${
                            project.pages[m.page]?.voiceover?.[m.code] ? ' (replaces)' : ''
                          }`
                        : `Skipped: ${m.problem}`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="max-h-[60vh] overflow-auto">
            <table className="w-full text-xs" aria-label="Recordings">
              <thead className="sticky top-0 bg-background">
                <tr className="text-left text-muted-foreground">
                  <th className="p-1 font-medium">Where</th>
                  {languages.map((l) => (
                    <th key={l.code} className="p-1 font-medium">
                      {l.name}
                      <span className="ml-1 font-normal">
                        {pageRows.filter((r) => r.line?.[l.code]).length} of {pageRows.length}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.key} className="border-t">
                    <td className={cn('p-1', row.indent && 'pl-4 text-muted-foreground')}>
                      {row.indent && <CornerDownRight className="mr-1 inline size-3" />}
                      {row.label}
                    </td>
                    {languages.map((l) => {
                      const clip = row.line?.[l.code];
                      const status = lineStatus(
                        row.line as Parameters<typeof lineStatus>[0],
                        l.code,
                        fallback,
                      );
                      return (
                        <td
                          key={l.code}
                          className="p-1"
                          data-testid={`cell-${row.label}-${l.code}`}
                        >
                          {clip ? (
                            <span className="inline-flex items-center gap-0.5 text-emerald-700 dark:text-emerald-400">
                              <Check className="size-3.5" aria-label="Recorded" />
                              <PreviewButton
                                assetId={clip.id}
                                label={`${l.name} for ${row.label}`}
                              />
                            </span>
                          ) : status === 'fallback' ? (
                            <span className="text-amber-700 dark:text-amber-400">
                              ↩ {short(fallback)}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <DialogFooter>
          {pending ? (
            <>
              <Button variant="ghost" onClick={() => setPending(null)}>
                Back
              </Button>
              <Button
                disabled={!plan.length || busy}
                onClick={async () => {
                  setBusy(true);
                  await applyBulkVoice(plan);
                  setBusy(false);
                  setPending(null);
                }}
              >
                Add {plan.length} recording{plan.length === 1 ? '' : 's'}
              </Button>
            </>
          ) : (
            <Button variant="outline" disabled={!languages.length} onClick={() => void pick()}>
              <FolderUp /> Upload many files…
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

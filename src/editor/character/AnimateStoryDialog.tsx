import { Wand2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { ANIMATION_PRESETS, IDLE_MOTIONS } from '@/core/animation';
import {
  applyStoryPlan,
  pageText,
  suggestPlan,
  type MotionChoice,
  type StoryPlanRow,
} from '@/core/story';
import { Button } from '@/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/ui/select';
import { Switch } from '@/ui/switch';
import { docStore } from '../store/doc-store';
import { useProject } from '../store/selectors';

const NONE = 'none';
const USUAL = 'usual';

const motionsOf = (kind: 'entrance' | 'emphasis' | 'exit') =>
  ANIMATION_PRESETS.filter((p) => p.requiresCharacter && p.kind === kind);

function MotionSelect({
  label,
  kind,
  value,
  onChange,
}: {
  label: string;
  kind: 'entrance' | 'emphasis' | 'exit';
  value: MotionChoice | undefined;
  onChange: (choice: MotionChoice | undefined) => void;
}) {
  return (
    <Select
      value={value?.motion ?? NONE}
      onValueChange={(v) =>
        onChange(v === NONE ? undefined : v === value?.motion ? value : { motion: v })
      }
    >
      <SelectTrigger className="h-8 w-full text-xs" aria-label={label}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE}>—</SelectItem>
        {motionsOf(kind).map((m) => (
          <SelectItem key={m.id} value={m.id}>
            {m.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function PlanEditor({ onDone }: { onDone: () => void }) {
  const project = useProject();
  const characters = Object.values(project.characters);
  const [characterId, setCharacterId] = useState(characters[0]!.id);
  const [rows, setRows] = useState<StoryPlanRow[]>(() => suggestPlan(project));
  const character = project.characters[characterId]!;
  const included = rows.filter((r) => r.include).length;
  const update = (i: number, patch: Partial<StoryPlanRow>) =>
    setRows((prev) => prev.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  const apply = () => {
    docStore.change((d) => applyStoryPlan(d, characterId, rows), { label: 'Animate story' });
    toast.success(`Animated ${character.name} on ${included} ${included === 1 ? 'page' : 'pages'}`);
    onDone();
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>Animate my story</DialogTitle>
        <DialogDescription>
          Suggestions come from each page's words (“jumped” → Hop). {character.name} keeps the same
          spot from page to page. Review, adjust and apply — it's one undo.
        </DialogDescription>
      </DialogHeader>
      {characters.length > 1 && (
        <Select value={characterId} onValueChange={setCharacterId}>
          <SelectTrigger className="h-8 w-56" aria-label="Character">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {characters.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
      <div
        className="max-h-[55vh] overflow-y-auto rounded-lg border"
        role="table"
        aria-label="Story plan"
      >
        <div
          role="row"
          className="sticky top-0 z-10 grid grid-cols-[2.5rem_minmax(0,1.6fr)_repeat(4,minmax(0,1fr))] gap-2 border-b bg-muted px-2 py-1.5 text-[11px] font-medium text-muted-foreground"
        >
          <span role="columnheader">Page</span>
          <span role="columnheader">Text</span>
          <span role="columnheader">Enters</span>
          <span role="columnheader">Then</span>
          <span role="columnheader">Leaves</span>
          <span role="columnheader">Idle</span>
        </div>
        {rows.map((row, i) => (
          <div
            key={row.pageId}
            role="row"
            data-testid="story-row"
            className="grid grid-cols-[2.5rem_minmax(0,1.6fr)_repeat(4,minmax(0,1fr))] items-start gap-2 border-b px-2 py-2 last:border-b-0 data-[off=true]:opacity-50"
            data-off={!row.include}
          >
            <div role="cell" className="flex flex-col items-center gap-1">
              <span className="text-xs tabular-nums">{i + 1}</span>
              <Switch
                checked={row.include}
                onCheckedChange={(include) => update(i, { include })}
                aria-label={`Animate page ${i + 1}`}
                className="scale-75"
              />
            </div>
            <div role="cell" className="min-w-0 text-xs">
              <p className="line-clamp-2">
                {pageText(project, i) || <em className="text-muted-foreground">No text</em>}
              </p>
              <div className="mt-1 flex flex-wrap gap-1">
                {row.reasons.map((r) => (
                  <span
                    key={r}
                    className="rounded bg-accent px-1 text-[10px] text-accent-foreground"
                  >
                    {r}
                  </span>
                ))}
              </div>
            </div>
            <div role="cell">
              <MotionSelect
                label={`Page ${i + 1} entrance`}
                kind="entrance"
                value={row.entrance}
                onChange={(entrance) => update(i, { entrance })}
              />
            </div>
            <div role="cell">
              <MotionSelect
                label={`Page ${i + 1} action`}
                kind="emphasis"
                value={row.action}
                onChange={(action) => update(i, { action })}
              />
            </div>
            <div role="cell">
              <MotionSelect
                label={`Page ${i + 1} exit`}
                kind="exit"
                value={row.exit}
                onChange={(exit) => update(i, { exit })}
              />
            </div>
            <div role="cell">
              <Select
                value={row.idle ?? USUAL}
                onValueChange={(v) => update(i, { idle: v === USUAL ? undefined : v })}
              >
                <SelectTrigger className="h-8 w-full text-xs" aria-label={`Page ${i + 1} idle`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={USUAL}>Usual</SelectItem>
                  <SelectItem value={NONE}>Keep still</SelectItem>
                  {IDLE_MOTIONS.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        ))}
      </div>
      <DialogFooter>
        <Button variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <Button onClick={apply} disabled={!included}>
          <Wand2 /> Apply to {included} {included === 1 ? 'page' : 'pages'}
        </Button>
      </DialogFooter>
    </>
  );
}

export function AnimateStoryDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const project = useProject();
  const hasCharacter = useMemo(
    () => Object.keys(project.characters).length > 0,
    [project.characters],
  );
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl">
        {open && hasCharacter && <PlanEditor onDone={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}

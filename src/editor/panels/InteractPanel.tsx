import { findElement, flattenElements } from '@/core/schema/tree';
import {
  AlertTriangle,
  CheckCircle2,
  CircleX,
  MousePointerClick,
  Music,
  Play,
  Plus,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { useId, useMemo } from 'react';
import { getPreset } from '@/core/animation';
import { validateInteractivity, type CheckIssue } from '@/core/interaction/validate';
import {
  BURST_EFFECTS,
  type Interaction,
  type Page,
  type PageElement,
  type StoryAction,
} from '@/core/schema';
import { Button } from '@/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/ui/dropdown-menu';
import { Input } from '@/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/ui/select';
import { Switch } from '@/ui/switch';
import {
  ACTION_LABELS,
  addInteraction,
  appendAction,
  removeInteraction,
  setA11yLabel,
  setActionType,
  updateFlow,
  updateGoal,
  updateInteraction,
  updateReader,
  type ActionType,
} from '../interaction/actions';
import { assetUrls } from '../assets/asset-urls';
import { textIssues } from '../checks/text-checks';
import { deleteSound, setPageTurnSound, setSoundName, uploadSound } from '../sound/actions';
import { useActivePage, useProject, useSelectedElements } from '../store/selectors';
import { useUiStore } from '../store/ui-store';
import { Field, NumberField, Section } from './controls';

const ACTION_ORDER: ActionType[] = [
  'next',
  'prev',
  'goToPage',
  'firstPage',
  'playStep',
  'unlockNext',
  'burst',
  'collect',
  'playSound',
];

const BURST_LABELS: Record<(typeof BURST_EFFECTS)[number], string> = {
  confetti: 'Confetti',
  sparkles: 'Sparkles',
  hearts: 'Hearts',
};

/** Right-panel "Interact" tab: what taps do, how pages lead on, and live checks. */
export function InteractPanel() {
  const selected = useSelectedElements();
  const page = useActivePage();
  return (
    <div>
      {selected.length === 1 ? (
        <ElementInteractions element={selected[0]!} page={page} />
      ) : selected.length > 1 ? (
        <Section>
          <p className="text-sm text-muted-foreground">
            Select a single item to choose what happens when it's tapped.
          </p>
        </Section>
      ) : (
        <>
          <PageFlowSection page={page} />
          <GoalSection page={page} />
          <ReaderSection />
          <SoundsSection />
        </>
      )}
      <ChecksSection />
    </div>
  );
}

function AddActionMenu({
  onPick,
  children,
  disabled,
}: {
  onPick: (type: ActionType) => void;
  children: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild disabled={disabled}>
        {children}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {ACTION_ORDER.map((type) => (
          <DropdownMenuItem key={type} onSelect={() => onPick(type)}>
            {ACTION_LABELS[type]}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ElementInteractions({ element, page }: { element: PageElement; page: Page }) {
  const interactions = element.interactions ?? [];
  const nameId = useId();
  const placeholder = element.type === 'button' ? element.label : 'e.g. “Wake the dragon”';
  return (
    <>
      <Section title="When tapped in the book">
        {!interactions.length && (
          <p className="text-xs text-muted-foreground">
            {element.type === 'hotspot'
              ? 'This tap area is invisible to readers. Choose what tapping it does.'
              : 'Make this tappable: turn a page, play an animation, make a choice…'}
          </p>
        )}
        {interactions.map((interaction, i) => (
          <InteractionCard
            key={interaction.id}
            element={element}
            page={page}
            interaction={interaction}
            index={i}
          />
        ))}
        <AddActionMenu
          onPick={(type) => void addInteraction(element.id, type)}
          disabled={interactions.length >= 4 || element.locked}
        >
          <Button variant="outline" size="sm" className="justify-self-start">
            <MousePointerClick />{' '}
            {interactions.length ? 'Add another tap action' : 'Add tap action'}
          </Button>
        </AddActionMenu>
      </Section>
      {(interactions.length > 0 || element.type === 'hotspot' || element.type === 'button') && (
        <Section title="Accessibility">
          <Field label="Name read by screen readers" htmlFor={nameId}>
            <Input
              id={nameId}
              key={element.id}
              defaultValue={element.a11yLabel ?? ''}
              placeholder={placeholder}
              maxLength={120}
              className="h-8"
              onBlur={(e) => {
                if (e.target.value.trim() !== (element.a11yLabel ?? '')) {
                  setA11yLabel(element.id, e.target.value);
                }
              }}
              onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
            />
          </Field>
        </Section>
      )}
    </>
  );
}

function InteractionCard({
  element,
  page,
  interaction,
  index,
}: {
  element: PageElement;
  page: Page;
  interaction: Interaction;
  index: number;
}) {
  const onceId = useId();
  return (
    <div
      className="grid gap-2 rounded-lg border bg-background p-2.5"
      data-testid="interaction-card"
      aria-label={`Tap action ${index + 1}`}
      role="group"
    >
      {interaction.actions.map((action, i) => (
        <ActionRow
          key={i}
          element={element}
          page={page}
          interaction={interaction}
          action={action}
          index={i}
        />
      ))}
      <div className="flex items-center justify-between gap-2">
        <AddActionMenu
          onPick={(type) => void appendAction(element.id, interaction.id, type)}
          disabled={interaction.actions.length >= 8}
        >
          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs">
            <Plus /> Then…
          </Button>
        </AddActionMenu>
        <Button
          variant="ghost"
          size="icon"
          className="size-7"
          aria-label={`Remove tap action ${index + 1}`}
          onClick={() => removeInteraction(element.id, interaction.id)}
        >
          <Trash2 />
        </Button>
      </div>
      <label htmlFor={onceId} className="flex items-center justify-between gap-2 text-xs">
        Only the first tap
        <Switch
          id={onceId}
          checked={interaction.once}
          onCheckedChange={(once) =>
            updateInteraction(element.id, interaction.id, (it) => void (it.once = once))
          }
        />
      </label>
    </div>
  );
}

function ActionRow({
  element,
  page,
  interaction,
  action,
  index,
}: {
  element: PageElement;
  page: Page;
  interaction: Interaction;
  action: StoryAction;
  index: number;
}) {
  const project = useProject();
  const set = (next: StoryAction) =>
    updateInteraction(element.id, interaction.id, (it) => void (it.actions[index] = next));
  const reactions = page.animations.filter((s) => s.trigger === 'onInteraction');
  const nameOf = (id: string) => findElement(page.elements, id)?.name ?? 'Deleted item';

  return (
    <div className="grid gap-1.5">
      <div className="flex items-center gap-1">
        {index > 0 && <span className="shrink-0 text-xs text-muted-foreground">then</span>}
        <Select
          value={action.type}
          onValueChange={(t) =>
            void setActionType(element.id, interaction.id, index, t as ActionType)
          }
        >
          <SelectTrigger className="h-8 min-w-0 flex-1" aria-label={`Action ${index + 1}`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ACTION_ORDER.map((type) => (
              <SelectItem key={type} value={type}>
                {ACTION_LABELS[type]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          variant="ghost"
          size="icon"
          className="size-7 shrink-0"
          aria-label={`Remove action ${index + 1}`}
          onClick={() =>
            updateInteraction(element.id, interaction.id, (it) => void it.actions.splice(index, 1))
          }
        >
          <X />
        </Button>
      </div>
      {action.type === 'goToPage' && (
        <Select value={action.pageId} onValueChange={(pageId) => set({ type: 'goToPage', pageId })}>
          <SelectTrigger className="h-8 w-full" aria-label="Page to jump to">
            <SelectValue placeholder="Choose a page" />
          </SelectTrigger>
          <SelectContent>
            {project.pages.map((p, i) => (
              <SelectItem key={p.id} value={p.id} disabled={p.id === page.id}>
                Page {i + 1}
                {p.id === page.id ? ' (this page)' : ''}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
      {action.type === 'playStep' && (
        <Select value={action.stepId} onValueChange={(stepId) => set({ type: 'playStep', stepId })}>
          <SelectTrigger className="h-8 w-full" aria-label="Animation to play">
            <SelectValue placeholder="Choose an animation" />
          </SelectTrigger>
          <SelectContent>
            {reactions.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {nameOf(s.elementId)} · {getPreset(s.preset)?.label ?? s.preset}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
      {action.type === 'playStep' && (
        <p className="text-[11px] text-muted-foreground">
          Change how it moves in the Animate tab (Start: “When tapped”).
        </p>
      )}
      {action.type === 'playSound' && (
        <div className="flex items-center gap-1">
          <Select
            value={action.soundId}
            onValueChange={(v) => {
              if (v !== UPLOAD) return set({ type: 'playSound', soundId: v });
              void uploadSound().then(
                (sound) => sound && set({ type: 'playSound', soundId: sound.id }),
              );
            }}
          >
            <SelectTrigger className="h-8 min-w-0 flex-1" aria-label="Sound to play">
              <SelectValue placeholder="Choose a sound" />
            </SelectTrigger>
            <SelectContent>
              {Object.values(project.sounds).map((snd) => (
                <SelectItem key={snd.id} value={snd.id}>
                  {snd.name ?? 'Sound'}
                </SelectItem>
              ))}
              <SelectItem value={UPLOAD}>Upload a sound…</SelectItem>
            </SelectContent>
          </Select>
          <PreviewSoundButton soundId={action.soundId} />
        </div>
      )}
      {action.type === 'burst' && (
        <Select
          value={action.effect}
          onValueChange={(effect) =>
            set({ type: 'burst', effect: effect as (typeof BURST_EFFECTS)[number] })
          }
        >
          <SelectTrigger className="h-8 w-full" aria-label="Burst effect">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {BURST_EFFECTS.map((e) => (
              <SelectItem key={e} value={e}>
                {BURST_LABELS[e]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </div>
  );
}

/** Select items can't trigger uploads directly; this value stands for "upload a new one". */
const UPLOAD = '__upload';

let previewAudio: HTMLAudioElement | null = null;

/** Plays a sound in the editor (stopping any other preview). */
function PreviewSoundButton({ soundId, name }: { soundId: string; name?: string }) {
  return (
    <Button
      variant="ghost"
      size="icon"
      className="size-7 shrink-0"
      aria-label={`Play ${name ?? 'sound'}`}
      onClick={() => {
        const src = assetUrls.resolve(soundId);
        if (!src) return;
        previewAudio?.pause();
        previewAudio = new Audio(src);
        void previewAudio.play().catch(() => undefined);
      }}
    >
      <Play />
    </Button>
  );
}

const NO_SOUND = '__none';

function SoundsSection() {
  const project = useProject();
  const sounds = Object.values(project.sounds);
  return (
    <Section title="Sounds (whole book)">
      {!sounds.length ? (
        <p className="text-xs text-muted-foreground">
          MP3, OGG, WAV or M4A up to 2 MB. Play them when something is tapped, or when a page turns.
          Readers can mute them.
        </p>
      ) : (
        <ul className="grid gap-1.5" aria-label="Sounds">
          {sounds.map((snd) => (
            <li key={snd.id} className="flex items-center gap-1">
              <Music className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              <Input
                key={snd.id + snd.name}
                defaultValue={snd.name ?? 'Sound'}
                aria-label="Sound name"
                maxLength={200}
                className="h-7 min-w-0 flex-1 text-xs"
                onBlur={(e) =>
                  e.target.value.trim() &&
                  e.target.value.trim() !== snd.name &&
                  setSoundName(snd.id, e.target.value)
                }
                onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
              />
              <span className="shrink-0 text-[11px] text-muted-foreground tabular-nums">
                {snd.duration !== undefined && `${snd.duration.toFixed(1)} s`}
              </span>
              <PreviewSoundButton soundId={snd.id} name={snd.name} />
              <Button
                variant="ghost"
                size="icon"
                className="size-7 shrink-0"
                aria-label={`Remove ${snd.name ?? 'sound'}`}
                onClick={() => deleteSound(snd.id)}
              >
                <Trash2 />
              </Button>
            </li>
          ))}
        </ul>
      )}
      <Button
        variant="outline"
        size="sm"
        className="justify-self-start"
        onClick={() => void uploadSound()}
      >
        <Upload /> Upload sound
      </Button>
      <Field label="Page-turn sound">
        <Select
          value={project.reader.pageTurnSound ?? NO_SOUND}
          onValueChange={(v) => {
            if (v === UPLOAD) {
              void uploadSound().then((snd) => snd && setPageTurnSound(snd.id));
            } else setPageTurnSound(v === NO_SOUND ? undefined : v);
          }}
        >
          <SelectTrigger className="h-8 w-full" aria-label="Page-turn sound">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NO_SOUND}>None</SelectItem>
            {sounds.map((snd) => (
              <SelectItem key={snd.id} value={snd.id}>
                {snd.name ?? 'Sound'}
              </SelectItem>
            ))}
            <SelectItem value={UPLOAD}>Upload a sound…</SelectItem>
          </SelectContent>
        </Select>
      </Field>
    </Section>
  );
}

const DEFAULT_NEXT = 'default';
const END = 'end';

function PageFlowSection({ page }: { page: Page }) {
  const project = useProject();
  const index = project.pages.findIndex((p) => p.id === page.id);
  const lockId = useId();
  const isLast = index === project.pages.length - 1;
  return (
    <Section title={`Page ${index + 1} in the story`}>
      <Field label="After this page">
        <Select
          value={page.flow?.next ?? DEFAULT_NEXT}
          onValueChange={(v) => updateFlow(page.id, { next: v === DEFAULT_NEXT ? null : v })}
        >
          <SelectTrigger className="h-8 w-full" aria-label="After this page">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={DEFAULT_NEXT}>
              {isLast ? 'The end of the book' : `The next page (page ${index + 2})`}
            </SelectItem>
            {!isLast && <SelectItem value={END}>The end of the book</SelectItem>}
            {project.pages.map((p, i) =>
              i === index || i === index + 1 ? null : (
                <SelectItem key={p.id} value={p.id}>
                  Page {i + 1}
                </SelectItem>
              ),
            )}
          </SelectContent>
        </Select>
      </Field>
      <label htmlFor={lockId} className="flex items-start justify-between gap-3 text-sm">
        <span>
          Tap something to continue
          <span className="block text-xs text-muted-foreground">
            Readers can't turn the page until they tap a button or finish the page (a choice,
            “unlock”, or collecting items).
          </span>
        </span>
        <Switch
          id={lockId}
          checked={!!page.flow?.lockNext}
          onCheckedChange={(lockNext) => updateFlow(page.id, { lockNext })}
        />
      </label>
    </Section>
  );
}

type ReaderToggle =
  'tapToAdvance' | 'showNavButtons' | 'hints' | 'showPageMenu' | 'rememberPosition';

const READER_ROWS: { key: ReaderToggle; label: string; hint: string }[] = [
  { key: 'tapToAdvance', label: 'Tap the page to turn', hint: 'Anywhere that isn’t a button' },
  { key: 'showNavButtons', label: 'Show arrow buttons', hint: 'Keyboard and swipes always work' },
  { key: 'hints', label: 'Hints on locked pages', hint: 'Tappable things glow' },
  { key: 'showPageMenu', label: 'Page menu', hint: 'Readers can jump to any page' },
  {
    key: 'rememberPosition',
    label: 'Remember where readers stopped',
    hint: 'Exported books continue on the same page',
  },
];

function ReaderSection() {
  const project = useProject();
  const r = project.reader;
  return (
    <Section title="Reading (whole book)">
      {READER_ROWS.map((row) => (
        <label key={row.key} className="flex items-start justify-between gap-3 text-sm">
          <span>
            {row.label}
            <span className="block text-xs text-muted-foreground">{row.hint}</span>
          </span>
          <Switch
            checked={r[row.key]}
            aria-label={row.label}
            onCheckedChange={(v) => updateReader({ [row.key]: v })}
          />
        </label>
      ))}
    </Section>
  );
}

function GoalSection({ page }: { page: Page }) {
  const labelId = useId();
  const collectibles = flattenElements(page.elements).filter((e) =>
    e.interactions?.some((i) => i.actions.some((a) => a.type === 'collect')),
  ).length;
  return (
    <Section title="Collect goal">
      <p className="text-xs text-muted-foreground">
        “Find 3 stars”: give items the <em>Collect it</em> tap action ({collectibles} on this page).
        Reaching the goal unlocks the page with confetti.
      </p>
      <div className="grid grid-cols-[80px_1fr] items-end gap-2">
        <NumberField
          label="Items"
          value={page.goal?.count ?? 0}
          min={0}
          max={20}
          onCommit={(count) => updateGoal(page.id, { count })}
        />
        <Field label="Shown to readers" htmlFor={labelId}>
          <Input
            id={labelId}
            key={`${page.id}:${page.goal ? 'on' : 'off'}`}
            defaultValue={page.goal?.label ?? ''}
            placeholder="Find the stars"
            maxLength={60}
            disabled={!page.goal}
            className="h-8"
            onBlur={(e) => {
              if (page.goal && e.target.value !== page.goal.label) {
                updateGoal(page.id, { label: e.target.value });
              }
            }}
            onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
          />
        </Field>
      </div>
    </Section>
  );
}

function ChecksSection() {
  const project = useProject();
  const issues = useMemo(
    () => [...textIssues(project), ...validateInteractivity(project)],
    [project],
  );
  const go = (issue: CheckIssue) => {
    const ui = useUiStore.getState();
    ui.setActivePage(issue.pageId);
    ui.select(issue.elementId ? [issue.elementId] : []);
  };
  return (
    <Section title="Checks">
      {!issues.length ? (
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <CheckCircle2 className="size-4 text-emerald-600" /> No problems found.
        </p>
      ) : (
        <ul className="grid gap-1.5" aria-label="Problems">
          {issues.map((issue) => (
            <li key={issue.id}>
              <button
                type="button"
                onClick={() => go(issue)}
                className="flex w-full items-start gap-2 rounded-md p-1.5 text-left text-xs hover:bg-accent"
              >
                {issue.severity === 'error' ? (
                  <CircleX className="mt-px size-4 shrink-0 text-destructive" aria-label="Error" />
                ) : (
                  <AlertTriangle
                    className="mt-px size-4 shrink-0 text-amber-600"
                    aria-label="Warning"
                  />
                )}
                {issue.message}
              </button>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

import { findElement, flattenElements } from '@/core/schema/tree';
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { restrictToVerticalAxis } from '@dnd-kit/modifiers';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  ChevronDown,
  GripVertical,
  MousePointerClick,
  Play,
  Plus,
  Sparkles,
  Spline,
  Square,
  Trash2,
  Wand2,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import {
  ANIMATION_PRESETS,
  canBake,
  EASINGS,
  TRANSITIONS,
  createAnimationStep,
  getPreset,
  presetsFor,
  scheduleSteps,
  type MotionTracks,
  type ParamDef,
} from '@/core/animation';
import {
  addAnimation,
  moveAnimation,
  removeAnimations,
  updateAnimation,
  updatePage,
} from '@/core/ops';
import type {
  AnimationKind,
  AnimationStep,
  AnimationTrigger,
  Page,
  PageElement,
  TransitionPreset,
} from '@/core/schema';
import { Button } from '@/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/ui/dropdown-menu';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/ui/select';
import { cn } from '@/ui/utils';
import { previewAnimations, stopPreview } from '../animation/preview';
import { TransitionPreview } from '../animation/TransitionPreview';
import { AnimateStoryDialog } from '../character/AnimateStoryDialog';
import { convertToKeyframes } from '../timeline/actions';
import { getStageView } from '../stage/stage-view';
import { docStore } from '../store/doc-store';
import { useActivePage, useProject, useSelectedElements } from '../store/selectors';
import { useUiStore } from '../store/ui-store';
import { Field, NumberField, Section } from './controls';

const KIND_STYLES: Record<AnimationKind, string> = {
  entrance: 'bg-emerald-500',
  emphasis: 'bg-amber-500',
  exit: 'bg-rose-500',
};
const KIND_LABELS: Record<AnimationKind, string> = {
  entrance: 'Entrance',
  emphasis: 'Emphasis',
  exit: 'Exit',
};
const TRIGGER_LABELS: Record<AnimationTrigger, string> = {
  onPageEnter: 'When page opens',
  withPrevious: 'With previous',
  afterPrevious: 'After previous',
  onClick: 'On click',
  onInteraction: 'When tapped (interaction)',
};

function play(page: Page, stepIds?: string[]) {
  const view = getStageView();
  const project = docStore.project();
  if (!view || !project) return;
  void previewAnimations(view, page, project.pageSize, stepIds);
}

function change(label: string, recipe: Parameters<typeof docStore.change>[0]) {
  docStore.change(recipe, { label });
}

/** Entry point for animating the whole book's character from its text. */
function StoryAutomation() {
  const project = useProject();
  const [open, setOpen] = useState(false);
  const hasCharacter = Object.keys(project.characters).length > 0;
  return (
    <div className="border-b px-4 py-3">
      <Button
        variant="secondary"
        size="sm"
        className="w-full"
        disabled={!hasCharacter}
        onClick={() => setOpen(true)}
      >
        <Wand2 /> Animate my story
      </Button>
      {!hasCharacter && (
        <p className="mt-1.5 text-[11px] text-muted-foreground">
          Make a picture a character first (Design tab), or insert one with “Character”.
        </p>
      )}
      <AnimateStoryDialog open={open} onOpenChange={setOpen} />
    </div>
  );
}

/** Presets for an element; a character's own moves come first. */
function orderedPresets(kind: AnimationKind, element: PageElement, isCharacter: boolean) {
  const list = presetsFor(kind, element.type, isCharacter);
  return [...list.filter((p) => p.requiresCharacter), ...list.filter((p) => !p.requiresCharacter)];
}

function AddAnimationMenu({
  element,
  page,
  onAdded,
}: {
  element?: PageElement;
  page: Page;
  onAdded: (id: string) => void;
}) {
  const project = useProject();
  const isCharacter =
    element?.type === 'image' && !!element.characterId && !!project.characters[element.characterId];
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="sm" disabled={!element} className="flex-1">
          <Plus /> Add animation <ChevronDown className="opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-[70vh] w-60 overflow-y-auto">
        {(['entrance', 'emphasis', 'exit'] as const).map((kind, i) => (
          <div key={kind}>
            {i > 0 && <DropdownMenuSeparator />}
            <DropdownMenuLabel className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className={cn('size-2 rounded-full', KIND_STYLES[kind])} /> {KIND_LABELS[kind]}
            </DropdownMenuLabel>
            {element &&
              orderedPresets(kind, element, isCharacter).map((preset) => (
                <DropdownMenuItem
                  key={preset.id}
                  onSelect={() => {
                    const trigger: AnimationTrigger = page.animations.length
                      ? 'afterPrevious'
                      : 'onPageEnter';
                    const step = createAnimationStep(element.id, preset.id, trigger);
                    const characterId = element.type === 'image' ? element.characterId : undefined;
                    docStore.change(
                      (d) => {
                        addAnimation(d, page.id, step);
                        // Bending moves need the character drawn as strips.
                        if (preset.warp && characterId && d.characters[characterId]) {
                          d.characters[characterId]!.warp = true;
                        }
                      },
                      { label: 'Add animation' },
                    );
                    onAdded(step.id);
                    // Show it right away, like PowerPoint does.
                    const updated = docStore.project()?.pages.find((p) => p.id === page.id);
                    if (updated) setTimeout(() => play(updated, [step.id]), 50);
                  }}
                >
                  {preset.label}
                  {preset.requiresCharacter && (
                    <span className="ml-auto text-[10px] text-muted-foreground">character</span>
                  )}
                </DropdownMenuItem>
              ))}
          </div>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ParamField({ def, step, page }: { def: ParamDef; step: AnimationStep; page: Page }) {
  const preset = getPreset(step.preset)!;
  const value = step.params?.[def.key] ?? preset.defaults.params?.[def.key];
  const set = (v: number | string) =>
    change('Animation option', (d) =>
      updateAnimation(d, page.id, step.id, (s) => {
        s.params = { ...s.params, [def.key]: v };
      }),
    );
  if (def.type === 'number') {
    return (
      <NumberField
        label={def.label}
        value={typeof value === 'number' ? value : Number(value ?? 0)}
        min={def.min}
        max={def.max}
        step={def.step}
        precision={def.step < 1 ? 2 : 0}
        suffix={def.unit}
        onCommit={set}
      />
    );
  }
  if (def.type === 'pose') return <PoseParamField def={def} value={value} step={step} set={set} />;
  return (
    <Field label={def.label}>
      <Select value={String(value ?? '')} onValueChange={set}>
        <SelectTrigger className="h-8 w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {def.options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Field>
  );
}

/** Select items can't have an empty value; this stands for "the character's own artwork". */
const OWN_ARTWORK = '__artwork';

function PoseParamField({
  def,
  value,
  step,
  set,
}: {
  def: ParamDef;
  value: unknown;
  step: AnimationStep;
  set: (v: string) => void;
}) {
  const project = useProject();
  const page = useActivePage();
  const element = findElement(page.elements, step.elementId);
  const character =
    element?.type === 'image' && element.characterId
      ? project.characters[element.characterId]
      : undefined;
  const poses = character?.poses ?? [];
  const current = typeof value === 'string' && poses.some((p) => p.id === value) ? value : '';
  return (
    <Field label={def.label}>
      <Select value={current || OWN_ARTWORK} onValueChange={(v) => set(v === OWN_ARTWORK ? '' : v)}>
        <SelectTrigger className="h-8 w-full" aria-label={def.label}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={OWN_ARTWORK}>Own artwork (back to normal)</SelectItem>
          {poses.map((p) => (
            <SelectItem key={p.id} value={p.id}>
              {p.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {!poses.length && (
        <p className="text-[11px] text-muted-foreground">
          Add poses (extra pictures) in the Design tab → Character.
        </p>
      )}
    </Field>
  );
}

/** Character moves made only of whole-body motion can become editable keyframes. */
function useCanConvert(step: AnimationStep, element: PageElement): boolean {
  const project = useProject();
  const preset = getPreset(step.preset) as
    ({ tracks?: (ctx: never) => MotionTracks } & ReturnType<typeof getPreset>) | undefined;
  if (!preset?.tracks || element.type !== 'image' || !element.characterId) return false;
  const character = project.characters[element.characterId];
  if (!character) return false;
  try {
    const tracks = (preset.tracks as (ctx: unknown) => MotionTracks)({
      element,
      params: { ...preset.defaults.params, ...step.params },
      pageSize: project.pageSize,
      character,
      step,
    });
    return canBake(tracks);
  } catch {
    return false;
  }
}

function StepEditor({
  step,
  page,
  element,
}: {
  step: AnimationStep;
  page: Page;
  element: PageElement;
}) {
  const preset = getPreset(step.preset);
  const canConvert = useCanConvert(step, element);
  const update = (label: string, recipe: (s: AnimationStep) => void) =>
    change(label, (d) => updateAnimation(d, page.id, step.id, recipe));

  return (
    <div className="grid gap-3 border-t border-foreground/[0.07] bg-white/35 px-3 py-3 dark:bg-white/[0.03]">
      <Field label="Effect">
        <Select
          value={step.preset}
          onValueChange={(id) => {
            const next = getPreset(id)!;
            update('Change effect', (s) => {
              s.preset = next.id;
              s.kind = next.kind;
              s.duration = next.defaults.duration;
              s.easing = next.defaults.easing;
              s.params = next.defaults.params ? { ...next.defaults.params } : undefined;
            });
          }}
        >
          <SelectTrigger className="h-8 w-full" aria-label="Effect">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ANIMATION_PRESETS.filter(
              (p) =>
                p.id !== 'keyframes' &&
                (!p.appliesTo || p.appliesTo.includes(element.type)) &&
                (!p.requiresCharacter || (element.type === 'image' && !!element.characterId)),
            ).map((p) => (
              <SelectItem key={p.id} value={p.id}>
                <span className={cn('size-2 rounded-full', KIND_STYLES[p.kind])} /> {p.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <Field label="Start">
        <Select
          value={step.trigger}
          onValueChange={(v) =>
            update('Change start', (s) => void (s.trigger = v as AnimationTrigger))
          }
        >
          <SelectTrigger className="h-8 w-full" aria-label="Start">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(TRIGGER_LABELS) as AnimationTrigger[]).map((t) => (
              <SelectItem key={t} value={t}>
                {TRIGGER_LABELS[t]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <NumberField
          label="Duration"
          value={step.duration / 1000}
          min={0.05}
          max={60}
          step={0.1}
          precision={2}
          suffix="s"
          onCommit={(v) => update('Duration', (s) => void (s.duration = Math.round(v * 1000)))}
        />
        <NumberField
          label="Delay"
          value={step.delay / 1000}
          min={0}
          max={60}
          step={0.1}
          precision={2}
          suffix="s"
          onCommit={(v) => update('Delay', (s) => void (s.delay = Math.round(v * 1000)))}
        />
      </div>
      <Field label="Easing">
        <Select
          value={step.easing}
          onValueChange={(v) => update('Easing', (s) => void (s.easing = v))}
        >
          <SelectTrigger className="h-8 w-full" aria-label="Easing">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {EASINGS.map((e) => (
              <SelectItem key={e.id} value={e.id}>
                {e.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      {preset?.params?.map((def) => (
        <ParamField key={def.key} def={def} step={step} page={page} />
      ))}
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          className="flex-1"
          onClick={() => play(page, [step.id])}
        >
          <Play /> Preview
        </Button>
        {canConvert && (
          <Button
            variant="outline"
            size="sm"
            title="Turn this move into keyframes you can edit on the timeline"
            onClick={() => {
              if (convertToKeyframes(step.id)) useUiStore.getState().setTimelineOpen(true);
            }}
          >
            <Spline /> Edit as keyframes
          </Button>
        )}
        <Button
          variant="ghost"
          size="sm"
          aria-label="Remove animation"
          onClick={() => change('Remove animation', (d) => removeAnimations(d, page.id, [step.id]))}
        >
          <Trash2 /> Remove
        </Button>
      </div>
    </div>
  );
}

function StepRow({
  step,
  index,
  page,
  element,
  clickNumber,
  open,
  onToggle,
}: {
  step: AnimationStep;
  index: number;
  page: Page;
  element: PageElement;
  clickNumber: number | null;
  open: boolean;
  onToggle: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: step.id,
  });
  const preset = getPreset(step.preset);
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        'glass-subtle overflow-hidden rounded-lg',
        isDragging && 'z-10 shadow-lg',
        open && 'ring-2 ring-primary/40',
      )}
      data-testid="animation-step"
    >
      <div className="flex items-center gap-1.5 px-1.5 py-1.5">
        <button
          type="button"
          className="cursor-grab rounded p-0.5 text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={`Reorder animation ${index + 1}`}
          {...attributes}
          {...listeners}
        >
          <GripVertical className="size-3.5" />
        </button>
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          className="flex min-w-0 flex-1 items-center gap-2 rounded px-1 py-0.5 text-left text-sm focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span className="w-4 text-right text-xs text-muted-foreground tabular-nums">
            {index + 1}
          </span>
          <span
            className={cn('size-2 shrink-0 rounded-full', KIND_STYLES[step.kind])}
            aria-label={KIND_LABELS[step.kind]}
          />
          <span className="min-w-0 flex-1">
            <span className="block truncate font-medium">{element.name}</span>
            <span className="block truncate text-xs text-muted-foreground">
              {preset?.label ?? step.preset} · {TRIGGER_LABELS[step.trigger]}
            </span>
          </span>
          {clickNumber !== null && (
            <span
              className="inline-flex items-center gap-0.5 rounded bg-accent px-1 text-[10px] font-medium text-accent-foreground"
              title={`Plays on click ${clickNumber}`}
            >
              <MousePointerClick className="size-3" />
              {clickNumber}
            </span>
          )}
        </button>
      </div>
      {open && <StepEditor step={step} page={page} element={element} />}
    </li>
  );
}

function TransitionSection({ page }: { page: Page }) {
  const t = page.transition;
  const pageCount = useProject().pages.length;
  const [hovered, setHovered] = useState<string | null>(null);
  const set = (patch: Partial<Page['transition']>) =>
    change('Page transition', (d) => updatePage(d, page.id, { transition: { ...t, ...patch } }));
  const pick = (preset: TransitionPreset) =>
    // A transition needs time to play: picking one on a page set to 0 s gives it a default.
    set({ preset, ...(preset !== 'none' && t.duration <= 0 ? { duration: 800 } : {}) });
  const useEverywhere = () =>
    change('Page transition on every page', (d) => {
      for (const p of d.pages) p.transition = { ...t };
    });
  const shown = hovered ?? (t.preset !== 'none' ? t.preset : null);
  return (
    <Section title="Page transition">
      <p className="-mt-1 text-[11px] text-muted-foreground">
        How this page appears when the reader turns to it.
      </p>
      <div
        className="grid grid-cols-3 gap-1"
        role="radiogroup"
        aria-label="Page transition"
        onMouseLeave={() => setHovered(null)}
      >
        {TRANSITIONS.map((tr) => (
          <button
            key={tr.id}
            type="button"
            role="radio"
            aria-checked={t.preset === tr.id}
            onClick={() => pick(tr.id as TransitionPreset)}
            onMouseEnter={() => setHovered(tr.id === 'none' ? null : tr.id)}
            onFocus={() => setHovered(tr.id === 'none' ? null : tr.id)}
            onBlur={() => setHovered(null)}
            className={cn(
              'rounded-md border px-1 py-1.5 text-[11px] focus-visible:ring-2 focus-visible:ring-ring',
              t.preset === tr.id
                ? 'border-primary bg-accent text-accent-foreground'
                : 'hover:bg-muted',
            )}
          >
            {tr.label}
          </button>
        ))}
      </div>
      {shown && <TransitionPreview preset={shown} />}
      {t.preset === 'curl' && (
        <p className="text-[11px] text-muted-foreground">
          Readers can also drag the page’s bottom corner to turn it.
        </p>
      )}
      {t.preset !== 'none' && (
        <NumberField
          label="Duration"
          value={t.duration / 1000}
          min={0.1}
          max={5}
          step={0.1}
          precision={2}
          suffix="s"
          onCommit={(v) => set({ duration: Math.round(v * 1000) })}
        />
      )}
      {pageCount > 1 && (
        <Button variant="outline" size="sm" onClick={useEverywhere}>
          Use on every page
        </Button>
      )}
    </Section>
  );
}

/** PowerPoint-style Animation Pane for the active page. */
export function AnimationPane() {
  const page = useActivePage();
  const selected = useSelectedElements();
  const previewing = useUiStore((s) => s.previewing);
  const openId = useUiStore((s) => s.selectedStepId);
  const setOpenId = (id: string | null) => useUiStore.getState().setSelectedStep(id);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  // Stop any preview when leaving the page or the pane.
  useEffect(() => () => stopPreview(), [page.id]);

  const clickNumbers = useMemo(() => {
    const map = new Map<string, number>();
    scheduleSteps(page.animations).groups.forEach((g, i) => {
      if (i > 0) g.steps.forEach((s) => map.set(s.step.id, i));
    });
    return map;
  }, [page.animations]);

  const elementsById = new Map(flattenElements(page.elements).map((e) => [e.id, e]));
  const single = selected.length === 1 ? selected[0] : undefined;

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const from = page.animations.findIndex((s) => s.id === active.id);
    const to = page.animations.findIndex((s) => s.id === over.id);
    docStore.change((d) => moveAnimation(d, page.id, from, to), { label: 'Reorder animations' });
  };

  return (
    <div>
      <StoryAutomation />
      <Section title="Animations">
        <div className="flex gap-2">
          <AddAnimationMenu element={single} page={page} onAdded={setOpenId} />
          <Button
            variant="outline"
            size="sm"
            disabled={!page.animations.length}
            onClick={() => (previewing ? stopPreview() : play(page))}
            aria-label={previewing ? 'Stop preview' : 'Play page animations'}
          >
            {previewing ? <Square /> : <Play />} {previewing ? 'Stop' : 'Play'}
          </Button>
        </div>
        {!single && (
          <p className="text-[11px] text-muted-foreground">
            Select one element on the page to animate it.
          </p>
        )}
        {page.animations.length === 0 ? (
          <div className="grid place-items-center gap-2 rounded-lg border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">
            <Sparkles className="size-5" />
            No animations on this page yet.
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={onDragEnd}
            modifiers={[restrictToVerticalAxis]}
          >
            <SortableContext
              items={page.animations.map((s) => s.id)}
              strategy={verticalListSortingStrategy}
            >
              <ol className="grid gap-1.5" aria-label="Animation order">
                {page.animations.map((step, i) => {
                  const element = elementsById.get(step.elementId);
                  if (!element) return null;
                  return (
                    <StepRow
                      key={step.id}
                      step={step}
                      index={i}
                      page={page}
                      element={element}
                      clickNumber={clickNumbers.get(step.id) ?? null}
                      open={openId === step.id}
                      onToggle={() => {
                        setOpenId(openId === step.id ? null : step.id);
                        useUiStore.getState().select([element.id]);
                      }}
                    />
                  );
                })}
              </ol>
            </SortableContext>
          </DndContext>
        )}
      </Section>
      <TransitionSection page={page} />
      <p className="px-4 pb-4 text-[11px] text-muted-foreground">
        Tip: “On click” steps wait for the reader to tap or press → before playing.
      </p>
    </div>
  );
}

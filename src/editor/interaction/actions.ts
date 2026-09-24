import { current, isDraft } from 'immer';
import { createAnimationStep } from '@/core/animation';
import { newId } from '@/core/ids';
import { addAnimation, addAsset, addElements, getPage, updateElement } from '@/core/ops';
import {
  createButtonElement,
  createHotspotElement,
  createImageElement,
  type AnimationStep,
  type AssetRef,
  type ButtonElement,
  type ImageElement,
  type Interaction,
  type Page,
  type Project,
  type ReaderSettings,
  type StoryAction,
} from '@/core/schema';
import { toast } from 'sonner';
import { imageFilesFrom, importImageFiles } from '../assets/upload';
import { docStore } from '../store/doc-store';
import { getActivePage, getSelectedElements } from '../store/selectors';
import { uploadSound } from '../sound/actions';
import { useUiStore } from '../store/ui-store';

/**
 * Editor commands for the storybook side of a book: story buttons, tap areas, what taps do,
 * and how pages lead to one another. Each is one undo step.
 */

export type ButtonPreset = 'next' | 'back' | 'choice' | 'restart' | 'tapMe';

export const BUTTON_PRESETS: { id: ButtonPreset; label: string; hint: string }[] = [
  { id: 'next', label: 'Next →', hint: 'Turns to the next page' },
  { id: 'back', label: '← Back', hint: 'Goes back a page' },
  { id: 'choice', label: 'Choice (2 buttons)', hint: 'Each button jumps to its own page' },
  { id: 'restart', label: 'Start over', hint: 'Back to the first page' },
  { id: 'tapMe', label: 'Tap me!', hint: 'Sparkles when tapped' },
];

export const newInteraction = (actions: StoryAction[], once = false): Interaction => ({
  id: newId('ia'),
  trigger: 'tap',
  actions,
  once,
});

type Box = { x: number; y: number; width: number; height: number };

/** Inserts a ready-made story button (or two, for a choice) on the active page. */
export function insertButton(preset: ButtonPreset): string[] {
  const project = docStore.project();
  const page = getActivePage();
  if (!project || !page) return [];
  const { width: W, height: H } = project.pageSize;
  const pageIndex = project.pages.findIndex((p) => p.id === page.id);
  const h = Math.round(Math.max(56, H * 0.085));
  const margin = Math.round(Math.min(W, H) * 0.05);
  const fontSize = Math.round(h * 0.42);
  const style = {
    fontFamily: project.theme.fontFamily,
    fontSize,
    fill: project.theme.accent,
    textColor: '#ffffff',
    radius: h / 2,
  };
  const widthFor = (label: string, icon: boolean) =>
    Math.round(Math.max(h * 2.2, label.length * fontSize * 0.62 + h * (icon ? 1.3 : 0.9)));
  const make = (
    label: string,
    box: Omit<Box, 'width' | 'height'> & { width?: number },
    extra: Partial<ButtonElement>,
    actions: StoryAction[],
  ) =>
    createButtonElement(
      label,
      { width: widthFor(label, !!extra.icon), height: h, ...box },
      { ...extra, style, interactions: [newInteraction(actions)] },
    );

  const bottom = H - margin - h;
  let elements: ButtonElement[];
  let lock = false;
  switch (preset) {
    case 'next': {
      const w = widthFor('Next', true);
      elements = [
        make(
          'Next',
          { x: W - margin - w, y: bottom },
          { icon: 'arrowRight', iconPosition: 'end' },
          [{ type: 'next' }],
        ),
      ];
      break;
    }
    case 'back':
      elements = [
        make('Back', { x: margin, y: bottom }, { icon: 'arrowLeft', iconPosition: 'start' }, [
          { type: 'prev' },
        ]),
      ];
      break;
    case 'restart': {
      const w = widthFor('Start over', true);
      elements = [
        make(
          'Start over',
          { x: (W - w) / 2, y: bottom },
          { icon: 'restart', iconPosition: 'start' },
          [{ type: 'firstPage' }],
        ),
      ];
      break;
    }
    case 'tapMe': {
      const w = widthFor('Tap me!', true);
      elements = [
        make(
          'Tap me!',
          { x: (W - w) / 2, y: (H - h) / 2 },
          { icon: 'star', iconPosition: 'start' },
          [{ type: 'burst', effect: 'sparkles' }],
        ),
      ];
      break;
    }
    case 'choice': {
      // Default targets: the next two pages (edit them in the Interact tab).
      const a = project.pages[pageIndex + 1] ?? page;
      const b = project.pages[pageIndex + 2] ?? a;
      const w = Math.max(widthFor('Option A', false), Math.round(W * 0.3));
      const gap = margin;
      const x0 = (W - (w * 2 + gap)) / 2;
      elements = [
        make('Option A', { x: x0, y: bottom, width: w }, {}, [{ type: 'goToPage', pageId: a.id }]),
        make('Option B', { x: x0 + w + gap, y: bottom, width: w }, {}, [
          { type: 'goToPage', pageId: b.id },
        ]),
      ];
      // A choice must be made: tapping the page or "next" shouldn't skip it.
      lock = true;
      break;
    }
  }
  docStore.change(
    (d) => {
      addElements(d, page.id, elements);
      if (lock) {
        const target = getPage(d, page.id);
        target.flow = { ...target.flow, lockNext: true };
      }
    },
    { label: preset === 'choice' ? 'Add choice' : 'Add button' },
  );
  useUiStore.getState().select(elements.map((e) => e.id));
  return elements.map((e) => e.id);
}

/** Inserts an invisible tap area and opens the Interact tab to say what it does. */
export function insertHotspot(): string | undefined {
  const project = docStore.project();
  const page = getActivePage();
  if (!project || !page) return;
  const { width: W, height: H } = project.pageSize;
  const size = Math.round(Math.min(W, H) * 0.25);
  const el = createHotspotElement({
    x: (W - size) / 2,
    y: (H - size) / 2,
    width: size,
    height: size,
  });
  docStore.change((d) => addElements(d, page.id, [el]), { label: 'Add tap area' });
  useUiStore.getState().select([el.id]);
  useUiStore.getState().setRightTab('interact');
  return el.id;
}

function editInteractions(
  elementId: string,
  label: string,
  recipe: (list: Interaction[]) => Interaction[],
  coalesceKey?: string,
) {
  const page = getActivePage();
  if (!page) return;
  docStore.change(
    (d) =>
      updateElement(d, page.id, elementId, (el) => {
        // Drafts are Proxies (structuredClone rejects them); snapshot first.
        const list = el.interactions
          ? isDraft(el.interactions)
            ? current(el.interactions)
            : el.interactions
          : [];
        const next = recipe(structuredClone(list) as Interaction[]);
        if (next.length) el.interactions = next;
        else delete el.interactions;
      }),
    { label, coalesceKey },
  );
}

export type ActionType = StoryAction['type'];

export const ACTION_LABELS: Record<ActionType, string> = {
  next: 'Go to the next page',
  prev: 'Go back',
  goToPage: 'Jump to a page',
  firstPage: 'Start over',
  playStep: 'Play an animation',
  unlockNext: 'Unlock the next page',
  burst: 'Burst of fun',
  collect: 'Collect it',
  playSound: 'Play a sound',
};

/**
 * A sensible action of the given type for an element: jumps target the next page,
 * "play an animation" reuses the element's first tap animation — or creates a new one
 * (returned as `step`, to be added in the same undo step) — and "play a sound" uses the given
 * or first sound (null when the book has none yet).
 */
export function defaultAction(
  project: Project,
  page: Page,
  elementId: string,
  type: ActionType,
  soundId?: string,
): { action: StoryAction; step?: AnimationStep } | null {
  switch (type) {
    case 'playSound': {
      // The newest upload (the caller passes it) or the book's first sound.
      const id = soundId ?? Object.keys(project.sounds)[0];
      return id ? { action: { type, soundId: id } } : null;
    }
    case 'goToPage': {
      const i = project.pages.findIndex((p) => p.id === page.id);
      const target = project.pages[i + 1] ?? project.pages.find((p) => p.id !== page.id) ?? page;
      return { action: { type, pageId: target.id } };
    }
    case 'playStep': {
      const reactions = page.animations.filter((s) => s.trigger === 'onInteraction');
      const existing = reactions.find((s) => s.elementId === elementId) ?? reactions[0];
      if (existing) return { action: { type, stepId: existing.id } };
      const step = createAnimationStep(elementId, 'pulse', 'onInteraction');
      return { action: { type, stepId: step.id }, step };
    }
    case 'burst':
      return { action: { type, effect: 'sparkles' } };
    default:
      return { action: { type } as StoryAction };
  }
}

/**
 * Edits one element's interactions with a recipe that may need a new reaction step; the
 * step and the interaction change land in one undo step.
 */
async function editWithAction(
  elementId: string,
  type: ActionType,
  label: string,
  recipe: (list: Interaction[], action: StoryAction) => Interaction[],
): Promise<void> {
  // "Play a sound" in a book without sounds asks for one first (still inside the click).
  let soundId: string | undefined;
  if (type === 'playSound' && !Object.keys(docStore.project()?.sounds ?? {}).length) {
    soundId = (await uploadSound())?.id;
    if (!soundId) return;
  }
  const project = docStore.project();
  const page = getActivePage();
  if (!project || !page) return;
  const made = defaultAction(project, page, elementId, type, soundId);
  if (!made) return;
  const { action, step } = made;
  docStore.change(
    (d) => {
      if (step) addAnimation(d, page.id, step);
      updateElement(d, page.id, elementId, (el) => {
        const list = el.interactions
          ? isDraft(el.interactions)
            ? current(el.interactions)
            : el.interactions
          : [];
        const next = recipe(structuredClone(list) as Interaction[], action);
        if (next.length) el.interactions = next;
        else delete el.interactions;
      });
    },
    { label },
  );
}

/** Adds a new tap behaviour with one action of the given type. */
export function addInteraction(elementId: string, type: ActionType): Promise<void> {
  return editWithAction(elementId, type, 'Add tap action', (list, action) =>
    list.length >= 4 ? list : [...list, newInteraction([action])],
  );
}

/** Appends an action ("…then …") to an existing tap behaviour. */
export function appendAction(
  elementId: string,
  interactionId: string,
  type: ActionType,
): Promise<void> {
  return editWithAction(elementId, type, 'Add tap action', (list, action) => {
    const target = list.find((i) => i.id === interactionId);
    if (target && target.actions.length < 8) target.actions.push(action);
    return list;
  });
}

/** Replaces one action with a default action of another type. */
export function setActionType(
  elementId: string,
  interactionId: string,
  index: number,
  type: ActionType,
): Promise<void> {
  return editWithAction(elementId, type, 'Edit tap action', (list, action) => {
    const target = list.find((i) => i.id === interactionId);
    if (target?.actions[index]) target.actions[index] = action;
    return list;
  });
}

export function removeInteraction(elementId: string, interactionId: string): void {
  editInteractions(elementId, 'Remove tap action', (list) =>
    list.filter((i) => i.id !== interactionId),
  );
}

export function updateInteraction(
  elementId: string,
  interactionId: string,
  recipe: (interaction: Interaction) => void,
  label = 'Edit tap action',
): void {
  editInteractions(elementId, label, (list) => {
    const target = list.find((i) => i.id === interactionId);
    if (target) recipe(target);
    // An interaction with no actions left disappears.
    return list.filter((i) => i.actions.length);
  });
}

export function setA11yLabel(elementId: string, value: string): void {
  const page = getActivePage();
  if (!page) return;
  docStore.change(
    (d) =>
      updateElement(d, page.id, elementId, (el) => {
        const v = value.trim().slice(0, 120);
        if (v) el.a11yLabel = v;
        else delete el.a11yLabel;
      }),
    { label: 'Screen reader name' },
  );
}

/** Changes where a page leads and whether the reader must tap something to leave it. */
export function updateFlow(
  pageId: string,
  patch: { next?: string | null; lockNext?: boolean },
): void {
  docStore.change(
    (d) => {
      const page = getPage(d, pageId);
      const flow = { lockNext: false, ...page.flow };
      if (patch.lockNext !== undefined) flow.lockNext = patch.lockNext;
      if (patch.next === null) delete flow.next;
      else if (patch.next !== undefined) flow.next = patch.next;
      if (flow.next === undefined && !flow.lockNext) delete page.flow;
      else page.flow = flow;
    },
    { label: 'Page flow' },
  );
}

export function updateReader(patch: Partial<ReaderSettings>): void {
  docStore.change((d) => void Object.assign(d.reader, patch), { label: 'Reader settings' });
}

/**
 * Lift-the-flap: a "Lift me!" flap covers a picture. Tapping the flap lifts it (once) and the
 * picture underneath pops in. Covers the selected image, or uploads a new one.
 */
export async function insertFlap(files?: readonly File[]): Promise<void> {
  let picture: ImageElement | undefined;
  let newAsset: AssetRef | undefined;
  const selected = getSelectedElements();
  if (!files && selected.length === 1 && selected[0]!.type === 'image') {
    picture = selected[0] as ImageElement;
  } else {
    const [file] = imageFilesFrom(files ?? []);
    if (!file) return;
    const { assets, errors } = await importImageFiles([file]);
    errors.forEach((e) => toast.error(`${e.name}: ${e.message}`));
    newAsset = assets[0];
    if (!newAsset) return;
  }
  const project = docStore.project();
  const page = getActivePage();
  if (!project || !page) return;
  const { width: W, height: H } = project.pageSize;
  if (!picture && newAsset) {
    const size = Math.round(Math.min(W, H) * 0.4);
    picture = createImageElement(
      newAsset,
      { x: (W - size) / 2, y: (H - size) / 2, width: size, height: size },
      { name: 'Hidden picture' },
    );
  }
  if (!picture) return;
  const box = { x: picture.x, y: picture.y, width: picture.width, height: picture.height };
  const fontSize = Math.round(Math.max(20, Math.min(box.width, box.height) * 0.14));
  const flap = createButtonElement('Lift me!', box, {
    name: 'Flap',
    icon: 'question',
    iconPosition: 'start',
    rotation: picture.rotation,
    style: {
      fontFamily: project.theme.fontFamily,
      fontSize,
      fill: project.theme.accent,
      textColor: '#ffffff',
      radius: Math.round(Math.min(box.width, box.height) * 0.08),
      shadow: true,
    },
  });
  const lift = createAnimationStep(flap.id, 'liftUp', 'onInteraction');
  const reveal = { ...createAnimationStep(picture.id, 'popIn', 'onInteraction'), delay: 250 };
  flap.interactions = [
    newInteraction(
      [
        { type: 'playStep', stepId: lift.id },
        { type: 'playStep', stepId: reveal.id },
      ],
      true,
    ),
  ];
  const existing = !newAsset;
  const pictureEl = picture;
  docStore.change(
    (d) => {
      if (newAsset) addAsset(d, newAsset);
      if (!existing) addElements(d, page.id, [pictureEl]);
      addElements(d, page.id, [flap]);
      addAnimation(d, page.id, reveal);
      addAnimation(d, page.id, lift);
    },
    { label: 'Add lift-the-flap' },
  );
  useUiStore.getState().select([flap.id]);
}

/** Sets (or clears, with count 0) the page's "collect N items" goal. */
export function updateGoal(pageId: string, patch: { count?: number; label?: string }): void {
  docStore.change(
    (d) => {
      const page = getPage(d, pageId);
      const goal = { count: 0, label: '', ...page.goal, ...patch };
      goal.count = Math.max(0, Math.min(20, Math.round(goal.count)));
      goal.label = goal.label.slice(0, 60);
      if (goal.count > 0) {
        // A new goal locks the page: finding the items is what unlocks it.
        if (!page.goal) page.flow = { ...page.flow, lockNext: true };
        page.goal = goal;
      } else delete page.goal;
    },
    { label: 'Page goal' },
  );
}

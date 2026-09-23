import { current, isDraft } from 'immer';
import {
  bakeStep,
  createAnimationStep,
  evaluateTrack,
  scheduleSteps,
  TRACK_DEFAULTS,
} from '@/core/animation';
import { pivotToLocal } from '@/core/character';
import { addAnimation, removeAnimations, updateAnimation } from '@/core/ops';
import type { AnimationStep, KeyframeTrack, TrackKeyframe, TrackProperty } from '@/core/schema';
import { docStore } from '../store/doc-store';
import { getActivePage } from '../store/selectors';
import { useUiStore } from '../store/ui-store';

const round = (n: number, p = 1000) => Math.round(n * p) / p;

/**
 * Adds a "Custom move" (keyframes step) for an element, starting at `ms` in `group`. The new
 * step is placed at the end of that click group and anchored to the group's start.
 */
export function addCustomMove(elementId: string, group: number, ms: number): string | undefined {
  const page = getActivePage();
  if (!page) return;
  const schedule = scheduleSteps(page.animations);
  const target = schedule.groups[group] ?? schedule.groups[0]!;
  const lastIndex = target.steps.length ? target.steps[target.steps.length - 1]!.index : -1;
  const firstClick = page.animations.findIndex((s) => s.trigger === 'onClick');
  const index =
    lastIndex >= 0
      ? lastIndex + 1
      : group === 0 && firstClick >= 0
        ? firstClick
        : page.animations.length;
  const base = createAnimationStep(
    elementId,
    'keyframes',
    group > 0 && lastIndex < 0 ? 'onClick' : 'onPageEnter',
  );
  const flat = (property: TrackProperty): KeyframeTrack => ({
    property,
    keyframes: [
      { t: 0, v: 0, easing: 'easeInOut' },
      { t: 1, v: 0, easing: 'easeInOut' },
    ],
  });
  const step: AnimationStep = {
    ...base,
    delay: Math.max(0, Math.round(ms)),
    // Starts and ends where the element stands; drag the end dot on the stage to move it.
    tracks: [flat('x'), flat('y')],
  };
  docStore.change((d) => addAnimation(d, page.id, step, index), { label: 'Add custom move' });
  useUiStore.getState().setSelectedStep(step.id);
  return step.id;
}

/** Applies a recipe to one step's tracks (creating the tracks array if needed). */
export function editTracks(
  stepId: string,
  label: string,
  recipe: (tracks: KeyframeTrack[]) => KeyframeTrack[],
  coalesceKey?: string,
): void {
  const page = getActivePage();
  if (!page) return;
  docStore.change(
    (d) =>
      updateAnimation(d, page.id, stepId, (s) => {
        // Drafts are Proxies (structuredClone rejects them); snapshot first.
        const tracks = s.tracks ? (isDraft(s.tracks) ? current(s.tracks) : s.tracks) : [];
        s.tracks = recipe(structuredClone(tracks) as KeyframeTrack[]).filter(
          (t) => t.keyframes.length,
        );
      }),
    { label, coalesceKey },
  );
}

const sortKeys = (keys: TrackKeyframe[]) => keys.sort((a, b) => a.t - b.t);

/** Sets (or inserts) a keyframe value at time t on a property track. */
export function setKeyframe(
  tracks: KeyframeTrack[],
  property: TrackProperty,
  t: number,
  v: number,
  easing?: string,
) {
  let track = tracks.find((tr) => tr.property === property);
  if (!track) {
    track = { property, keyframes: [] };
    tracks.push(track);
  }
  const rt = round(t);
  const existing = track.keyframes.find((k) => Math.abs(k.t - rt) < 1e-6);
  if (existing) existing.v = round(v, 100);
  else if (track.keyframes.length < 64) {
    track.keyframes.push({ t: rt, v: round(v, 100), easing: easing ?? 'easeInOut' });
    sortKeys(track.keyframes);
  }
  return tracks;
}

/** Adds a keyframe at time t holding the track's current value there. */
export function addKeyframeAt(
  stepId: string,
  tracks: readonly KeyframeTrack[],
  property: TrackProperty,
  t: number,
) {
  const track = tracks.find((tr) => tr.property === property);
  const v = track?.keyframes.length ? evaluateTrack(track.keyframes, t) : TRACK_DEFAULTS[property];
  editTracks(stepId, 'Add keyframe', (ts) => setKeyframe(ts, property, t, v));
}

export function moveKeyframe(stepId: string, property: TrackProperty, index: number, t: number) {
  editTracks(
    stepId,
    'Move keyframe',
    (ts) => {
      const track = ts.find((tr) => tr.property === property);
      if (track?.keyframes[index]) {
        track.keyframes[index]!.t = round(Math.min(1, Math.max(0, t)));
        sortKeys(track.keyframes);
      }
      return ts;
    },
    `kf-move:${stepId}:${property}`,
  );
}

export function updateKeyframe(
  stepId: string,
  property: TrackProperty,
  index: number,
  patch: Partial<TrackKeyframe>,
) {
  editTracks(stepId, 'Edit keyframe', (ts) => {
    const k = ts.find((tr) => tr.property === property)?.keyframes[index];
    if (k) Object.assign(k, patch);
    return ts;
  });
}

export function deleteKeyframe(stepId: string, property: TrackProperty, index: number) {
  editTracks(stepId, 'Delete keyframe', (ts) => {
    const track = ts.find((tr) => tr.property === property);
    track?.keyframes.splice(index, 1);
    return ts;
  });
}

export function removeStep(stepId: string) {
  const page = getActivePage();
  if (!page) return;
  docStore.change((d) => removeAnimations(d, page.id, [stepId]), { label: 'Remove animation' });
  if (useUiStore.getState().selectedStepId === stepId) useUiStore.getState().setSelectedStep(null);
}

/** Replaces a character motion step with editable keyframes of the same move. */
export function convertToKeyframes(stepId: string): boolean {
  const project = docStore.project();
  const page = getActivePage();
  const step = page?.animations.find((s) => s.id === stepId);
  const element = page?.elements.find((e) => e.id === step?.elementId);
  if (!project || !page || !step || element?.type !== 'image') return false;
  const character = element.characterId ? project.characters[element.characterId] : undefined;
  const asset = project.assets[element.assetId];
  if (!character || !asset) return false;
  const tracks = bakeStep({
    element,
    params: step.params ?? {},
    pageSize: project.pageSize,
    character,
    pivot: pivotToLocal(asset, element, character.pivot),
    step,
  });
  if (!tracks) return false;
  docStore.change(
    (d) =>
      updateAnimation(d, page.id, stepId, (s) => {
        s.preset = 'keyframes';
        s.tracks = tracks;
        s.easing = 'linear';
        delete s.params;
      }),
    { label: 'Convert to keyframes' },
  );
  return true;
}

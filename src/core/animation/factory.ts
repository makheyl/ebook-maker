import { newId } from '../ids';
import type { AnimationStep, AnimationTrigger } from '../schema/types';
import { getPreset } from './presets';

/** A new Animation Pane step with the preset's defaults. */
export function createAnimationStep(
  elementId: string,
  presetId: string,
  trigger: AnimationTrigger = 'afterPrevious',
): AnimationStep {
  const preset = getPreset(presetId);
  if (!preset) throw new Error(`Unknown animation preset: ${presetId}`);
  return {
    id: newId('an'),
    elementId,
    kind: preset.kind,
    preset: preset.id,
    trigger,
    duration: preset.defaults.duration,
    delay: preset.defaults.delay,
    easing: preset.defaults.easing,
    ...(preset.defaults.params ? { params: { ...preset.defaults.params } } : {}),
  };
}

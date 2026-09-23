import { DEFAULT_FILTERS } from '../schema/defaults';
import type { ImageFilters } from '../schema/types';

export type FilterPreset = { id: string; label: string; filters: ImageFilters };

/** One-click looks; each is just a set of adjustment values (still fully editable). */
export const FILTER_PRESETS: readonly FilterPreset[] = [
  { id: 'none', label: 'Original', filters: DEFAULT_FILTERS },
  { id: 'bw', label: 'B&W', filters: { ...DEFAULT_FILTERS, grayscale: 1, contrast: 1.1 } },
  { id: 'sepia', label: 'Sepia', filters: { ...DEFAULT_FILTERS, sepia: 0.8, contrast: 1.05 } },
  { id: 'vivid', label: 'Vivid', filters: { ...DEFAULT_FILTERS, saturate: 1.5, contrast: 1.1 } },
  {
    id: 'warm',
    label: 'Warm',
    filters: { ...DEFAULT_FILTERS, sepia: 0.25, saturate: 1.2, hueRotate: -8 },
  },
  {
    id: 'cool',
    label: 'Cool',
    filters: { ...DEFAULT_FILTERS, saturate: 1.05, hueRotate: 12, brightness: 1.03 },
  },
  {
    id: 'fade',
    label: 'Fade',
    filters: { ...DEFAULT_FILTERS, contrast: 0.8, brightness: 1.1, saturate: 0.8 },
  },
  {
    id: 'dramatic',
    label: 'Drama',
    filters: { ...DEFAULT_FILTERS, contrast: 1.4, brightness: 0.9, saturate: 0.9 },
  },
];

export function sameFilters(a: ImageFilters, b: ImageFilters): boolean {
  return (Object.keys(a) as (keyof ImageFilters)[]).every((k) => a[k] === b[k]);
}

import type { PageSize } from './types';

export type PageSizePreset = PageSize & { id: string; label: string; description: string };

export const PAGE_SIZE_PRESETS: readonly PageSizePreset[] = [
  {
    id: 'landscape',
    label: 'Landscape 4:3',
    description: 'Classic picture-book spread',
    width: 1600,
    height: 1200,
  },
  {
    id: 'portrait',
    label: 'Portrait book',
    description: '4:5, great on phones',
    width: 1080,
    height: 1350,
  },
  {
    id: 'square',
    label: 'Square',
    description: '1:1, same on every screen',
    width: 1080,
    height: 1080,
  },
  {
    id: 'widescreen',
    label: 'Widescreen 16:9',
    description: 'Best on desktops and TVs',
    width: 1600,
    height: 900,
  },
];

export const DEFAULT_PAGE_SIZE_ID = 'landscape';

export function getPageSizePreset(presetId: string): PageSizePreset {
  return PAGE_SIZE_PRESETS.find((p) => p.id === presetId) ?? PAGE_SIZE_PRESETS[0]!;
}

export function describePageSize(size: PageSize): string {
  const preset = PAGE_SIZE_PRESETS.find((p) => p.width === size.width && p.height === size.height);
  return preset ? preset.label : `${size.width}×${size.height}`;
}

import type { ProjectSummary } from '@/storage';

/** Placeholder cover (M1). Replaced by a live render of the first page in M2. */
export function CoverThumbnail({ summary }: { summary: ProjectSummary }) {
  const bg = summary.cover?.background;
  const background =
    bg?.type === 'color'
      ? bg.color
      : bg?.type === 'gradient'
        ? `linear-gradient(${bg.angle}deg, ${bg.from}, ${bg.to})`
        : undefined;
  return (
    <div
      className="w-full bg-white"
      style={{ aspectRatio: `${summary.pageSize.width} / ${summary.pageSize.height}`, background }}
    />
  );
}

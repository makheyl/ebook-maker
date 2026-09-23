import { useLayoutEffect, useRef, useState } from 'react';
import { PageThumbnail } from '@/editor/stage/PageThumbnail';
import { useEnsureAssets } from '@/editor/assets/asset-urls';
import type { ProjectSummary } from '@/storage';

/** Live render of a book's first page (same renderer as the editor and the export). */
export function CoverThumbnail({ summary }: { summary: ProjectSummary }) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const ready = useEnsureAssets(Object.keys(summary.coverAssets));
  const { width: W, height: H } = summary.pageSize;

  useLayoutEffect(() => {
    const el = ref.current!;
    const ro = new ResizeObserver(
      ([entry]) => entry && setWidth(Math.floor(entry.contentRect.width)),
    );
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div ref={ref} className="w-full bg-white" style={{ aspectRatio: `${W} / ${H}` }}>
      {summary.cover && width > 0 && ready && (
        <PageThumbnail
          page={summary.cover}
          pageSize={summary.pageSize}
          assets={summary.coverAssets}
          width={width}
        />
      )}
    </div>
  );
}

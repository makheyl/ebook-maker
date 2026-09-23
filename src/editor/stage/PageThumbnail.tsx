import { memo } from 'react';
import type { AssetRef, Page, PageSize } from '@/core/schema';
import { cn } from '@/ui/utils';
import { PageCanvas } from './PageCanvas';

/**
 * A live, scaled-down render of a page (same renderer as the stage and the export),
 * using thumbnail-size image variants. Rendered lazily by virtualized lists.
 */
export const PageThumbnail = memo(function PageThumbnail({
  page,
  pageSize,
  assets,
  width,
  className,
}: {
  page: Page;
  pageSize: PageSize;
  assets: Readonly<Record<string, AssetRef>>;
  width: number;
  className?: string;
}) {
  const scale = width / pageSize.width;
  return (
    <div
      className={cn('relative overflow-hidden', className)}
      style={{ width, height: pageSize.height * scale }}
      aria-hidden="true"
    >
      <div style={{ transform: `scale(${scale})`, transformOrigin: '0 0', width: pageSize.width }}>
        <PageCanvas
          page={page}
          pageSize={pageSize}
          assets={assets}
          mode="thumbnail"
          variant="thumb"
        />
      </div>
    </div>
  );
});

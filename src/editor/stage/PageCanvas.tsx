import { useLayoutEffect, useRef } from 'react';
import { createPageView, type PageView, type RenderMode } from '@/core/render';
import type { AssetRef, Page, PageSize } from '@/core/schema';
import { assetUrls, useAssetUrlsVersion, type AssetVariant } from '../assets/asset-urls';

type Props = {
  page: Page;
  pageSize: PageSize;
  assets: Readonly<Record<string, AssetRef>>;
  mode: RenderMode;
  variant?: AssetVariant;
  splitTextFor?: (page: Page) => ReadonlySet<string>;
  /** Receives the live PageView (for selection handles, animation preview…). */
  onView?: (view: PageView | null) => void;
  className?: string;
};

/**
 * React host for the framework-agnostic PageView. React owns only the container; the page
 * DOM itself is produced by core/render — exactly as in the exported player.
 */
export function PageCanvas({
  page,
  pageSize,
  assets,
  mode,
  variant = 'full',
  splitTextFor,
  onView,
  className,
}: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<PageView | null>(null);
  const assetsVersion = useAssetUrlsVersion();
  const onViewRef = useRef(onView);
  useLayoutEffect(() => {
    onViewRef.current = onView;
  });

  useLayoutEffect(() => {
    const view = createPageView({
      pageSize,
      mode,
      resolveAsset: variant === 'thumb' ? assetUrls.resolveThumb : assetUrls.resolveFull,
      splitTextFor,
    });
    viewRef.current = view;
    hostRef.current!.appendChild(view.root);
    onViewRef.current?.(view);
    return () => {
      onViewRef.current?.(null);
      view.destroy();
      viewRef.current = null;
    };
  }, [pageSize, mode, variant, splitTextFor]);

  useLayoutEffect(() => {
    viewRef.current?.update(page, assets);
  }, [page, assets, pageSize, mode, variant, splitTextFor]);

  useLayoutEffect(() => {
    if (assetsVersion) viewRef.current?.refreshAssets();
  }, [assetsVersion]);

  return <div ref={hostRef} className={className} />;
}

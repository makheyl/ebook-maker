import type { TextSplit } from '@/core/text/split';
import { useLayoutEffect, useRef } from 'react';
import { createPageView, type PageView, type RenderMode } from '@/core/render';
import type { AssetRef, Character, Page, PageSize } from '@/core/schema';
import { assetUrls, useAssetUrlsVersion, type AssetVariant } from '../assets/asset-urls';

type Props = {
  page: Page;
  pageSize: PageSize;
  assets: Readonly<Record<string, AssetRef>>;
  characters?: Readonly<Record<string, Character>>;
  mode: RenderMode;
  variant?: AssetVariant;
  splitTextFor?: (page: Page) => ReadonlyMap<string, TextSplit>;
  /** The book's language (`lang` on the page: hyphenation). */
  lang?: string;
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
  characters,
  mode,
  variant = 'full',
  splitTextFor,
  lang,
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
      lang,
    });
    viewRef.current = view;
    hostRef.current!.appendChild(view.root);
    onViewRef.current?.(view);
    return () => {
      onViewRef.current?.(null);
      view.destroy();
      viewRef.current = null;
    };
  }, [pageSize, mode, variant, splitTextFor, lang]);

  useLayoutEffect(() => {
    viewRef.current?.update(page, assets, characters);
  }, [page, assets, characters, pageSize, mode, variant, splitTextFor, lang]);

  useLayoutEffect(() => {
    if (assetsVersion) viewRef.current?.refreshAssets();
  }, [assetsVersion]);

  return <div ref={hostRef} className={className} />;
}

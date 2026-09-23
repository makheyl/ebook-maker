import { useEffect, useState, useSyncExternalStore } from 'react';
import { assetRepo } from '@/storage';

export type AssetVariant = 'full' | 'thumb';

/**
 * Maps content-addressed asset ids to object URLs for the blobs in IndexedDB.
 * The renderer needs synchronous lookups, so callers `ensure()` ids up front and
 * re-render when `version` changes.
 */
class AssetUrlRegistry {
  private urls = new Map<string, { full: string; thumb: string }>();
  private pending = new Map<string, Promise<void>>();
  private listeners = new Set<() => void>();
  private version = 0;

  resolve = (assetId: string, variant: AssetVariant = 'full'): string | undefined =>
    this.urls.get(assetId)?.[variant];

  resolveFull = (assetId: string) => this.resolve(assetId, 'full');
  resolveThumb = (assetId: string) => this.resolve(assetId, 'thumb');

  has(assetId: string): boolean {
    return this.urls.has(assetId);
  }

  /** Registers blobs that are already in memory (fresh uploads) without a DB round trip. */
  register(assetId: string, full: Blob, thumb: Blob): void {
    if (this.urls.has(assetId)) return;
    this.urls.set(assetId, { full: URL.createObjectURL(full), thumb: URL.createObjectURL(thumb) });
    this.bump();
  }

  async ensure(assetIds: Iterable<string>): Promise<void> {
    const missing = [...new Set(assetIds)].filter((id) => !this.urls.has(id));
    if (!missing.length) return;
    const toFetch = missing.filter((id) => !this.pending.has(id));
    if (toFetch.length) {
      const job = assetRepo.getMany(toFetch).then((rows) => {
        for (const [id, row] of rows) {
          if (!this.urls.has(id)) {
            this.urls.set(id, {
              full: URL.createObjectURL(row.blob),
              thumb: URL.createObjectURL(row.thumb),
            });
          }
        }
        toFetch.forEach((id) => this.pending.delete(id));
        this.bump();
      });
      toFetch.forEach((id) => this.pending.set(id, job));
    }
    await Promise.all(missing.map((id) => this.pending.get(id)).filter(Boolean));
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getVersion = () => this.version;

  private bump() {
    this.version++;
    this.listeners.forEach((l) => l());
  }
}

export const assetUrls = new AssetUrlRegistry();

/** Re-renders when any asset URL becomes available. */
export function useAssetUrlsVersion(): number {
  return useSyncExternalStore(assetUrls.subscribe, assetUrls.getVersion);
}

/** Loads object URLs for the given ids; returns true once they are all resolvable. */
export function useEnsureAssets(assetIds: readonly string[]): boolean {
  const key = [...new Set(assetIds)].sort().join('|');
  const [readyKey, setReadyKey] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    assetUrls
      .ensure(key ? key.split('|') : [])
      .catch(() => undefined)
      .then(() => !cancelled && setReadyKey(key));
    return () => {
      cancelled = true;
    };
  }, [key]);
  return readyKey === key;
}

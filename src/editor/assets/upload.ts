import { processImage, type ProcessedImage } from '@/core/image/process';
import type { WorkerRequest, WorkerResponse } from '@/core/image/process.worker';
import type { AssetRef } from '@/core/schema';
import { assetRepo } from '@/storage';
import { assetUrls } from './asset-urls';

let worker: Worker | null | undefined;
let seq = 0;
const pending = new Map<
  number,
  { resolve: (r: ProcessedImage) => void; reject: (e: Error) => void }
>();

function getWorker(): Worker | null {
  if (worker !== undefined) return worker;
  try {
    if (typeof OffscreenCanvas === 'undefined') throw new Error('no OffscreenCanvas');
    worker = new Worker(new URL('../../core/image/process.worker.ts', import.meta.url), {
      type: 'module',
    });
    worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
      const job = pending.get(e.data.id);
      if (!job) return;
      pending.delete(e.data.id);
      if (e.data.ok) job.resolve(e.data.result);
      else job.reject(new Error(e.data.error));
    };
    worker.onerror = () => {
      // Fail every in-flight job over to the main thread and stop using the worker.
      worker = null;
      for (const job of pending.values()) job.reject(new Error('Image worker failed'));
      pending.clear();
    };
  } catch {
    worker = null;
  }
  return worker;
}

function processOffThread(file: Blob): Promise<ProcessedImage> {
  const w = getWorker();
  if (!w) return processImage(file);
  const id = ++seq;
  return new Promise<ProcessedImage>((resolve, reject) => {
    pending.set(id, { resolve, reject });
    w.postMessage({ id, file } satisfies WorkerRequest);
  }).catch((err: unknown) => {
    // Some browsers can't encode in workers; retry on the main thread before giving up.
    if (err instanceof Error && /could not be read|Only image/.test(err.message)) throw err;
    return processImage(file);
  });
}

/**
 * Processes image files and stores them (deduplicated by content hash).
 * Returns asset refs ready to be added to the project.
 */
export async function importImageFiles(files: readonly File[]): Promise<{
  assets: AssetRef[];
  errors: { name: string; message: string }[];
}> {
  const assets: AssetRef[] = [];
  const errors: { name: string; message: string }[] = [];
  for (const file of files) {
    try {
      const img = await processOffThread(file);
      await assetRepo.put({
        id: img.id,
        blob: img.blob,
        thumb: img.thumb,
        mime: img.mime,
        width: img.width,
        height: img.height,
        bytes: img.bytes,
        createdAt: Date.now(),
      });
      assetUrls.register(img.id, img.blob, img.thumb);
      assets.push({
        id: img.id,
        kind: 'image',
        mime: img.mime,
        width: img.width,
        height: img.height,
        bytes: img.bytes,
        name: file.name.slice(0, 200) || undefined,
        hasAlpha: img.hasAlpha,
        ...(img.opaqueBounds ? { opaqueBounds: img.opaqueBounds } : {}),
      });
    } catch (err) {
      errors.push({ name: file.name, message: err instanceof Error ? err.message : String(err) });
    }
  }
  return { assets, errors };
}

export function imageFilesFrom(list: FileList | readonly File[] | null | undefined): File[] {
  return Array.from(list ?? []).filter((f) => f.type.startsWith('image/'));
}

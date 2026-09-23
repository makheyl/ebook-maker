/// <reference lib="webworker" />
import { processImage, type ProcessedImage } from './process';

export type WorkerRequest = { id: number; file: Blob };
export type WorkerResponse =
  { id: number; ok: true; result: ProcessedImage } | { id: number; ok: false; error: string };

const ctx = self as unknown as DedicatedWorkerGlobalScope;

ctx.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const { id, file } = event.data;
  try {
    const result = await processImage(file);
    ctx.postMessage({ id, ok: true, result } satisfies WorkerResponse);
  } catch (err) {
    ctx.postMessage({
      id,
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    } satisfies WorkerResponse);
  }
};

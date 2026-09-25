import { useEffect, useState } from 'react';
import { assetUrls } from '../assets/asset-urls';

/**
 * Waveform peaks for a stored sound (editor only — the reader never decodes audio). Decoded
 * once with Web Audio, reduced to a few hundred peaks, and kept; the decoded audio itself is
 * dropped right away.
 */
const PEAKS = 400;
const cache = new Map<string, Float32Array>();
const pending = new Map<string, Promise<Float32Array | null>>();
/** Decoding needs no sound output: an offline context never asks for a gesture. */
let ctx: OfflineAudioContext | null = null;

async function decode(assetId: string): Promise<Float32Array | null> {
  const url = assetUrls.resolve(assetId);
  if (!url) return null;
  try {
    ctx ??= new OfflineAudioContext(1, 1, 44100);
    const buffer = await (await fetch(url)).arrayBuffer();
    const audio = await ctx.decodeAudioData(buffer);
    const data = audio.getChannelData(0);
    const size = Math.max(1, Math.floor(data.length / PEAKS));
    const peaks = new Float32Array(PEAKS);
    let max = 0;
    for (let i = 0; i < PEAKS; i++) {
      // Long tracks are measured in slices, so a drag never waits for them.
      if (i % 50 === 49) await new Promise((r) => setTimeout(r));
      let peak = 0;
      const end = Math.min(data.length, (i + 1) * size);
      for (let j = i * size; j < end; j += 4) peak = Math.max(peak, Math.abs(data[j]!));
      peaks[i] = peak;
      max = Math.max(max, peak);
    }
    if (max > 0) for (let i = 0; i < PEAKS; i++) peaks[i]! /= max;
    return peaks;
  } catch {
    return null;
  }
}

export function peaksFor(assetId: string): Promise<Float32Array | null> {
  const hit = cache.get(assetId);
  if (hit) return Promise.resolve(hit);
  let job = pending.get(assetId);
  if (!job) {
    job = decode(assetId).then((peaks) => {
      pending.delete(assetId);
      if (peaks) cache.set(assetId, peaks);
      return peaks;
    });
    pending.set(assetId, job);
  }
  return job;
}

export function usePeaks(assetId: string | undefined): Float32Array | null {
  const [peaks, setPeaks] = useState<Float32Array | null>(() =>
    assetId ? (cache.get(assetId) ?? null) : null,
  );
  useEffect(() => {
    if (!assetId) return;
    let live = true;
    void peaksFor(assetId).then((p) => live && setPeaks(p));
    return () => {
      live = false;
    };
  }, [assetId]);
  return assetId ? (cache.get(assetId) ?? peaks) : null;
}

/** An SVG path of the peaks between two fractions of the file (a trimmed part). */
export function waveformPath(
  peaks: Float32Array,
  from = 0,
  to = 1,
  width = 100,
  height = 20,
): string {
  const a = Math.floor(from * peaks.length);
  const b = Math.max(a + 1, Math.ceil(to * peaks.length));
  const n = b - a;
  const mid = height / 2;
  let d = '';
  for (let i = 0; i < n; i++) {
    const x = (i / Math.max(1, n - 1)) * width;
    const h = Math.max(0.5, peaks[a + i]! * mid);
    d += `M${x.toFixed(1)},${(mid - h).toFixed(1)}V${(mid + h).toFixed(1)}`;
  }
  return d;
}

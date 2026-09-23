import { analyzeAlpha, sampleSize, type AlphaInfo } from '../character/alpha';

/**
 * Image upload pipeline (runs in a Web Worker when possible, else on the main thread):
 * decode → downscale to ≤ maxEdge → encode WebP (fallback JPEG, or PNG when transparent)
 * → small thumbnail. Assets are content-addressed by a SHA-256 of the original bytes, so the
 * same file uploaded twice is stored once.
 */
export type ProcessOptions = {
  maxEdge: number;
  thumbEdge: number;
  quality: number;
};

export const DEFAULT_PROCESS_OPTIONS: ProcessOptions = {
  maxEdge: 2400,
  thumbEdge: 320,
  quality: 0.85,
};

export type ProcessedImage = {
  id: string;
  blob: Blob;
  thumb: Blob;
  mime: string;
  width: number;
  height: number;
  bytes: number;
} & AlphaInfo;

/** Images with transparency (characters, stickers) are encoded a little finer to avoid halos. */
const ALPHA_QUALITY = 0.95;

export async function hashBytes(buffer: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  const hex = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
  return `img_${hex.slice(0, 40)}`;
}

export function fitWithin(width: number, height: number, maxEdge: number) {
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

type Canvas2D = OffscreenCanvas | HTMLCanvasElement;

function makeCanvas(width: number, height: number): Canvas2D {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(width, height);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function toBlob(canvas: Canvas2D, type: string, quality?: number): Promise<Blob> {
  if ('convertToBlob' in canvas) return canvas.convertToBlob({ type, quality });
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Encoding failed'))), type, quality),
  );
}

function draw(source: CanvasImageSource, width: number, height: number): Canvas2D {
  const canvas = makeCanvas(width, height);
  const ctx = canvas.getContext('2d') as
    CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
  if (!ctx) throw new Error('Canvas 2D is not available');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, 0, 0, width, height);
  return canvas;
}

/** Transparency and the box of visible pixels, from a small sample of the image. */
export function alphaInfo(
  source: CanvasImageSource & { width: number; height: number },
): AlphaInfo {
  const size = sampleSize(source.width, source.height);
  const probe = draw(source, size.width, size.height);
  const ctx = probe.getContext('2d') as
    CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
  const { data } = ctx.getImageData(0, 0, size.width, size.height);
  return analyzeAlpha(data, size.width, size.height);
}

function hasTransparency(canvas: Canvas2D): boolean {
  const probe = draw(canvas, Math.min(64, canvas.width), Math.min(64, canvas.height));
  const ctx = probe.getContext('2d') as
    CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
  const { data } = ctx.getImageData(0, 0, probe.width, probe.height);
  for (let i = 3; i < data.length; i += 4) if (data[i]! < 255) return true;
  return false;
}

/** Encodes WebP when the browser can; otherwise PNG for transparent images, JPEG for the rest. */
async function encode(canvas: Canvas2D, quality: number): Promise<Blob> {
  const webp = await toBlob(canvas, 'image/webp', quality);
  if (webp.type === 'image/webp') return webp;
  return hasTransparency(canvas) ? toBlob(canvas, 'image/png') : toBlob(canvas, 'image/jpeg', 0.9);
}

async function decode(file: Blob): Promise<ImageBitmap> {
  try {
    return await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    throw new Error('This file could not be read as an image.');
  }
}

export async function processImage(
  file: Blob,
  options: ProcessOptions = DEFAULT_PROCESS_OPTIONS,
): Promise<ProcessedImage> {
  if (!file.type.startsWith('image/')) throw new Error('Only image files are supported.');
  const buffer = await file.arrayBuffer();
  const id = await hashBytes(buffer);
  const bitmap = await decode(file);
  try {
    const size = fitWithin(bitmap.width, bitmap.height, options.maxEdge);
    const resized = size.width !== bitmap.width || size.height !== bitmap.height;
    const canvas = draw(bitmap, size.width, size.height);
    const alpha = alphaInfo(canvas);
    let blob = await encode(canvas, alpha.hasAlpha ? ALPHA_QUALITY : options.quality);
    // Small web-ready originals are kept as-is to avoid a lossy re-encode.
    const keepable = ['image/webp', 'image/jpeg', 'image/png'].includes(file.type);
    if (!resized && keepable && file.size <= blob.size) blob = file;

    const thumbSize = fitWithin(size.width, size.height, options.thumbEdge);
    const thumb = await encode(draw(canvas, thumbSize.width, thumbSize.height), 0.8);
    return {
      id,
      blob,
      thumb,
      mime: blob.type,
      width: size.width,
      height: size.height,
      bytes: blob.size,
      ...alpha,
    };
  } finally {
    bitmap.close();
  }
}

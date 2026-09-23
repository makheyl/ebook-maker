import { analyzeAlpha, sampleSize, type AlphaInfo } from '@/core/character';
import { assetRepo } from '@/storage';

/** Transparency info for images uploaded before it was recorded at upload time. */
export async function analyzeStoredAsset(assetId: string): Promise<AlphaInfo> {
  const stored = await assetRepo.get(assetId);
  if (!stored) return { hasAlpha: false };
  const bitmap = await createImageBitmap(stored.blob);
  try {
    const size = sampleSize(bitmap.width, bitmap.height);
    const canvas = document.createElement('canvas');
    canvas.width = size.width;
    canvas.height = size.height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    ctx.drawImage(bitmap, 0, 0, size.width, size.height);
    const { data } = ctx.getImageData(0, 0, size.width, size.height);
    return analyzeAlpha(data, size.width, size.height);
  } finally {
    bitmap.close();
  }
}

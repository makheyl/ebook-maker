import {
  buildSingleFile,
  buildZip,
  estimateSize,
  selectFontFaces,
  type ExportFormat,
  type ExportResult,
  type SizeEstimate,
} from '@/core/export/build';
import { usedAssetIds, usedImageIds, usedSoundIds } from '@/core/export/usage';
import type { FontFace } from '@/core/fonts/catalog';
import type { Project } from '@/core/schema';
import { assetRepo } from '@/storage';
import { FONT_FILES } from '../fonts';

/** The compiled reader runtime, loaded only when exporting. */
async function loadPlayer(): Promise<{ js: string; css: string }> {
  const bundle = await import('virtual:player-bundle');
  return { js: bundle.playerJs, css: bundle.playerCss };
}

const fontCache = new Map<string, Promise<ArrayBuffer>>();
function fetchFont(face: FontFace): Promise<ArrayBuffer> {
  let job = fontCache.get(face.src);
  if (!job) {
    job = fetch(face.src).then((r) => {
      if (!r.ok) throw new Error(`Could not load font ${face.fontId}`);
      return r.arrayBuffer();
    });
    fontCache.set(face.src, job);
    job.catch(() => fontCache.delete(face.src));
  }
  return job;
}

export async function exportBook(
  project: Project,
  opts: { format: ExportFormat; showBadge: boolean },
): Promise<ExportResult> {
  const player = await loadPlayer();
  const assets = await assetRepo.getMany(usedAssetIds(project));
  const inputs = {
    project,
    playerJs: player.js,
    playerCss: player.css,
    showBadge: opts.showBadge,
    fontFiles: FONT_FILES,
    getAsset: async (id: string) => assets.get(id)?.blob,
    getFont: fetchFont,
  };
  return opts.format === 'zip' ? buildZip(inputs) : buildSingleFile(inputs);
}

export async function estimateExport(
  project: Project,
  format: ExportFormat,
): Promise<SizeEstimate> {
  const [player, images, sounds, fonts] = await Promise.all([
    loadPlayer(),
    assetRepo.getMany(usedImageIds(project)),
    assetRepo.getMany(usedSoundIds(project)),
    Promise.all(selectFontFaces(project, FONT_FILES).map(fetchFont)),
  ]);
  return estimateSize({
    format,
    imageBytes: [...images.values()].map((a) => a.blob.size),
    audioBytes: [...sounds.values()].map((a) => a.blob.size),
    fontBytes: fonts.map((f) => f.byteLength),
    playerBytes: player.js.length + player.css.length,
    projectJsonBytes: JSON.stringify(project).length,
  });
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

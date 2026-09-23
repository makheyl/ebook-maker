import { createProject, getPageSizePreset, type AssetRef } from '@/core/schema';
import { generatePages, PALETTES } from '@/core/templates';
import { importImageFiles } from '@/editor/assets/upload';
import { projectRepo } from '@/storage';

type Scene = { sky: [string, string]; sun: string; hills: string[]; text: string };

const SCENES: Scene[] = [
  {
    sky: ['#ffd29d', '#ff8a65'],
    sun: '#fff4d6',
    hills: ['#d9774f', '#a8513a'],
    text: 'Every morning, the sun climbed over the red hills.',
  },
  {
    sky: ['#9be7ff', '#4f9dff'],
    sun: '#ffffff',
    hills: ['#58c48f', '#2f8f63'],
    text: 'By noon the valley was bright and busy.',
  },
  {
    sky: ['#4a3f8c', '#1d1740'],
    sun: '#fdf1c7',
    hills: ['#2d2a5e', '#1a173b'],
    text: 'And at night, the moon kept watch.',
  },
];

/** Paints a simple landscape illustration offline (no downloads). */
async function paint(scene: Scene): Promise<File> {
  const canvas = document.createElement('canvas');
  canvas.width = 1600;
  canvas.height = 1200;
  const g = canvas.getContext('2d')!;
  const sky = g.createLinearGradient(0, 0, 0, 1200);
  sky.addColorStop(0, scene.sky[0]);
  sky.addColorStop(1, scene.sky[1]);
  g.fillStyle = sky;
  g.fillRect(0, 0, 1600, 1200);
  g.fillStyle = scene.sun;
  g.beginPath();
  g.arc(1150, 380, 150, 0, Math.PI * 2);
  g.fill();
  scene.hills.forEach((color, i) => {
    g.fillStyle = color;
    g.beginPath();
    g.moveTo(0, 1200);
    const base = 760 + i * 170;
    for (let x = 0; x <= 1600; x += 40)
      g.lineTo(x, base + Math.sin(x / (230 - i * 60) + i) * (70 - i * 15));
    g.lineTo(1600, 1200);
    g.closePath();
    g.fill();
  });
  const blob = await new Promise<Blob>((resolve) => canvas.toBlob((b) => resolve(b!), 'image/png'));
  return new File([blob], 'illustration.png', { type: 'image/png' });
}

/** Creates a small, animated demo book so first-time users can explore right away. */
export async function createSampleBook(): Promise<string> {
  const files = await Promise.all(SCENES.map(paint));
  const { assets } = await importImageFiles(files);
  const pageSize = getPageSizePreset('landscape');
  const palette = PALETTES[0]!;
  const rows = SCENES.map((scene, i) => ({ text: scene.text, asset: assets[i] }));
  const pages = [
    ...generatePages([{ text: 'A Day in the Hills' }], {
      templateId: 'text-only',
      pageSize,
      palette: PALETTES[1]!,
      fontId: 'playfair-display',
      animate: true,
    }),
    ...generatePages(rows, {
      templateId: 'full-bleed',
      pageSize,
      palette,
      fontId: 'lora',
      animate: true,
    }),
  ];
  pages.forEach((p, i) => i > 0 && (p.transition = { preset: 'slide', duration: 700 }));
  const project = createProject({
    title: 'A Day in the Hills (sample)',
    pageSize: { width: pageSize.width, height: pageSize.height },
    pages,
    theme: { fontFamily: 'lora' },
  });
  const refs: Record<string, AssetRef> = {};
  for (const a of assets) refs[a.id] = a;
  project.assets = refs;
  await projectRepo.save(project);
  return project.id;
}

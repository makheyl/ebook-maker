/**
 * Builds Inkbug's icons from `logo-ebook.jpeg`: the white background is removed (only the
 * white connected to the edges, so the eyes and pages stay white), the head and glasses are
 * cropped, and drawn on a soft mint tile.
 *
 *   node scripts/make-brand-icons.mjs
 *
 * Uses the Playwright Chromium the tests already need, so there's nothing extra to install.
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const source = await readFile(join(root, 'logo-ebook.jpeg'));

/** Head, antennae and glasses (the book starts at y 498 in the source). */
const MARK = { x: 195, y: 100, w: 480, h: 395 };
/** Just the face and glasses, for 16 px where the antennae would be a blur. */
const TINY = { x: 205, y: 205, w: 460, h: 290 };

const OUTPUTS = [
  { file: 'public/favicon-16.png', size: 16, tile: true, crop: 'tiny' },
  { file: 'public/favicon-32.png', size: 32, tile: true },
  { file: 'public/apple-touch-icon.png', size: 180, tile: true },
  { file: 'public/icon-192.png', size: 192, tile: true },
  { file: 'public/icon-512.png', size: 512, tile: true },
  { file: 'src/assets/brand/inkbug-mark.png', size: 96, tile: true },
  { file: 'src/assets/brand/inkbug-favicon-32.png', size: 32, tile: true },
  { file: 'docs/brand/inkbug-mark.png', size: 256, tile: true },
  { file: 'docs/brand/inkbug-head.png', size: 512, tile: false },
];

const browser = await chromium.launch();
const page = await browser.newPage();
const images = await page.evaluate(
  async ({ src, crops, outputs }) => {
    const img = new Image();
    img.src = src;
    await img.decode();
    const W = img.naturalWidth;
    const H = img.naturalHeight;
    const base = document.createElement('canvas');
    base.width = W;
    base.height = H;
    const bx = base.getContext('2d');
    bx.drawImage(img, 0, 0);
    const data = bx.getImageData(0, 0, W, H);
    const px = data.data;

    // Clear the white connected to the edges (flood fill), then soften the rim.
    const white = (i) => px[i] > 232 && px[i + 1] > 232 && px[i + 2] > 232;
    const cleared = new Uint8Array(W * H);
    const stack = [];
    for (let x = 0; x < W; x++) stack.push(x, (H - 1) * W + x);
    for (let y = 0; y < H; y++) stack.push(y * W, y * W + W - 1);
    while (stack.length) {
      const p = stack.pop();
      if (cleared[p] || !white(p * 4)) continue;
      cleared[p] = 1;
      const x = p % W;
      const y = (p / W) | 0;
      if (x > 0) stack.push(p - 1);
      if (x < W - 1) stack.push(p + 1);
      if (y > 0) stack.push(p - W);
      if (y < H - 1) stack.push(p + W);
    }
    for (let p = 0; p < W * H; p++) {
      const i = p * 4;
      if (cleared[p]) {
        px[i + 3] = 0;
        continue;
      }
      const x = p % W;
      const y = (p / W) | 0;
      const rim =
        (x > 0 && cleared[p - 1]) ||
        (x < W - 1 && cleared[p + 1]) ||
        (y > 0 && cleared[p - W]) ||
        (y < H - 1 && cleared[p + W]);
      if (!rim) continue;
      // An anti-aliased edge pixel: the whiter it is, the more see-through.
      const lightest = Math.min(px[i], px[i + 1], px[i + 2]);
      if (lightest > 170) px[i + 3] = Math.round(255 * Math.min(1, (255 - lightest) / 85));
    }
    bx.putImageData(data, 0, 0);

    const round = (cx, s, r) => {
      cx.beginPath();
      cx.moveTo(r, 0);
      cx.arcTo(s, 0, s, s, r);
      cx.arcTo(s, s, 0, s, r);
      cx.arcTo(0, s, 0, 0, r);
      cx.arcTo(0, 0, s, 0, r);
      cx.closePath();
    };

    const out = {};
    for (const o of outputs) {
      const s = o.size;
      const mark = crops[o.crop ?? 'mark'];
      const c = document.createElement('canvas');
      c.width = s;
      c.height = s;
      const cx = c.getContext('2d');
      cx.imageSmoothingQuality = 'high';
      const scale = (s * (o.tile && !o.crop ? 0.94 : 1)) / mark.w;
      const w = mark.w * scale;
      const h = mark.h * scale;
      const x = (s - w) / 2;
      if (o.tile) {
        const r = s * 0.22;
        round(cx, s, r);
        const g = cx.createLinearGradient(0, 0, 0, s);
        g.addColorStop(0, '#ffffff');
        g.addColorStop(1, '#e3f4ea');
        cx.fillStyle = g;
        cx.fill();
        cx.save();
        round(cx, s, r);
        cx.clip();
        // The head peeks up from the bottom edge of the tile.
        cx.drawImage(base, mark.x, mark.y, mark.w, mark.h, x, s - h, w, h);
        cx.restore();
        if (s >= 48) {
          round(cx, s, r);
          cx.lineWidth = Math.max(1, s / 128);
          cx.strokeStyle = 'rgba(54, 127, 72, 0.18)';
          cx.stroke();
        }
      } else {
        cx.drawImage(base, mark.x, mark.y, mark.w, mark.h, x, (s - h) / 2, w, h);
      }
      out[o.file] = c.toDataURL('image/png');
    }
    return out;
  },
  {
    src: `data:image/jpeg;base64,${source.toString('base64')}`,
    crops: { mark: MARK, tiny: TINY },
    outputs: OUTPUTS,
  },
);
await browser.close();

const png = (file) => Buffer.from(images[file].split(',')[1], 'base64');
for (const { file } of OUTPUTS) {
  await mkdir(join(root, dirname(file)), { recursive: true });
  await writeFile(join(root, file), png(file));
  console.log(`${file.padEnd(40)} ${(png(file).length / 1024).toFixed(1)} KB`);
}

// favicon.ico: the 16 and 32 px PNGs in one file (PNG-in-ICO).
const parts = [png('public/favicon-16.png'), png('public/favicon-32.png')];
const header = Buffer.alloc(6 + parts.length * 16);
header.writeUInt16LE(0, 0);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(parts.length, 4);
let offset = header.length;
parts.forEach((part, i) => {
  const size = i === 0 ? 16 : 32;
  const e = 6 + i * 16;
  header.writeUInt8(size, e);
  header.writeUInt8(size, e + 1);
  header.writeUInt16LE(1, e + 4);
  header.writeUInt16LE(32, e + 6);
  header.writeUInt32LE(part.length, e + 8);
  header.writeUInt32LE(offset, e + 12);
  offset += part.length;
});
const ico = Buffer.concat([header, ...parts]);
await writeFile(join(root, 'public/favicon.ico'), ico);
console.log(`${'public/favicon.ico'.padEnd(40)} ${(ico.length / 1024).toFixed(1)} KB`);

/**
 * Artwork for the sample book, painted on canvases at runtime so the app ships no binary
 * files and works offline: backgrounds, the mascot "Pip" (and a blink pose), an owl for the
 * flap, a star for the treasure hunt, and a short chime sound.
 */

export type Scene = {
  sky: [string, string];
  sun: string;
  hills: string[];
  /** Extra decoration drawn over the hills. */
  extra?: 'trees' | 'waves' | 'stars';
};

export const SCENES = {
  title: { sky: ['#fff1d6', '#ffc9a3'], sun: '#fffaf0', hills: ['#f4a47c', '#e07a5f'] },
  morning: { sky: ['#ffd29d', '#ff8a65'], sun: '#fff4d6', hills: ['#d9774f', '#a8513a'] },
  crossroads: { sky: ['#9be7ff', '#4f9dff'], sun: '#ffffff', hills: ['#58c48f', '#2f8f63'] },
  forest: {
    sky: ['#6fbf8e', '#1f5c45'],
    sun: '#e9ffd9',
    hills: ['#2f7a55', '#1c4d36'],
    extra: 'trees',
  },
  sea: {
    sky: ['#b8ecff', '#5cc6f2'],
    sun: '#fff8e1',
    hills: ['#3aa0e8', '#1f6fb8'],
    extra: 'waves',
  },
  night: {
    sky: ['#4a3f8c', '#1d1740'],
    sun: '#fdf1c7',
    hills: ['#2d2a5e', '#1a173b'],
    extra: 'stars',
  },
} satisfies Record<string, Scene>;

const toFile = (canvas: HTMLCanvasElement, name: string) =>
  new Promise<File>((resolve) =>
    canvas.toBlob((b) => resolve(new File([b!], name, { type: 'image/png' })), 'image/png'),
  );

function canvas(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return { c, g: c.getContext('2d')! };
}

export async function paintScene(scene: Scene, name: string): Promise<File> {
  const { c, g } = canvas(1600, 1200);
  const sky = g.createLinearGradient(0, 0, 0, 1200);
  sky.addColorStop(0, scene.sky[0]);
  sky.addColorStop(1, scene.sky[1]);
  g.fillStyle = sky;
  g.fillRect(0, 0, 1600, 1200);
  g.fillStyle = scene.sun;
  g.beginPath();
  g.arc(1250, 330, 120, 0, Math.PI * 2);
  g.fill();
  if (scene.extra === 'stars') {
    g.fillStyle = '#fff8dc';
    for (let i = 0; i < 60; i++) {
      const x = (i * 263) % 1600;
      const y = (i * 137) % 600;
      g.fillRect(x, y, 3, 3);
    }
  }
  scene.hills.forEach((color, i) => {
    g.fillStyle = color;
    g.beginPath();
    g.moveTo(0, 1200);
    const base = 780 + i * 160;
    for (let x = 0; x <= 1600; x += 40) {
      g.lineTo(x, base + Math.sin(x / (230 - i * 60) + i) * (60 - i * 15));
    }
    g.lineTo(1600, 1200);
    g.closePath();
    g.fill();
  });
  if (scene.extra === 'trees') {
    for (let i = 0; i < 9; i++) {
      const x = 80 + i * 190 + (i % 2) * 40;
      const h = 260 + (i % 3) * 70;
      g.fillStyle = '#5b3a22';
      g.fillRect(x - 14, 900 - h * 0.25, 28, h * 0.25 + 40);
      g.fillStyle = i % 2 ? '#1f6b44' : '#2a8455';
      g.beginPath();
      g.moveTo(x, 900 - h);
      g.lineTo(x - 110, 900 - h * 0.2);
      g.lineTo(x + 110, 900 - h * 0.2);
      g.closePath();
      g.fill();
    }
  }
  if (scene.extra === 'waves') {
    g.strokeStyle = 'rgba(255,255,255,0.55)';
    g.lineWidth = 8;
    for (let row = 0; row < 4; row++) {
      g.beginPath();
      for (let x = 0; x <= 1600; x += 20) {
        g.lineTo(x, 880 + row * 80 + Math.sin(x / 50 + row) * 10);
      }
      g.stroke();
    }
  }
  return toFile(c, name);
}

/** Pip: a round, orange, fox-ish friend standing on its feet, with transparent space around. */
function drawPip(g: CanvasRenderingContext2D, eyesClosed: boolean) {
  // Ears
  g.fillStyle = '#ff8a3d';
  g.beginPath();
  g.moveTo(150, 190);
  g.lineTo(175, 70);
  g.lineTo(235, 170);
  g.moveTo(265, 170);
  g.lineTo(325, 70);
  g.lineTo(350, 190);
  g.fill();
  g.fillStyle = '#ffd3b0';
  g.beginPath();
  g.moveTo(178, 165);
  g.lineTo(185, 110);
  g.lineTo(215, 160);
  g.moveTo(285, 160);
  g.lineTo(315, 110);
  g.lineTo(322, 165);
  g.fill();
  // Feet
  g.fillStyle = '#d9632a';
  g.beginPath();
  g.ellipse(195, 540, 48, 22, 0, 0, Math.PI * 2);
  g.ellipse(305, 540, 48, 22, 0, 0, Math.PI * 2);
  g.fill();
  // Body and belly
  g.fillStyle = '#ff8a3d';
  g.beginPath();
  g.ellipse(250, 350, 150, 195, 0, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#ffe2c7';
  g.beginPath();
  g.ellipse(250, 410, 95, 120, 0, 0, Math.PI * 2);
  g.fill();
  // Eyes
  if (eyesClosed) {
    g.strokeStyle = '#1f1d2b';
    g.lineWidth = 9;
    g.lineCap = 'round';
    for (const x of [200, 300]) {
      g.beginPath();
      g.arc(x, 275, 22, 0.15 * Math.PI, 0.85 * Math.PI);
      g.stroke();
    }
  } else {
    for (const x of [200, 300]) {
      g.fillStyle = '#ffffff';
      g.beginPath();
      g.arc(x, 270, 30, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#1f1d2b';
      g.beginPath();
      g.arc(x + 6, 275, 15, 0, Math.PI * 2);
      g.fill();
    }
  }
  // Cheeks and smile
  g.fillStyle = 'rgba(255, 99, 99, 0.35)';
  g.beginPath();
  g.arc(160, 330, 20, 0, Math.PI * 2);
  g.arc(340, 330, 20, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = '#1f1d2b';
  g.lineWidth = 7;
  g.lineCap = 'round';
  g.beginPath();
  g.arc(250, 320, 28, 0.15 * Math.PI, 0.85 * Math.PI);
  g.stroke();
}

export async function paintPip(eyesClosed = false): Promise<File> {
  const { c, g } = canvas(500, 600);
  drawPip(g, eyesClosed);
  return toFile(c, eyesClosed ? 'Pip blink.png' : 'Pip.png');
}

export async function paintOwl(): Promise<File> {
  const { c, g } = canvas(400, 400);
  g.fillStyle = '#8a5a3b';
  g.beginPath();
  g.ellipse(200, 220, 130, 150, 0, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#d9b48f';
  g.beginPath();
  g.ellipse(200, 270, 80, 90, 0, 0, Math.PI * 2);
  g.fill();
  for (const x of [150, 250]) {
    g.fillStyle = '#fff6d8';
    g.beginPath();
    g.arc(x, 170, 45, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#1f1d2b';
    g.beginPath();
    g.arc(x, 175, 20, 0, Math.PI * 2);
    g.fill();
  }
  g.fillStyle = '#f2a33a';
  g.beginPath();
  g.moveTo(185, 215);
  g.lineTo(215, 215);
  g.lineTo(200, 245);
  g.fill();
  return toFile(c, 'Owl.png');
}

export async function paintStar(): Promise<File> {
  const { c, g } = canvas(200, 200);
  g.fillStyle = '#ffd84d';
  g.strokeStyle = '#e0a100';
  g.lineWidth = 8;
  g.lineJoin = 'round';
  g.beginPath();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 ? 38 : 88;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    g.lineTo(100 + Math.cos(a) * r, 104 + Math.sin(a) * r);
  }
  g.closePath();
  g.fill();
  g.stroke();
  return toFile(c, 'Star.png');
}

/** A soft two-note chime (16-bit mono WAV, ~0.5 s). */
export function makeChime(): File {
  const rate = 22050;
  const n = Math.round(rate * 0.5);
  const buf = new ArrayBuffer(44 + n * 2);
  const v = new DataView(buf);
  const text = (o: number, s: string) =>
    [...s].forEach((ch, i) => v.setUint8(o + i, ch.charCodeAt(0)));
  text(0, 'RIFF');
  v.setUint32(4, 36 + n * 2, true);
  text(8, 'WAVE');
  text(12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, rate, true);
  v.setUint32(28, rate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  text(36, 'data');
  v.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) {
    const t = i / rate;
    const f = t < 0.12 ? 880 : 1318.5;
    const start = t < 0.12 ? 0 : 0.12;
    const env = Math.exp(-(t - start) * 7) * Math.min(1, (t - start) * 400);
    v.setInt16(44 + i * 2, Math.round(Math.sin(2 * Math.PI * f * t) * env * 9000), true);
  }
  return new File([buf], 'Chime.wav', { type: 'audio/wav' });
}

/**
 * A soft 8-second music loop (16-bit mono WAV, ~250 KB): a gentle arpeggio over four chords
 * (C, Am, F, G) with a low hum under each. Notes that ring past the end wrap to the start, so
 * the loop has no seam.
 */
export function makeMusicLoop(): File {
  const rate = 16000;
  const seconds = 8;
  const n = rate * seconds;
  const mix = new Float32Array(n);
  const note = (
    at: number,
    freq: number,
    length: number,
    gain: number,
    attack: number,
    decay: number,
  ) => {
    const from = Math.round(at * rate);
    const count = Math.round(length * rate);
    for (let i = 0; i < count; i++) {
      const t = i / rate;
      const env = Math.min(1, t / attack) * Math.exp(-t * decay);
      const wave = Math.sin(2 * Math.PI * freq * t) + 0.25 * Math.sin(4 * Math.PI * freq * t);
      mix[(from + i) % n]! += wave * env * gain;
    }
  };
  const bars = [
    { bass: 130.81, arp: [261.63, 329.63, 392.0, 329.63] }, // C
    { bass: 110.0, arp: [220.0, 261.63, 329.63, 261.63] }, // Am
    { bass: 87.31, arp: [174.61, 220.0, 261.63, 220.0] }, // F
    { bass: 98.0, arp: [196.0, 246.94, 293.66, 246.94] }, // G
  ];
  bars.forEach((bar, b) => {
    note(b * 2, bar.bass, 2.6, 0.35, 0.25, 0.9);
    bar.arp.forEach((freq, i) => note(b * 2 + i * 0.5, freq, 1.6, 0.3, 0.015, 2.6));
  });
  const peak = mix.reduce((m, x) => Math.max(m, Math.abs(x)), 0) || 1;

  const buf = new ArrayBuffer(44 + n * 2);
  const v = new DataView(buf);
  const text = (o: number, s: string) =>
    [...s].forEach((ch, i) => v.setUint8(o + i, ch.charCodeAt(0)));
  text(0, 'RIFF');
  v.setUint32(4, 36 + n * 2, true);
  text(8, 'WAVE');
  text(12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, rate, true);
  v.setUint32(28, rate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  text(36, 'data');
  v.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) v.setInt16(44 + i * 2, Math.round((mix[i]! / peak) * 14000), true);
  return new File([buf], 'Soft morning.wav', { type: 'audio/wav' });
}

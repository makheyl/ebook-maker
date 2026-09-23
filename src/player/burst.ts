import type { BurstEffect } from '../core/schema';

const COLORS: Record<BurstEffect, string[]> = {
  confetti: ['#ff6b6b', '#ffd84d', '#4cc38a', '#3aa0ff', '#b18cff', '#ff8fc7'],
  sparkles: ['#ffd84d', '#fff3b0', '#ffffff', '#ffb300'],
  hearts: ['#ff5c8a', '#ff8fb1', '#e8335d', '#ffc2d4'],
};
const COUNT: Record<BurstEffect, number> = { confetti: 28, sparkles: 16, hearts: 12 };
const HEART_PATH =
  'M12 21s-7.5-4.6-9.6-9C1 8.7 3.1 5 6.8 5c2.1 0 3.6 1.2 5.2 3.1C13.6 6.2 15.1 5 17.2 5 20.9 5 23 8.7 21.6 12c-2.1 4.4-9.6 9-9.6 9z';

function particle(effect: BurstEffect, color: string, size: number): HTMLElement {
  const p = document.createElement('div');
  p.className = `fp-particle fp-${effect}`;
  p.style.width = `${size}px`;
  p.style.height = `${effect === 'confetti' ? size * 0.45 : size}px`;
  if (effect === 'hearts') {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', HEART_PATH);
    path.setAttribute('fill', color);
    svg.appendChild(path);
    p.appendChild(svg);
  } else {
    p.style.background = color;
  }
  return p;
}

/**
 * Plays a short burst of particles centred on (x, y) inside `layer`, then removes every node
 * it created. Pure DOM + WAAPI (no canvas, no timers left behind). `spread` is the radius in px.
 */
export function burst(
  layer: HTMLElement,
  x: number,
  y: number,
  effect: BurstEffect,
  spread: number,
): Promise<void> {
  const box = document.createElement('div');
  box.className = 'fp-burst';
  box.setAttribute('aria-hidden', 'true');
  box.style.left = `${x}px`;
  box.style.top = `${y}px`;
  layer.appendChild(box);
  const colors = COLORS[effect];
  const n = COUNT[effect];
  const base = Math.max(8, spread * 0.09);
  const anims: Animation[] = [];
  for (let i = 0; i < n; i++) {
    const size = base * (0.6 + Math.random() * 0.8);
    const p = particle(effect, colors[i % colors.length]!, size);
    box.appendChild(p);
    // Confetti and hearts fly mostly upwards; sparkles go every way.
    const angle =
      effect === 'sparkles'
        ? (i / n) * Math.PI * 2 + Math.random() * 0.4
        : -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * (effect === 'hearts' ? 0.7 : 1.3);
    const dist = spread * (0.55 + Math.random() * 0.6);
    const dx = Math.cos(angle) * dist;
    const dy = Math.sin(angle) * dist;
    const fall = effect === 'confetti' ? spread * 0.5 : effect === 'hearts' ? -spread * 0.2 : 0;
    const spin = effect === 'confetti' ? (Math.random() - 0.5) * 720 : effect === 'hearts' ? 0 : 90;
    const center = 'translate(-50%, -50%)';
    anims.push(
      p.animate(
        [
          { transform: `${center} translate(0, 0) scale(0.2) rotate(0deg)`, opacity: 1 },
          {
            transform: `${center} translate(${dx * 0.75}px, ${dy * 0.75}px) scale(1) rotate(${spin / 2}deg)`,
            opacity: 1,
            offset: 0.45,
          },
          {
            transform: `${center} translate(${dx}px, ${dy + fall}px) scale(${effect === 'sparkles' ? 0.2 : 0.7}) rotate(${spin}deg)`,
            opacity: 0,
          },
        ],
        {
          duration: 850 + Math.random() * 450,
          delay: Math.random() * 80,
          easing: 'cubic-bezier(0.2, 0.7, 0.3, 1)',
          fill: 'both',
        },
      ),
    );
  }
  return Promise.all(anims.map((a) => a.finished.catch(() => undefined))).then(() => {
    box.remove();
  });
}

import { describe, expect, it } from 'vitest';
import { bubbleGeometry } from './bubble-geometry';

const numbers = (d: string) => (d.match(/-?\d+(\.\d+)?/g) ?? []).map(Number);

describe('speech bubble geometry', () => {
  it('points the tail exactly at the tip, starting inside the body', () => {
    const g = bubbleGeometry('speech', 400, 200, { x: 120, y: 330 }, 40, 3);
    expect(g.tail).toMatch(/L120,330 /);
    const [x1, y1] = numbers(g.tail!);
    expect(y1).toBeLessThan(200); // the base is inside the body
    expect(x1).toBeGreaterThan(0);
    expect(g.cover).not.toBeNull();
    expect(g.inset).toEqual({ x: 0, y: 0 });
  });

  it('draws no tail when the tip is inside the bubble, or for captions', () => {
    expect(bubbleGeometry('speech', 400, 200, { x: 200, y: 100 }, 40).tail).toBeNull();
    expect(bubbleGeometry('caption', 400, 200, { x: 120, y: 330 }, 40).tail).toBeNull();
  });

  it('gives thought bubbles a trail of shrinking circles, and clouds/bursts a text inset', () => {
    const thought = bubbleGeometry('thought', 400, 200, { x: 400, y: 400 }, 40);
    expect(thought.tail!.match(/a/g)!.length).toBe(6); // three circles, two arcs each
    expect(thought.cover).toBeNull();
    expect(thought.inset.x).toBeGreaterThan(0);
    const shout = bubbleGeometry('shout', 400, 200, { x: -100, y: 100 }, 40);
    expect(shout.body.startsWith('M')).toBe(true);
    expect(shout.body.trim().endsWith('Z')).toBe(true);
    expect(shout.tail).toMatch(/L-100,100 /);
  });
});

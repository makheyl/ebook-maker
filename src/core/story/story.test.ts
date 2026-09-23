import { produce } from 'immer';
import { describe, expect, it } from 'vitest';
import { analyzeAlpha } from '../character/alpha';
import { createCharacter } from '../character/character';
import { GROUND_LINE, placeCharacter } from '../character/placement';
import { PatchHistory } from '../history/patch-history';
import { projectSchema } from '../schema/project';
import { createPage, createProject, createTextElement, type Project } from '../schema';
import { applyStoryPlan } from './apply';
import { matchKeywords } from './keywords';
import { suggestPlan } from './plan';
import { keywordSuggester } from './suggest-motions';

const pages = (...texts: string[]) => keywordSuggester.suggest(texts.map((text) => ({ text })));

describe('keyword matching', () => {
  it('matches whole words with simple stems, in priority order', () => {
    expect(matchKeywords('The fox jumped over the log').map((m) => m.rule.id)).toEqual(['hop']);
    expect(matchKeywords('She was so happy she danced').map((m) => m.rule.id)).toEqual([
      'happy',
      'dance',
    ]);
    expect(matchKeywords('A jumper and a hopscotch')).toEqual([]); // not whole words
    expect(matchKeywords('Time to sleep')[0]!.rule.kind).toBe('idle');
  });
});

describe('keyword suggester', () => {
  it('walks in on the first page, reacts to words, and waves at the end', () => {
    const s = pages('Pip woke up.', 'Pip jumped for joy!', 'The end.');
    expect(s[0]!.entrance).toEqual({ motion: 'walkIn', params: { from: 'left' } });
    expect(s[1]!.entrance).toBeUndefined(); // still on stage
    expect(s[1]!.action?.motion).toBe('hop');
    expect(s[1]!.reasons.join(' ')).toContain('"jumped"');
    expect(s[2]!.action?.motion).toBe('wave');
  });

  it('keeps continuity: leaves to the right, comes back from the left', () => {
    const s = pages('Pip said goodbye.', 'Later that day…', 'Pip was back.');
    expect(s[0]!.exit).toEqual({ motion: 'walkOut', params: { to: 'right' } });
    expect(s[1]!.entrance).toEqual({ motion: 'walkIn', params: { from: 'left' } });
    expect(s[1]!.reasons).toContain('comes back in');
  });

  it('never exits on the last page and suggests idles from mood words', () => {
    const s = pages('Night fell and Pip was tired. Goodbye!');
    expect(s[0]!.exit).toBeUndefined();
    expect(s[0]!.idle).toBe('snooze');
  });
});

describe('placement', () => {
  const asset = {
    width: 400,
    height: 800,
    opaqueBounds: { x: 0.1, y: 0.05, width: 0.8, height: 0.9 },
  };
  const size = { width: 1600, height: 1200 };

  it('stands the character on the ground line at ~40% of the page height', () => {
    const box = placeCharacter({ elements: [] }, size, asset);
    expect(box.height).toBeCloseTo(480);
    // Feet (bottom of visible pixels, 95% down the art) on the ground line.
    expect(box.y + box.height * 0.95).toBeCloseTo(size.height * GROUND_LINE);
  });

  it('picks the side with less text', () => {
    const leftText = createTextElement('Words', { x: 0, y: 600, width: 700, height: 500 });
    const box = placeCharacter({ elements: [leftText] }, size, asset);
    expect(box.x + box.width / 2).toBeGreaterThan(size.width / 2);
    const rightText = createTextElement('Words', { x: 900, y: 600, width: 700, height: 500 });
    expect(placeCharacter({ elements: [rightText] }, size, asset).x).toBeLessThan(size.width / 2);
  });

  it("reuses the previous page's slot", () => {
    const slot = { x: 10, y: 20, width: 30, height: 40 };
    expect(placeCharacter({ elements: [] }, size, asset, slot)).toEqual(slot);
  });
});

describe('applying a story plan', () => {
  function book(): { project: Project; characterId: string } {
    const texts = ['Pip arrived at the park.', 'Pip jumped!', 'Pip went home. Bye!', 'The end.'];
    const project = createProject({
      pages: texts.map((t) => ({
        ...createPage(),
        elements: [createTextElement(t, { x: 100, y: 100, width: 700, height: 100 })],
      })),
    });
    const asset = {
      id: 'art',
      kind: 'image' as const,
      mime: 'image/png',
      width: 400,
      height: 800,
      bytes: 1,
      hasAlpha: true,
    };
    const character = createCharacter(asset, 'Pip');
    project.assets.art = asset;
    project.characters[character.id] = character;
    return { project, characterId: character.id };
  }

  it('places the character in one consistent spot and adds the planned steps, as one undo', () => {
    const { project, characterId } = book();
    const history = new PatchHistory<Project>();
    const plan = suggestPlan(project);
    const after = history.apply(project, (d) => applyStoryPlan(d, characterId, plan), {
      label: 'Animate story',
    });
    const instances = after.pages.map((p) => p.elements.find((e) => e.type === 'image')!);
    expect(instances.every((i) => i && i.type === 'image' && i.characterId === characterId)).toBe(
      true,
    );
    expect(new Set(instances.map((i) => `${i.x},${i.y}`)).size).toBe(1);
    const story = (i: number) =>
      after.pages[i]!.animations.filter((a) => a.trigger !== 'onInteraction');
    expect(story(0).map((a) => a.preset)).toEqual(['walkIn']);
    expect(story(1).map((a) => a.preset)).toEqual(['hop']);
    expect(story(2).map((a) => a.preset)).toEqual(['walkOut']);
    // Every placed instance also wiggles when tapped.
    for (const p of after.pages.slice(1)) {
      const reaction = p.animations.find((a) => a.trigger === 'onInteraction');
      expect(reaction?.preset).toBe('wiggle');
      const inst = p.elements.find((e) => e.type === 'image')!;
      expect(inst.interactions?.[0]?.actions).toEqual([{ type: 'playStep', stepId: reaction!.id }]);
    }
    expect(story(3).map((a) => [a.preset, a.trigger])).toEqual([
      ['walkIn', 'onPageEnter'],
      ['wave', 'afterPrevious'],
    ]);
    expect(projectSchema.safeParse(after).success).toBe(true);
    expect(history.undo(after)).toEqual(project);
  });

  it('re-applying replaces story steps but keeps tap reactions, and skips excluded pages', () => {
    const { project, characterId } = book();
    const once = produce(project, (d) => applyStoryPlan(d, characterId, suggestPlan(project)));
    const withReaction = produce(once, (d) => {
      const inst = d.pages[1]!.elements.find((e) => e.type === 'image')!;
      d.pages[1]!.animations.push({
        id: 'tap',
        elementId: inst.id,
        kind: 'emphasis',
        preset: 'wiggle',
        trigger: 'onInteraction',
        duration: 800,
        delay: 0,
        easing: 'linear',
      });
    });
    const plan = suggestPlan(withReaction).map((r, i) => (i === 0 ? { ...r, include: false } : r));
    const twice = produce(withReaction, (d) => applyStoryPlan(d, characterId, plan));
    expect(twice.pages[1]!.animations.map((a) => a.id)).toContain('tap');
    expect(twice.pages[1]!.animations.filter((a) => a.preset === 'hop')).toHaveLength(1);
    expect(twice.pages[0]!.animations).toEqual(once.pages[0]!.animations);
  });
});

describe('alpha analysis', () => {
  function rgba(w: number, h: number, paint: (x: number, y: number) => number) {
    const data = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) data[(y * w + x) * 4 + 3] = paint(x, y);
    return data;
  }

  it('finds the visible box of a transparent image', () => {
    const data = rgba(10, 10, (x, y) => (x >= 2 && x < 6 && y >= 1 && y < 9 ? 255 : 0));
    expect(analyzeAlpha(data, 10, 10)).toEqual({
      hasAlpha: true,
      opaqueBounds: { x: 0.2, y: 0.1, width: 0.4, height: 0.8 },
    });
  });

  it('reports opaque and fully transparent images', () => {
    expect(
      analyzeAlpha(
        rgba(4, 4, () => 255),
        4,
        4,
      ),
    ).toEqual({
      hasAlpha: false,
      opaqueBounds: { x: 0, y: 0, width: 1, height: 1 },
    });
    expect(
      analyzeAlpha(
        rgba(4, 4, () => 0),
        4,
        4,
      ),
    ).toEqual({ hasAlpha: true });
  });
});

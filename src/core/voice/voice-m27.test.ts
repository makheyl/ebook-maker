import { produce } from 'immer';
import { describe, expect, it } from 'vitest';
import { createAnimationStep } from '../animation/factory';
import { createPageTimeline } from '../animation/timeline';
import { addVoiceToTap, tapVoiceTarget } from '../ops/voice';
import { createPageView } from '../render/page-view';
import {
  createBubbleElement,
  createButtonElement,
  createPage,
  createProject,
  type Page,
  type Project,
  type VoiceClip,
} from '../schema';
import { bubbleVoiceCues } from './cues';
import { matchVoiceFiles } from './match';
import { validateVoice } from './validate';

const clip = (id: string): VoiceClip => ({ id, kind: 'voice', mime: 'audio/mpeg', bytes: 10 });
const LANGS = [
  { code: 'en', name: 'English' },
  { code: 'tl', name: 'Tagalog' },
];

describe('bulk upload: matching file names', () => {
  it('reads page numbers and languages in the usual shapes', () => {
    const got = matchVoiceFiles(
      [
        'page-03-tl.mp3',
        'p3_en.m4a',
        '01 tagalog.wav',
        'Page2.mp3',
        'intro.mp3',
        'page-09-tl.mp3',
        'p3-tl-take2.mp3',
      ],
      5,
      LANGS,
      'en',
    );
    expect(got).toEqual([
      { name: 'page-03-tl.mp3', page: 2, code: 'tl' },
      { name: 'p3_en.m4a', page: 2, code: 'en' },
      { name: '01 tagalog.wav', page: 0, code: 'tl' },
      { name: 'Page2.mp3', page: 1, code: 'en' }, // no language: the default
      { name: 'intro.mp3', problem: 'no page number in the name' },
      { name: 'page-09-tl.mp3', problem: "there's no page 9" },
      { name: 'p3-tl-take2.mp3', problem: 'same page and language as page-03-tl.mp3' },
    ]);
  });
});

describe('voiceover checks', () => {
  it('flags silent taps, lines without the default, and pages that fall back', () => {
    const tap = createButtonElement('Say', { x: 0, y: 0, width: 100, height: 40 });
    tap.interactions = [
      { id: 'ia', trigger: 'tap', once: false, actions: [{ type: 'playVoice', line: {} }] },
    ];
    const bubble = createBubbleElement('Hi', { x: 0, y: 100, width: 200, height: 100 });
    bubble.voice = { tl: clip('b') };
    const p1: Page = { ...createPage(), elements: [tap, bubble], voiceover: { en: clip('1') } };
    const p2: Page = { ...createPage(), voiceover: { en: clip('2'), tl: clip('3') } };
    const p3: Page = { ...createPage(), voiceover: { en: clip('4') } };
    const project: Project = {
      ...createProject({ pages: [p1, p2, p3] }),
      voiceover: { languages: LANGS, defaultLanguage: 'en' },
    };
    const issues = validateVoice(project);
    expect(issues.map((i) => [i.severity, i.message])).toEqual([
      ['error', "“Say” on page 1 has a voiceover with no recording — it won't say anything."],
      [
        'warning',
        `“${bubble.name}” on page 1 has no English recording (the default), so readers of other languages hear nothing there.`,
      ],
      ['warning', 'No Tagalog recording for Page 1, Page 3 — English plays there instead.'],
    ]);
  });
});

describe('when a voiced bubble is heard', () => {
  function setup(
    steps: (ids: { a: string; b: string; c: string; g: string }) => Page['animations'],
  ) {
    const a = createBubbleElement('A', { x: 0, y: 0, width: 100, height: 50 });
    const b = createBubbleElement('B', { x: 0, y: 60, width: 100, height: 50 });
    const c = createBubbleElement('C', { x: 0, y: 120, width: 100, height: 50 });
    const hidden = createBubbleElement('H', { x: 0, y: 180, width: 100, height: 50 });
    for (const x of [a, b, c, hidden]) x.voice = { en: clip(x.id) };
    hidden.hidden = true;
    const page: Page = {
      ...createPage(),
      elements: [
        a,
        {
          id: 'g',
          type: 'group',
          name: 'G',
          x: 200,
          y: 0,
          width: 100,
          height: 50,
          rotation: 0,
          opacity: 1,
          locked: false,
          hidden: false,
          children: [b],
        },
        c,
        hidden,
      ],
    };
    page.animations = steps({ a: a.id, b: b.id, c: c.id, g: 'g' });
    return { page, ids: { a: a.id, b: b.id, c: c.id } };
  }
  const timeline = (page: Page, reducedMotion = false) => {
    const view = createPageView({
      pageSize: { width: 1000, height: 800 },
      mode: 'player',
      resolveAsset: () => undefined,
    });
    view.update(page, {}, {});
    return createPageTimeline(page, (id) => view.getNodes(id), {
      pageSize: { width: 1000, height: 800 },
      reducedMotion,
      animate: () =>
        ({
          pause() {},
          play() {},
          cancel() {},
          currentTime: 0,
          finished: Promise.resolve(),
        }) as unknown as Animation,
    });
  };

  it('own entrance, its group’s entrance, a tap step, or the page opening', () => {
    const { page, ids } = setup(({ a, g, c }) => [
      { ...createAnimationStep(a, 'popFromTail', 'onPageEnter'), delay: 300 },
      { ...createAnimationStep(g, 'fadeIn', 'onClick'), delay: 100 },
      createAnimationStep(c, 'popFromTail', 'onInteraction'),
    ]);
    const tl = timeline(page);
    expect(tl.entrances.map((e) => [e.elementId, e.group, e.at])).toEqual([
      [ids.a, 0, 300],
      ['g', 1, 100],
      [ids.c, null, 0],
    ]);
    const cues = bubbleVoiceCues(page, tl.entrances);
    expect(cues.map((c) => [c.elementId, c.group, c.at, c.stepId ?? null])).toEqual([
      [ids.a, 0, 300, null],
      [ids.b, 1, 100, null],
      [ids.c, null, 0, page.animations[2]!.id],
    ]);
    // Reduced motion: entrances start at once.
    expect(bubbleVoiceCues(page, timeline(page, true).entrances)[0]!.at).toBe(0);
  });

  it('a voiced bubble with no entrance is heard when the page opens', () => {
    const { page, ids } = setup(() => []);
    expect(
      bubbleVoiceCues(page, timeline(page).entrances).map((c) => [c.elementId, c.group, c.at]),
    ).toEqual([
      [ids.a, 0, 0],
      [ids.b, 0, 0],
      [ids.c, 0, 0],
    ]);
  });
});

describe('speak when tapped', () => {
  it('joins the existing tap, then makes a new one, and stops at the limits', () => {
    const el = createButtonElement('Pip', { x: 0, y: 0, width: 10, height: 10 });
    el.interactions = [
      {
        id: 'wiggle',
        trigger: 'tap',
        once: false,
        actions: Array.from({ length: 7 }, () => ({ type: 'next' as const })),
      },
    ];
    const page = { ...createPage(), elements: [el] };
    let project = createProject({ pages: [page] });
    project = produce(project, (d) => void addVoiceToTap(d, page.id, el.id));
    expect(project.pages[0]!.elements[0]!.interactions![0]!.actions).toHaveLength(8);
    expect(tapVoiceTarget(project.pages[0]!, el.id)).toMatchObject({
      interactionId: 'wiggle',
      index: 7,
    });
    // Asking again doesn't add a second line.
    const again = produce(project, (d) => void addVoiceToTap(d, page.id, el.id));
    expect(again.pages[0]!.elements[0]!.interactions).toHaveLength(1);

    // A full tap: a new one; four taps and all full: nothing.
    const full = produce(createProject({ pages: [page] }), (d) => {
      const e = d.pages[0]!.elements[0]!;
      e.interactions = Array.from({ length: 4 }, (_, i) => ({
        id: `t${i}`,
        trigger: 'tap' as const,
        once: false,
        actions: Array.from({ length: 8 }, () => ({ type: 'next' as const })),
      }));
    });
    let result: unknown = 'unset';
    produce(full, (d) => void (result = addVoiceToTap(d, page.id, el.id)));
    expect(result).toBeNull();
    const three = produce(full, (d) => void d.pages[0]!.elements[0]!.interactions!.pop());
    const added = produce(three, (d) => void addVoiceToTap(d, page.id, el.id));
    expect(added.pages[0]!.elements[0]!.interactions).toHaveLength(4);
  });
});

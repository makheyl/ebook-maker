import { produce } from 'immer';
import { createAnimationStep } from '@/core/animation';
import { createCharacter } from '@/core/character';
import { newId } from '@/core/ids';
import {
  createButtonElement,
  createImageElement,
  createPage,
  createProject,
  createTextElement,
  getPageSizePreset,
  type AnimationStep,
  type AssetRef,
  type ButtonElement,
  type Interaction,
  type Page,
  type PageElement,
  type StoryAction,
} from '@/core/schema';
import { applyStoryPlan, type StoryPlanRow } from '@/core/story/apply';
import { importSoundFiles } from '@/editor/assets/upload-sound';
import { importImageFiles } from '@/editor/assets/upload';
import { fitGeneratedText } from '@/editor/text/fit-pages';
import { projectRepo } from '@/storage';
import { makeChime, paintOwl, paintPip, paintScene, paintStar, SCENES } from './sample-art';

const tap = (actions: StoryAction[], once = false): Interaction => ({
  id: newId('ia'),
  trigger: 'tap',
  actions,
  once,
});

type Size = { width: number; height: number };

/** A painted scene filling the page with a caption across the top (the mascot stands below). */
function scenePage(background: AssetRef, text: string, size: Size, title = false): Page {
  const { width: W, height: H } = size;
  const m = Math.round(Math.min(W, H) * 0.05);
  const image = createImageElement(background, { x: 0, y: 0, width: W, height: H }, {}, 'exact');
  image.name = 'Background';
  image.locked = true;
  const caption = createTextElement(
    text,
    { x: m, y: m, width: W - 2 * m, height: Math.round(H * (title ? 0.26 : 0.19)) },
    {
      style: title
        ? {
            fontFamily: 'playfair-display',
            fontSize: Math.round(H * 0.11),
            fontWeight: 700,
            color: '#5a2d1a',
            align: 'center',
            verticalAlign: 'middle',
          }
        : {
            fontFamily: 'lora',
            fontSize: Math.round(H * 0.048),
            autofit: 'shrink',
            color: '#ffffff',
            align: 'center',
            verticalAlign: 'middle',
            lineHeight: 1.3,
            background: 'rgba(15, 12, 30, 0.55)',
            padding: Math.round(m * 0.45),
          },
    },
  );
  const animations: AnimationStep[] = [
    { ...createAnimationStep(caption.id, title ? 'popIn' : 'fadeIn', 'onPageEnter'), delay: 200 },
  ];
  return createPage(undefined, {
    background: { type: 'color', color: '#ffffff' },
    elements: [image, caption],
    animations,
    transition: title ? { preset: 'none', duration: 0 } : { preset: 'slide', duration: 700 },
  });
}

function storyButton(
  label: string,
  box: { x: number; y: number; width: number; height: number },
  actions: StoryAction[],
  extra: Partial<ButtonElement> = {},
): ButtonElement {
  // Wide enough for the label (Fredoka at ~0.42 × height) plus the icon.
  const fontSize = Math.round(box.height * 0.42);
  const needed = Math.round(label.length * fontSize * 0.6 + box.height * (extra.icon ? 1.5 : 1));
  const width = Math.max(box.width, needed);
  const x = box.x - (width - box.width) / 2;
  return createButtonElement(
    label,
    { ...box, x, width },
    {
      ...extra,
      style: {
        fontFamily: 'fredoka',
        fontSize,
        fill: '#6d4aff',
        textColor: '#ffffff',
        radius: box.height / 2,
        shadow: true,
        ...extra.style,
      },
      interactions: [tap(actions)],
    },
  );
}

/** The x range free of the mascot on a page ("left" or "right" half). */
function freeSide(page: Page, width: number): 'left' | 'right' {
  const pip = page.elements.find((e) => e.type === 'image' && e.characterId);
  return pip && pip.x + pip.width / 2 < width / 2 ? 'right' : 'left';
}

/**
 * Creates "Pip's Big Day", a small demo that shows what books can do: a mascot that walks,
 * hops, waves, blinks and reacts to taps; a choice between two paths; a lift-the-flap; a
 * treasure hunt that unlocks the page; a sound; and two endings.
 */
export async function createSampleBook(): Promise<string> {
  const size = getPageSizePreset('landscape');
  const W = size.width;
  const H = size.height;
  const files = await Promise.all([
    paintScene(SCENES.title, 'Title.png'),
    paintScene(SCENES.morning, 'Morning.png'),
    paintScene(SCENES.crossroads, 'Crossroads.png'),
    paintScene(SCENES.forest, 'Forest.png'),
    paintScene(SCENES.sea, 'Sea.png'),
    paintScene(SCENES.night, 'Night.png'),
    paintPip(),
    paintPip(true),
    paintOwl(),
    paintStar(),
  ]);
  const { assets, errors } = await importImageFiles(files);
  if (assets.length !== files.length) {
    throw new Error(errors[0]?.message ?? 'The sample pictures could not be prepared.');
  }
  const [title, morning, crossroads, forest, sea, night, pip, pipBlink, owl, star] = assets as [
    AssetRef,
    AssetRef,
    AssetRef,
    AssetRef,
    AssetRef,
    AssetRef,
    AssetRef,
    AssetRef,
    AssetRef,
    AssetRef,
  ];
  const { sounds } = await importSoundFiles([makeChime()]);
  const chime = sounds[0];

  const pages = [
    scenePage(title, "Pip's Big Day", size, true),
    scenePage(morning, 'Every morning, Pip hopped over the red hills.', size),
    scenePage(crossroads, 'Where should Pip go today? You choose!', size),
    scenePage(forest, 'The forest was dark and quiet. Something was hiding in there…', size),
    scenePage(sea, 'At the sea, Pip found shiny stars. Can you find all three?', size),
    scenePage(night, 'At night, sleepy Pip curled up. The moon kept watch. The end!', size),
  ];
  const character = createCharacter(pip, 'Pip');
  character.poses.push({ id: newId('po'), name: 'blink', assetId: pipBlink.id });

  const base = createProject({
    title: "Pip's Big Day (sample)",
    pageSize: { width: W, height: H },
    pages,
    theme: { fontFamily: 'lora', accent: '#6d4aff' },
  });
  base.assets = Object.fromEntries(assets.map((a) => [a.id, a]));
  base.characters = { [character.id]: character };
  if (chime) base.sounds = { [chime.id]: { ...chime, name: 'Chime' } };

  const row = (i: number, s: Partial<StoryPlanRow>): StoryPlanRow => ({
    pageId: pages[i]!.id,
    include: true,
    reasons: [],
    ...s,
  });
  const plan: StoryPlanRow[] = [
    row(0, { entrance: { motion: 'popUp' }, action: { motion: 'wave' } }),
    row(1, { entrance: { motion: 'walkIn' }, action: { motion: 'hop' } }),
    row(2, { action: { motion: 'lookAround' } }),
    row(3, { action: { motion: 'shiver' } }),
    row(4, { action: { motion: 'excited' } }),
    row(5, { idle: 'snooze' }),
  ];

  const project = produce(base, (d) => {
    applyStoryPlan(d, character.id, plan);
    const [p0, , p2, p3, p4, p5] = d.pages as Page[];
    const sound: StoryAction[] = chime ? [{ type: 'playSound', soundId: chime.id }] : [];
    const bh = Math.round(H * 0.1);

    // Title: Pip blinks after waving; a "Let's go!" button turns the page.
    const pip0 = p0!.elements.find((e) => e.type === 'image' && e.characterId)!;
    p0!.animations.push({ ...createAnimationStep(pip0.id, 'blink', 'afterPrevious'), delay: 300 });
    const goW = Math.round(W * 0.2);
    const goX =
      freeSide(p0!, W) === 'right' ? W - goW - Math.round(W * 0.08) : Math.round(W * 0.08);
    p0!.elements.push(
      storyButton(
        "Let's go!",
        { x: goX, y: Math.round(H * 0.62), width: goW, height: bh },
        [{ type: 'next' }],
        {
          icon: 'arrowRight',
          iconPosition: 'end',
        },
      ),
    );

    // The choice: two paths; "next" is locked until one is picked.
    const cw = Math.round(W * 0.32);
    const cx = freeSide(p2!, W) === 'right' ? Math.round(W * 0.58) : Math.round(W * 0.1);
    p2!.elements.push(
      storyButton(
        'Into the forest',
        { x: cx, y: Math.round(H * 0.36), width: cw, height: bh },
        [{ type: 'goToPage', pageId: p3!.id }],
        { style: { fill: '#2f8f63' } as ButtonElement['style'] },
      ),
      storyButton(
        'Down to the sea',
        { x: cx, y: Math.round(H * 0.52), width: cw, height: bh },
        [{ type: 'goToPage', pageId: p4!.id }],
        { style: { fill: '#1f6fb8' } as ButtonElement['style'] },
      ),
    );
    p2!.flow = { lockNext: true };

    // The forest: a flap hides an owl; the forest path skips the sea.
    const fs = Math.round(H * 0.3);
    const fx = freeSide(p3!, W) === 'right' ? Math.round(W * 0.62) : Math.round(W * 0.14);
    const fy = Math.round(H * 0.33);
    const owlEl = createImageElement(owl, { x: fx, y: fy, width: fs, height: fs }, { name: 'Owl' });
    owlEl.alt = 'An owl';
    const flap = createButtonElement(
      'Who is there?',
      { x: fx, y: fy, width: fs, height: fs },
      {
        name: 'Flap',
        icon: 'question',
        iconPosition: 'start',
        a11yLabel: 'Lift the flap: who is there?',
        style: {
          fontFamily: 'fredoka',
          fontSize: Math.round(fs * 0.085),
          fill: '#8a5a3b',
          textColor: '#fff6d8',
          radius: Math.round(fs * 0.08),
          shadow: true,
        },
      },
    );
    const lift = createAnimationStep(flap.id, 'liftUp', 'onInteraction');
    const reveal = { ...createAnimationStep(owlEl.id, 'popIn', 'onInteraction'), delay: 250 };
    flap.interactions = [
      tap(
        [{ type: 'playStep', stepId: lift.id }, { type: 'playStep', stepId: reveal.id }, ...sound],
        true,
      ),
    ];
    p3!.elements.push(owlEl as PageElement, flap);
    p3!.animations.push(reveal, lift);
    p3!.flow = { next: p5!.id, lockNext: false };

    // The sea: find three stars to continue.
    const ss = Math.round(H * 0.11);
    const side = freeSide(p4!, W);
    const spots =
      side === 'right'
        ? [
            [0.56, 0.3],
            [0.78, 0.42],
            [0.64, 0.58],
          ]
        : [
            [0.12, 0.3],
            [0.32, 0.42],
            [0.2, 0.58],
          ];
    spots.forEach(([px, py], i) => {
      const s = createImageElement(
        star,
        { x: Math.round(W * px!), y: Math.round(H * py!), width: ss, height: ss },
        {
          name: `Star ${i + 1}`,
        },
      );
      s.alt = 'A star';
      s.a11yLabel = `Star ${i + 1}`;
      s.interactions = [tap([{ type: 'collect' }, ...sound])];
      p4!.elements.push(s);
      p4!.animations.push({
        ...createAnimationStep(s.id, 'pulse', 'onPageEnter'),
        loop: true,
        delay: i * 250,
        duration: 1400,
      });
    });
    p4!.goal = { count: 3, label: 'Find the 3 stars' };
    p4!.flow = { lockNext: true };
  });

  // Measure every caption with the real fonts so none of them overflows its box.
  const fitted = { ...project, pages: await fitGeneratedText(project.pages, project.pageSize) };
  await projectRepo.save(fitted);
  return fitted.id;
}

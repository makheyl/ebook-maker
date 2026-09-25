import { z } from 'zod';

/**
 * The project JSON is the single source of truth. Everything here must stay plain,
 * serializable data: the editor edits it, the renderer draws it, the exporter packages it.
 *
 * Bump SCHEMA_VERSION whenever the shape changes, and add a migration in core/migrations.
 */
export const SCHEMA_VERSION = 6;

const id = z.string().min(1).max(64);
const unit = z.number().min(0).max(1);
/** Registry ids (animation presets, idle motions): alphanumeric, never free text. */
export const presetIdSchema = z.string().regex(/^[a-zA-Z0-9]{1,40}$/);

/**
 * Any CSS value we write into a style must be inert: no url()/image-set()/var() (which could
 * make the exported book fetch something) and no characters that could escape a declaration.
 */
const SAFE_CSS_VALUE =
  /^(?!.*\b(?:url|image-set|expression|var|attr|env)\s*\()[#a-zA-Z0-9(),.%\s/+-]*$/i;
export const cssColor = z.string().max(80).regex(SAFE_CSS_VALUE, 'Unsupported color value');
const fontId = z.string().regex(/^[a-z0-9-]{1,40}$/, 'Unknown font id');

export const pageSizeSchema = z.object({
  width: z.number().int().min(100).max(10000),
  height: z.number().int().min(100).max(10000),
});

export const themeSchema = z.object({
  fontFamily: fontId,
  background: cssColor,
  textColor: cssColor,
  accent: cssColor,
});

// ─── Assets ────────────────────────────────────────────────────────────────────

export const assetRefSchema = z.object({
  id, // content hash of the original upload; also the key of the blob in storage
  kind: z.literal('image'),
  mime: z.string().max(64),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  bytes: z.number().int().nonnegative(),
  name: z.string().max(200).optional(),
  /** Filled in at upload: whether any pixel is transparent, and the box of visible pixels. */
  hasAlpha: z.boolean().optional(),
  opaqueBounds: z.object({ x: unit, y: unit, width: unit, height: unit }).optional(),
});

/** Audio formats every current browser can play (no transcoding). */
export const SOUND_MIMES = [
  'audio/mpeg',
  'audio/ogg',
  'audio/wav',
  'audio/x-wav',
  'audio/wave',
  'audio/mp4',
  'audio/x-m4a',
  'audio/aac',
] as const;
export const MAX_SOUND_BYTES = 2 * 1024 * 1024;

export const soundRefSchema = z.object({
  id, // content hash; also the key of the blob in storage (shared with images)
  kind: z.literal('audio'),
  mime: z.enum(SOUND_MIMES),
  bytes: z.number().int().nonnegative().max(MAX_SOUND_BYTES),
  /** Seconds, when the browser could read it at upload. */
  duration: z.number().nonnegative().optional(),
  name: z.string().max(200).optional(),
});

// ─── Voiceover ─────────────────────────────────────────────────────────────────

export const MAX_VOICE_BYTES = 10 * 1024 * 1024;
export const MAX_VOICE_LANGUAGES = 8;

/** A language tag: 'en', 'tl', 'fil', 'es-MX'. Fixed once added; also the reader's `lang`. */
export const languageCodeSchema = z.string().regex(/^[a-z]{2,3}(-[A-Za-z0-9]{2,8}){0,2}$/);

export const voiceLanguageSchema = z.object({
  code: languageCodeSchema,
  /** What readers see: "Tagalog". */
  name: z.string().trim().min(1).max(40),
});

/** An uploaded recording. Its details live in the line that uses it (no separate library). */
export const voiceClipSchema = z.object({
  id, // 'vo_' + content hash; also the key of the blob in storage (shared with images)
  kind: z.literal('voice'),
  mime: z.enum(SOUND_MIMES),
  bytes: z.number().int().positive().max(MAX_VOICE_BYTES),
  duration: z.number().nonnegative().optional(),
  /** The original file name, for the author. */
  name: z.string().max(200).optional(),
});

/** One thing said, in each language it was recorded in. */
export const voiceLineSchema = z
  .record(languageCodeSchema, voiceClipSchema)
  .refine((line) => Object.keys(line).length <= MAX_VOICE_LANGUAGES, {
    message: `At most ${MAX_VOICE_LANGUAGES} languages`,
  });

export const voiceoverSchema = z.object({
  /** In the order readers see them. */
  languages: z.array(voiceLanguageSchema).max(MAX_VOICE_LANGUAGES),
  /** Plays when the reader's language has no clip; repaired to the first language. */
  defaultLanguage: languageCodeSchema.optional(),
});

// ─── Interactions ──────────────────────────────────────────────────────────────

export const BURST_EFFECTS = ['confetti', 'sparkles', 'hearts'] as const;

/** What a tap can do. A closed set: no URLs, no scripts, only ids that are validated. */
export const storyActionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('next') }),
  z.object({ type: z.literal('prev') }),
  z.object({ type: z.literal('firstPage') }),
  z.object({ type: z.literal('goToPage'), pageId: id }),
  z.object({ type: z.literal('playStep'), stepId: id }),
  z.object({ type: z.literal('unlockNext') }),
  z.object({ type: z.literal('burst'), effect: z.enum(BURST_EFFECTS) }),
  z.object({ type: z.literal('collect') }),
  z.object({ type: z.literal('playSound'), soundId: id }),
  /** Says a voice line in the reader's language (may be empty while being set up). */
  z.object({ type: z.literal('playVoice'), line: voiceLineSchema }),
]);

export const interactionSchema = z.object({
  id,
  trigger: z.literal('tap'),
  actions: z.array(storyActionSchema).min(1).max(8),
  /** Only the first tap counts. */
  once: z.boolean(),
});

// ─── Elements ──────────────────────────────────────────────────────────────────

const baseElementShape = {
  id,
  name: z.string().max(120),
  x: z.number(),
  y: z.number(),
  width: z.number().min(1),
  height: z.number().min(1),
  rotation: z.number(),
  opacity: z.number().min(0).max(1),
  locked: z.boolean(),
  hidden: z.boolean(),
  /** Tap behaviour in the reader. */
  interactions: z.array(interactionSchema).max(4).optional(),
  /** Accessible name when the element is interactive. */
  a11yLabel: z.string().max(120).optional(),
};

export const textRunSchema = z.object({
  text: z.string().max(20000),
  bold: z.boolean().optional(),
  italic: z.boolean().optional(),
  underline: z.boolean().optional(),
  color: cssColor.optional(),
});

/** Limited rich text, stored as structured runs — never as HTML. */
export const paragraphSchema = z.object({ runs: z.array(textRunSchema) });

export const textShadowSchema = z.object({
  x: z.number(),
  y: z.number(),
  blur: z.number().min(0),
  color: cssColor,
});

export const textStyleSchema = z.object({
  fontFamily: fontId,
  fontSize: z.number().min(1).max(2000),
  fontWeight: z.number().int().min(100).max(900),
  italic: z.boolean(),
  color: cssColor,
  align: z.enum(['left', 'center', 'right', 'justify']),
  /** Hyphenate words at line ends (default: on for justified text). Uses the book's language. */
  hyphenate: z.boolean().optional(),
  verticalAlign: z.enum(['top', 'middle', 'bottom']),
  lineHeight: z.number().min(0.5).max(4),
  letterSpacing: z.number().min(-50).max(200),
  background: cssColor.optional(),
  padding: z.number().min(0).max(500),
  shadow: textShadowSchema.optional(),
  /**
   * How the box treats text that doesn't fit: 'grow' the box (default when missing), 'shrink'
   * the text to fit the box, or keep the box fixed ('none'; flagged in the editor).
   */
  autofit: z.enum(['grow', 'shrink', 'none']).optional(),
  /** Font-size factor the editor measured for 'shrink' (the reader never measures). */
  fitScale: z.number().min(0.1).max(1).optional(),
});

export const textElementSchema = z.object({
  ...baseElementShape,
  type: z.literal('text'),
  content: z.array(paragraphSchema),
  style: textStyleSchema,
});

export const normalizedRectSchema = z.object({
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  width: z.number().gt(0).max(1),
  height: z.number().gt(0).max(1),
});

export const imageFiltersSchema = z.object({
  brightness: z.number().min(0).max(3), // 1 = unchanged
  contrast: z.number().min(0).max(3), // 1 = unchanged
  saturate: z.number().min(0).max(3), // 1 = unchanged
  blur: z.number().min(0).max(50), // px, in page units
  grayscale: z.number().min(0).max(1),
  sepia: z.number().min(0).max(1),
  hueRotate: z.number().min(-360).max(360), // degrees
});

export const imageElementSchema = z.object({
  ...baseElementShape,
  type: z.literal('image'),
  assetId: id,
  crop: normalizedRectSchema,
  filters: imageFiltersSchema,
  flipX: z.boolean(),
  flipY: z.boolean(),
  borderRadius: z.number().min(0),
  /** Description for screen readers in the exported book; empty = decorative. */
  alt: z.string().max(500).optional(),
  /** Makes this image an instance of a book-level character (pivot, shadow, idle motion). */
  characterId: id.optional(),
  /** Per-instance idle motion ('none' turns it off); defaults to the character's idle. */
  idleOverride: presetIdSchema.optional(),
});

export const shapeElementSchema = z.object({
  ...baseElementShape,
  type: z.literal('shape'),
  shape: z.enum(['rect', 'ellipse', 'line']),
  fill: cssColor,
  stroke: cssColor.optional(),
  strokeWidth: z.number().min(0).max(200),
  cornerRadius: z.number().min(0),
});

export const BUTTON_ICONS = [
  'arrowRight',
  'arrowLeft',
  'home',
  'restart',
  'star',
  'heart',
  'question',
  'check',
  'play',
  'soundOn',
  'soundOff',
  'paw',
] as const;

export const buttonStyleSchema = z.object({
  fontFamily: fontId,
  fontSize: z.number().min(4).max(400),
  fontWeight: z.number().int().min(100).max(900),
  textColor: cssColor,
  fill: cssColor,
  borderColor: cssColor.optional(),
  borderWidth: z.number().min(0).max(40),
  radius: z.number().min(0).max(1000),
  shadow: z.boolean(),
});

export const buttonElementSchema = z.object({
  ...baseElementShape,
  type: z.literal('button'),
  label: z.string().max(60),
  icon: z.enum(BUTTON_ICONS).optional(),
  iconPosition: z.enum(['start', 'end', 'only']),
  style: buttonStyleSchema,
});

/** An invisible tap area (outlined in the editor, invisible but focusable in the reader). */
export const hotspotElementSchema = z.object({
  ...baseElementShape,
  type: z.literal('hotspot'),
});

export const BUBBLE_SHAPES = ['speech', 'thought', 'shout', 'whisper', 'caption'] as const;

/**
 * A speech bubble: text in a balloon whose tail points at its speaker. Attached to an element
 * (usually a character), the tail follows it and — with moveWithSpeaker — so does the bubble.
 */
export const bubbleElementSchema = z.object({
  ...baseElementShape,
  type: z.literal('bubble'),
  content: z.array(paragraphSchema),
  style: textStyleSchema,
  bubble: z.object({
    shape: z.enum(BUBBLE_SHAPES),
    fill: cssColor,
    stroke: cssColor.optional(),
    strokeWidth: z.number().min(0).max(40),
  }),
  tail: z.object({
    /** The element the tail points at (a character instance, usually). */
    targetId: id.optional(),
    /** Where on the target (0–1 of its box; default: the top of a character's artwork). */
    anchor: z.object({ x: unit, y: unit }),
    /** Tail tip in the bubble's own coordinates, used when the tail isn't attached. */
    tip: z.object({ x: z.number(), y: z.number() }),
    width: z.number().min(4).max(200),
  }),
  /** The character speaking (for "Pip says: …"). */
  speakerId: id.optional(),
  moveWithSpeaker: z.boolean(),
  /** Voiceover heard when the bubble appears. */
  voice: voiceLineSchema.optional(),
});

/** Every element that isn't a group. */
export const leafElementSchema = z.discriminatedUnion('type', [
  textElementSchema,
  imageElementSchema,
  shapeElementSchema,
  buttonElementSchema,
  hotspotElementSchema,
  bubbleElementSchema,
]);

/** Deepest allowed nesting of groups (a group inside a group inside a group). */
export const MAX_GROUP_DEPTH = 3;

const groupBaseSchema = z.object({ ...baseElementShape, type: z.literal('group') });

/**
 * A group: its children move, resize, rotate and animate as one. Children are positioned in
 * the group's own coordinates (0,0 = the group's top-left, before its rotation), and the
 * group's box is always the bounds of its children.
 */
export type GroupElementData = z.infer<typeof groupBaseSchema> & { children: PageElementData[] };
export type PageElementData = z.infer<typeof leafElementSchema> | GroupElementData;

export const groupElementSchema: z.ZodType<GroupElementData> = groupBaseSchema.extend({
  children: z.lazy(() => z.array(pageElementSchema).min(1).max(200)),
});

export const pageElementSchema: z.ZodType<PageElementData> = z.lazy(() =>
  z.union([leafElementSchema, groupElementSchema]),
);

// ─── Animation ─────────────────────────────────────────────────────────────────

export const ANIMATION_TRIGGERS = [
  'onPageEnter',
  'withPrevious',
  'afterPrevious',
  'onClick',
  /** Not part of the click sequence: only plays when an interaction's playStep action runs. */
  'onInteraction',
] as const;
export const ANIMATION_KINDS = ['entrance', 'emphasis', 'exit'] as const;

export const TRACK_PROPERTIES = ['x', 'y', 'rotate', 'scaleX', 'scaleY', 'opacity'] as const;

/** One keyframe of a custom track. `t` is 0–1 of the step duration; `easing` leads to the next. */
export const trackKeyframeSchema = z.object({
  t: unit,
  v: z.number().min(-10000).max(10000),
  easing: z.string().max(40).optional(),
});

export const keyframeTrackSchema = z.object({
  property: z.enum(TRACK_PROPERTIES),
  keyframes: z.array(trackKeyframeSchema).min(1).max(64),
});

export const animationStepSchema = z.object({
  id,
  elementId: id,
  kind: z.enum(ANIMATION_KINDS),
  preset: presetIdSchema,
  trigger: z.enum(ANIMATION_TRIGGERS),
  duration: z.number().min(0).max(60000), // ms
  delay: z.number().min(0).max(60000), // ms
  easing: z.string().max(40),
  params: z.record(z.string(), z.union([z.number(), z.string(), z.boolean()])).optional(),
  /** Repeat until the reader leaves the page. */
  loop: z.boolean().optional(),
  /** Custom property tracks (only for the `keyframes` preset). */
  tracks: z.array(keyframeTrackSchema).max(8).optional(),
});

export const PAGE_TRANSITIONS = ['none', 'fade', 'slide', 'flip', 'zoom', 'curl'] as const;

export const pageTransitionSchema = z.object({
  preset: z.enum(PAGE_TRANSITIONS),
  duration: z.number().min(0).max(10000), // ms
});

// ─── Pages ─────────────────────────────────────────────────────────────────────

export const pageBackgroundSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('color'), color: cssColor }),
  z.object({
    type: z.literal('gradient'),
    from: cssColor,
    to: cssColor,
    angle: z.number(),
  }),
  z.object({
    type: z.literal('image'),
    assetId: id,
    fit: z.enum(['cover', 'contain']),
    color: cssColor,
  }),
]);

export const pageSchema = z.object({
  id,
  background: pageBackgroundSchema,
  elements: z.array(pageElementSchema), // array order = z-order (last is on top)
  animations: z.array(animationStepSchema), // ordered, like the PowerPoint Animation Pane
  transition: pageTransitionSchema,
  notes: z.string().max(20000).optional(),
  /** Where "next" goes, and whether it is locked until an unlock action runs. */
  flow: z
    .object({
      next: z.union([id, z.literal('end')]).optional(),
      lockNext: z.boolean(),
    })
    .optional(),
  /** "Find 3 stars": collect actions count toward it; reaching it unlocks next. */
  goal: z.object({ count: z.number().int().min(1).max(20), label: z.string().max(60) }).optional(),
  /** Voiceover played when the page opens. */
  voiceover: voiceLineSchema.optional(),
  /** A sound effect played when the page opens. */
  openSound: id.optional(),
});

// ─── Project ───────────────────────────────────────────────────────────────────

export const exportSettingsSchema = z.object({
  format: z.enum(['html', 'zip']),
  showBadge: z.boolean(),
});

// ─── Characters ────────────────────────────────────────────────────────────────

export const characterPoseSchema = z.object({ id, name: z.string().max(40), assetId: id });

/** A book-level character: one image, shared settings, reused on any number of pages. */
export const characterSchema = z.object({
  id,
  name: z.string().max(60),
  assetId: id,
  /** Where it stands (its feet), in 0–1 coordinates of the image. */
  pivot: z.object({ x: unit, y: unit }),
  /** Which way the artwork faces. */
  facing: z.enum(['left', 'right']),
  shadow: z.object({ enabled: z.boolean(), opacity: unit, size: z.number().min(0.2).max(2) }),
  idle: z.object({ preset: presetIdSchema, intensity: z.number().min(0).max(2) }).nullable(),
  /** Render as strips so bending motions (sway, jelly, lean) can deform it. */
  warp: z.boolean(),
  poses: z.array(characterPoseSchema).max(8),
});

export const readerSettingsSchema = z.object({
  tapToAdvance: z.boolean(),
  showNavButtons: z.boolean(),
  showPageMenu: z.boolean(),
  rememberPosition: z.boolean(),
  hints: z.boolean(),
  /** Played when the reader turns a page (after their first tap or key press). */
  pageTurnSound: id.optional(),
});

export const projectSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  id,
  title: z.string().max(200),
  author: z.string().max(200).optional(),
  description: z.string().max(2000).optional(),
  pageSize: pageSizeSchema,
  theme: themeSchema,
  pages: z.array(pageSchema).min(1),
  assets: z.record(z.string(), assetRefSchema),
  characters: z.record(z.string(), characterSchema),
  reader: readerSettingsSchema,
  sounds: z.record(id, soundRefSchema),
  voiceover: voiceoverSchema,
  /** The language the book is written in: `lang` of every page (hyphenation, screen readers). */
  language: languageCodeSchema,
  exportSettings: exportSettingsSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
});

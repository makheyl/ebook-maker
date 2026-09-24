import type { z } from 'zod';
import type {
  ANIMATION_KINDS,
  ANIMATION_TRIGGERS,
  BURST_EFFECTS,
  BUTTON_ICONS,
  PAGE_TRANSITIONS,
  TRACK_PROPERTIES,
  buttonElementSchema,
  buttonStyleSchema,
  characterPoseSchema,
  characterSchema,
  hotspotElementSchema,
  interactionSchema,
  keyframeTrackSchema,
  readerSettingsSchema,
  storyActionSchema,
  trackKeyframeSchema,
  animationStepSchema,
  assetRefSchema,
  soundRefSchema,
  SOUND_MIMES,
  exportSettingsSchema,
  imageElementSchema,
  imageFiltersSchema,
  normalizedRectSchema,
  pageBackgroundSchema,
  pageElementSchema,
  pageSchema,
  pageSizeSchema,
  pageTransitionSchema,
  paragraphSchema,
  projectSchema,
  shapeElementSchema,
  textElementSchema,
  textRunSchema,
  textShadowSchema,
  textStyleSchema,
  themeSchema,
  GroupElementData,
} from './project';

export type Project = z.infer<typeof projectSchema>;
export type PageSize = z.infer<typeof pageSizeSchema>;
export type Theme = z.infer<typeof themeSchema>;
export type AssetRef = z.infer<typeof assetRefSchema>;
export type SoundRef = z.infer<typeof soundRefSchema>;
export type SoundMime = (typeof SOUND_MIMES)[number];
export type Page = z.infer<typeof pageSchema>;
export type PageBackground = z.infer<typeof pageBackgroundSchema>;
export type PageTransition = z.infer<typeof pageTransitionSchema>;
export type TransitionPreset = (typeof PAGE_TRANSITIONS)[number];
export type ExportSettings = z.infer<typeof exportSettingsSchema>;

/** Named PageElement (not Element) to avoid clashing with the DOM's global Element type. */
export type PageElement = z.infer<typeof pageElementSchema>;
export type ElementType = PageElement['type'];
export type TextElement = z.infer<typeof textElementSchema>;
export type ImageElement = z.infer<typeof imageElementSchema>;
export type ShapeElement = z.infer<typeof shapeElementSchema>;
export type ButtonElement = z.infer<typeof buttonElementSchema>;
export type ButtonStyle = z.infer<typeof buttonStyleSchema>;
export type ButtonIcon = (typeof BUTTON_ICONS)[number];
export type HotspotElement = z.infer<typeof hotspotElementSchema>;
export type GroupElement = GroupElementData;
/** Elements that aren't groups. */
export type LeafElement = Exclude<PageElement, GroupElement>;
export type TextRun = z.infer<typeof textRunSchema>;
export type Paragraph = z.infer<typeof paragraphSchema>;
export type TextStyle = z.infer<typeof textStyleSchema>;
export type TextShadow = z.infer<typeof textShadowSchema>;
export type ImageFilters = z.infer<typeof imageFiltersSchema>;
export type NormalizedRect = z.infer<typeof normalizedRectSchema>;

export type AnimationStep = z.infer<typeof animationStepSchema>;
export type AnimationKind = (typeof ANIMATION_KINDS)[number];
export type AnimationTrigger = (typeof ANIMATION_TRIGGERS)[number];
export type TrackProperty = (typeof TRACK_PROPERTIES)[number];
export type TrackKeyframe = z.infer<typeof trackKeyframeSchema>;
export type KeyframeTrack = z.infer<typeof keyframeTrackSchema>;

export type StoryAction = z.infer<typeof storyActionSchema>;
export type Interaction = z.infer<typeof interactionSchema>;
export type BurstEffect = (typeof BURST_EFFECTS)[number];

export type Character = z.infer<typeof characterSchema>;
export type CharacterPose = z.infer<typeof characterPoseSchema>;
export type ReaderSettings = z.infer<typeof readerSettingsSchema>;
export type PageFlow = NonNullable<Page['flow']>;
export type PageGoal = NonNullable<Page['goal']>;

/** The geometric fields every element shares. */
export type ElementGeometry = Pick<PageElement, 'x' | 'y' | 'width' | 'height' | 'rotation'>;

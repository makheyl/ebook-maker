import { newId } from '../ids';
import {
  DEFAULT_BUTTON_STYLE,
  DEFAULT_EXPORT_SETTINGS,
  DEFAULT_FILTERS,
  DEFAULT_READER,
  DEFAULT_TEXT_STYLE,
  DEFAULT_THEME,
  DEFAULT_TRANSITION,
  FULL_CROP,
} from './defaults';
import { getPageSizePreset, DEFAULT_PAGE_SIZE_ID } from './page-sizes';
import { SCHEMA_VERSION } from './project';
import { paragraphsFromPlainText } from './text';
import type {
  AssetRef,
  BubbleElement,
  BubbleShape,
  ButtonElement,
  ButtonStyle,
  HotspotElement,
  ImageElement,
  Page,
  PageSize,
  Project,
  ShapeElement,
  TextElement,
  TextStyle,
  Theme,
} from './types';

export function nowIso(): string {
  return new Date().toISOString();
}

export function createPage(theme: Theme = DEFAULT_THEME, overrides: Partial<Page> = {}): Page {
  return {
    id: newId('pg'),
    background: { type: 'color', color: theme.background },
    elements: [],
    animations: [],
    transition: { ...DEFAULT_TRANSITION },
    ...overrides,
  };
}

export function createProject(
  opts: { title?: string; pageSize?: PageSize; theme?: Partial<Theme>; pages?: Page[] } = {},
): Project {
  const theme = { ...DEFAULT_THEME, ...opts.theme };
  const { width, height } = opts.pageSize ?? getPageSizePreset(DEFAULT_PAGE_SIZE_ID);
  const now = nowIso();
  return {
    schemaVersion: SCHEMA_VERSION,
    id: newId('bk'),
    title: opts.title?.trim() || 'Untitled book',
    pageSize: { width, height },
    theme,
    pages: opts.pages?.length ? opts.pages : [createPage(theme)],
    assets: {},
    characters: {},
    reader: { ...DEFAULT_READER },
    sounds: {},
    voiceover: { languages: [] },
    language: 'en',
    music: { tracks: {}, sections: [], ducking: true, crossfadeMs: 1500 },
    exportSettings: { ...DEFAULT_EXPORT_SETTINGS },
    createdAt: now,
    updatedAt: now,
  };
}

type Box = { x: number; y: number; width: number; height: number };

export function createTextElement(
  text: string,
  box: Box,
  overrides: Partial<Omit<TextElement, 'type' | 'style'>> & { style?: Partial<TextStyle> } = {},
): TextElement {
  return {
    id: newId('el'),
    type: 'text',
    name: text.trim().slice(0, 32) || 'Text',
    rotation: 0,
    opacity: 1,
    locked: false,
    hidden: false,
    content: paragraphsFromPlainText(text),
    ...box,
    ...overrides,
    style: { ...DEFAULT_TEXT_STYLE, ...overrides.style },
  };
}

/** Fits an image into `bounds` (contain) unless an explicit box is given. */
export function createImageElement(
  asset: Pick<AssetRef, 'id' | 'width' | 'height' | 'name'>,
  bounds: Box,
  overrides: Partial<Omit<ImageElement, 'type' | 'assetId'>> = {},
  fit: 'contain' | 'exact' = 'contain',
): ImageElement {
  let box = bounds;
  if (fit === 'contain') {
    const scale = Math.min(bounds.width / asset.width, bounds.height / asset.height);
    const width = asset.width * scale;
    const height = asset.height * scale;
    box = {
      x: bounds.x + (bounds.width - width) / 2,
      y: bounds.y + (bounds.height - height) / 2,
      width,
      height,
    };
  }
  return {
    id: newId('el'),
    type: 'image',
    name: asset.name?.replace(/\.[a-z0-9]+$/i, '').slice(0, 32) || 'Image',
    rotation: 0,
    opacity: 1,
    locked: false,
    hidden: false,
    assetId: asset.id,
    crop: { ...FULL_CROP },
    filters: { ...DEFAULT_FILTERS },
    flipX: false,
    flipY: false,
    borderRadius: 0,
    ...box,
    ...overrides,
  };
}

export function createShapeElement(
  shape: ShapeElement['shape'],
  box: Box,
  overrides: Partial<Omit<ShapeElement, 'type' | 'shape'>> = {},
): ShapeElement {
  const names = { rect: 'Rectangle', ellipse: 'Ellipse', line: 'Line' } as const;
  return {
    id: newId('el'),
    type: 'shape',
    shape,
    name: names[shape],
    rotation: 0,
    opacity: 1,
    locked: false,
    hidden: false,
    fill: shape === 'line' ? 'transparent' : '#bfe3f7',
    stroke: shape === 'line' ? '#1f1d2b' : undefined,
    strokeWidth: shape === 'line' ? 6 : 0,
    cornerRadius: 0,
    ...box,
    ...overrides,
  };
}

export function createButtonElement(
  label: string,
  box: Box,
  overrides: Partial<Omit<ButtonElement, 'type' | 'style'>> & { style?: Partial<ButtonStyle> } = {},
): ButtonElement {
  return {
    id: newId('el'),
    type: 'button',
    name: label.trim().slice(0, 32) || 'Button',
    rotation: 0,
    opacity: 1,
    locked: false,
    hidden: false,
    label,
    iconPosition: 'end',
    interactions: [],
    ...box,
    ...overrides,
    style: { ...DEFAULT_BUTTON_STYLE, ...overrides.style },
  };
}

export function createHotspotElement(
  box: Box,
  overrides: Partial<Omit<HotspotElement, 'type'>> = {},
): HotspotElement {
  return {
    id: newId('el'),
    type: 'hotspot',
    name: 'Tap area',
    rotation: 0,
    opacity: 1,
    locked: false,
    hidden: false,
    interactions: [],
    ...box,
    ...overrides,
  };
}

/** Starting looks for each bubble shape (the Insert gallery and the shape picker use these). */
export const BUBBLE_LOOKS: Record<
  BubbleShape,
  { label: string; bubble: BubbleElement['bubble']; style: Partial<TextStyle> }
> = {
  speech: {
    label: 'Speech',
    bubble: { shape: 'speech', fill: '#ffffff', stroke: '#1f1d2b', strokeWidth: 4 },
    style: {},
  },
  thought: {
    label: 'Thought',
    bubble: { shape: 'thought', fill: '#ffffff', stroke: '#1f1d2b', strokeWidth: 4 },
    style: { italic: true },
  },
  shout: {
    label: 'Shout',
    bubble: { shape: 'shout', fill: '#fff3a6', stroke: '#1f1d2b', strokeWidth: 5 },
    style: { fontWeight: 800 },
  },
  whisper: {
    label: 'Whisper',
    bubble: { shape: 'whisper', fill: '#ffffff', stroke: '#6b6880', strokeWidth: 3 },
    style: { italic: true, color: '#4b4860' },
  },
  caption: {
    label: 'Caption',
    bubble: { shape: 'caption', fill: '#fff8e1', stroke: '#1f1d2b', strokeWidth: 3 },
    style: { align: 'left' },
  },
};

/** A speech bubble; its tail points down-left of it until it's attached to a speaker. */
export function createBubbleElement(
  text: string,
  box: Box,
  shape: BubbleShape = 'speech',
  overrides: Partial<Omit<BubbleElement, 'type' | 'style'>> & { style?: Partial<TextStyle> } = {},
): BubbleElement {
  const look = BUBBLE_LOOKS[shape];
  return {
    id: newId('el'),
    type: 'bubble',
    name: text.trim().slice(0, 32) || `${look.label} bubble`,
    rotation: 0,
    opacity: 1,
    locked: false,
    hidden: false,
    content: paragraphsFromPlainText(text),
    bubble: { ...look.bubble },
    tail: {
      anchor: { x: 0.5, y: 0 },
      tip: { x: Math.round(box.width * 0.3), y: Math.round(box.height * 1.5) },
      width: Math.round(Math.max(20, Math.min(48, box.width * 0.1))),
    },
    moveWithSpeaker: true,
    ...box,
    ...overrides,
    style: {
      ...DEFAULT_TEXT_STYLE,
      fontSize: 40,
      align: 'center',
      verticalAlign: 'middle',
      padding: 24,
      lineHeight: 1.2,
      autofit: 'shrink',
      ...look.style,
      ...overrides.style,
    },
  };
}

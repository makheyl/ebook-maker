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
    fill: shape === 'line' ? 'transparent' : '#c9bfff',
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

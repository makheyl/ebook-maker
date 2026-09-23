import { DEFAULT_FONT_ID } from '../fonts/catalog';
import type {
  ExportSettings,
  ImageFilters,
  NormalizedRect,
  PageTransition,
  TextStyle,
  Theme,
} from './types';

export const DEFAULT_THEME: Theme = {
  fontFamily: DEFAULT_FONT_ID,
  background: '#ffffff',
  textColor: '#1f1d2b',
  accent: '#6d4aff',
};

export const DEFAULT_TEXT_STYLE: TextStyle = {
  fontFamily: DEFAULT_FONT_ID,
  fontSize: 56,
  fontWeight: 400,
  italic: false,
  color: DEFAULT_THEME.textColor,
  align: 'left',
  verticalAlign: 'top',
  lineHeight: 1.3,
  letterSpacing: 0,
  padding: 0,
};

export const DEFAULT_FILTERS: ImageFilters = {
  brightness: 1,
  contrast: 1,
  saturate: 1,
  blur: 0,
  grayscale: 0,
  sepia: 0,
  hueRotate: 0,
};

export const FULL_CROP: NormalizedRect = { x: 0, y: 0, width: 1, height: 1 };

export const DEFAULT_TRANSITION: PageTransition = { preset: 'fade', duration: 500 };

export const DEFAULT_EXPORT_SETTINGS: ExportSettings = { format: 'html', showBadge: true };

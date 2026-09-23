import type {
  AnimationStep,
  AssetRef,
  PageBackground,
  PageElement,
  PageSize,
} from '../schema/types';

export type PagePalette = {
  id: string;
  label: string;
  background: string;
  text: string;
  accent: string;
};

export type LayoutInput = {
  text: string;
  asset?: AssetRef;
  pageSize: PageSize;
  palette: PagePalette;
  fontId: string;
  /** Add the template's suggested animations. */
  animate: boolean;
};

export type LayoutResult = {
  background: PageBackground;
  elements: PageElement[];
  animations: AnimationStep[];
};

/**
 * A quick-create layout. Adding a template = one file in layouts/ exporting this, listed in
 * the registry. Output is ordinary, fully editable elements.
 */
export type LayoutTemplate = {
  id: string;
  label: string;
  description: string;
  /** Whether the layout needs an image (rows without one fall back to the text layout). */
  usesImage: boolean;
  build(input: LayoutInput): LayoutResult;
};

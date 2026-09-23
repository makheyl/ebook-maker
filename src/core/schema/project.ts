import { z } from 'zod';

/**
 * The project JSON is the single source of truth. Everything here must stay plain,
 * serializable data: the editor edits it, the renderer draws it, the exporter packages it.
 *
 * Bump SCHEMA_VERSION whenever the shape changes, and add a migration in core/migrations.
 */
export const SCHEMA_VERSION = 1;

const id = z.string().min(1).max(64);

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
  align: z.enum(['left', 'center', 'right']),
  verticalAlign: z.enum(['top', 'middle', 'bottom']),
  lineHeight: z.number().min(0.5).max(4),
  letterSpacing: z.number().min(-50).max(200),
  background: cssColor.optional(),
  padding: z.number().min(0).max(500),
  shadow: textShadowSchema.optional(),
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

export const pageElementSchema = z.discriminatedUnion('type', [
  textElementSchema,
  imageElementSchema,
  shapeElementSchema,
]);

// ─── Animation ─────────────────────────────────────────────────────────────────

export const ANIMATION_TRIGGERS = [
  'onPageEnter',
  'withPrevious',
  'afterPrevious',
  'onClick',
] as const;
export const ANIMATION_KINDS = ['entrance', 'emphasis', 'exit'] as const;

export const animationStepSchema = z.object({
  id,
  elementId: id,
  kind: z.enum(ANIMATION_KINDS),
  preset: z.string().regex(/^[a-zA-Z0-9]{1,40}$/),
  trigger: z.enum(ANIMATION_TRIGGERS),
  duration: z.number().min(0).max(60000), // ms
  delay: z.number().min(0).max(60000), // ms
  easing: z.string().max(40),
  params: z.record(z.string(), z.union([z.number(), z.string(), z.boolean()])).optional(),
});

export const PAGE_TRANSITIONS = ['none', 'fade', 'slide', 'flip', 'zoom'] as const;

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
});

// ─── Project ───────────────────────────────────────────────────────────────────

export const exportSettingsSchema = z.object({
  format: z.enum(['html', 'zip']),
  showBadge: z.boolean(),
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
  exportSettings: exportSettingsSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
});

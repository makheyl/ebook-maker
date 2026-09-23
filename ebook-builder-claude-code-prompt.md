# Build Prompt: Interactive Ebook Builder (Canva/PPT-style editor → playable HTML export)

## Your role

You are a senior full-stack SaaS engineer with deep experience building browser-based visual editors (think Canva, Pitch, Figma-lite). You make pragmatic, well-reasoned architecture decisions, favor proven libraries over reinventing engines, keep the codebase clean and typed, and ship in working vertical slices. When a decision has real trade-offs, you state them briefly, pick a default, and move on — you only stop to ask me when the choice is truly mine (product direction, naming, paid services).

**Before writing any code:** enter plan mode, read this whole document, and give me (1) a short architecture summary, (2) the folder structure, (3) the milestone plan with acceptance criteria, and (4) any questions from the "Open decisions" section you need answered. Wait for my approval, then build milestone by milestone.

---

## 1. Product vision

A web app for creating **interactive, animated ebooks**. It works like a simplified Canva/PowerPoint, but everything is built around **book pages** instead of slides or general designs.

A user can:

1. **Quick-create** a book: upload one line of text + one image per page (or bulk upload), and the app auto-generates laid-out pages.
2. **Edit each page visually**: move, resize, rotate, and layer text and images freely; edit text styling; edit images (crop, filters, adjustments).
3. **Animate**: add entrance / emphasis / exit animations to any element, with timing and order — like PowerPoint's Animation Pane — plus page-turn transitions.
4. **Preview** the book exactly as a reader will see it.
5. **Export to a standalone HTML file** that anyone can open by double-clicking — works offline, with no install, no server, and no account — and read/play like a book (page navigation + animations).

The exported file is the product's payoff. **What the user sees in the editor preview must look and behave the same as the exported file.**

---

## 2. Core architecture principles (non-negotiable)

1. **A single source of truth: the project JSON.** Everything the user builds is plain, serializable, versioned data. The editor edits the data; the renderer draws the data; the exporter packages the data. No state lives only in the DOM or in a canvas library's internal objects.

2. **One shared renderer for editor, preview, and export.** Render pages as **DOM elements** (absolutely positioned inside a fixed-size "stage" scaled to fit the viewport), not as a `<canvas>` bitmap. Reasons: the export is HTML anyway, text stays real, selectable and accessible, fonts look sharp at any zoom level, and one `PageRenderer` component guarantees the editor and the exported file match. The editor wraps the renderer with selection and transform handles; the player wraps it with navigation.
   - Use **react-moveable** (+ **selecto** for marquee/multi-select) for drag, resize, rotate, snapping, and guides.
   - Do NOT use Fabric.js or Konva for the page itself. If you strongly disagree, argue it in plan mode before building.

3. **One shared animation runtime.** Animations are stored as data (preset name + params) and turned into **GSAP** timelines by one module used by both the editor preview and the exported player. (GSAP is free for commercial use, including its plugins.)

4. **Non-destructive image editing.** Keep the original image. Store crop rect, filters (brightness, contrast, saturation, blur, grayscale, sepia, hue-rotate), flip, and border radius as parameters, and apply them with CSS (`object-fit`/`object-position`/`clip-path`/`filter`). Only "bake" to a new bitmap when it's genuinely needed.

5. **Local-first now, cloud-ready later.** The MVP stores everything in the browser (IndexedDB). Put all persistence behind a `ProjectRepository` interface so a cloud backend (auth + database + object storage) can be added later without touching editor code.

6. **Versioned schema.** The project JSON has a `schemaVersion`, is validated with **zod**, and loads through a migrations pipeline. Exported files embed the version too.

---

## 3. Tech stack

| Concern | Choice |
|---|---|
| Build / framework | Vite + React 18+ + TypeScript (strict) |
| Styling (app UI) | Tailwind CSS + shadcn/ui (Radix primitives) |
| State | Zustand + Immer; undo/redo via `zundo` (or a patch-based history — your call, justify it) |
| Transform handles | react-moveable, selecto |
| Animation | GSAP |
| Image crop UI | react-easy-crop (or equivalent) |
| Persistence | Dexie (IndexedDB) — projects as JSON, images as Blobs in a separate table |
| Validation | zod |
| Export packaging | Inline single HTML; JSZip for the zip option |
| Testing | Vitest (unit), Playwright (E2E, including opening the exported file) |
| Lint / format | ESLint + Prettier |
| Package manager | pnpm |

---

## 4. Data model (starting point — refine it, but keep the spirit)

```ts
type Project = {
  schemaVersion: number;
  id: string;
  title: string;
  author?: string;
  pageSize: { width: number; height: number }; // logical px, e.g. 1080x1350 (portrait) or 1600x900
  theme: { fontFamily: string; background: string; accent: string };
  pages: Page[];
  assets: Record<string, AssetRef>;             // assetId -> metadata; blobs stored separately
  createdAt: string; updatedAt: string;
};

type Page = {
  id: string;
  background: { type: 'color' | 'image' | 'gradient'; value: string; assetId?: string };
  elements: Element[];                           // array order = z-order
  animations: AnimationStep[];                   // ordered, like the PPT Animation Pane
  transition: { preset: 'none' | 'fade' | 'slide' | 'flip' | 'zoom'; duration: number };
  notes?: string;
};

type BaseElement = {
  id: string; name: string;
  x: number; y: number; width: number; height: number; rotation: number;
  opacity: number; locked: boolean; hidden: boolean;
};

type TextElement = BaseElement & {
  type: 'text';
  content: string;                               // limited rich text; store a safe structured format, not raw HTML
  style: { fontFamily: string; fontSize: number; fontWeight: number; italic: boolean;
           color: string; align: 'left' | 'center' | 'right'; lineHeight: number;
           letterSpacing: number; background?: string; shadow?: string };
};

type ImageElement = BaseElement & {
  type: 'image';
  assetId: string;
  crop: { x: number; y: number; width: number; height: number };  // normalized 0..1
  filters: { brightness: number; contrast: number; saturate: number; blur: number;
             grayscale: number; sepia: number; hueRotate: number };
  flipX: boolean; flipY: boolean; borderRadius: number;
};

type ShapeElement = BaseElement & { type: 'shape'; shape: 'rect' | 'ellipse' | 'line'; fill: string; stroke?: string };

type Element = TextElement | ImageElement | ShapeElement;

type AnimationStep = {
  id: string;
  elementId: string;
  kind: 'entrance' | 'emphasis' | 'exit';
  preset: string;          // e.g. 'fadeIn', 'slideUp', 'zoomIn', 'typewriter', 'pulse', 'kenBurns', 'fadeOut'
  trigger: 'onPageEnter' | 'withPrevious' | 'afterPrevious' | 'onClick';
  duration: number; delay: number; easing: string;
  params?: Record<string, unknown>;
};
```

Animation presets live in a **registry** (`presets/*.ts`). Each preset exports `{ id, label, kind, defaults, build(el, gsapTimeline, params) }`, so adding a new animation means adding one file.

---

## 5. Feature scope

### MVP (build this)

**Dashboard**
- List projects (thumbnail, title, updated date); create, rename, duplicate, delete.

**Quick-create wizard**
- Pick a page size preset (Portrait book, Square, Landscape).
- Add pages as rows of *text line + image*, one at a time or in bulk: drop multiple images plus paste multi-line text, then pair them by order with a reorderable preview before confirming.
- Pick a layout template (e.g. image top/text bottom, full-bleed image with text overlay, side-by-side). Pages are generated from it as normal, fully editable elements.

**Editor**
- Left: page thumbnails sidebar (add, duplicate, delete, drag to reorder).
- Center: stage with zoom (fit / 50–200%), selection, multi-select, drag/resize/rotate, snapping to edges, centers and other elements, and alignment guides.
- Right: context-sensitive properties panel (position/size, text styling, image adjustments, layer order, lock/hide).
- Top bar: title, undo/redo, preview, export, save status.
- Insert: text box, image (upload / drag-drop / paste), basic shapes.
- Layers: bring forward/back, lock, hide.
- Image tools: replace, crop, filters/adjustments with live preview, flip, corner radius, reset.
- Text: inline editing on double-click, font family (curated list of ~10 bundled fonts), size, weight, italic, color, alignment, line height, letter spacing.
- Keyboard shortcuts: delete, duplicate (Cmd/Ctrl+D), copy/paste, undo/redo, arrow-key nudge (Shift = 10px), Esc to deselect.
- Autosave (debounced) + "Saved / Saving…" indicator.

**Animation Pane**
- Per-page ordered list of animation steps (like PowerPoint's Animation Pane): add an animation to the selected element, choose a preset, trigger, duration, delay and easing, drag to reorder, and preview a single step or the whole page.
- About 10 quality presets to start: fadeIn, slideUp, slideLeft, zoomIn, popIn, typewriter (text only), kenBurns (image only), pulse (emphasis), fadeOut, slideOutDown.
- Page transition picker (none, fade, slide, flip, zoom).

**Preview / Player**
- Full-screen reader mode using the same renderer + animation runtime as the export.
- Navigation: next/prev buttons, arrow keys, swipe, click-to-advance for `onClick` triggers, page indicator, progress bar, fullscreen toggle.
- Respects `prefers-reduced-motion` (skip or shorten animations).
- Stage scales to fit any screen while keeping the aspect ratio (letterboxed).

**Export**
- **Single-file HTML** (default): one `.html` containing the player runtime (inlined JS/CSS), project JSON in a `<script type="application/json">` tag, images as base64 data URIs, and used fonts embedded as base64 woff2. Opens offline by double-click in any modern browser and makes zero network requests.
- **Zip** option: `index.html` + `assets/` folder (smaller, better for many images or web hosting).
- Show an estimated file size before exporting, and warn above ~25 MB.
- Include the book title in the `<title>` tag and basic meta tags.

### Explicitly later (design for it, don't build it)
Accounts, cloud sync and sharing links; real-time collaboration; audio/narration per page; video elements; EPUB3 export; PDF export; template marketplace; brand kits; AI helpers (auto-layout, text generation, image generation); comments; analytics on exported books; page-curl 3D transitions; in-book quizzes and hotspots.

---

## 6. The export pipeline (get this right)

- Build the **player** as a separate Vite entry (`src/player/main.ts`) compiled in library/IIFE mode into a single JS bundle + CSS. The player must NOT include editor code (React may be used only if the bundle stays small; otherwise use a vanilla-TS player that reuses the pure rendering/animation modules). Target a player bundle under ~150 KB gzipped, excluding assets.
- Keep rendering logic and animation logic in **framework-agnostic modules** (`src/core/render`, `src/core/animation`) that both the React editor and the player import. This is how editor/export parity is guaranteed.
- The app imports the built player as a raw string at build time and stitches it into an HTML template at export time.
- Exported HTML structure:
  ```html
  <!doctype html><html><head><meta charset="utf-8"><title>{title}</title>
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <style>/* player css + @font-face with base64 fonts */</style></head>
  <body><div id="book"></div>
  <script type="application/json" id="book-data">{project json with data-URI assets}</script>
  <script>/* player runtime */</script></body></html>
  ```
- Escape the embedded JSON safely (no `</script>` injection). Sanitize all user text on render (no raw `innerHTML` from user content).
- **Verify it with an E2E test:** create a project → export → load the exported file via `file://` in Playwright → assert page 1 renders, animations run, next-page navigation works, and no network requests were made.

---

## 7. Image handling and performance

- On upload: decode with `createImageBitmap`, downscale to at most 2400 px on the long edge, re-encode as WebP (quality ~0.85; fall back to JPEG/PNG and keep PNG for transparency), store as a Blob in IndexedDB, and generate a small thumbnail.
- Deduplicate assets by content hash.
- Editor should stay responsive with 100+ pages: virtualize the page sidebar, render only the active page on the stage, and generate thumbnails lazily.
- The player preloads the next 1–2 pages' images.

---

## 8. Quality bar

- TypeScript strict, no `any` without a comment explaining why.
- Clear module boundaries: `core/` (pure logic: schema, render, animation, export, migrations), `editor/` (React UI), `player/` (runtime entry), `storage/` (repositories), `ui/` (shared components).
- Unit tests for: schema validation + migrations, the animation preset registry, export packaging (JSON escaping, asset inlining, size estimate), and undo/redo on core operations.
- Playwright E2E for: quick-create flow, editing + autosave + reload persistence, and the export round-trip described above.
- Accessibility: keyboard-operable editor controls, visible focus states, ARIA labels on icon buttons; the exported player is keyboard-navigable and exposes page text to screen readers.
- A clean, modern, minimal UI — take cues from Canva/Pitch, not a developer tool. Light and dark themes.
- A README with setup, scripts, an architecture overview (with a simple diagram) and "how to add an animation preset / layout template".

---

## 9. Milestones (build in this order; each ends in a working, demoable state + a commit)

0. **Scaffold** — Vite/React/TS, Tailwind + shadcn, lint/format, Vitest + Playwright wired up, folder structure, CI-ready scripts.
1. **Core model** — zod schema, types, factories, migrations skeleton, Zustand store with undo/redo, Dexie repositories, dashboard CRUD.
2. **Renderer + stage** — shared `core/render` producing DOM for a page; editor stage with zoom/fit; page sidebar.
3. **Editing** — insert text/image/shape; select/multi-select/transform with react-moveable + selecto; snapping and guides; properties panel; layers; shortcuts; autosave.
4. **Image tools** — upload pipeline (downscale/WebP/dedupe), crop UI, filters/adjustments, flip, radius, replace.
5. **Animation system** — preset registry, GSAP timeline builder in `core/animation`, Animation Pane UI, per-step and per-page preview, page transitions.
6. **Player + preview** — framework-agnostic player runtime, in-app preview mode, navigation, reduced motion, scaling.
7. **Export** — single-file HTML + zip, size estimate, font embedding, safe JSON embedding, and the E2E export round-trip test.
8. **Quick-create wizard** — bulk text + image pairing, layout templates, page generation.
9. **Polish** — empty states, onboarding hints, error handling (corrupt project, quota exceeded), performance pass with a 100-page book, a11y pass, README.

For each milestone, first list its acceptance criteria, then build, then run the tests and show me how to verify it manually.

---

## 10. Open decisions (ask me about these in plan mode)

1. **Product name** (for the UI, the export footer and meta tags). Use a placeholder until I decide.
2. **Default page size**: portrait book (1080×1350), square (1080×1080), or landscape (1600×900)?
3. **Default export**: single-file HTML (most portable) or zip (smaller)? *Recommendation: single-file default, zip as an option.*
4. **"Made with …" badge** in exported books: on, off, or a toggle?
5. **Backend timing**: stay fully local for MVP (recommended), or wire up auth + cloud storage (e.g. Supabase) now?

---

## 11. Working agreement

- Don't silently cut scope. If something in the MVP turns out much harder than expected, tell me, propose a simpler version, and continue.
- Prefer boring, well-maintained libraries. Check licenses (MIT/Apache/free commercial use) before adding one.
- Keep commits small and scoped to one milestone, with descriptive messages.
- When done with each milestone, give me a short summary: what was built, how to test it, known limitations, and what's next.

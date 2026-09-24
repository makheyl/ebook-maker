# Import plan: open an exported book and keep editing it

> Status: **plan only**. Nothing in the app has been changed yet.
> Goal: a **Import** button that takes a book exported by Folio (the single `.html` file or the
> `.zip` folder) and turns it back into a normal, fully editable book in the dashboard. Any
> export then doubles as a **backup**.

---

## 1. The promise (acceptance criteria)

A book that goes **export → import** must come back:

1. **Identical in content.** Every page, element, animation step, timeline keyframe, character
   (pivot, idle, shadow, poses), interaction, page flow, goal, sound, reader setting, theme and
   export setting is the same as before export. Only `updatedAt` changes (and `id`/`title` when
   importing as a copy).
2. **Directly editable.** It opens in the editor like any other book. Pictures, poses and sounds
   are real stored assets: you can crop, replace, re-animate, re-export. Nothing is "flattened".
3. **Loss-free on repeat.** `export(import(export(book)))` produces the same book data and the
   same asset bytes as `export(book)`. You can round-trip forever without degrading pictures.
4. **Checked for problems.** The Interact tab's checks show nothing new after import.
5. **Offline and safe.** Import makes zero network requests and never runs the player code that
   is inside the exported file.
6. **Old files still work.** Books exported by earlier versions (schema v1 and v2) import and are
   upgraded by the existing migrations.

---

## 2. How export works today (what import has to undo)

| Piece                            | Where                                                                                                         | What it contains                                                                                                                                                                       |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Book data                        | `<script type="application/json" id="book-data">` in the HTML (`src/core/export/build.ts` → `renderBookHtml`) | A `BookData` object (`src/core/export/format.ts`): `format: 'folio-book'`, `schemaVersion`, the **complete `project` JSON**, an `assets` map `assetId → URL`, and `options.showBadge`. |
| Escaping                         | `escapeJsonForHtml` (`src/core/export/escape.ts`)                                                             | `<`, `>`, `&`, U+2028, U+2029 become `\uXXXX`. Still valid JSON; `JSON.parse` returns the exact original value.                                                                        |
| Pictures and sounds, single file | `buildSingleFile`                                                                                             | `assets[id]` = `data:<mime>;base64,…` of the **stored full-size blob** (already ≤ 2400 px WebP/PNG/JPEG; sounds as uploaded).                                                          |
| Pictures and sounds, ZIP         | `buildZip`                                                                                                    | `assets[id]` = `assets/images/<id>.<ext>` or `assets/audio/<id>.<ext>`, and the file is in the zip.                                                                                    |
| Which assets                     | `usedAssetIds` (`src/core/export/usage.ts`)                                                                   | Images on **visible** elements and backgrounds, poses of characters on visible elements, and sounds that visible elements or the page turn play.                                       |
| Fonts, player JS/CSS             | inlined                                                                                                       | Not needed for import (the app ships the same fonts and its own editor).                                                                                                               |

Storage side, for reference:

- A book is saved with `projectRepo.save(project)`; its summary lists `projectAssetIds(project)`
  so the asset garbage collector keeps those blobs (`src/storage/summary.ts`,
  `src/storage/dexie/project-repo.ts`).
- Each stored asset is `{ id, blob, thumb, mime, width, height, bytes, createdAt }`. Image ids are
  a hash of the **original upload** (`img_…`), sound ids a hash of the file (`snd_…`).
- Loading always goes through `loadProject(raw)` → migrations → zod validation →
  `repairProject` (`src/core/migrations/index.ts`).

The good news: **the export already carries the whole project JSON**, not a flattened rendering.
Import is mostly "read that JSON back, and put the blobs back in the store".

---

## 3. Compatibility gaps found (must fix for "directly editable")

| #   | Gap                                                                                                                                                | Effect if ignored                                                                  | Fix                                                                                                                                                                                                               |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| G1  | **Hidden elements' pictures are not exported** (`usedImageIds` skips `hidden`).                                                                    | After import, a hidden picture shows as "missing image" the moment you un-hide it. | Export every asset the book owns: switch the export's asset list to `projectAssetIds(project)` (already covers hidden elements, all characters, all poses and the whole sound list), filtered to refs that exist. |
| G2  | **Characters not placed on any visible page lose their artwork and poses**, and **sounds in the library that nothing plays yet are not exported**. | Imported character/sounds exist in the data but have no files.                     | Same fix as G1.                                                                                                                                                                                                   |
| G3  | **Thumbnails are not exported** (only the full blob).                                                                                              | The asset store needs a `thumb` for each image (sidebar, covers, pose list).       | Regenerate thumbnails on import from the full blob (320 px, same encoder as uploads). Sounds use the blob as their thumb, as uploads already do.                                                                  |
| G4  | **Asset ids can't be recomputed**: an image id hashes the _original_ upload, but the export holds the _processed_ blob.                            | Re-hashing on import would give new ids, breaking every reference and dedupe.      | Store each imported blob **under the id from the book data**. Never re-process or re-encode it (that would also lose quality on every round trip).                                                                |
| G5  | **Stored asset metadata** (`width`, `height`, `mime`, `bytes`) isn't in the file separately.                                                       | Needed for `StoredAsset`.                                                          | Take it from the project's `assets[id]` / `sounds[id]` ref, and check it against the decoded blob.                                                                                                                |
| G6  | **Book id collisions**: the file carries the original `project.id`.                                                                                | Importing into the same browser would overwrite the book silently.                 | Detect and ask: **Keep both** (default: new id, "(imported)" suffix) or **Replace** (with confirmation).                                                                                                          |
| G7  | **Older exports** (made before the G1 fix) may lack hidden pictures.                                                                               | Some assets missing.                                                               | Import anyway; list what's missing, keep the references (the renderer already shows a "missing image" placeholder); the checks can offer "Replace image".                                                         |

G1/G2 are a one-line change in what export collects, plus a size note (see §5). Everything else
lives in the new import code.

---

## 4. Decisions (recommended answers)

| #   | Question                                                                | Recommendation                                                                                                                                        | Why                                                                                                                                                               |
| --- | ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | Always include hidden/unplaced assets in exports, or make it an option? | **Always.**                                                                                                                                           | They are part of the book; usually a small size difference; one kind of file is simpler to explain ("every export is a backup").                                  |
| D2  | Keep original ids or give imported assets new ids?                      | **Keep them.**                                                                                                                                        | References stay valid and identical pictures dedupe with ones already in this browser. Existing local assets are never overwritten (`put` is already idempotent). |
| D3  | Same book already in this browser?                                      | Ask: **Keep both** (default) / **Replace**. Warn when the local copy was edited _after_ the file was exported (`updatedAt` newer).                    | Never lose work silently.                                                                                                                                         |
| D4  | Where is the button?                                                    | Dashboard header **Import** (next to Blank book / Quick create), the empty state, and **drag-and-drop** a file onto the dashboard.                    | Import creates a book, so it belongs with the other "new book" actions.                                                                                           |
| D5  | Accepted files                                                          | `.html` / `.htm` exported by Folio, `.zip` exported by Folio, and (bonus) the **raw project JSON** from "Download raw data" on the load-error screen. | The JSON has no files in it, but its pictures are often still in this browser.                                                                                    |
| D6  | Import other tools' HTML?                                               | **No.** Only files with `format: "folio-book"`.                                                                                                       | Clear error instead of a half-broken book.                                                                                                                        |
| D7  | Mark exports as "import-ready"?                                         | Add `generator: { app: 'Folio', formatVersion: 2, exportedAt }` to `BookData` (optional field). Import does **not** require it.                       | Lets future versions handle format changes; old files stay importable.                                                                                            |
| D8  | New dependencies?                                                       | **None.** JSZip is already used by export; zod, Dexie and the image pipeline already exist.                                                           |                                                                                                                                                                   |

---

## 5. Design

### 5.1 Flow

```mermaid
flowchart TD
  F[File picked or dropped] --> T{What is it?}
  T -- "starts with PK" --> Z[Read zip with JSZip: index.html + assets/]
  T -- "text/html" --> H[Read text]
  T -- ".json" --> J[Raw project JSON]
  Z --> X[Extract book-data JSON]
  H --> X
  X --> V{format = folio-book?}
  V -- no --> E1[Error: not a Folio book]
  V -- yes --> M["loadProject(data.project)<br/>migrate → validate → repair"]
  J --> M
  M -- fails --> E2[Error with details + nothing written]
  M -- ok --> A[Collect asset sources for projectAssetIds]
  A --> D[Decode each: data: URI or zip entry → Blob<br/>check type, size, decodes]
  D --> TH[Make image thumbnails]
  TH --> P[Import preview dialog:<br/>title, pages, cover, warnings,<br/>Keep both / Replace]
  P -- confirm --> W[Write assets, then save project]
  W --> O[Open in editor]
```

Nothing is written until the reader confirms in the preview dialog, and the project is saved
**after** its assets (so a half-finished import never produces a book pointing at nothing).

### 5.2 New and changed modules

Pure, unit-testable core (no React, no storage):

- `src/core/import/read.ts`
  - `extractBookData(html: string): BookData`: finds `#book-data` with `DOMParser` (scripts are
    never executed), `JSON.parse`, `isBookData`. Clear errors for "not a Folio book", "damaged".
  - `detectKind(bytes)`: zip (`PK\x03\x04`), html, json.
- `src/core/import/sources.ts`
  - `assetSources(data, kind)`: for each id in `projectAssetIds(project)`, where to get its bytes.
    Single file: must be a `data:` URI. ZIP: must be a relative path matching
    `^assets/(images|audio)/[A-Za-z0-9_-]+\.[a-z0-9]+$`. **Anything else is rejected**
    (no `http:`, `blob:`, `../`, absolute paths).
  - `decodeDataUri(uri): { mime, bytes }` without `fetch` (base64 → `Uint8Array`).
- `src/core/import/plan.ts`
  - `planImport(project, found, localAssetIds)`: returns
    `{ project, assetsToWrite, alreadyHere, missing[], warnings[] }`. Pure.
  - `asCopy(project)`: new book id (`newId('bk')`), title `"… (imported)"`, fresh
    `createdAt`/`updatedAt`. Element, page and step ids stay (they are per-book).

Image pipeline:

- `src/core/image/process.ts`: split out `makeThumbnail(blob)` (the 320 px thumb step that
  `processImage` already does), so import reuses the exact same encoder. No re-encode of the full
  image.

Export (small change for G1/G2 + D7):

- `src/core/export/usage.ts`: `usedAssetIds` → every asset the book owns
  (`projectAssetIds`, filtered to existing refs), sounds included.
  Existing test "exports only used assets" keeps passing: assets no element or character refers
  to are still left out.
- `src/core/export/format.ts`: optional `generator` field (D7).
- Size estimate automatically includes the extra assets.

App side:

- `src/dashboard/import/import-book.ts`: File → read → decode → thumbnails → (after confirm)
  `assetRepo.put` for new assets → `projectRepo.save` → return the book id. Reports progress
  (big files can hold many MB of base64).
- `src/dashboard/import/ImportDialog.tsx`: preview (live cover via the existing `PageView`
  cover, title, page count, characters, sounds, "made with schema vN", warnings), the
  Keep both / Replace choice, and Import / Cancel.
- `src/dashboard/Dashboard.tsx`: **Import** button (header + empty state), hidden file input
  (`accept=".html,.htm,.zip,.json"`), drop zone over the whole dashboard.
- `src/editor/LoadErrorScreen.tsx`: mention that the downloaded raw data can be imported.

### 5.3 Safety (the file is untrusted)

- Parse only; never execute the embedded player or any script. `DOMParser` doesn't run scripts.
- The project goes through the **same** `loadProject` pipeline as locally stored books: zod
  schema (closed enums, string limits, id formats), migrations, `cleanReferences`.
- Text is already rendered with `textContent` everywhere; button icons are a closed set; no
  user HTML exists in the model.
- Asset checks: MIME must be an allowed image type (`webp`, `png`, `jpeg`, `gif`) or one of
  `SOUND_MIMES`; images must decode (`createImageBitmap`) and match the ref's dimensions within
  rounding; sounds ≤ 2 MB; images ≤ 25 MB each.
- File limits: refuse files over 300 MB; ZIP: only read entries the book data names (no
  directory walking), cap total uncompressed size at 500 MB (zip-bomb guard).
- Existing assets with the same id are never replaced (D2). A file can't alter other books.
- Errors are shown as friendly messages; nothing is written on any failure.

### 5.4 Performance

- Decode base64 in chunks and yield between assets so the UI stays responsive; show
  "Importing… 12 / 40 pictures".
- Thumbnails go through the existing image worker when available (same as uploads).
- A 30-page book with ~40 pictures should import in a few seconds.

---

## 6. Milestones

### I1: Core import + export completeness

- `core/import/{read,sources,plan}.ts`, `makeThumbnail`, export asset list change (G1/G2),
  optional `generator` field.
- **Done when:** unit tests in §7.1 pass, including the pure round trip for HTML and ZIP.

### I2: Import in the app

- `import-book.ts`, `ImportDialog`, dashboard button + drop zone, Keep both / Replace (with
  confirm), progress, errors, raw-JSON import, load-error screen hint.
- **Done when:** E2E tests in §7.2 pass.

### I3: Polish

- Missing-asset list in the dialog and a "Replace image" path for G7 files; accessibility
  (dialog labelling, focus, keyboard drop alternative); README section "Backups: export and
  import"; screenshot.
- **Done when:** `pnpm check`, `pnpm test:e2e` and `pnpm size:player` pass (the reader bundle
  must not grow: import code is app-only).

Each milestone ends with a commit and a short summary, like M10–M16.

---

## 7. Tests

### 7.1 Unit (Vitest)

- **Round trip, single file:** build a rich book (text, image, hidden image, background image,
  character with pose and tap reaction, custom keyframes, button choice, flap, goal, sounds
  incl. an unused one, reader settings) → `buildSingleFile` → `extractBookData` → decode →
  `planImport` ⇒ project deep-equals the original (except `updatedAt`), and **every asset's bytes
  are identical**.
- **Round trip, ZIP:** same with `buildZip`.
- **Idempotence:** export → import → export again ⇒ same `BookData.project` (minus timestamps)
  and byte-identical assets.
- **Escaping survives:** titles/text containing `</script>`, `<!--`, `&`, U+2028, emoji.
- **Old files:** an export with a v1 and a v2 project migrates to the current schema.
- **G7:** a file missing one picture imports with a warning listing it; the reference remains.
- **Copies:** `asCopy` gives a new book id and keeps every internal reference valid
  (`validateInteractivity` returns no new issues).
- **Rejections (nothing written):** not HTML/zip/json; HTML without `#book-data`; `format` ≠
  `folio-book`; broken JSON; schema-invalid project; newer schema than the app; `http:` or
  `blob:` asset URLs; `../` or absolute zip paths; wrong MIME; image that doesn't decode;
  oversized sound.

### 7.2 E2E (Playwright)

1. Build a book in the UI (picture, hidden picture, character + pose, choice buttons, flap,
   sound), export **HTML** and **ZIP**, delete the book, import each file:
   - pages, elements, character, poses and sounds are back; the checks show no problems;
   - un-hiding the hidden picture shows it (G1);
   - edit something (move, retime a timeline bar), autosave, reload: the change persists;
   - re-export works and opens offline.
2. Import the same file while the book still exists: **Keep both** creates a second book;
   **Replace** (after confirming) overwrites it; the "edited more recently" warning appears when
   the local copy is newer.
3. Import a damaged file and a non-Folio HTML file: friendly error, no new book.
4. Drag-and-drop a file onto the dashboard imports it.
5. Import makes **zero network requests**.
6. The sample book survives export → import → preview (both paths still work).

---

## 8. Out of scope / known limits

- Books made by other tools, or Folio exports edited by hand, aren't supported.
- Pictures are imported at their exported size (≤ 2400 px). That is the size the editor already
  works with, so nothing is lost compared to the stored book, but the _original_ upload (if it
  was larger) is not recoverable from an export.
- Undo history is not part of a book and isn't restored.
- The reader's "continue where you left off" position and mute setting are per browser and not
  part of the backup.

---

## 9. Questions for you before building

1. **D1:** OK to always include hidden pictures, unplaced characters and unused sounds in every
   export (slightly bigger files, but every export is a complete backup)? Recommended: yes.
2. **D3:** Default to **Keep both** when the same book already exists? Recommended: yes.
3. Should the editor also get an **"Export backup"** shortcut (e.g. in the top bar menu) that
   downloads the ZIP directly, or is the existing Export dialog enough? Recommended: the
   existing dialog is enough; the README will explain that every export is a backup.

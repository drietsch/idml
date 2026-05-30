# Paged — Panel Catalog & SDK Extension

**Status:** Draft v1.0
**Companions:** `sdk.md` (strategy), `sdk-implementation-plan.md` (tactical phasing), `editor-architecture.md`, `canvas.md`, `scripting-layer.md`

This document does two coupled jobs in one place:

1. **The panel inventory** — every panel an InDesign-class editor needs, each tagged with its catalog disposition, binding manifest (`reads` / `writes`), required Rust `Operation`s, UI field breakdown, and phase.
2. **The SDK extension** — the read/write vocabulary the inventory *forces*, with a decision for each gap: **raise the binding ceiling**, or **push to an expert leaf**.

The two are not independent. The panel list is the forcing function. You cannot know what the SDK must add until you have enumerated every panel and seen which ones the current binding ceiling (`sdk.md` §11.5: *literals + selectionProperty refs + unit coerce*) can and cannot express. So this document is written inventory-first, and the SDK extension is presented as the *consequence* of the inventory rather than as a wishlist.

---

## The headline finding

A complete enumeration of the panel set — all ~55 panels, InDesign-parity, listed in §6 — forces exactly:

- **One new *read* kind:** `documentCollection:<name>`.
- **Zero new *write* kinds.**

Everything richer than a single-path property write — collection mutations, multi-target geometry, boolean path ops, style-definition edits — resolves cleanly into the **expert-leaf** contract that already exists (`sdk.md` invariant 9: expert leaves get imperative *rendering*, never imperative *mutation*; they still write only through `paged.mutate(...)`).

This is the load-bearing claim of the document, and §5 proves it kind by kind. The practical consequence: the binding ceiling **holds**. The A2UI adapter's "reject anything not in the catalog" invariant (`sdk.md` invariant 11) stays enforceable because the binding language did not grow a Turing tarpit of write expressions. The one addition is a *read* — and reads cannot violate the mutation invariant.

If this finding survives review, the SDK extension is a half-day of types plus the Rust collection-read methods, not a redesign.

---

## 1. How to read a panel entry

Every panel in §6 carries a fixed header block:

| Field | Meaning |
| ----- | ------- |
| **id** | Catalog/registry id, `paged.*` namespace. |
| **Disposition** | `composition` \| `expert-leaf` \| `hybrid`. See §2. |
| **Surface** | `dock` (persistent panel) \| `popover` (launched from a control) \| `bar` (Control/Properties strip) \| `overlay` (on-canvas). |
| **Reads** | The declared `ReadSpec[]`. The panel re-renders when any of these change. |
| **Writes** | The declared `WriteSpec[]`. For compositions these are all `selectionProperty`; for expert leaves they are whatever `paged.mutate` carries. |
| **Operations** | The Rust `Operation` variants the panel requires. Gaps here are work items, per `sdk.md` invariant 8 ("panel friction is specification"). |
| **Phase** | Where it lands relative to `sdk-implementation-plan.md`. |

Each entry then lists its **fields** (the actual UI controls) and any **notes** on disposition rationale.

---

## 2. The disposition model

Three dispositions, with a hard test for each.

### composition
The panel is a tree of catalog primitives bound to selection properties. **It contains no hand-written JSX** — it is a `*.composition.json` file rendered by `CompositionRenderer`. A panel qualifies iff *every* control on it is a single-property scalar read/write expressible under the §11.5 ceiling.

Examples: Character, Paragraph, Stroke, Object/Transform, Text-Wrap, Hyperlinks.

### expert-leaf
The panel renders through opaque code (`<canvas>`, bespoke geometry, gesture coupling, a third-party widget). It declares its bindings in a sibling `*.bindings.ts` manifest, and it **mutates only through `paged.mutate(...)`** — it never reaches past the door. Imperative *rendering*, declarative *contract*.

Examples: Tools, Gradient ramp, Spread Mini-Map, Glyphs grid, Tabs ruler, Separations Preview, REPL, Script-Editor, the Canvas itself.

### hybrid
A composition *chrome* hosting one or more expert leaves as children. The structural shell (title, sections, layout) is declarative; one bespoke control inside it is an expert leaf with its own manifest. This is the dominant shape for **collection panels** (Swatches, Layers, the Style panels): a declarative list/toolbar wrapping a custom row renderer or a custom add/edit affordance.

Examples: Pages (chrome + thumbnail strip), Layers (chrome + drag-reorder row), Swatches (chrome + swatch grid + new-swatch popover), every Style panel.

### The decision test
> Can every control be expressed as one `selectionProperty` read/write (or a literal) under the §11.5 ceiling?
> **Yes** → composition.
> **Mostly, but one control is bespoke** → hybrid (composition chrome + expert child).
> **No, the whole surface is bespoke rendering** → expert-leaf.

Crucially: **document-level collection data is a *read* concern, not a write concern.** A panel that reads a collection but only ever applies entities to the selection (a Style panel applying a paragraph style) is a composition/hybrid, because *applying* a style is a single `selectionProperty` write (§5.3). A panel that *edits the collection itself* (renaming the style, deleting a swatch) does that through `paged.mutate(Operation::…)` from an expert child — still no new write kind.

---

## 3. The current SDK surface (recap)

From `sdk-implementation-plan.md` Phase 1–3. The `paged` handle both scripts and panels receive:

```ts
export interface PagedHandle {
  readonly client: CanvasClient;
  readonly selection: Observable<ElementId[]>;
  readonly contentSelection: Observable<ContentSelection | null>;
  readonly camera: Observable<Camera>;
  readonly activeTool: Observable<ToolId>;
  readonly document: Observable<DocumentHandle | null>;
  mutate(op: Mutation): Promise<AppliedOperation>;
  request<R>(req: MainToWorker): Promise<R>;
}
```

The binding model:

```ts
export type Binding =
  | { kind: "literal"; value: JsonValue }
  | { kind: "selectionProperty"; path: PropertyPath; coerce?: "pt" | "px" | "%" };
  // §11.5 ceiling: no other kinds.

export interface BindingDeclaration {
  reads: ReadSpec[];   // e.g. ["selectionProperty:characterFontSize", "camera"]
  writes: WriteSpec[]; // e.g. ["selectionProperty:characterFontSize"]
}
```

The primitive leaf vocabulary (Phase 3b): `numeric-scrub`, `length`, `color-swatch`, `bounds`, `enum-select`, `layout.row`, `layout.section`, `label`.

This surface handles the entire **property/inspector tier** (§6, Tier 2) with no extension. The structural and collection tiers are where the gap appears.

---

## 4. Where the current surface breaks (the gap, enumerated)

Walking the full inventory, the current surface fails on exactly five panel *classes*. Each is named here; §5 resolves each.

| # | Panel class | Example panels | Why the current surface fails |
| - | ----------- | -------------- | ----------------------------- |
| G1 | **Collection-backed lists** | Swatches, Paragraph/Character/Object/Cell/Table Styles, Links, Articles, Glyphs, Layers list, Pages list, Hyperlinks list, Bookmarks | The panel's primary data is a *document-level collection*, not a selection-resolved property. `selectionProperty:*` cannot express "the document's swatch list." There is no read spec for it. |
| G2 | **Multi-property atomic writes** | Object/Transform (bounds + rotation + shear in one drag), Text-Frame-Options (columns + insets together) | A single gesture wants to write several independent property paths atomically as one undo step. `selectionProperty` is one path per binding. |
| G3 | **Apply-an-entity writes** | All Style panels, Swatches-as-fill | Clicking "Heading 1" doesn't set a scalar — it *applies a style entity* to the selection. Looks like it needs a new write kind. |
| G4 | **Multi-target geometry** | Align, Distribute, Pathfinder | The operation is over *N selected objects relative to each other*, not one selection's resolved property. The binding model assumes single-selection property resolution. |
| G5 | **Collection mutation** | New/rename/delete swatch; new/edit/delete style; reorder layers; add page | Mutates the document collection itself, not the selection. Not a `selectionProperty` write at all. |

Five classes. The next section shows that four of them need **no SDK change** and one needs a single new *read* kind.

---

## 5. The SDK extension (one read kind; everything else is expert-leaf)

### 5.1 G1 — Collection reads → **one new read kind**

This is the only genuine addition. Too many panels (≥10) need to read document-level collections for an expert-leaf-per-panel approach to be clean; the read belongs in the declarative surface.

**Add to `ReadSpec`:**

```ts
// packages/catalog/src/types.ts
export type ReadSpec =
  | `selectionProperty:${string}`
  | `documentCollection:${CollectionName}`   // NEW
  | `documentMeta:${DocumentMetaKey}`        // NEW (small, see §5.6)
  | "selection" | "contentSelection" | "camera" | "document";

export type CollectionName =
  | "swatches" | "gradients" | "colorGroups"
  | "paragraphStyles" | "characterStyles" | "objectStyles"
  | "cellStyles" | "tableStyles"
  | "layers" | "spreads" | "pages" | "masterPages"
  | "links" | "articles" | "hyperlinks" | "bookmarks"
  | "crossReferences" | "conditions" | "conditionSets"
  | "fonts" | "indexTopics";
```

**Add to the handle:**

```ts
export interface PagedHandle {
  // …existing…
  collection<T = unknown>(name: CollectionName): Observable<readonly T[]>;  // NEW
  documentMeta(): Observable<DocumentMeta>;                                  // NEW
}
```

Backed by a single Rust read method family, mirroring the `model.element_properties` pattern that already serves `paged.inspect` / `client.elementProperties`:

```rust
// crates/paged-canvas/src/channel.rs  (request kinds)
RequestCollection { name: CollectionName },     // -> CollectionReply { items: Vec<serde_json::Value> }
RequestDocumentMeta,                            // -> DocumentMetaReply { .. }
```

Each `CollectionName` maps to one accessor on the model. The reply is a `Vec` of tsify'd structs. The observable re-fetches on `mutationApplied` (same snapshot discipline closed in `sdk.md` §11.1).

**Script parity (free):** the same method gives scripts `paged.collection("swatches")` with no extra work — the convergence thesis (one Rust source → one shape for UI and script) extends to collections by construction.

**Why this is safe:** it is a *read*. It cannot mutate. Invariant 9 is untouched. The A2UI adapter rejects any composition referencing a `CollectionName` not in the enum — the surface stays finite and inspectable.

> **Decision D1 (proposed, redirectable):** add `documentCollection` + `documentMeta` read kinds. This is the *only* binding-language growth in this document.

### 5.2 G2 — Multi-property atomic writes → **expert-leaf, not a binding kind**

Tempting to add a `selectionProperties` (plural) write that sets several paths in one operation. **Reject it.** It is the first step onto the §11.5 slippery slope and it is unnecessary: the atomicity belongs in the *Operation*, not the *binding*.

The Object/Transform "drag the bounding box" gesture is already an expert interaction (the gesture spine, not a panel field). The *panel* exposes four independent scalar fields (X, Y, W, H) — each a normal single-path `selectionProperty` write. When the user drags on canvas, that is the gesture spine emitting one `Operation::SetFrameBounds{…}` that happens to carry four numbers. The panel never needs to write four paths in one binding.

For the rare panel control that truly wants atomic multi-field commit (e.g. a "set columns and gutter together" in Text-Frame-Options), that control is a small **expert leaf** whose render is a couple of inputs and whose commit is one `paged.mutate(Operation::SetTextFrameColumns{count, gutter, …})`. The atomic group is one Operation; the binding model never sees plurality.

> **Decision D2:** no plural-write binding kind. Atomic multi-field writes are single `Operation`s emitted by an expert leaf (or the gesture spine). Ceiling preserved.

### 5.3 G3 — Apply-an-entity → **already a `selectionProperty` write**

The key insight that collapses an apparent gap. Applying a paragraph style is **setting one property** — the selection's *applied-paragraph-style reference*. The style *definition* lives in a collection (read via §5.1); *applying* it is:

```json
{ "kind": "selectionProperty", "path": "appliedParagraphStyle" }
```

…with the value being a style id. The cascade/resolution happens in Rust. Same for `appliedCharacterStyle`, `appliedObjectStyle`, `appliedCellStyle`, `appliedTableStyle`, and `frameFillColor` / `frameStrokeColor` taking a swatch ref.

So a Style panel is a **hybrid**: it *reads* the style collection (§5.1) to render the list, and each list row, when clicked, performs a single `selectionProperty` write of the style id. No new write kind. The `enum-select` primitive already models "write a string ref" — a style list is `enum-select` with a dynamic option set sourced from a collection read.

> **Decision D3:** entity application is a `selectionProperty` write whose value is an entity id. No new write kind. The Operation layer needs `Operation::SetProperty{AppliedParagraphStyle | AppliedCharacterStyle | …}` (see §7).

### 5.4 G4 — Multi-target geometry → **command-backed expert-leaf**

Align / Distribute / Pathfinder operate on the selection *set*. They read `selection` (declared) and emit one geometry Operation over the set:

```ts
paged.mutate({ kind: "AlignObjects", ids, axis: "horizontal", mode: "centers", relativeTo: "selection" })
paged.mutate({ kind: "PathfinderOp", ids, op: "subtract" })
```

These panels are thin **expert leaves** (a grid of buttons) — or, cleaner, pure **command contributions** (Phase 4 menu/command surface) surfaced as a button cluster. Either way: declared `reads: ["selection"]`, `writes: ["selection", "geometry"]`, no binding-language change.

> **Decision D4:** multi-target geometry panels are command-backed expert leaves. The work is in the Operation set (`AlignObjects`, `DistributeObjects`, `PathfinderOp`), not the SDK.

### 5.5 G5 — Collection mutation → **expert child + `paged.mutate`**

Creating/renaming/deleting a swatch or style, reordering layers, inserting a page: all are `Operation`s over a collection. The panel *reads* the collection declaratively (§5.1) and the create/edit/delete affordances are an **expert child** inside the hybrid chrome that calls `paged.mutate(Operation::CreateSwatch{…})` etc. Imperative rendering of the "+ New" popover; declarative contract; mutation through the one door.

> **Decision D5:** collection mutations go through `paged.mutate` from an expert child. The work is Operation-set coverage (§7), not the SDK.

### 5.6 Two supporting refinements (not new kinds)

- **`"mixed"` sentinel.** When the selection is heterogeneous (N objects, different font sizes), `selectionProperty` resolution returns a `"mixed"` sentinel instead of a value. Primitive leaves render this as an empty/dashed state and, on edit, write the new value to all. This is a *resolution refinement* in `packages/catalog/src/binding.ts`, not a new binding kind.

  ```ts
  export type ResolvedValue<T> = T | "mixed" | undefined; // undefined = no selection / property absent
  ```

- **`documentMeta` read** (named in §5.1). Small, finite set for chrome/status surfaces: page count, active page, document units, color mode, document name, dirty flag. Could be folded into `documentCollection`, but a flat meta read is cleaner for the Info panel and status bar. Keep it distinct.

### 5.7 The extended SDK surface, consolidated

```ts
// packages/catalog/src/types.ts — after this document
export type ReadSpec =
  | `selectionProperty:${string}`
  | `documentCollection:${CollectionName}`
  | `documentMeta:${DocumentMetaKey}`
  | "selection" | "contentSelection" | "camera" | "document";

export type WriteSpec =
  | `selectionProperty:${string}`     // includes applied-entity refs (§5.3)
  | "selection" | "camera" | "geometry" | "collection";
  // "geometry" + "collection" are the *expert-leaf* write surfaces:
  // they correspond to paged.mutate(Operation::…), declared for audit,
  // NOT to a declarative binding. No composition emits them.

export type Binding =
  | { kind: "literal"; value: JsonValue }
  | { kind: "selectionProperty"; path: PropertyPath; coerce?: "pt" | "px" | "%" };
  // UNCHANGED. The §11.5 ceiling holds.
```

Note the asymmetry, and that it is the whole point: **`ReadSpec` grows; `Binding` does not.** The `"geometry"` and `"collection"` `WriteSpec`s are *declarations for the audit/lint layer* (so an expert leaf truthfully states it mutates the document), not new declarative binding kinds. A composition cannot emit them — only an expert leaf's manifest names them, and the lint rule (§9) enforces that any panel declaring `writes: ["collection"]` is an expert leaf with a `.bindings.ts` sibling.

> **Net SDK delta:** +2 read kinds (`documentCollection`, `documentMeta`), +1 handle method family (`collection()` / `documentMeta()`), +2 audit-only `WriteSpec` tags, +1 resolution sentinel (`"mixed"`). **Zero new declarative `Binding` kinds.** The binding ceiling survives the full panel set.

---

## 6. The panel inventory

Organized by tier. Tier order ≈ build order and ≈ conceptual dependency, not strict phase order (phases are in §8).

Legend for disposition: **C** = composition, **E** = expert-leaf, **H** = hybrid.

### Tier 0 — The canvas (the one principled exception)

#### `paged.canvas`
**Disposition:** E · **Surface:** dock (center) · **Phase:** exists
**Reads:** `camera`, `document` · **Writes:** ø (gesture spine mutates; the panel itself writes nothing)
**Operations:** none directly — all mutation flows through the gesture spine.
**Fields:** none (it *is* the render surface).
**Notes:** `sdk.md` §5.1. Registers in the catalog as an expert leaf so the registry is exhaustive, but it is the sole panel that legitimately renders the document itself. Its `.bindings.ts` declares `reads: ["camera","document"], writes: []`.

---

### Tier 1 — Structural panels (collection-backed, tree/list UIs)

These are the primary consumers of the new `documentCollection` read (§5.1). All are **H** (composition chrome + expert row/thumbnail leaf) because their rows carry bespoke affordances (drag-reorder, thumbnails, status badges).

#### `paged.pages`
**Disposition:** H · **Surface:** dock · **Phase:** 3 (migrates existing `navigator-panel.tsx`)
**Reads:** `documentCollection:spreads`, `documentCollection:pages`, `documentCollection:masterPages`, `selection`, `camera` · **Writes:** `selection`, `camera`, `collection`
**Operations:** `InsertPage`, `DeletePage`, `MovePage`, `DuplicateSpread`, `ApplyMaster`, `SetPageSize`, `CreateSection`, `SetPageNumberingStyle`
**Fields:**
- Spread/page thumbnail grid (expert leaf — the `spread-thumbnail-strip` from Phase 3)
- Master/parent page well (drag master onto page → `ApplyMaster`)
- Page-size-per-page control (`enum-select` + custom popover)
- Section & numbering markers (start section, numbering style, prefix)
- New/delete/duplicate/move page controls
- Alternate-layout switcher (if liquid layout is in scope)
**Notes:** The Phase-3 proof panel for the structural tier. The thumbnail strip is the expert child; the chrome (toolbar, master well) is composition.

#### `paged.layers`
**Disposition:** H · **Surface:** dock · **Phase:** 5
**Reads:** `documentCollection:layers`, `selection` · **Writes:** `selection`, `collection`
**Operations:** `CreateLayer`, `DeleteLayer`, `RenameLayer`, `MoveLayer`, `SetLayerVisible`, `SetLayerLocked`, `SetLayerColor`, `MoveObjectsToLayer`, `MergeLayers` (Track M already ships rename/move/insert/remove)
**Fields:**
- Layer list with per-row: visibility toggle, lock toggle, layer color chip, expand-for-sublayers
- Object sublayer rows (per-object visibility/lock)
- New/delete/merge/duplicate layer controls
- Move-selection-to-layer affordance
**Notes:** Row is an expert leaf (custom drag affordance + the eye/lock click targets); chrome is composition.

#### `paged.outline`
**Disposition:** C (possibly H) · **Surface:** dock · **Phase:** 5
**Reads:** `documentCollection:paragraphStyles`, `document`, `selection` · **Writes:** `selection`, `camera`
**Operations:** none new (read + navigate); jump-to drives camera/selection
**Fields:** nested heading list (by mapped paragraph styles), click-to-navigate, collapse/expand.
**Notes:** May need a `paged.layout.tree-list` primitive added once (§9 rule: ≥2 panels). Tree (`paged.tree`) is the second consumer, justifying it.

#### `paged.tree`
**Disposition:** C (with `tree-list` primitive) · **Surface:** dock · **Phase:** 5
**Reads:** `document`, `selection` · **Writes:** `selection`
**Operations:** reorder via `MoveObjectInZOrder`, group/ungroup via `GroupObjects`/`UngroupObjects`
**Fields:** scene/object hierarchy tree, z-order reorder, group nodes, select-on-click, rename inline.

#### `paged.links`
**Disposition:** H · **Surface:** dock · **Phase:** 5
**Reads:** `documentCollection:links`, `selection` · **Writes:** `selection`, `collection`
**Operations:** `RelinkAsset`, `UpdateLink`, `EmbedLink`, `UnembedLink`, `EditOriginal` (external)
**Fields:**
- Link list with status (up-to-date / modified / missing) badges
- Per-link info: resolution, color space, file size, scale, layer overrides
- Relink / update / update-all / embed / unembed / reveal controls
**Notes:** Link status badges are an expert-rendered row; the info panel beneath is composition reading link metadata.

#### `paged.articles`
**Disposition:** H · **Surface:** dock · **Phase:** 5
**Reads:** `documentCollection:articles`, `selection` · **Writes:** `selection`, `collection`
**Operations:** `CreateArticle`, `AddToArticle`, `ReorderArticleContent`, `SetIncludeInExport`
**Fields:** article list, threaded content per article (drag to reorder reading order), include-in-export toggle, add-selection-to-article.

#### `paged.bookmarks`
**Disposition:** H · **Surface:** dock · **Phase:** later
**Reads:** `documentCollection:bookmarks`, `selection` · **Writes:** `collection`, `camera`
**Operations:** `CreateBookmark`, `DeleteBookmark`, `RenameBookmark`, `ReorderBookmark`
**Fields:** bookmark tree (for PDF/interactive nav), create-from-selection, reorder, jump-to.

#### `paged.conditional-text`
**Disposition:** H · **Surface:** dock · **Phase:** later
**Reads:** `documentCollection:conditions`, `documentCollection:conditionSets`, `contentSelection` · **Writes:** `collection`, `selectionProperty:appliedConditions`
**Operations:** `CreateCondition`, `DeleteCondition`, `SetConditionVisible`, `ApplyConditionToText`, `CreateConditionSet`
**Fields:** condition list with show/hide + indicator-style controls, condition-set switcher, apply/remove to text selection.
**Notes:** Apply-to-text is a `contentSelection`-scoped `selectionProperty`-style write (text range, not frame).

#### `paged.index`
**Disposition:** E · **Surface:** dock · **Phase:** later
**Reads:** `documentCollection:indexTopics`, `contentSelection` · **Writes:** `collection`
**Operations:** `CreateIndexEntry`, `CreateIndexTopic`, `CreateCrossReferenceEntry`, `GenerateIndex`
**Fields:** topic/entry tree, add-entry-from-selection, cross-reference, page-range options, generate-index.
**Notes:** Entry tree + generation flow are bespoke; expert leaf reading the topic collection.

#### `paged.toc`
**Disposition:** E / dialog · **Surface:** popover · **Phase:** later
**Reads:** `documentCollection:paragraphStyles` · **Writes:** `collection`
**Operations:** `GenerateTOC`, `UpdateTOC`, `CreateTOCStyle`
**Fields:** which paragraph styles become entries (style → level mapping), entry/page-number formatting, leader, sort, replace-existing.
**Notes:** Modal-style flow → popover/dialog rather than a persistent dock panel.

---

### Tier 2 — Property / inspector panels (selection-resolved, pure compositions)

The heart of the editor and the cleanest fit for the binding model. **All C**, no SDK extension, each is a `*.composition.json`. These exercise the `"mixed"` sentinel (§5.6) heavily.

#### `paged.character`
**Disposition:** C · **Surface:** dock · **Phase:** 3 (the binding-model proof)
**Reads:** `selectionProperty:character*` · **Writes:** `selectionProperty:character*`
**Operations:** `SetProperty{CharacterFontFamily | CharacterFontStyle | CharacterFontSize | CharacterLeading | CharacterKerning | CharacterTracking | CharacterHScale | CharacterVScale | CharacterBaselineShift | CharacterSkew | CharacterCase | CharacterPosition | CharacterLanguage | CharacterFillColor | CharacterStrokeColor | CharacterUnderline | CharacterStrikethrough | CharacterLigatures | CharacterOpenTypeFeatures}`
**Fields:**
- Font family (`enum-select`, options from `documentCollection:fonts`) + style
- Size (`length`), Leading (`length`, auto-aware)
- Kerning (`enum-select`: metrics/optical + value), Tracking (`numeric-scrub`)
- Horizontal/Vertical scale (`numeric-scrub` %)
- Baseline shift (`length`), Skew (`numeric-scrub` °)
- Case (`enum-select`: normal/all-caps/small-caps), Position (super/subscript)
- Language (`enum-select`)
- Fill / Stroke (`color-swatch`, options from `documentCollection:swatches`)
- Underline / Strikethrough toggles, Ligatures toggle
- OpenType features (sub-section: swashes, ordinals, fractions, alternates)
**Notes:** Phase-3 proof. The panel `.ts` is *only* `{ component: CompositionRenderer, componentProps: { composition } }` — no JSX (AC-3.1).

#### `paged.paragraph`
**Disposition:** C · **Surface:** dock · **Phase:** 5
**Reads/Writes:** `selectionProperty:paragraph*`
**Operations:** `SetProperty{ParagraphAlignment | ParagraphLeftIndent | ParagraphRightIndent | ParagraphFirstLineIndent | ParagraphLastLineIndent | ParagraphSpaceBefore | ParagraphSpaceAfter | ParagraphDropCapLines | ParagraphDropCapChars | ParagraphHyphenate | ParagraphAlignToGrid | ParagraphKeepOptions | ParagraphSpanColumns | ParagraphShading | ParagraphBorder | ParagraphBulletsNumbering}`
**Fields:** alignment (incl. justify variants), L/R/first/last indents, space before/after, drop caps (lines + chars), hyphenation toggle, align-to-baseline-grid, keep options (keep-with-next, keep-lines-together, start), span/split columns, paragraph shading, paragraph border, bullets & numbering.

#### `paged.stroke`
**Disposition:** C · **Surface:** dock · **Phase:** 5
**Reads/Writes:** `selectionProperty:frameStroke*`
**Operations:** `SetProperty{FrameStrokeWeight | FrameStrokeColor | FrameStrokeType | FrameStrokeAlign | FrameStrokeCap | FrameStrokeJoin | FrameStrokeMiter | FrameStrokeDashPattern | FrameStrokeStartArrow | FrameStrokeEndArrow | FrameStrokeGapColor}`
**Fields:** weight (`length`), cap, miter limit, join, align stroke (center/inside/outside), stroke type (solid/dashed/dotted/custom), dash & gap pattern, start/end arrowheads + scale, gap color/tint.

#### `paged.effects`
**Disposition:** H · **Surface:** dock + popover · **Phase:** 5
**Reads/Writes:** `selectionProperty:frame{Opacity,BlendMode,DropShadow,InnerShadow,OuterGlow,InnerGlow,Bevel,Satin,Feather}`
**Operations:** `SetProperty{FrameOpacity | FrameBlendMode | FrameFillOpacity | FrameStrokeOpacity | FrameTextOpacity | FrameDropShadow | FrameInnerShadow | FrameOuterGlow | FrameInnerGlow | FrameBevelEmboss | FrameSatin | FrameBasicFeather | FrameDirectionalFeather | FrameGradientFeather | FrameKnockoutGroup | FrameIsolateBlending}`
**Fields:**
- Blend mode (`enum-select`) + opacity (`numeric-scrub` %) at object/fill/stroke/text levels
- Effect toggles: drop shadow, inner shadow, outer glow, inner glow, bevel & emboss, satin, basic/directional/gradient feather
- Per-effect options (popover composition): distance, size, spread, angle, noise, color, blend mode
- Knockout group, isolate blending, "object knocks out shadow"
**Notes:** The opacity/blend row is plain composition. Each effect's detailed options is a popover composition launched from a toggle — still C, just deeper nesting. The gradient-feather *angle handle on canvas* is gesture-spine, not panel.

#### `paged.object-transform`
**Disposition:** C · **Surface:** dock · **Phase:** 5
**Reads/Writes:** `selectionProperty:frame{Bounds,Rotation,Shear,Scale}`
**Operations:** `SetProperty{FrameX | FrameY | FrameWidth | FrameHeight | FrameRotation | FrameShear | FrameScaleX | FrameScaleY | FrameFlipH | FrameFlipV | FrameReferencePoint}`
**Fields:** X / Y (`length`), W / H (`length`), scale X/Y % (`numeric-scrub`), rotation (`numeric-scrub` °), shear (`numeric-scrub` °), reference-point picker (9-point), flip H/V.
**Notes:** §5.2 in practice — four independent scalar fields, each a single `selectionProperty` write. The on-canvas drag is the gesture spine emitting one `SetFrameBounds`. No plural binding.

#### `paged.text-frame-options`
**Disposition:** H · **Surface:** popover · **Phase:** 5
**Reads/Writes:** `selectionProperty:textFrame*`
**Operations:** `SetTextFrameColumns`, `SetProperty{TextFrameInsetTop|Bottom|Left|Right | TextFrameVerticalJustify | TextFrameFirstBaselineOffset | TextFrameAutoSize | TextFrameIgnoreWrap}`
**Fields:** columns (count/gutter/width, balance, fixed-width), inset per side, vertical justification (top/center/bottom/justify + para-spacing limit), first-baseline offset, auto-size, ignore text wrap.
**Notes:** The columns group is the §5.2 example — a small expert child committing one atomic `SetTextFrameColumns`. Rest is composition.

#### `paged.text-wrap`
**Disposition:** C · **Surface:** dock/popover · **Phase:** 5
**Reads/Writes:** `selectionProperty:textWrap*`
**Operations:** `SetProperty{TextWrapMode | TextWrapOffsetTop|Bottom|Left|Right | TextWrapContour | TextWrapInvert | TextWrapAffectsBeneathOnly}`
**Fields:** wrap mode (none/bounding-box/object-shape/jump-line/jump-column), offset per side, contour options, invert, affects-text-beneath-only.

#### `paged.corner-options`
**Disposition:** C · **Surface:** popover · **Phase:** later
**Reads/Writes:** `selectionProperty:frameCorner*`
**Operations:** `SetProperty{FrameCornerShape | FrameCornerRadius}` (per-corner, link/unlink)
**Fields:** per-corner shape (rounded/inverse-rounded/bevel/inset/fancy), radius (`length`), link/unlink corners.

#### `paged.anchored-object`
**Disposition:** C · **Surface:** popover · **Phase:** later
**Reads/Writes:** `selectionProperty:anchored*`
**Operations:** `SetProperty{AnchoredPosition | AnchoredReferencePoint | AnchoredOffsetX | AnchoredOffsetY | AnchoredPreventManual}`
**Fields:** inline / above-line / custom positioning, anchor + object reference points, X/Y offsets, prevent-manual-positioning.

#### `paged.frame-fitting`
**Disposition:** C · **Surface:** dock/bar · **Phase:** later
**Reads/Writes:** `selectionProperty:fitting*`
**Operations:** `SetProperty{FittingMode | FittingReferencePoint | FittingCrop | FittingAutoFit}`
**Fields:** fitting mode (fill/fit-content/fit-proportionally/fit-frame), align reference point, crop amount, auto-fit toggle.

#### `paged.story`
**Disposition:** C · **Surface:** dock · **Phase:** later
**Reads/Writes:** `selectionProperty:storyOpticalMargin`
**Operations:** `SetProperty{StoryOpticalMarginAlignment}`
**Fields:** optical margin alignment toggle + size.

#### `paged.tabs`
**Disposition:** E · **Surface:** bar (above text frame) · **Phase:** later
**Reads:** `selectionProperty:paragraphTabStops`, `camera` · **Writes:** `selectionProperty:paragraphTabStops`
**Operations:** `SetProperty{ParagraphTabStops}` (array of {alignment, position, leader, alignChar})
**Fields:** ruler with draggable tab stops (L/C/R/decimal), leader characters, align-on character, indent markers.
**Notes:** The ruler is a bespoke draggable surface positioned over the frame → expert leaf. Writes the whole tab-stop array as one property (single path, array value — fits the ceiling per §5.2's array-value note; the *interaction* is expert, the *write* is one path).

#### `paged.hyphenation-justification`
**Disposition:** C · **Surface:** popover · **Phase:** later
**Reads/Writes:** `selectionProperty:hj*` (usually edited within a paragraph style)
**Operations:** `SetProperty{HJWordSpacing | HJLetterSpacing | HJGlyphScaling | HJSingleWordJustify}`
**Fields:** word/letter spacing min-desired-max, glyph scaling min-desired-max, single-word justification, hyphenation zone/limits.

---

### Tier 2b — Color panels

#### `paged.swatches`
**Disposition:** H · **Surface:** dock · **Phase:** 5
**Reads:** `documentCollection:swatches`, `documentCollection:colorGroups`, `selection` · **Writes:** `selectionProperty:frameFillColor`, `selectionProperty:frameStrokeColor`, `collection`
**Operations:** `CreateSwatch`, `EditSwatch`, `DeleteSwatch`, `RenameSwatch`, `CreateColorGroup`, `MergeSwatches`, `SetSwatchType` (process/spot), plus the apply paths above
**Fields:**
- Swatch grid (expert child) with type/mode badges (CMYK/RGB/Lab, process/spot, none/paper/registration)
- Fill vs stroke target toggle; tint slider
- Swatch groups; load/save library
- New/edit/delete/duplicate swatch (popover composition for new-swatch dialog)
**Notes:** Canonical §5.3 + §5.5 panel. Apply = `selectionProperty` write of swatch ref (declarative). Create/edit = `paged.mutate` from the new-swatch popover (expert child). Read = `documentCollection:swatches`.

#### `paged.color`
**Disposition:** C · **Surface:** dock · **Phase:** later
**Reads:** `selectionProperty:frameFillColor` / `frameStrokeColor` · **Writes:** same + `collection` (add-to-swatches)
**Operations:** `SetProperty{FrameFillColor|FrameStrokeColor}`, `CreateSwatch` (add-to-swatches)
**Fields:** live mixer (CMYK/RGB/Lab/HSB sliders), tint slider, out-of-gamut warning, hex input, add-to-swatches.
**Notes:** A live mixer is a handful of bound sliders → composition. The gamut warning is a derived read (resolution-level), not a binding kind.

#### `paged.gradient`
**Disposition:** E · **Surface:** dock · **Phase:** later
**Reads:** `selectionProperty:frameGradient`, `documentCollection:gradients` · **Writes:** `selectionProperty:frameGradient`, `collection`
**Operations:** `SetProperty{FrameGradient}`, `CreateGradientSwatch`
**Fields:** type (linear/radial), angle, gradient ramp with draggable stops + midpoints, reverse, per-stop color/location.
**Notes:** The ramp (draggable multi-stop control) is bespoke → expert leaf. Writes the whole gradient as one property.

#### `paged.color-themes`
**Disposition:** E · **Surface:** dock · **Phase:** later
**Reads:** external (Adobe Color) · **Writes:** `collection`
**Operations:** `CreateSwatch` (import theme)
**Fields:** theme browser, extract-from-image, import-to-swatches.
**Notes:** Possibly out of v1 scope. Pure expert leaf hitting an external service.

---

### Tier 2c — Style panels (read collection · apply via selectionProperty · edit via mutate)

All **H**, all the same shape (§5.3 + §5.5). One template, five instances.

| id | Collection read | Apply write (`selectionProperty`) | Edit/define Operations | Phase |
| -- | --------------- | --------------------------------- | ---------------------- | ----- |
| `paged.paragraph-styles` | `paragraphStyles` | `appliedParagraphStyle` | `CreateParagraphStyle`, `EditParagraphStyle`, `DeleteParagraphStyle`, `RenameStyle`, `DuplicateStyle`, `SetStyleBasedOn`, `SetNextStyle`, `RedefineStyleFromSelection`, `ClearOverrides` | 5 |
| `paged.character-styles` | `characterStyles` | `appliedCharacterStyle` | same family (Character) | 5 |
| `paged.object-styles` | `objectStyles` | `appliedObjectStyle` | same family (Object) | later |
| `paged.cell-styles` | `cellStyles` | `appliedCellStyle` | same family (Cell) | later |
| `paged.table-styles` | `tableStyles` | `appliedTableStyle` | same family (Table) | later |

**Shared fields:** style list (grouped, with override indicator `+`), apply-on-click, new/edit/delete/duplicate, based-on / next-style, redefine-from-selection, clear-overrides, load styles from library.
**Shared notes:** The list + apply is composition (`enum-select`-like over a collection read). The **style-options editor** (what "Heading 1" *means* — all character/paragraph/indent/tab/GREP/nested-style settings) is a large popover composition for *defining* a style, committing via `paged.mutate(Operation::EditParagraphStyle{…})`. That editor reuses the same primitive leaves as the Character/Paragraph panels — strong reuse argument.

---

### Tier 2d — Table panels

#### `paged.table`
**Disposition:** H · **Surface:** dock + bar · **Phase:** later
**Reads:** `selectionProperty:table*`, `contentSelection` (cell range) · **Writes:** `selectionProperty:table*`, `collection`
**Operations:** `SetTableDimensions`, `SetRowHeight`, `SetColumnWidth`, `InsertRow`, `InsertColumn`, `DeleteRow`, `DeleteColumn`, `MergeCells`, `SplitCell`, `SetCellInset`, `SetCellVerticalJustify`, `SetCellStroke`, `SetCellFill`, `SetAlternatingPattern`, `SetTableBorder`, `SetHeaderFooterRows`
**Fields:** rows/columns count, row height (at-least/exactly), column width, table dimensions, cell insets, cell vertical justification, diagonal lines, alternating row/column fills & strokes, header/footer rows, table border.
**Notes:** Cell selection is a `contentSelection` concept (range within a table). The row/column dimension grid is an expert child; cell formatting is composition.

---

### Tier 3 — Object operation panels (multi-target geometry → command-backed)

#### `paged.align`
**Disposition:** E / command-backed · **Surface:** dock/bar · **Phase:** later
**Reads:** `selection` · **Writes:** `selection`, `geometry`
**Operations:** `AlignObjects{axis, mode, relativeTo}`, `DistributeObjects{axis, mode}`, `DistributeSpacing{axis, amount}`
**Fields:** align edges/centers (H/V), distribute objects, distribute spacing, align-to (selection/margins/page/spread), use-spacing value.
**Notes:** §5.4. A button grid; ideally pure command contributions surfaced as a cluster.

#### `paged.pathfinder`
**Disposition:** E / command-backed · **Surface:** dock/bar · **Phase:** later
**Reads:** `selection` · **Writes:** `selection`, `geometry`
**Operations:** `PathfinderOp{op}` (add/subtract/intersect/exclude/minus-back), `ConvertShape{to}`, `ConvertPoint{to}`, `OpenPath`, `ClosePath`, `ReversePath`
**Fields:** add/subtract/intersect/exclude/minus-back; convert shape (rect/rounded/bevel/ellipse/triangle/polygon/line); convert point; open/close/reverse path.

---

### Tier 3b — Typography utility

#### `paged.glyphs`
**Disposition:** E · **Surface:** dock · **Phase:** later
**Reads:** `documentCollection:fonts` + per-font glyph set (a `documentCollection:fontGlyphs` scoped read), `contentSelection` · **Writes:** `selectionProperty` (insert glyph into text) / `collection` (glyph sets)
**Operations:** `InsertGlyph`, `CreateGlyphSet`, `AddToGlyphSet`
**Fields:** glyph grid by font, recently-used, alternates fly-out, glyph sets, Unicode lookup, OpenType category filter (ligatures/swashes/ordinals/fractions).
**Notes:** The glyph grid is a bespoke virtualized canvas → expert leaf. Inserting a glyph is a `contentSelection`-scoped text mutation.

---

### Tier 4 — Interactive / digital publishing

#### `paged.buttons-forms`
**Disposition:** H · **Surface:** dock · **Phase:** later
**Reads:** `selectionProperty:interactive*` · **Writes:** `selectionProperty:interactive*`, `collection`
**Operations:** `SetInteractiveType`, `AddButtonEvent`, `AddButtonAction`, `SetButtonState`, `SetFormFieldProperties`
**Fields:** object type (button/checkbox/radio/text-field/list/combo/signature), events (on-release/click/rollover/…), actions (go-to-page/URL/show-hide/video/sound/form-actions), appearance states (Normal/Rollover/Click), PDF/EPUB options.
**Notes:** The appearance-state editor is an expert child; type/event/action lists are composition.

#### `paged.animation`
**Disposition:** H · **Surface:** dock · **Phase:** later
**Reads:** `selectionProperty:animation*` · **Writes:** `selectionProperty:animation*`
**Operations:** `SetAnimationPreset`, `SetAnimationProperties`, `SetMotionPath`
**Fields:** preset, duration, plays count, speed/easing, event trigger, animate-from (opacity/scale/rotation), motion path edit.
**Notes:** Motion-path edit is on-canvas/gesture; the property block is composition.

#### `paged.timing`
**Disposition:** E · **Surface:** dock · **Phase:** later
**Reads:** `documentCollection` (animations on active spread) · **Writes:** `collection`
**Operations:** `SetAnimationOrder`, `SetAnimationDelay`, `GroupAnimations`
**Fields:** per-event animation sequence, reorder, delay, play-together grouping.

#### `paged.media`
**Disposition:** H · **Surface:** dock · **Phase:** later
**Reads:** `selectionProperty:media*` · **Writes:** `selectionProperty:media*`
**Operations:** `SetMediaSource`, `SetPosterFrame`, `SetMediaController`, `AddNavigationPoint`
**Fields:** place video/audio, poster frame, controller skin, play-on-load, loop, navigation points.

#### `paged.object-states`
**Disposition:** E · **Surface:** dock · **Phase:** later
**Reads:** `selectionProperty:objectStates` · **Writes:** `selectionProperty:objectStates`, `collection`
**Operations:** `CreateObjectState`, `DeleteObjectState`, `PasteIntoState`, `ReorderStates`
**Fields:** multi-state object list, state thumbnails, paste-into-state, reorder.
**Notes:** State thumbnails are bespoke → expert leaf.

#### `paged.hyperlinks`
**Disposition:** H · **Surface:** dock · **Phase:** later
**Reads:** `documentCollection:hyperlinks`, `contentSelection` · **Writes:** `collection`, `selectionProperty:appliedCharacterStyle` (link style)
**Operations:** `CreateHyperlink`, `DeleteHyperlink`, `EditHyperlink`, `CreateHyperlinkDestination`
**Fields:** destination types (URL/email/page/text-anchor/file), hyperlink list, character style for links, shared destinations.

#### `paged.cross-references`
**Disposition:** H · **Surface:** dock · **Phase:** later
**Reads:** `documentCollection:crossReferences` · **Writes:** `collection`
**Operations:** `CreateCrossReference`, `UpdateCrossReference`, `SetCrossReferenceFormat`
**Fields:** reference list (to paragraphs/anchors), format, update, jump-to.

---

### Tier 5 — Production / output

#### `paged.separations-preview`
**Disposition:** E · **Surface:** dock · **Phase:** later
**Reads:** `documentCollection:swatches` (inks), `camera` · **Writes:** view-state only (not document)
**Operations:** none (view-only)
**Fields:** per-plate ink visibility, ink-limit (total area coverage) view, overprint preview.
**Notes:** Renders a re-separated raster of the canvas → expert leaf. Writes *view state*, not the document — its `.bindings.ts` declares `writes: []`.

#### `paged.flattener-preview`
**Disposition:** E · **Surface:** dock · **Phase:** later
**Reads:** `camera`, `document` · **Writes:** view-state only
**Operations:** none
**Fields:** highlight transparency-affected areas, flattener preset selection.

#### `paged.preflight`
**Disposition:** H · **Surface:** dock · **Phase:** later
**Reads:** `documentMeta`, `documentCollection:links`, `documentCollection:fonts`, `document` · **Writes:** `collection` (profiles)
**Operations:** `CreatePreflightProfile`, `SetActivePreflightProfile`, `RunPreflight`
**Fields:** active profile, live error list (links/color/images/overset/fonts), error → navigate-to, define profiles.
**Notes:** Error list is composition over a derived read; navigation drives camera/selection.

#### `paged.attributes`
**Disposition:** C · **Surface:** dock/popover · **Phase:** later
**Reads/Writes:** `selectionProperty:{overprintFill,overprintStroke,nonprinting}`
**Operations:** `SetProperty{OverprintFill | OverprintStroke | Nonprinting}`
**Fields:** overprint fill, overprint stroke, nonprinting toggle.

#### `paged.info`
**Disposition:** C · **Surface:** dock · **Phase:** later
**Reads:** `documentMeta`, `selection`, `contentSelection` · **Writes:** ø
**Operations:** none (read-only)
**Fields:** cursor position, selection dimensions, character/word counts, link/font/color summary, file info. Pure `documentMeta` + selection read.

#### `paged.background-tasks`
**Disposition:** E · **Surface:** dock/toast · **Phase:** later
**Reads:** task queue (infrastructure, not document) · **Writes:** ø
**Fields:** async export/IDML/package progress.
**Notes:** Infrastructure panel, not document-bound. Sits outside the catalog read model (reads the client's task queue, not the model).

#### `paged.trap-presets`
**Disposition:** C · **Surface:** dock · **Phase:** far-future
**Reads/Writes:** `documentCollection` (trap presets)
**Operations:** `CreateTrapPreset`, `EditTrapPreset`
**Fields:** trap width, image trap, threshold, step limit. High-end print only; likely out of v1.

---

### Tier 6 — Tools & chrome (expert-rendering + the contextual bars)

#### `paged.tools`
**Disposition:** E · **Surface:** bar (left rail) · **Phase:** 5
**Reads:** `activeTool` · **Writes:** `activeTool`
**Operations:** none (tool state is application state, not a document Operation)
**Fields:** Selection, Direct-Selection, Page, Gap, Type, Type-on-Path, Line, Pen (+add/delete/convert anchor), Pencil, Rectangle/Ellipse/Polygon (frame + shape), Scissors, Free-Transform, Rotate, Scale, Shear, Gradient-Swatch, Gradient-Feather, Note, Eyedropper, Measure, Hand, Zoom. Fill/stroke swatches, formatting-affects-container/text toggles, screen-mode selector.
**Notes:** Wires the `activeTool` observable (extracted to `@paged-media/client` in Phase 1) through the registry. Bespoke geometry + gesture-spine coupling → expert leaf. Writes `activeTool`, not the document.

#### `paged.path-edit-toolbar`
**Disposition:** E · **Surface:** bar/overlay · **Phase:** later
**Reads:** `selection`, `activeTool` · **Writes:** `geometry`
**Operations:** `AddAnchor`, `DeleteAnchor`, `ConvertAnchor`, `SmoothPath`
**Fields:** anchor add/delete/convert, smooth, corner. Gesture-adjacent → expert leaf.

#### `paged.control`
**Disposition:** C (selection-switched) · **Surface:** bar (top) · **Phase:** 4–5
**Reads:** `selection`, `contentSelection`, `selectionProperty:*` · **Writes:** `selectionProperty:*`
**Operations:** (delegates to whatever the contextual sub-panel covers)
**Fields:** A contextual strip that swaps composition based on selection type — text mode shows a condensed Character+Paragraph composition; object mode shows a condensed Object+Stroke composition. Implemented as *several* compositions with a switch on `selection` kind.
**Notes:** Not a new mechanism — it is composition-of-compositions keyed on selection type. The switch lives in a tiny expert wrapper choosing which composition to render; the contents are pure compositions reusing the property-panel leaves.

#### `paged.properties`
**Disposition:** C (selection-switched) · **Surface:** dock · **Phase:** 5
**Reads/Writes:** as Control, plus quick-actions
**Fields:** Consolidated context panel — Transform, Appearance (fill/stroke/effects), Text, Frame-fitting, Quick-Actions. Same switch-on-selection composition pattern as Control, denser.
**Notes:** Strong reuse: Properties and Control are two layouts over the same property-panel compositions. Build the property compositions once (Tier 2), compose them two ways here.

---

### Tier 7 — Scripting / dev

#### `paged.repl`
**Disposition:** E · **Surface:** dock · **Phase:** 5
**Reads:** declared `[]` structural; reads via script eval · **Writes:** `collection` / `geometry` / `selectionProperty` (any Operation via parsed text)
**Operations:** any (it is a script surface)
**Fields:** input line, output log, history.
**Notes:** Reclassified from "unchanged" to expert-leaf in the plan's Phase 5 table — correct, because it makes the binding-declaration discipline universal (nothing escapes a `.bindings.ts`). Its manifest honestly declares `writes: ["collection","geometry","selectionProperty"]` since a script can do anything `paged.mutate` can.

#### `paged.script-editor`
**Disposition:** E · **Surface:** dock · **Phase:** 5
**Reads/Writes:** as REPL · **Operations:** any
**Fields:** code editor (Monaco/CodeMirror), run, save, script list, error surface.
**Notes:** Same shape as REPL. Reads current selection via `paged.selection()` (the Phase-2 host fn). The convergence test (AC-3.2: same edit succeeds from a script) runs through here.

---

### Tier 8 — Asset / library (likely post-v1)

#### `paged.cc-libraries`
**Disposition:** E · **Surface:** dock · **Phase:** far-future
**Reads:** external library service · **Writes:** `collection` (import asset)
**Fields:** shared colors/type/graphics/text across documents.
**Notes:** External-service expert leaf. Out of v1.

#### `paged.content-conveyor`
**Disposition:** E · **Surface:** overlay · **Phase:** far-future
**Reads:** `selection`, conveyor buffer · **Writes:** `geometry` / `collection`
**Fields:** collect & place repeated content across docs (collector/placer).
**Notes:** Cross-document; out of v1.

---

## 7. Consolidated Rust Operation requirements

Every `Operation` referenced above, deduplicated, grouped by domain. This is the Rust-side work the panel set implies — directly feeds the "each Operation gap is phase work" discipline (`sdk.md` invariant 8). Items likely already shipped (per Track M) are marked **[M]**.

**Property writes — Character:** `SetProperty{CharacterFontFamily, CharacterFontStyle, CharacterFontSize, CharacterLeading, CharacterKerning, CharacterTracking, CharacterHScale, CharacterVScale, CharacterBaselineShift, CharacterSkew, CharacterCase, CharacterPosition, CharacterLanguage, CharacterFillColor, CharacterStrokeColor, CharacterUnderline, CharacterStrikethrough, CharacterLigatures, CharacterOpenTypeFeatures}`

**Property writes — Paragraph:** `SetProperty{ParagraphAlignment, ParagraphLeftIndent, ParagraphRightIndent, ParagraphFirstLineIndent, ParagraphLastLineIndent, ParagraphSpaceBefore, ParagraphSpaceAfter, ParagraphDropCapLines, ParagraphDropCapChars, ParagraphHyphenate, ParagraphAlignToGrid, ParagraphKeepOptions, ParagraphSpanColumns, ParagraphShading, ParagraphBorder, ParagraphBulletsNumbering, ParagraphTabStops}`

**Property writes — Frame/Object:** `SetProperty{FrameX, FrameY, FrameWidth, FrameHeight, FrameRotation, FrameShear, FrameScaleX, FrameScaleY, FrameFlipH, FrameFlipV, FrameReferencePoint, FrameFillColor, FrameStrokeColor, FrameStrokeWeight, FrameStrokeType, FrameStrokeAlign, FrameStrokeCap, FrameStrokeJoin, FrameStrokeMiter, FrameStrokeDashPattern, FrameStrokeStartArrow, FrameStrokeEndArrow, FrameStrokeGapColor, FrameCornerShape, FrameCornerRadius}` · `SetFrameBounds{x,y,w,h}` (atomic, gesture-spine)

**Property writes — Effects:** `SetProperty{FrameOpacity, FrameBlendMode, FrameFillOpacity, FrameStrokeOpacity, FrameTextOpacity, FrameDropShadow, FrameInnerShadow, FrameOuterGlow, FrameInnerGlow, FrameBevelEmboss, FrameSatin, FrameBasicFeather, FrameDirectionalFeather, FrameGradientFeather, FrameGradient, FrameKnockoutGroup, FrameIsolateBlending}`

**Property writes — Text-frame / wrap / fitting / anchor / story / attributes:** `SetTextFrameColumns{count,gutter,…}` (atomic) · `SetProperty{TextFrameInsetTop/Bottom/Left/Right, TextFrameVerticalJustify, TextFrameFirstBaselineOffset, TextFrameAutoSize, TextFrameIgnoreWrap, TextWrapMode, TextWrapOffsetTop/Bottom/Left/Right, TextWrapContour, TextWrapInvert, TextWrapAffectsBeneathOnly, FittingMode, FittingReferencePoint, FittingCrop, FittingAutoFit, AnchoredPosition, AnchoredReferencePoint, AnchoredOffsetX, AnchoredOffsetY, AnchoredPreventManual, StoryOpticalMarginAlignment, OverprintFill, OverprintStroke, Nonprinting, HJWordSpacing, HJLetterSpacing, HJGlyphScaling, HJSingleWordJustify}`

**Applied-entity writes (§5.3):** `SetProperty{AppliedParagraphStyle, AppliedCharacterStyle, AppliedObjectStyle, AppliedCellStyle, AppliedTableStyle, AppliedConditions}`

**Structural — pages/spreads:** `InsertPage, DeletePage, MovePage, DuplicateSpread, ApplyMaster, SetPageSize, CreateSection, SetPageNumberingStyle`

**Structural — layers [M for core]:** `CreateLayer, DeleteLayer, RenameLayer [M], MoveLayer [M], SetLayerVisible, SetLayerLocked, SetLayerColor, MoveObjectsToLayer [M], MergeLayers`

**Structural — z-order/grouping:** `MoveObjectInZOrder, GroupObjects, UngroupObjects`

**Geometry (multi-target, §5.4):** `AlignObjects, DistributeObjects, DistributeSpacing, PathfinderOp, ConvertShape, ConvertPoint, OpenPath, ClosePath, ReversePath, AddAnchor, DeleteAnchor, ConvertAnchor, SmoothPath`

**Collections — swatches/gradients:** `CreateSwatch, EditSwatch, DeleteSwatch, RenameSwatch, SetSwatchType, MergeSwatches, CreateColorGroup, CreateGradientSwatch`

**Collections — styles:** `Create{Paragraph,Character,Object,Cell,Table}Style, Edit{…}Style, Delete{…}Style, RenameStyle, DuplicateStyle, SetStyleBasedOn, SetNextStyle, RedefineStyleFromSelection, ClearOverrides`

**Collections — links/articles/interactive:** `RelinkAsset, UpdateLink, EmbedLink, UnembedLink, CreateArticle, AddToArticle, ReorderArticleContent, SetIncludeInExport, CreateBookmark, DeleteBookmark, RenameBookmark, ReorderBookmark, CreateHyperlink, EditHyperlink, DeleteHyperlink, CreateHyperlinkDestination, CreateCrossReference, UpdateCrossReference, SetCrossReferenceFormat`

**Collections — conditional text / index / toc:** `CreateCondition, DeleteCondition, SetConditionVisible, ApplyConditionToText, CreateConditionSet, CreateIndexEntry, CreateIndexTopic, GenerateIndex, GenerateTOC, UpdateTOC, CreateTOCStyle`

**Tables:** `SetTableDimensions, SetRowHeight, SetColumnWidth, InsertRow, InsertColumn, DeleteRow, DeleteColumn, MergeCells, SplitCell, SetCellInset, SetCellVerticalJustify, SetCellStroke, SetCellFill, SetAlternatingPattern, SetTableBorder, SetHeaderFooterRows`

**Interactive/media:** `SetInteractiveType, AddButtonEvent, AddButtonAction, SetButtonState, SetFormFieldProperties, SetAnimationPreset, SetAnimationProperties, SetMotionPath, SetAnimationOrder, SetAnimationDelay, GroupAnimations, SetMediaSource, SetPosterFrame, SetMediaController, AddNavigationPoint, CreateObjectState, DeleteObjectState, PasteIntoState, ReorderStates`

**Text-content (contentSelection-scoped):** `InsertGlyph, CreateGlyphSet, AddToGlyphSet`

**Production:** `CreatePreflightProfile, SetActivePreflightProfile, RunPreflight, CreateTrapPreset, EditTrapPreset`

> Each arm needs its inverse in `crates/paged-mutate/src/apply.rs` for undo (the plan's AC pattern). The property-write arms are mechanical; the collection and geometry arms carry the real implementation weight.

---

## 8. Phasing (mapped onto the implementation plan)

The plan's phases stop at the proof slice + the named Phase-5 sweep. This inventory extends past that, so panels beyond the plan's named set get a coarser bucket: **v1** (ship for a usable editor), **v2** (rounding out parity), **far-future** (high-end print, cross-doc, external services).

| Phase / bucket | Panels |
| -------------- | ------ |
| **Phase 1** | (no panels — `activeTool` observable extracted, used by Tools later) |
| **Phase 3 (proof)** | `character` (composition proof), `pages` (structural proof, migrates `navigator-panel`), `spread-minimap` (expert-leaf proof). **SDK: `documentCollection` read lands here** — Pages forces it. |
| **Phase 5 (named sweep)** | `paragraph`, `stroke`, `effects`, `object-transform`, `swatches`, `paragraph-styles`, `character-styles`, `layers`, `outline`, `tree`, `links`, `articles`, `tools`, `repl`, `script-editor`; retire `inspector` |
| **v1** | `color`, `gradient`, `text-frame-options`, `text-wrap`, `frame-fitting`, `align`, `pathfinder`, `properties`, `control`, `attributes`, `info`, `object-styles` |
| **v2** | `corner-options`, `anchored-object`, `story`, `tabs`, `hyphenation-justification`, `glyphs`, `table`, `cell-styles`, `table-styles`, `hyperlinks`, `cross-references`, `bookmarks`, `conditional-text`, `buttons-forms`, `animation`, `timing`, `media`, `object-states`, `preflight`, `background-tasks`, `color-themes`, `toc`, `index` |
| **far-future** | `separations-preview`, `flattener-preview`, `trap-presets`, `cc-libraries`, `content-conveyor` |

**The one SDK dependency that gates everything:** `documentCollection` must land in Phase 3 (Pages needs it). Once it exists, the entire collection tier (Swatches, Styles, Links, Articles, Layers list) unblocks at once. This is why Pages is the right structural proof — it forces the single SDK addition early, where it is cheap to get wrong, exactly as the plan argues for the catalog primitives.

---

## 9. Catalog primitive additions implied by the inventory

New primitive leaves the inventory justifies (each meets the §9 ">= 2 panels" rule). Added to the Phase-3b vocabulary.

| New primitive | Used by (≥2) | Notes |
| ------------- | ------------ | ----- |
| `paged.layout.tree-list` | Outline, Tree, Bookmarks, Index | Nested, collapsible, selectable list. The most-reused structural primitive. Add once when Outline+Tree migrate. |
| `paged.input.font-select` | Character, Character-style editor, Paragraph-style editor | `enum-select` specialized with font preview + `documentCollection:fonts` source. |
| `paged.input.collection-select` | Swatches-as-fill, all Style panels, Hyperlink-style | `enum-select` whose options come from a `documentCollection` read rather than a literal list. **This is the primitive that operationalizes §5.3** — apply-an-entity as a bound select. |
| `paged.input.toggle-group` | Paragraph (alignment), Object (flip), Stroke (cap/join) | Segmented multi-state toggle; pure `selectionProperty` write of an enum. |
| `paged.input.reference-point` | Object/Transform, Frame-fitting, Anchored-object | 9-point picker writing one enum property. |
| `paged.layout.popover-section` | Effects, Corner-options, Text-frame-options, H&J | A section that launches a composition in a popover. Layout-only. |

Lint rule (extends the plan's set): every `documentCollection`-sourced `collection-select` must name a valid `CollectionName` — a compile-time check against the enum, so a typo'd collection name fails CI rather than rendering empty.

---

## 10. Expert-leaf register (the audit list for invariant 9)

Every expert leaf in the inventory, with its declared write surface. This is the list a release-time audit walks to confirm none has started reaching past `paged.mutate`.

| Panel | Renders | Declared writes | Mutation path |
| ----- | ------- | --------------- | ------------- |
| `paged.canvas` | document raster | ø | gesture spine |
| `pages` thumbnail strip | spread thumbnails | `selection`, `camera`, `collection` | `paged.mutate` |
| `layers` row | drag-reorder row | `collection` | `paged.mutate` |
| `swatches` grid | swatch chips | `selectionProperty`, `collection` | `paged.mutate` |
| `gradient` ramp | multi-stop ramp | `selectionProperty`, `collection` | `paged.mutate` |
| `tabs` ruler | draggable ruler | `selectionProperty` | `paged.mutate` |
| `glyphs` grid | glyph grid | `selectionProperty`, `collection` | `paged.mutate` |
| `tools` | tool rail | `activeTool` | observable set (not document) |
| `path-edit-toolbar` | anchor controls | `geometry` | `paged.mutate` |
| `align` / `pathfinder` | button cluster | `selection`, `geometry` | `paged.mutate` / command |
| `separations-preview` / `flattener-preview` | re-rendered raster | ø (view-state) | none |
| `object-states` / `timing` | thumbnails / sequence | `collection` | `paged.mutate` |
| `repl` / `script-editor` | text I/O | any | `paged.mutate` (via script) |
| `index` | entry tree | `collection` | `paged.mutate` |
| `cc-libraries` / `content-conveyor` | external/buffer | `collection`, `geometry` | `paged.mutate` |

Invariant: **every row's mutation path is `paged.mutate`, the gesture spine, or an observable set — never a direct model reach.** A leaf whose audit row cannot name one of these three is a bug.

---

## 11. Decisions register (this document)

| # | Decision | Status |
| - | -------- | ------ |
| D1 | Add `documentCollection` + `documentMeta` read kinds + `collection()`/`documentMeta()` handle methods. The only binding-language growth. | Proposed |
| D2 | No plural-write binding kind. Atomic multi-field writes are single `Operation`s from an expert leaf or gesture spine. | Proposed |
| D3 | Entity application (style/swatch) is a `selectionProperty` write whose value is an entity id. No new write kind. | Proposed |
| D4 | Multi-target geometry (Align/Distribute/Pathfinder) is command-backed expert leaves; work is in the Operation set. | Proposed |
| D5 | Collection mutation goes through `paged.mutate` from an expert child; work is Operation coverage. | Proposed |
| D6 | `documentCollection` lands in **Phase 3**, forced by Pages, unblocking the whole collection tier. | Proposed |
| D7 | Add 6 catalog primitives (§9); `collection-select` is the load-bearing one (operationalizes D3). | Proposed |
| D8 | `"mixed"` resolution sentinel for heterogeneous selection — resolution refinement, not a binding kind. | Proposed |

All redirectable, in the plan's house style.

---

## 12. One-sentence summary

Enumerating the full InDesign-class panel set proves the binding ceiling holds: the entire surface needs **one new read kind** (`documentCollection`) and **zero new write kinds** — collection mutation, entity application, multi-target geometry, and atomic multi-field writes all resolve into the existing expert-leaf + `selectionProperty` + `paged.mutate` triad, so the catalog stays finite, the mutation invariant stays intact, and the A2UI adapter stays enforceable.

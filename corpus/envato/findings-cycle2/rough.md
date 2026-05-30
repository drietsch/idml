# Envato `rough` tier — cycle-2 fidelity findings (meanΔE > 20)

Tier review of the 10 packs that survived cycle 1 in the rough bucket.
**Five are regressions** (worse than pre-cycle-1). For each, the
hypothesis names which cycle-1 fix exposed the new visible delta and
which deferred backlog item would close it.

Sampled packs (post-cycle-1 mean ΔE):

- `hair-stylist-brochure-vol-3` (21.59 — winner; still in tier)
- `soccer-career-flyer-templates` (23.59 — REGRESSION 11.21→23.59)
- `annual-report-template-8b5d40` (24.52 — REGRESSION 15.15→24.52)
- `the-brochure` (26.59)
- `wedding-newspaper` (26.70 — REGRESSION 25.87→26.70)
- `event-program-brochure` (33.75)
- `welcome-guide-template` (37.63 — REGRESSION 32.17→37.63)
- `fitness-protein-powder-business-card-templates` (51.18 — REGRESSION 31.31→51.18)
- `travel-guide-brochure-template-indd-canva` (52.97)
- `annual-report-template` (63.82)

Common cycle-2 thread: cycle 1 made *foreground* content visible (P-11
gradient text, P-02 missing-image placeholder, P-18 white-on-color
text) but the *background* layers it was meant to land on are still
deferred (P-09 GradientFeather on non-Rect shapes, P-10 paragraph
shading) or expose newly-discovered gaps (object-style FillTint
cascade, embedded `<PDF>` content, blend-group composition against
paper, complex Rectangle paths, layer z-order). Net effect: the
visible delta moves from "nothing" to "something wrong on white",
which scores worse on ΔE.

Findings are sorted by Severity desc, Frequency desc, Effort asc.

---

### F-01: `ObjectStyle` `FillTint` not cascaded → image placeholders + tinted callouts render at 100% strength
- **Category**: Color / Cascade
- **Severity**: Blocker
- **Frequency**: 5+ packs (welcome-guide-template, wedding-newspaper, travel-guide-brochure-template-indd-canva, annual-report-template-8b5d40 partial, several Envato templates that share the "Placeholders" object style)
- **Crate(s)**: paged-parse, paged-renderer
- **Evidence**:
  - `corpus/envato/reports/welcome-guide-template/heat-002.png` (light-grey image-placeholder rectangles render solid black; cascade source `ObjectStyle/Placeholders` declares `FillColor="Color/Black" FillTint="15"`)
  - `corpus/envato/reports/wedding-newspaper/heat-001.png` (tiled "YOUR IMAGE GOES HERE" placeholder area paints solid black instead of 15% grey)
  - `corpus/envato/reports/travel-guide-brochure-template-indd-canva/heat-001.png` (the central "Traveling / Guide Book.." panel renders solid black; ref shows 15% grey)
- **Symptom**: Image-placeholder rectangles + decorative panels that cascade their fill from an `<ObjectStyle>` carrying `FillColor="…" FillTint="N"` paint at 100% strength. The frame element itself omits FillTint — it relies on cascade — and `object_style_cascade` doesn't pass FillTint through.
- **Root cause (hypothesis)**: `ResolvedObject` at `crates/paged-parse/src/styles.rs:152` lists only five fields (`fill_color`, `stroke_color`, `stroke_weight`, `corner_radius`, `corner_option`) — no `fill_tint`. Even if the field existed, `object_style_cascade` at `crates/paged-renderer/src/module/object_style.rs:38-65` only cascades `fill_color`, `stroke_color`, `corner_radius`, `corner_option` (and only the corner fields on Rect geometries). So a Rectangle with no inline FillColor inherits black from `ObjectStyle/Placeholders` but FillTint=15 is dropped on the floor. **This is the dominant driver of the welcome-guide / wedding-newspaper / travel-guide regressions**: cycle 1 didn't introduce the bug, but P-01 and P-02 raising the visible "weight" of frame fills exposed how loudly it screams when the placeholder rectangles paint pure black instead of light grey.
- **Suggested fix**: Add `pub fill_tint: Option<f32>` to `ResolvedObject` at `crates/paged-parse/src/styles.rs:152`; populate from `<ObjectStyle FillTint="…">` in the parser (mirror the existing FillColor populate pattern at `:1187`); cascade it in `object_style_cascade` at `crates/paged-renderer/src/module/object_style.rs:42` next to `fill_color`. Same pattern for `stroke_tint` if symptoms recur. Adds 3 fields, 1 cascade line.
- **Effort**: S

---

### F-02: GradientFeather on Polygon / Oval / TextFrame / GraphicLine still missing — page backgrounds vanish (P-09 extension)
- **Category**: Effects
- **Severity**: Blocker
- **Frequency**: 5+ packs (hair-stylist-brochure-vol-3, soccer-career-flyer-templates, fitness-protein-powder-business-card-templates, the-brochure, annual-report-template-8b5d40)
- **Crate(s)**: paged-parse, paged-compose, paged-renderer
- **Evidence**:
  - `corpus/envato/reports/hair-stylist-brochure-vol-3/heat-001.png` (right half of cover spread missing the grey gradient-feathered backdrop + giant "S/T/Y/L" decorative letters; visible delta now larger because the cycle-1-recovered "BROCHURE / HAIR STYLIST" left panel landed on white)
  - `corpus/envato/reports/hair-stylist-brochure-vol-3/heat-005.png` (orange page-bg Polygon with `<GradientFeatherSetting>` paints grey instead of yellow)
  - `corpus/envato/reports/soccer-career-flyer-templates/heat-001.png` (entire orange page bg + textured silhouette host renders as grey/white; multiple Polygons + non-Rect frames carry GradientFeatherSetting)
  - `corpus/envato/reports/fitness-protein-powder-business-card-templates/heat-001.png` (P-11 cycle-1 fix paints "WHEY POWER / Pro" gradient text — but the red/green Multiply backgrounds those titles were designed to land on are gradient-feathered Rectangles tangled with the F-04 Multiply-on-paper bug; visible delta jumped 31.31 → 51.18)
- **Symptom**: Decorative gradient-feathered backdrops on non-Rectangle shapes paint as flat fill (or, when the frame's FillColor is None, as nothing) — the `<GradientFeatherSetting>` plumbing wired for Rectangle in cycle 1 was never extended.
- **Root cause (hypothesis)**: `effects: Option<FrameEffects>` lives only on `Rectangle` (`crates/paged-parse/src/spread.rs:470`). `Polygon` (`:881`), `Oval` (`:707`), `TextFrame` (`:443`), `GraphicLine` (`:750`) all lack the field and the matching `emit_effects_pre_fill` / `emit_effects_post_fill` calls in their per-shape `emit_*_into` paths in `pipeline.rs`. Cited as deferred in `improvement-protocol.md` P-09 ("Extension to Polygon / Oval / TextFrame / GraphicLine is its own batch"). **This is the primary regression driver for hair-stylist-brochure-vol-3 and soccer-career-flyer-templates**: pre-fix, both packs silently rendered nothing in those shapes; post-fix they still render nothing in those shapes, but cycle-1 P-02 + P-11 added foreground content (placeholders, gradient text) on top of the missing background, yielding higher delta.
- **Suggested fix**: Mechanical extension of cycle-1's Rectangle path. (a) Add `pub effects: Option<FrameEffects>` to the four parser structs above; populate from the same parse arm that's currently Rectangle-only (search for `FrameEffects::default` in `crates/paged-parse/src/spread.rs`). (b) Mirror the Rectangle emit hooks at `crates/paged-renderer/src/pipeline.rs:7038-7058` (the `if let Some(effects) = rect.effects.as_ref()` blocks bracketing `fill_paint_module`) into `emit_polygon_into` near `:7405`, `emit_oval_into` near `:6493` / `:7530`, `emit_text_frame_into` near `:6831`, and the GraphicLine emit site. The compose-side `DisplayCommand::GradientFeather` and CPU `render_gradient_feather` are already shape-agnostic (operate on a path id + transform), so no rasterizer changes needed. ~4 parser sites + 4 emit sites + the `from_*` constructors in `frame.rs`.
- **Effort**: M

---

### F-03: Embedded `<PDF>` page content not decoded — placed-PDF backgrounds become missing-image placeholders
- **Category**: Images
- **Severity**: Blocker
- **Frequency**: 3+ packs (soccer-career-flyer-templates, annual-report-template, the-brochure, likely more — `<PDF>` is InDesign's "Place ▸ PDF" element)
- **Crate(s)**: paged-parse, paged-renderer, paged-compose
- **Evidence**:
  - `corpus/envato/reports/soccer-career-flyer-templates/heat-001.png` (giant grey placeholder X-cross covers the spread because Rectangle u6aa3 hosts a `<PDF>` element with inline base64 PDF content — the player silhouette + textured backdrop. Cycle-1 P-02 placeholder now stamps a grey rect over what used to be unrendered transparent space, revealing the missing background.)
  - `corpus/envato/reports/annual-report-template/heat-001.png` (cover page: the entire 35MB Rectangle ua055 carries an embedded `<Image>` whose content is undecodable — likely PDF or oversized JPEG; placeholder X stamps over what should be a blue gradient cover, exposing white text as light grey "ANNUAL")
- **Symptom**: Pages whose hero artwork is a placed PDF (or an `<Image>` with embedded PDF/EPS/oversized data) render as InDesign's missing-image placeholder (grey + diagonal X) rather than the actual artwork. Where the placeholder lands on top of a transparent/Paper backdrop, white-on-color text from above reads as light-grey-on-grey (much higher ΔE than white-on-white).
- **Root cause (hypothesis)**: `crates/paged-parse/src/spread.rs:2007` treats `b"PDF"` and `b"ImportedPage"` interchangeably with `<Image>` — flips `has_image_element=true` so the missing-image-placeholder fires (P-02 / P-14 path), but never extracts the inline `<Contents>` CDATA or routes it to a PDF rasterizer. `decode_image_bytes` in `crates/paged-renderer/src/pipeline.rs:7967` sniffs `%!PS` and bails (P-14 EPS triage); `%PDF-` is treated identically — placeholder, no decode. **Soccer-flyer's specific regression is here**: pre-fix the PDF rectangle was silent (no fill, no glyphs, no placeholder), so it scored "missing pixels match white background"; post-fix the placeholder grey + X is stamped, scoring badly against the orange/silhouette reference.
- **Suggested fix**: Two-tiered, mirroring P-14's EPS triage. (a) Triage (S): in the parser, when `<PDF>` carries `<Contents>` CDATA but no `LinkResourceURI`, set a new `has_inline_pdf: bool` flag distinct from `has_image_element`. In `emit_*_missing_image_placeholder`, special-case inline-PDF rectangles to emit a *paper-coloured fill rather than the grey + X-cross* (matches InDesign's behaviour when a placed PDF can't render — it shows the underlying object-style/frame fill, not a placeholder). This alone closes the soccer-flyer regression without needing a PDF interpreter. (b) Full decode (L): wire a `pdfium`/`mupdf` sidecar decoding the CDATA to RGBA, then route through `DecodedImage`. Document WASM unsupportability in `docs/plan.md`. Triage path is enough to recover meanΔE on the 3 regression packs.
- **Effort**: S for triage; L for full decode

---

### F-04: Multiply / blend-mode rectangles composite against transparent backdrop instead of page paper
- **Category**: Effects
- **Severity**: Blocker
- **Frequency**: 4+ packs (fitness-protein-powder-business-card-templates, soccer-career-flyer-templates, business-proposal-template, hair-stylist-brochure-vol-3)
- **Crate(s)**: paged-renderer, paged-gpu
- **Evidence**:
  - `corpus/envato/reports/fitness-protein-powder-business-card-templates/heat-001.png` (red Rectangle ubeae with `BlendMode="Multiply"` + GradientFeather paints transparent over white instead of red over paper — the foreground "WHEY POWER" gradient text now hangs in white space)
  - `corpus/envato/reports/soccer-career-flyer-templates/heat-001.png` (multiple Polygons / Rects with `BlendMode="HardLight" / "Overlay" / "ColorBurn" / "SoftLight" / "Darken"` composite away to nothing because the spread has no opaque base layer underneath)
  - `corpus/envato/reports/hair-stylist-brochure-vol-3/heat-001.png` (the cycle-1-restored gradient titles + text fall on white because Multiply rectangles above lose their colour against transparent paper)
- **Symptom**: When a frame uses a non-Normal `BlendMode` (Multiply, ColorBurn, HardLight, etc.) and the spread doesn't draw an opaque Paper rectangle behind it, the blend group composites the frame against α=0 backdrop and the frame's contribution annihilates (Multiply × 0 = 0; ColorBurn likewise vanishes). InDesign treats the page as opaque white paper, so Multiply-against-paper preserves the colour.
- **Root cause (hypothesis)**: `frame_needs_blend_group` at `crates/paged-renderer/src/pipeline.rs:8109` correctly detects non-Normal blend modes and pushes a group via `push_blend_group` at `:8127`. The CPU rasterizer's `BeginBlendGroup` (`crates/paged-gpu/src/cpu.rs:1513`) snapshots the parent's existing pixels for the non-isolated semantic — but if the parent at the group's bounds is still the cleared-to-paper-white pixmap (no Rectangle has painted there yet, because spreads sometimes skip the explicit page-bg Paper rect), the snapshot is α=0 transparent, not opaque white. The composite at `EndBlendGroup` then multiplies against transparent → transparent. **This is the second-largest regression driver for fitness-protein-powder**: cycle-1 P-11 painted gradient titles, but the red/green Multiply rectangles those titles needed for backdrop colour are still annihilating to transparent.
- **Suggested fix**: Two paths. (a) Quick win (S): treat the page raster as paper (α=1 white) at `BeginBlendGroup` snapshot time when the snapshot region's α is fully zero. Touch `crates/paged-gpu/src/cpu.rs:1541` (the snapshot-taking path) — substitute opaque white for fully-transparent pixels. Mirrors PDF's "page is white paper" assumption. (b) Correct fix (M): paint an opaque Paper rect at the page bbox before *any* spread items (the current implicit-clear behaviour mirrors PDF's transparent device, but InDesign exports treat the page as opaque). Add to `crates/paged-renderer/src/pipeline.rs::render` page-init. Either path requires verifying we don't double-paint already-opaque-Paper-rect packs.
- **Effort**: S for snapshot patch; M for paper init

---

### F-05: `<Rectangle>` with multi-anchor `<GeometryPathType>` collapses to AABB — torn-paper / star / sticker shapes lose geometry
- **Category**: Path
- **Severity**: Major
- **Frequency**: 3+ packs (fitness-protein-powder-business-card-templates, soccer-career-flyer-templates, hair-stylist-brochure-vol-3)
- **Crate(s)**: paged-renderer
- **Evidence**:
  - `corpus/envato/reports/fitness-protein-powder-business-card-templates/heat-001.png` (Rectangle ube48 — green "torn paper" shape — carries 241 `<PathPointType>` anchors describing a complex outline; renders as plain rectangle in cand)
  - `corpus/envato/reports/soccer-career-flyer-templates/heat-001.png` (Rectangle u6831 has 4 anchors but is the host for the orange page-bg with ColorBurn + GradientFeather; geometry is fine here, but other Rectangles in similar packs use multi-anchor paths for stickers/badges)
- **Symptom**: A Rectangle element whose `<PathGeometry>` declares a non-rectangular outline (decorative shapes that InDesign authored as rectangles then reshaped) renders as the AABB rather than the actual outline. P-15 fixed the analogous bug for Polygon (`PathOpen` + multi-contour); the Rectangle equivalent was not addressed.
- **Root cause (hypothesis)**: `ResolvedFrame::from_rectangle` at `crates/paged-renderer/src/module/frame.rs:201` hardcodes `geometry: Geometry::Rect { rect: rect_from_bounds(rect.bounds) }` regardless of how many anchors the parser captured. The parser stores anchors on Rectangle (per `crates/paged-parse/src/spread.rs:246-254` — confirmed via the 241-anchor count above), so the data is sitting there unused. Polygon's adapter at `frame.rs:238-251` already does the right thing (route to `Geometry::Polygon` when anchors are non-empty); Rectangle just needs the same branch.
- **Suggested fix**: Mirror the Polygon adapter logic in `from_rectangle` at `crates/paged-renderer/src/module/frame.rs:201`. When `rect.anchors.len() > 4` (or when the path point set materially differs from the AABB corners), emit `Geometry::Polygon { anchors: &rect.anchors, subpath_starts: &rect.subpath_starts, subpath_open: &rect.subpath_open, bbox }` instead. The Polygon emit path already handles compound paths and `PathOpen` correctly post-P-15. ~5-line change plus a unit test on a multi-anchor Rectangle.
- **Effort**: S

---

### F-06: TextFrame fill color drops on full-bleed colored frames containing text
- **Category**: Color / Layout
- **Severity**: Major
- **Frequency**: 2+ packs (event-program-brochure, likely more — Envato templates often colour entire pages by giving the body TextFrame a FillColor)
- **Crate(s)**: paged-renderer
- **Evidence**:
  - `corpus/envato/reports/event-program-brochure/heat-002.png` (TextFrame u62cc3 carries `FillColor="Color/Color 2c"` — deep blue — and contains the page's "TABLE OF CONTENTS" body. Cand renders white where the deep blue page bg should be; "TABLE OF CONTENTS" text appears as black instead of white-on-blue)
  - `corpus/envato/reports/event-program-brochure/heat-001.png` (similar pattern on adjacent pages)
- **Symptom**: A TextFrame that doubles as a page-bg colour panel renders the text correctly but the frame fill itself is missing. Inside the cycle-1-improved P-18 white-text path, the white glyphs land on white paper instead of blue background.
- **Root cause (hypothesis)**: Need investigation. `from_text_frame` at `crates/paged-renderer/src/module/frame.rs:145` plumbs `fill_color` through, and `emit_text_frame_into` at `crates/paged-renderer/src/pipeline.rs:6831` does call `fill_paint_module`. But TextFrame uses `Geometry::TextFrameRect` (not `Geometry::Rect`) — possibly the fill emit path special-cases that geometry to skip the fill (e.g. treating the frame as a pure text container). Alternatively the AABB centroid for u62cc3 (with its large negative y-translate `-1038.89`) lands on the wrong page despite P-04 cross-page routing.
- **Suggested fix**: (a) Add a unit test covering "TextFrame with non-None FillColor renders a fill" and confirm `fill_paint_module` actually emits commands for `Geometry::TextFrameRect`. (b) If the centroid-routing is the cause, ensure `emit_text_frame_into`'s page dispatch uses overlap-pages rather than centroid-page. (c) If `Geometry::TextFrameRect` short-circuits in `fill_paint_module`, treat it identically to `Geometry::Rect`.
- **Effort**: S (investigation), S-M (fix)

---

### F-07: Layer z-order ignored — items in upper `ItemLayer` paint *under* items in lower layers when XML order disagrees
- **Category**: Layout
- **Severity**: Major
- **Frequency**: 2+ packs (the-brochure, white-blue-modern-company-annual-report per P-30)
- **Crate(s)**: paged-renderer
- **Evidence**:
  - `corpus/envato/reports/the-brochure/heat-022.png` (ref shows blue side strip on top of red column; cand misses the blue strip entirely. The blue strip is on a different ItemLayer — drawn first in XML order but should paint on top per InDesign's layer stack)
  - `corpus/envato/reports/the-brochure/heat-016.png` (similar layer-ordering symptom)
  - Closely related to deferred P-30 (`white-blue-modern-company-annual-report/cand-024.png` — Paper-coloured rect on layer ub8 doesn't punch through Blue rect on layer ueb)
- **Symptom**: Frames whose `ItemLayer` references a layer near the top of the layer stack render *behind* frames on lower layers when the spread XML serialises them in stack order (lower-layer first). The renderer iterates by `spread.text_frames` / `.rectangles` / `.polygons` per-shape lists in *XML order*, then sorts those by nothing — so an upper-layer Rectangle that appeared earlier in XML renders below a lower-layer Polygon that appeared later.
- **Root cause (hypothesis)**: `crates/paged-renderer/src/pipeline.rs:548-564` only uses ItemLayer for visibility filtering (`layer_visible`), never for z-ordering. The frame iteration order at `:581-590` follows `document.spreads[i].text_frames / rectangles / ...` lists which preserve XML order. There's no pass that sorts items by their ItemLayer's stack index (designmap declares layers in stack order; index-of-layer = z-order).
- **Suggested fix**: After parse, build a `layer_stack_index: HashMap<&str, usize>` from `document.container.designmap.layers`. In the per-spread emit loop at `crates/paged-renderer/src/pipeline.rs:581-824`, build a single combined `Vec<FrameRef>` across all shape kinds, then sort by `(layer_stack_index, xml_order_within_layer)`, then iterate. Also resolves P-30 (Paper-knockout). Touch points: ~30 lines + a unit test on a 3-rect 2-layer fixture.
- **Effort**: M

---

### F-08: Phantom paragraph still leaks past P-25 fix — text frame end-of-story produces overlapping rendered paragraphs
- **Category**: Text
- **Severity**: Major
- **Frequency**: 2+ packs (welcome-guide-template, possibly more)
- **Crate(s)**: paged-renderer
- **Evidence**:
  - `corpus/envato/reports/welcome-guide-template/heat-002.png` ("Linda Brown" renders as overlapping "LinedaBrown"; "Page No: 2" appears twice stacked vertically; the body paragraph renders twice with offset baselines)
  - `corpus/envato/reports/welcome-guide-template/heat-006.png` (similar pattern on multiple pages)
- **Symptom**: A text frame's body paragraph and signature line render twice with slightly offset baselines, creating a "double-vision" overlay across both visible glyphs. P-25 fixed trailing-`\n` phantom paragraphs, but a different code path is still emitting duplicate sub-paragraphs.
- **Root cause (hypothesis)**: `split_paragraph_at_breaks` at `crates/paged-renderer/src/pipeline.rs:5549` plus the cycle-1 tail-guard fix only drops fully-empty trailing sub-paragraphs. The welcome-guide case appears to have a *non-empty* phantom — possibly a paragraph whose runs have content but inherit the same y-position from the parent paragraph state on `StoryEmitter`. Could also be threaded-frame `NextTextFrame` chasing emitting the same story body into two consecutive frames on the same page.
- **Suggested fix**: Investigation pass. (a) Capture `StoryEmitter::paragraph_command_ranges` for the affected pages and confirm whether a single source paragraph is producing two render passes. (b) If yes, audit per-paragraph `pen_y` advance bookkeeping after `split_paragraph_at_breaks`. (c) Possibly extend P-25's tail-guard to also drop trailing sub-paragraphs whose runs are entirely whitespace (not just `\n`-only).
- **Effort**: S (investigation), S-M (fix)

---

### F-09: `ParagraphShading` / `RuleAbove` / `RuleBelow` / `ParagraphBorder` still unimplemented (P-10 follow-up)
- **Category**: Text
- **Severity**: Major
- **Frequency**: 4+ packs in this tier (fitness-protein-powder-business-card-templates, soccer-career-flyer-templates per cycle-1 evidence, real-estate-brochure, saas-product-launch-annual-report-brochure — explicitly listed as deferred in P-10)
- **Crate(s)**: paged-parse, paged-text, paged-renderer
- **Evidence**:
  - `corpus/envato/reports/fitness-protein-powder-business-card-templates/heat-001.png` ("WHEY" / "POWER" titles in the IDML carry `ParagraphShadingTint`, `RuleAboveLineWeight`, `RuleBelowLineWeight`, `ParagraphBorderTopLineWeight` — none rendered)
- **Symptom**: Headlines + callouts that depend on paragraph-level decorative bands / borders / rules render without those decorations. Re-cite the cycle-1 P-10 evidence list under cycle 2 because the underlying batch is still deferred.
- **Root cause (hypothesis)**: Same as P-10 in `improvement-protocol.md` — workspace grep for `ParagraphShading` / `RuleAbove` / `RuleBelow` returns zero hits in `crates/paged-parse/src/styles.rs` or `story.rs`.
- **Suggested fix**: As described in P-10's "Suggested fix" — parser fields on `ResolvedParagraph`, new `DisplayCommand::FillRect` / `StrokePath` emit primitives in `pipeline.rs::emit_line_decorations` at `:8405`. Mechanical fan-out of underline/strikethrough machinery. Re-sized as M-L given 4 feature families × cascade × emit.
- **Effort**: L

---

### F-10: Polygon Rectangle / non-Rect with embedded `<Image>` (large/oversized) → placeholder grey reveals previously-invisible foreground content
- **Category**: Images
- **Severity**: Major
- **Frequency**: 4+ packs (annual-report-template, fitness-protein-powder-business-card-templates, hair-stylist-brochure-vol-3, the-brochure)
- **Crate(s)**: paged-renderer
- **Evidence**:
  - `corpus/envato/reports/annual-report-template/heat-001.png` (Rectangle ua055 hosts a 35MB `<Image>` element — oversized JPEG/embedded PDF — that fails to decode; cycle-1 P-02 stamps placeholder grey + X-cross over what should be a deep-blue gradient cover, exposing the white "ANNUAL" headline as light grey on grey)
  - `corpus/envato/reports/annual-report-template/heat-020.png` (similar — cover/back page hero image undecodable, placeholder X stamps over the spot)
- **Symptom**: A frame whose `<Image>` link resolves to a payload our decoder can't handle (oversized, EPS, PDF, CMYK TIFF, etc.) gets the P-02 grey-X placeholder. When the design above used white text on the original colorful background, the white text now reads as light grey on grey — substantially worse ΔE than pre-P-02 (where the background was missing entirely and the white text simply matched the white page).
- **Root cause (hypothesis)**: The placeholder is correct InDesign behaviour for *missing-link* images, but when the image *is* present and we just can't decode it, InDesign would have rendered the actual content. Our `decode_image_bytes` fails silently → `emit_*_missing_image_placeholder` fires. The placeholder is misapplied for "decode-failed-but-link-resolved" cases.
- **Suggested fix**: Distinguish "link missing" from "link resolved but decode failed" in `crates/paged-renderer/src/pipeline.rs::resolve_image_id` at `:7311`. For decode-failed, emit only the frame's intrinsic `FillColor` (often a placeholder colour the designer chose to be visible behind a transparent-background image) rather than the InDesign-style grey-X placeholder. Alternatively, broaden the decoder to handle the long tail of formats — at minimum, route oversized JPEGs through a streaming decoder rather than failing on a buffer-size threshold.
- **Effort**: S for triage path; M for decoder broadening

---

### F-11: ColorBurn / HardLight / Overlay / SoftLight blend modes structurally untested in the corpus — fitness pack regression suggests a non-trivial subset broken
- **Category**: Effects
- **Severity**: Minor
- **Frequency**: 1+ packs (soccer-career-flyer-templates uses HardLight + Overlay + ColorBurn + SoftLight + Darken on the cover; fitness-protein-powder uses Multiply + Luminosity + ColorBurn)
- **Crate(s)**: paged-gpu
- **Evidence**:
  - `corpus/envato/reports/soccer-career-flyer-templates/heat-001.png` (after F-04's Multiply-on-paper fix, the residual delta will likely be in the layered blend stack — HardLight on the orange base, Overlay + GradientFeather on Polygon u6a2f, ColorBurn on Rectangle u6aa3)
- **Symptom**: Once F-04 is fixed and these blend modes start composing against opaque paper, subtle but real differences may emerge — InDesign's blend formulae specifically for HardLight / Overlay differ from raw Porter-Duff in edge cases (gamma-correct vs perceptual, CMYK vs RGB working space).
- **Root cause (hypothesis)**: `blend_mode_to_ts` at `crates/paged-gpu/src/cpu.rs:2675-2693` maps every IDML BlendMode to the matching tiny-skia variant; tiny-skia implements W3C Compositing/Blending Level 1, which mostly matches PDF 1.7 Annex H but differs in a few cases (e.g. SoftLight has multiple definitions; ColorBurn over partially-transparent pixels has an edge-case formula).
- **Suggested fix**: After F-04 lands, sweep the rough-tier packs' blend-mode usage via `paged-introspect` and add per-blend-mode unit tests using a small fixture (white paper + colour rect + each blend mode, against a known PDF reference). Defer until F-04 is verified.
- **Effort**: S (audit), M (per-mode formula tweaks if needed)

---

## Top regression-driver summary

For the parent agent's hand-off:

- **fitness-protein-powder (31.31→51.18, +63%)**: F-04 (Multiply against transparent → transparent) is the dominant cause; F-02 (GradientFeather on Rectangle u-bcae works but for the wrong reason) and F-09 (paragraph shading on "WHEY" titles) also contribute. The cycle-1 P-11 fix correctly painted the "Pro / POWER" gradient text but onto a paper-white rectangle that the Multiply background should have coloured red/green.
- **soccer-flyer (11.21→23.59, +110%)**: F-03 (`<PDF>` element undecodable → P-02 placeholder paints grey-X over the orange page) plus F-02 (GradientFeather + non-Rect blend stack). Pre-fix, the spread rendered nearly empty and matched the white reference background; post-fix, the placeholder grey is "wrong" content where there was previously "no" content.
- **annual-report-template-8b5d40 (15.15→24.52, +62%)**: F-01 (`ObjectStyle/Placeholders` FillTint cascade) plus F-02 (Rectangle u10bb's GradientFeather IS wired — needs to verify it actually produces visible green; likely a parser bug in extracting the gradient stops). The white-text-on-green design becomes white-text-on-near-white.
- **welcome-guide-template (32.17→37.63, +17%)**: F-01 (`ObjectStyle/Placeholders` FillTint cascade — the dominant cause) plus F-08 (phantom paragraph "LinedaBrown" overlay). Image placeholder rectangles render solid black instead of 15% grey.
- **wedding-newspaper (25.87→26.70, +3%)**: F-01 (same as welcome-guide — the tiled-image area on p1 pulls FillColor=Color/Black via the Placeholders object style). Marginal regression because the rest of the page stayed similar.

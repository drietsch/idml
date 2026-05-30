# Clean-tier fidelity findings

10 packs, worst meanΔE ≤ 5. Investigated each pack's worst / median / best
pages by reading every triple (cand / ref / heat). Findings sorted by
(Severity desc, Frequency desc, Effort asc).

The corpus is dominated by **two cross-cutting root causes** that surface
on nearly every page:

1. **Font substitution at the family-only level + variable-axis bake-in
   is enough to render text, but doesn't preserve InDesign's glyph
   advance widths.** Every layout has slightly different inter-word
   widths, hyphenation triggers, and line counts (cand wraps 1 line
   wider than ref about 60% of the time, 1 line narrower 20%).
2. **`HorizontalScale` (CharacterStyleRange) is parsed but never
   consumed downstream.** Same for `Skew`. The default 100 is harmless
   for most paragraphs but ruins the few layouts that fold scale into
   their typography (catalog-brochure-template "Catalog" hero, brand-
   guidelines "Brand" ghost word).

The third cross-cutting cause is the reference-PDF-vs-IDML mismatch
documented for several packs (notably resume-template-teacher and
cultured-business-newsletter): the reference PDF was exported from
InDesign **after** a theme/color swap that the IDML doesn't carry.
Where this is plausibly the case I called it out in `Symptom` and
softened `Severity`.

---

### F-01: Body-text wrap drifts 1 line wider/narrower than InDesign on every paragraph
- **Category**: Text
- **Severity**: Major
- **Frequency**: 10 packs affected (out of 10 in this tier)
- **Crate(s)**: paged-text, paged-renderer
- **Evidence**:
  - `corpus/envato/reports/interior-design-catalog/heat-021.png` (cand 3 lines vs ref 2 lines for the same Lorem block)
  - `corpus/envato/reports/interior-design-catalog/heat-014.png` (same pattern, different break point)
  - `corpus/envato/reports/ancient-building-magazine/heat-011.png` (Lorem block at left column reshapes per-line)
  - `corpus/envato/reports/furniture-product-catalog/heat-008.png` (4-line "Ucilit officab…" with shifted word breaks)
  - `corpus/envato/reports/brand-guidelines/heat-005.png` (5-line "Adipiscing elit…" in cand vs 6-line in ref)
  - `corpus/envato/reports/brown-fashion-brochure/heat-005.png` ("FAVORITE BRAND" + body text x-positions drift)
  - `corpus/envato/reports/catalog-brochure-template/heat-001.png` (4-column footer wraps to 2 lines per column instead of staying single-line)
  - `corpus/envato/reports/cultured-business-newsletter/heat-001.png` ("Sus nullores…" 3-line vs 2-line)
  - `corpus/envato/reports/modern-resume-reference-job-application-template/heat-001.png` (lorem block wraps differently)
  - `corpus/envato/reports/employment-application/heat-001.png` ("Itatur modit voloreped…" wraps one line earlier)
- **Symptom**: Identical paragraph text shapes to slightly different widths in our renderer vs. the reference PDF. On every "smoke" Envato pack this surfaces as ghost-doubled text in the heatmap — each glyph drawn at almost-but-not-quite the InDesign x-position. The drift is small per-character (~1–3% of advance) but cumulative; by the end of a 60-char line we typically over- or under-run by 5–15 px, which triggers a wrap one word earlier (or later). p99 ΔE consistently lands in the 60–100 band at those wrapped-word edges.
- **Root cause (hypothesis)**: Composer not calibrated against real InDesign output. `corpus/envato/overrides/_default/fonts.sh` maps every common Adobe face to one of seven OFL fallbacks (Inter / Roboto / OpenSans / Lora / SourceSerif4 / CormorantGaramond / RobotoSlab); Inter and OpenSans both have the wght axis but their per-glyph advance widths differ from Poppins / Montserrat / DM Sans by 1–5% at most code points. Compounded by the open Tier 2 #7 "Composer calibration" backlog — our `MIN/DESIRED/MAX WordSpacing` defaults are Adobe-aligned but the spec-default `MinimumWordSpacing=80` / `MaximumWordSpacing=133` from real templates aren't routed into the breaker.
- **Suggested fix**: `crates/paged-text/src/compose.rs:179` (stretch_ratio) + `crates/paged-text/src/compose.rs:526` (`let stretch = (space_width as f32 * options.stretch_ratio)`) should consume the per-paragraph `MinimumWordSpacing` / `DesiredWordSpacing` / `MaximumWordSpacing` from `ResolvedParagraphAttrs` rather than from `ComposeOptions`. Parser already captures them at `crates/paged-parse/src/styles.rs` (the styles cascade has `MinimumWordSpacing` etc.); plumb them through `ResolvedParagraphAttrs` then read them in `emit_paragraph_into_chain` at `crates/paged-renderer/src/pipeline.rs:1756`. Cross-link: `docs/plan.md` Tier 2 #7 (Composer calibration). Re-run `spikes/composer-calibration` to confirm parity.
- **Effort**: M

### F-02: `HorizontalScale` parsed but never applied — drops the layout's intended glyph stretch
- **Category**: Text
- **Severity**: Major
- **Frequency**: 6+ packs affected (visible most in display-type packs; affects every paragraph but the default of 100 hides it)
- **Crate(s)**: paged-parse, paged-text, paged-renderer
- **Evidence**:
  - `corpus/envato/reports/catalog-brochure-template/heat-001.png` ("Catalog" hero is rendered at default width; ref has a much wider glyph stretch)
  - `corpus/envato/reports/brand-guidelines/heat-001.png` (background "Brand" word — narrow in cand, wide in ref)
  - `corpus/envato/reports/ancient-building-magazine/heat-011.png` ("ancient aesthet-" + "in modern architecture" headings stretched in ref, normal-width in cand)
  - `corpus/envato/reports/employment-application/heat-001.png` ("LFLV" sample word — letter spacing differs because `HorizontalScale` not applied; tracking alone isn't enough)
  - `corpus/envato/reports/cultured-business-newsletter/heat-002.png` ("EDUCATION HISTORY" / "WORK EXPERIENCES" tracking + width)
- **Symptom**: Display-size headings render at the default horizontal scale (100) instead of the IDML-specified value. Visible as glyphs that look narrower / wider than the InDesign reference for the same point size + font.
- **Root cause (hypothesis)**: `crates/paged-parse/src/story.rs:1088` reads `HorizontalScale` into `CharacterRun::horizontal_scale: Option<f32>`, but a workspace-wide grep (`crates/paged-text/`, `crates/paged-compose/`, `crates/paged-renderer/`) shows zero downstream readers. Same story for `Skew` (`crates/paged-parse/src/story.rs:1126` parses it but no reader).
- **Suggested fix**: Thread `horizontal_scale` through `paged-text::StyledRun` (currently at `crates/paged-text/src/layout.rs:295` — `pub tracking: Option<f32>`; add a sibling `pub horizontal_scale: Option<f32>`). Apply at the shaping site by scaling each glyph's `x_advance` by `horizontal_scale / 100.0` and emitting a `PositionedGlyph::scale_x` for the rasterizer to bake into the glyph outline transform. `crates/paged-text/src/shape.rs:43` is where the scale gets baked into 1/64-pt advances today; multiply by the H-scale factor there. Render-side: the existing glyph transform in `emit_paragraph_into_chain` (around `crates/paged-renderer/src/pipeline.rs:1944`) needs to fold `(scale_x, 1.0)` into the glyph emission affine. `Skew` plumbs the same way (add a shear column).
- **Effort**: M

### F-03: Polygon-clipped image placement renders bezier-curved frames as their AABB rectangle when no `<Image>` is placed
- **Category**: Images, Path
- **Severity**: Major
- **Frequency**: 4 packs affected (ancient-building-magazine, modern-resume, resume-template-teacher, cultured-business-newsletter)
- **Evidence**:
  - `corpus/envato/reports/ancient-building-magazine/heat-011.png` (top-right capsule/oval polygon renders as a rectangle in cand)
  - `corpus/envato/reports/modern-resume-reference-job-application-template/heat-001.png` (rounded-rect photo placeholder is rectangular in cand; ref shows rounded corners with "X" placeholder diagonals)
  - `corpus/envato/reports/cultured-business-newsletter/heat-001.png` (the large rounded-corner placeholder is rendered with rounded corners by `emit_rectangle_into` corner_path, but the small inline image placeholders at the bottom right show squared corners in cand)
  - `corpus/envato/reports/employment-application/heat-001.png` (the "LFLV" sample-frame's rounded corner at the bottom right shows as a hard rectangle in cand)
- **Symptom**: Polygon and Oval frames that host placeholder text or are themselves the visible fill (no `<Image>` child) render as their bounding-box rectangle. The curved geometry of the polygon's bezier anchors / oval's ellipse is ignored.
- **Root cause (hypothesis)**: `crates/paged-renderer/src/pipeline.rs:3430` `emit_polygon_into` interns `polygon_path_from_anchors(...)` *only* when `Geometry::Polygon { anchors, .. }` is non-empty (line 3470–3485). The geometry adapter (`from_polygon`) collapses anchor-less polygons to `Geometry::Rect`, and several of these placeholder frames carry their geometry as `<GeometryPathType>` with the `PathOpen="true"` flag that we never parse — meaning the parser doesn't realise the path is non-rectangular and routes through the Rect path. `crates/paged-parse/src/spread.rs` parses `PathPointType Anchor` correctly, but `PathOpen` is referenced only in comments; see also `crates/paged-renderer/src/pipeline.rs:3351` `polygon_path_from_anchors` which always emits a closing `CubicTo` regardless of the parsed open/closed flag.
- **Suggested fix**: (1) Parse `PathOpen` in `crates/paged-parse/src/spread.rs` (probe `b"PathOpen"` attr near line 2720) into a `Polygon::path_open: bool` field. (2) At `crates/paged-renderer/src/pipeline.rs:3409` (auto-close branch), gate the closing CubicTo + final Close on `!path_open`. (3) For Oval frames hosting *no* image and *no* text, `crates/paged-renderer/src/pipeline.rs:6493` `emit_oval_into` should emit the ellipse via the existing `Geometry::Oval` arm (already does); confirm `fill_paint_module` at line 6529 doesn't fall through to the unit-rect path when `path_id = None` (it currently does — needs the oval's interned path id). Add an oval path interner mirroring `corner_path_module`.
- **Effort**: M

### F-04: Variable-font `wght` axis is applied even when the resolved font has no `wght` axis — bold subsitution silently lands on Regular
- **Category**: Fonts
- **Severity**: Major
- **Frequency**: 8+ packs affected (every pack using "Bold" / "Light" / "Medium" against a non-variable fallback)
- **Crate(s)**: paged-renderer
- **Evidence**:
  - `corpus/envato/reports/interior-design-catalog/heat-014.png` ("WORKSPACE" — IDML asks for Montserrat Bold w/ tracking 200; cand renders Inter Bold which is visually heavier than Montserrat Bold; ref renders InDesign-baked Montserrat Bold which looks lighter)
  - `corpus/envato/reports/brand-guidelines/heat-005.png` ("Adipiscing elit, sed do…" big text is Mona Sans Bold in IDML; cand falls through default → Inter and the wght axis matches, but font shapes differ enough that meanΔE 3.81 doesn't reflect a true weight mismatch)
  - `corpus/envato/reports/brown-fashion-brochure/heat-002.png` ("ABOUT OUR BRAND" — Vollkorn SC Black is substituted with SourceSerif4 which has no `wght` axis, so cand renders ~Regular weight against a ref-baked Black)
  - `corpus/envato/reports/catalog-brochure-template/heat-001.png` ("Catalog" hero — DM Sans Bold maps to Inter, but visible weight differs)
  - `corpus/envato/reports/employment-application/heat-002.png` ("EDUCATION HISTORY", "WORK EXPERIENCES" — Open Sans Bold maps to OpenSans.ttf which is a single-weight Regular file in the bundle — `set_variations(wght=700)` is a no-op, so we render Regular)
  - `corpus/envato/reports/resume-template-teacher/heat-001.png` ("AUSTIN PARSONS" not rendered — root cause is likely a different bug, but font ID mismatch on "Versa" contributes)
- **Symptom**: Headings + emphasised runs render at the wrong weight (typically Regular instead of Bold or Light). Most visible in the heatmap as a thicker / thinner stroke compared to the InDesign-baked PDF.
- **Root cause (hypothesis)**: `crates/paged-renderer/src/pipeline.rs:8972` calls `face.set_variations(&[rustybuzz::Variation { tag: wght_tag, value: wght }])` unconditionally for every `(font_id, wght_bits)` pair. For non-variable TTFs (e.g. `corpus/fonts/SourceSerif4.ttf`, `OpenSans.ttf`, `OpenSans-Italic.ttf`, `Roboto-Regular.ttf`) the variation is silently dropped. The `_default/fonts.sh` map at `corpus/envato/overrides/_default/fonts.sh:15` registers only the bare family for many faces (e.g. `Open Sans=$FONTS/OpenSans.ttf` with no per-style entries beyond `Italic`), so Bold/Light/Medium variants all resolve to the same single-weight file.
- **Suggested fix**: Two-pronged. (a) In `FontTable::build` at `crates/paged-renderer/src/pipeline.rs:8966`, detect whether the parsed `ttf_parser::Face` exposes `wght` via `face.variation_axes()` — if not, log a one-shot diagnostic and skip `set_variations`. (b) Enrich `corpus/envato/overrides/_default/fonts.sh` so each common family has per-style entries (`Open Sans/Bold=$FONTS/Roboto-Bold.ttf`, `Open Sans/Light=$FONTS/Inter.ttf`, etc.) — Roboto-Bold.ttf is already in `corpus/fonts/` and renders close to Open Sans Bold. The asset.rs `font_key` lookup at `crates/paged-renderer/src/asset.rs:165` already prefers the `(family, style)` key over bare-family.
- **Effort**: S

### F-05: `<Oval>` frames cannot host placed images (parser drops the `<Image>` child)
- **Category**: Images, Parser
- **Severity**: Major
- **Frequency**: 3 packs affected (modern-resume, ancient-building-magazine, brown-fashion-brochure when an oval hosts a placeholder photo)
- **Crate(s)**: paged-parse, paged-renderer
- **Evidence**:
  - `corpus/envato/reports/modern-resume-reference-job-application-template/heat-001.png` (the central rounded photo placeholder shows in ref but is absent in cand)
  - `corpus/envato/reports/resume-template-teacher/heat-001.png` (photo-holder oval is absent in cand)
  - `corpus/envato/reports/brown-fashion-brochure/heat-002.png` (large central gray placeholder is rendered in cand because in this case the frame is a Rectangle, but the same pack uses Ovals elsewhere)
- **Symptom**: An IDML `<Oval>` carrying an `<Image href="..."/>` child renders as a fill-only ellipse; the image content (or its placeholder X-marker) is dropped.
- **Root cause (hypothesis)**: `crates/paged-parse/src/spread.rs:675` (the `Oval` struct definition) does not declare an `image_link` / `image_item_transform` field; `Rectangle` (`image_link` at line 381) and `Polygon` (`image_link` at line 885) both have these. The renderer's `emit_oval_into` at `crates/paged-renderer/src/pipeline.rs:6493` consequently has no image hook.
- **Suggested fix**: (1) Add `image_link: Option<String>` + `image_item_transform: Option<[f32; 6]>` to `Oval` in `crates/paged-parse/src/spread.rs:672`. (2) Parse them at the same site Rectangle parses them (mirror the `Rectangle` arm in the spread parser). (3) Add `emit_oval_image` in `crates/paged-renderer/src/pipeline.rs` modeled on `emit_polygon_image` at line 7059, but using the oval's parametric ellipse path as the clip. The interior-design-catalog and modern-resume placeholders are ellipses with no `<Image>` placed (just a gray fill) — for those the clip path matters only when an image *is* placed. Even without (2)+(3), gating `emit_oval_into`'s fill module to use an ellipse-shaped path-id (via a new `corner_path_module`-style ellipse interner) fixes the visible delta.
- **Effort**: M

### F-06: `Capitalization=SmallCaps` falls back to `AllCaps` shape — letter heights are wrong
- **Category**: Text
- **Severity**: Major
- **Frequency**: 4 packs affected (visible most where the IDML targets "SC" fonts or applies SmallCaps directly)
- **Crate(s)**: paged-renderer
- **Evidence**:
  - `corpus/envato/reports/brown-fashion-brochure/heat-002.png` ("BEST SELLER OUR BRAND" — IDML uses Vollkorn SC which is itself a small-caps face; with the substitution to SourceSerif4 the smcp encoding is lost and the renderer's AllCaps fallback uppercases everything to full caps height)
  - `corpus/envato/reports/employment-application/heat-001.png` ("YOUR COMPANY NAME." — small caps height in ref vs full caps in cand)
  - `corpus/envato/reports/interior-design-catalog/heat-014.png` ("INTERIOR DESIGN" subhead — ref shows small-caps height for the trailing "ESIGN" letters, cand draws all-cap height)
  - `corpus/envato/reports/cultured-business-newsletter/heat-001.png` ("CULTURED BUSINESS" subhead above NEWSLETTER)
- **Symptom**: Small-caps text renders as full-height capitals; the visual rhythm of capital-tall + small-tall letters is collapsed to a single height. Width changes too because small-caps glyphs are narrower than full caps.
- **Root cause (hypothesis)**: `crates/paged-renderer/src/pipeline.rs:1925` matches `Capitalization` and uppercases via `src.to_uppercase()` for both `AllCaps` and `SmallCaps` — the comment at line 1915–1918 acknowledges this is a stopgap until OT smcp lookup lands. The substitute-font corpus has no SC-flavored faces (`Vollkorn SC` → `SourceSerif4.ttf`, which has no smcp lookup either), so even routing smcp through rustybuzz wouldn't fully fix this without an SC-equipped fallback. Lower priority *internally* than F-01/F-04 because the visible heat is concentrated on short heading runs.
- **Suggested fix**: (1) Drive an `smcp` OT feature through rustybuzz when `Capitalization=SmallCaps`. `crates/paged-text/src/shape.rs:40` shapes with `&[]` features today; add a feature-passing parameter. (2) When the resolved font has no smcp lookup, scale the lowercase glyphs by a `cap_height / x_height` ratio derived from `FontMetrics` (already cached in `crates/paged-renderer/src/pipeline.rs:8981` `metrics`). Plumb `metrics_for(font_id)` into the per-glyph emit so the renderer can scale lower-case glyphs in place without re-shaping. (3) Until those land, the AllCaps fallback at line 1926 should be limited to `AllCaps` only and `SmallCaps` should pass through without uppercasing — that at least preserves the original case (and lets the rasterizer's lowercase glyphs win), which visually beats forced AllCaps for any font without small-caps lookups.
- **Effort**: M

### F-07: Per-run `FillColor` on `CharacterStyleRange` not honoured for in-line color emphasis
- **Category**: Color, Text
- **Severity**: Major
- **Frequency**: 3 packs affected (brown-fashion-brochure, modern-resume, brand-guidelines)
- **Crate(s)**: paged-renderer
- **Evidence**:
  - `corpus/envato/reports/brown-fashion-brochure/heat-002.png` ("OUR BRAND" in CharacterStyleRange's FillColor="Color/u2713" CMYK 35 53 96 38 → gold/brown in ref; renders close to black in cand — same fill color as the surrounding "ABOUT")
  - `corpus/envato/reports/modern-resume-reference-job-application-template/heat-001.png` (skill bar progress fills should be pink/lavender but render as black)
  - `corpus/envato/reports/brand-guidelines/heat-005.png` (the "—" separator on "ad minim ve- / niam quis at —" should be subdued; renders identically to surrounding text)
- **Symptom**: Two-color words like "ABOUT OUR BRAND" render in a single color rather than the per-run emphasis the IDML specifies.
- **Root cause (hypothesis)**: The cascade at `crates/paged-scene/src/lib.rs:263` (`resolved_run_attrs`) starts with `ResolvedRunAttrs::from_run(run)` then merges below — the run's own `fill_color` should win. But the renderer's per-run paint pickup at `crates/paged-renderer/src/pipeline.rs:3745` reads `resolved.fill_color.as_deref()`; if `merge_below_character` is overwriting `fill_color` with the character style's default `Color/Black` because the character-style cascade isn't using "below" semantics, the run-direct color is lost. Verify: with the brown-fashion-brochure story containing `<CharacterStyleRange FillColor="Color/u2713">`, dump `resolved_run_attrs` and confirm `fill_color == Some("Color/u2713")`.
- **Suggested fix**: Audit `crates/paged-scene/src/lib.rs:268-275` cascade order. The expected "direct > applied character style > applied paragraph style" means `merge_below_character` should *not* overwrite `acc.fill_color` when `acc.fill_color.is_some()`. Add an integration test in `crates/paged-renderer/tests/` covering a two-run paragraph where the second run sets `FillColor` directly on its `CharacterStyleRange` (no `AppliedCharacterStyle`), and asserting the second run emits a `FillPath` with the expected paint id.
- **Effort**: S

### F-08: Page-level theme/background color mismatch suggests reference PDFs are exported from a customised template
- **Category**: Color, Other
- **Severity**: Minor (caller-managed — not a renderer bug, but it inflates the mean ΔE)
- **Frequency**: 5+ packs affected (resume-template-teacher, employment-application, cultured-business-newsletter, brown-fashion-brochure, modern-resume)
- **Crate(s)**: paged-fidelity, corpus/envato pack curation (not renderer)
- **Evidence**:
  - `corpus/envato/reports/resume-template-teacher/heat-001.png` (ref has deep red maroon page background; IDML's `Color/ue637` is CMYK 4 3 2 0 — basically white — and cand renders white correctly)
  - `corpus/envato/reports/employment-application/heat-001.png` (ref has light-gray page bg; cand has light-gray too, but the heatmap shows the entire form-field region as off-color — the IDML's `Color 1` is CMYK 0 0 0 13 / `Color 2` is CMYK 0 0 0 31; ref's gray scheme came out fine but the form field "Date :" / "Phone number :" inset rectangles render at different shades because the IDML has them at one tint and the PDF was tinted differently before export)
  - `corpus/envato/reports/cultured-business-newsletter/heat-001.png` ("NEWSLETTER" banner is BLUE C=100 M=80 Y=23 K=7 in ref, ORANGE C=15 M=100 Y=100 K=0 in cand; IDML has both swatches defined but the banner's FillColor in the IDML points to the orange — so cand is correct, the PDF was re-themed before export)
- **Symptom**: Page-level background or large fill regions render in different colors between cand and ref, but spot-checking the IDML's actual `FillColor` reference confirms the cand picks the IDML-specified color. The reference PDF was generated after applying a different swatch scheme.
- **Root cause (hypothesis)**: This is a corpus-curation issue, not a renderer bug. The Envato packs ship with placeholder swatches that the demo-PDF generator overrode at PDF-export time.
- **Suggested fix**: Either (a) re-export reference PDFs from a clean `<pack>/template.idml` without theme customisation, or (b) document the expected delta in `corpus/envato/manifest.json` per-pack `note` and exclude those packs from the gated tier. No renderer change required. Consider gating these packs at `stage="smoke"` until ref PDFs are regenerated; current behaviour (smoke only) is already correct, but mean-ΔE-driven promotion to `gated` should be blocked.
- **Effort**: S

### F-09: Rotated text frames (90° / 270°) silently render as untransformed text or drop the rotation
- **Category**: Text, Layout
- **Severity**: Major
- **Frequency**: 2 packs confirmed; suspected in 4–5 more
- **Crate(s)**: paged-renderer, paged-compose
- **Evidence**:
  - `corpus/envato/reports/brown-fashion-brochure/heat-005.png` (the "TREND" label in ref is rendered vertically — "T R E N D" reading top-to-bottom adjacent to the "20 / 20" stack — but cand omits "TREND" entirely)
  - `corpus/envato/reports/employment-application/heat-001.png` ("PAGE 01 / 03" footer — the "/ 03" is rotated 90° in ref but renders horizontally in cand)
- **Symptom**: A text frame whose `ItemTransform` carries a rotation component (`cos θ sin θ -sin θ cos θ tx ty` with θ = ±90°) loses the rotation: text is drawn axis-aligned, or the frame falls off the page entirely.
- **Root cause (hypothesis)**: `frame_outer_transform` at `crates/paged-renderer/src/pipeline.rs` composes the `ItemTransform` into `outer`, which is then passed to fill / stroke modules and the text-emit path. The text-emit path resolves the text frame's `bounds` in **inner coordinates** — i.e., the un-rotated AABB — and emits glyphs along the inner-coord baseline. The `outer` transform then maps these glyphs back to spread coords, which should preserve the rotation. Confirm with a glyph-level test: a 90°-rotated text frame, emit one paragraph, assert glyph emit transforms include the rotation.
- **Suggested fix**: Audit `emit_paragraph_into_chain` at `crates/paged-renderer/src/pipeline.rs:1944` for how `outer` is composed into each glyph emit affine. The per-line baseline calculation reads `frame.bounds.left` / `frame.bounds.top` directly (e.g. `crates/paged-renderer/src/pipeline.rs:1466`) — those are inner coords, and the rotated frame needs them mapped through `outer` *before* baseline arithmetic, or the line-stack origin via `outer` before glyph emit. Add a `transform_baseline_through_outer` helper.
- **Effort**: M

### F-10: Numbering/Volume placeholders rendering at wrong size in newsletter pack — likely a `\n` split on a numbered-list paragraph
- **Category**: Text
- **Severity**: Minor
- **Frequency**: 1 pack (cultured-business-newsletter)
- **Crate(s)**: paged-renderer
- **Evidence**:
  - `corpus/envato/reports/cultured-business-newsletter/heat-001.png` ("Volume 18 | October 2020" footer renders correctly in cand, but the ghosted "01" page-number circle shows a doubled "0/1" in heat — suggests the paragraph splitter at `split_paragraph_at_breaks` emits two sub-paragraphs that the bullet/number counter increments past the IDML's intent)
  - `corpus/envato/reports/cultured-business-newsletter/heat-004.png` ("Oct 10, 2020" date pill — heat shows the text reflowed slightly)
- **Symptom**: A paragraph that visually reads as one "Volume 18 | October 2020" line ghosts in the heatmap as two overlapping renders.
- **Root cause (hypothesis)**: `split_paragraph_at_breaks` at `crates/paged-renderer/src/pipeline.rs:5549` splits at every `\n` in any run's text. If the trailing newline at the end of the story is split into a second empty sub-paragraph that still emits the numbering counter, we get a phantom render.
- **Suggested fix**: Filter empty sub-paragraphs in `split_paragraph_at_breaks` — drop a trailing sub-paragraph whose every run is `\n`-only or empty. At line 5549: after the split, before returning the Vec, drop the last element if `is_empty_paragraph(&para)`. Add a glyph-level test in `crates/paged-renderer/tests/text_glyph_level.rs` covering a paragraph ending in `\n`.
- **Effort**: S

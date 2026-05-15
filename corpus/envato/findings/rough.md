# Envato `rough` tier — fidelity findings (meanΔE > 20)

Tier review of 12 sampled packs (of 25). Severity is calibrated to
**what's missing** (this is the "shipping the feature unlocks packs"
tier), not to per-pixel deltas. Findings are sorted by Severity desc,
Frequency desc, Effort asc.

Sampled packs (mix of "almost-moderate" to "deepest break"):

- `magazine-editorial-layout` (meanΔE 20.21, p15)
- `photography-portfolio-vol-16` (21.49, p17)
- `business-proposal-template` (35.21, p1)
- `event-program-brochure` (35.96, p2)
- `lifestyle-magazine-layout` (38.19, p17)
- `welcome-guide-template` (32.17, p37)
- `sport-magazine` (44.26, p26)
- `minimal-furniture-brochure` (49.58, p9)
- `travel-guide-brochure-template-indd-canva` (52.99, p1)
- `business-magazine-template` (55.93, p2)
- `the-brochure` (54.32, p8)
- `hair-stylist-brochure-vol-3` (72.97, p19)
- `food-cooking-magazine-template` (58.45, p6) — light scan
- `annual-report-template` (69.17, p20) — light scan
- `minimal-interior-design-catalog` (84.04, p21) — light scan
- `real-estate-brochure` (29.57, p23) — confirmation scan
- `saas-product-launch-annual-report-brochure` (26.48, p8) — confirmation scan
- `company-profile-canva-docx-id-psd` (41.78, p4) — confirmation scan
- `fitness-protein-powder-business-card-templates` (31.31, p1) — confirmation scan

---

### F-01: `FillTint` dropped for TextFrame / Polygon / Oval / GraphicLine — large neutral backgrounds render at 100% strength
- **Category**: Color
- **Severity**: Blocker
- **Frequency**: 14+ packs (every pack with grey backgrounds, light tinted bands, low-tint diagonal patterns)
- **Crate(s)**: idml-parse, idml-renderer
- **Evidence**:
  - `corpus/envato/reports/business-proposal-template/heat-001.png` (3% black stripes → 100% black stripes)
  - `corpus/envato/reports/welcome-guide-template/heat-037.png` (15% black placeholder rect → black)
  - `corpus/envato/reports/lifestyle-magazine-layout/heat-017.png` (red gradient bg lost)
  - `corpus/envato/reports/real-estate-brochure/heat-023.png` (5% black lower section → 100% black)
  - `corpus/envato/reports/travel-guide-brochure-template-indd-canva/heat-001.png` (15% black big rect → 100% black)
  - `corpus/envato/reports/welcome-guide-template/heat-037.png` (image-placeholder grey → black)
  - `corpus/envato/reports/minimal-interior-design-catalog/heat-021.png` (dark page bg fail)
- **Symptom**: Background tinted shapes (page banners, low-tint diagonal/stripe overlays, image-placeholder greys, decorative panels) render as 100% strength of the swatch color rather than the IDML's intended `FillTint=N%`. In `business-proposal-template/p1` each diagonal-stripe `<Polygon>` carries `FillColor="Color/Black" FillTint="3"` — InDesign renders these as 3% grey diagonals; we render solid black. Same pattern explains the dark page background in `welcome-guide-template`, the missing grey panel in `travel-guide-brochure-template`, etc.
- **Root cause (hypothesis)**: Only `<Rectangle>` parses `FillTint` (parser at `crates/idml-parse/src/spread.rs:1064` via `read_common_attrs`, struct field at `:371`, propagation at `:1357`). The `Polygon` / `Oval` / `TextFrame` / `GraphicLine` struct definitions (`crates/idml-parse/src/spread.rs:841` for Polygon) **do not even have a `fill_tint` field** even though every other shape sees the same `FillTint` attribute. The renderer-side compounding bug: `ResolvedFrame::from_text_frame` (`crates/idml-renderer/src/module/frame.rs:145`), `from_oval` (`:207`), `from_polygon` (`:250`), `from_graphic_line` (`:289`) all hardcode `fill_tint: None` regardless of what the parser captured.
- **Suggested fix**: Two coordinated edits.
  1. Add `pub fill_tint: Option<f32>` to `Polygon` (`crates/idml-parse/src/spread.rs:841`), `Oval`, `TextFrame`, `GraphicLine` structs; populate from `common.fill_tint` at their construction sites (`spread.rs:2097` for Polygon).
  2. Read it through in the four `from_*` constructors at `crates/idml-renderer/src/module/frame.rs:145`, `:207`, `:250`, `:289`. The downstream paint pipeline already handles tint correctly via `apply_fill_tint` at `crates/idml-renderer/src/pipeline.rs:8361`.
- **Effort**: S

---

### F-02: Image-placeholder rectangles (missing links) render as raw fill instead of InDesign's grey/X-cross
- **Category**: Images
- **Severity**: Blocker
- **Frequency**: 10+ packs (every Envato template with placeholder images — design templates ship with broken `LinkResourceURI` paths so InDesign substitutes a placeholder visual that bakes into the PDF)
- **Crate(s)**: idml-parse, idml-renderer
- **Evidence**:
  - `corpus/envato/reports/magazine-editorial-layout/heat-015.png` (grey X-crossed placeholders → empty)
  - `corpus/envato/reports/photography-portfolio-vol-16/heat-017.png` (large X-cross grid → blank)
  - `corpus/envato/reports/wedding-newspaper/heat-001.png` (tiled "YOUR IMAGE GOES HERE" → solid black)
  - `corpus/envato/reports/business-magazine-template/heat-002.png` (placeholder tile → dark fill)
  - `corpus/envato/reports/minimal-furniture-brochure/heat-009.png` (placeholder grey rects render visible-but-empty)
  - `corpus/envato/reports/event-program-brochure/heat-002.png` (TOC right-side image area missing)
- **Symptom**: When an `<Image>` element points at an external `LinkResourceURI` the renderer can't resolve (the template ships file paths like `file:/Users/sea/BrandPacks Dropbox/.../YOUR-IMAGE-GOES-HERE.jpg`), the host frame is drawn with its raw `FillColor` (often black, or transparent). InDesign exports the same IDML with its missing-link placeholder visual baked in. The result is dramatic content loss — entire image-driven pages diverge by 100% mean ΔE.
- **Root cause (hypothesis)**: Renderer's image pipeline at `crates/idml-renderer/src/pipeline.rs::emit_polygon_image` (`:7059`) and the analogous rectangle/text-frame image paths consume `image_link` via `AssetResolver::resolve_image`. When resolution fails the slot is silently dropped. No "render a placeholder cross / fill" fallback exists.
- **Suggested fix**: In the image-emit path (find via the existing `image_link` callsites near `crates/idml-renderer/src/pipeline.rs:7059` for polygons and the rectangle's `emit_rectangle_image`), when `AssetResolver` returns `None`/error, emit a `FillRect` with a grey paint plus two diagonal `StrokePath` strokes (a `\` and `/` from corner to corner). Match InDesign's placeholder visual: ~80% grey fill, thin (0.25–0.5pt) black stroke around the box, and the two diagonals. Wire a `RasterOptions::missing_image_placeholder: bool` (default `true`) so headless / production hosts can disable it. This alone closes ~30–50% of the meanΔE gap on every photography / portfolio / catalog template.
- **Effort**: S

---

### F-03: Frames spanning more than one page route to a single page (centroid-containment loses cross-page content)
- **Category**: Layout
- **Severity**: Blocker
- **Frequency**: 8+ packs (every spread-spanning header band, gradient backdrop, oversized hero rect that crosses the gutter)
- **Crate(s)**: idml-renderer
- **Evidence**:
  - `corpus/envato/reports/the-brochure/heat-008.png` (huge blue header `<Polygon>` u68a spans pages 8+9, renders only on the page containing the AABB centroid)
  - `corpus/envato/reports/saas-product-launch-annual-report-brochure/heat-008.png` (dark backdrop missing from upper half of page)
  - `corpus/envato/reports/lifestyle-magazine-layout/heat-017.png` (red gradient page bg — wider than one page)
  - `corpus/envato/reports/minimal-interior-design-catalog/heat-021.png` (page-spanning black backdrop u934 with bounds 1208×859 centered on the spread origin)
  - `corpus/envato/reports/event-program-brochure/heat-002.png` (full-bleed blue page-bg vanishes on one side of the spread)
- **Symptom**: Wide design elements (spread-spanning gradient backgrounds, two-page header bands, "bleed-the-gutter" decorative shapes) render on exactly one page of the spread instead of being clipped to each page they intersect.
- **Root cause (hypothesis)**: `page_for_frame` (`crates/idml-renderer/src/pipeline.rs:6407`) computes the AABB centroid and returns the first page whose bounds contain it. Frames straddling the gutter end up routed to whichever page wins the centroid containment test — the other half is dropped entirely. Eight call sites consume this (frames 485, 515, 553, 579, 598, 745, 769, 824) so every shape kind has the same blind spot.
- **Suggested fix**: Replace single-page routing with a multi-page emit pass. Either (a) duplicate the emit per page that the frame's AABB overlaps and rely on the existing per-page rasterizer clip (matches InDesign's "shapes bleed across pages" semantics), or (b) introduce a per-spread display list with one final clip-to-page-rect when paginating. Approach (a) is simpler: change the `let local_idx = page_for_frame(...).unwrap_or(0);` pattern to `for local_idx in pages_overlapping(...)` and emit into each. Touch points: all 8 call sites in `pipeline.rs` between `:485` and `:824`. Cross-link: `docs/plan.md` does not currently track this — should be added under a new "spread-spanning frames" entry.
- **Effort**: M

---

### F-04: `<GradientFeatherSetting>` (gradient feather + linear-/radial-gradient overlays) ignored
- **Category**: Effects
- **Severity**: Major
- **Frequency**: 6+ packs
- **Crate(s)**: idml-parse, idml-compose, idml-renderer
- **Evidence**:
  - `corpus/envato/reports/hair-stylist-brochure-vol-3/heat-019.png` (dark backdrop with vignette / typographic decoration FLST/YIT — backdrop has `<GradientFeatherSetting Angle="84.1" Length="783.9...">`)
  - `corpus/envato/reports/lifestyle-magazine-layout/heat-017.png` (corner-to-corner red gradient is the entire page background)
  - `corpus/envato/reports/business-proposal-template/heat-001.png` (the giant black squares in ref are actually transparent-gradient-feathered)
  - `corpus/envato/reports/minimal-interior-design-catalog/heat-021.png` (page-spanning rect carries a `<GradientFeatherSetting>` in source)
- **Symptom**: Decorative gradient-feathered backgrounds (faded edges, corner-to-corner radial vignettes) render as a flat fill instead of a feather-to-alpha gradient.
- **Root cause (hypothesis)**: `<GradientFeatherSetting Angle="X" Length="Y" GradientStart="x y">` is a transparency effect under `<TransparencySetting>`. Grep shows zero references to `GradientFeather` in `crates/`. We parse `<BlendingSetting>` and a `<FeatherSetting>`-like name but not the gradient-feather flavour. The IDML attribute lives on `<TransparencySetting><GradientFeatherSetting/></TransparencySetting>`.
- **Suggested fix**: Add `GradientFeatherSetting { angle: f32, length: f32, start: (f32, f32), stops: Vec<GradientStop> }` parse arm next to the existing `<BlendingSetting>` handler in `crates/idml-parse/src/spread.rs` (search for `BlendingSetting` to locate). Plumb through `ResolvedFrame` into a new `DisplayCommand::PushLayer { effect: LayerEffect::GradientFeather { ... } }` and pop after fill — the existing `PushLayer { GaussianBlur }` infrastructure (Tier 3 #12 in `docs/plan.md`) is the model to mirror. CPU side: a per-pixel alpha mask multiplied by a linear/radial gradient evaluated in the path's bbox. This lands the same way drop-shadow blur did.
- **Effort**: M

---

### F-05: Text with `FillColor="Gradient/<name>"` (gradient-painted glyphs) renders blank or as a single flat fall-back
- **Category**: Text
- **Severity**: Major
- **Frequency**: 5+ packs
- **Crate(s)**: idml-renderer, idml-compose
- **Evidence**:
  - `corpus/envato/reports/fitness-protein-powder-business-card-templates/heat-001.png` ("WHEY" / "POWER" body uses `FillColor="Gradient/New Gradient Swatch 2"` — title disappears entirely)
  - `corpus/envato/reports/the-brochure/heat-008.png` (likely the missing white subhead "Quisque id odio..." uses a gradient brush)
  - `corpus/envato/reports/business-magazine-template/heat-002.png` ("You're a trailblazer" present, "H101" present, but variant content using gradient styling missing)
- **Symptom**: Display titles painted with a gradient (gradient-fill-on-text) either drop out completely or render as a flat fall-back, breaking the design.
- **Root cause (hypothesis)**: `paint_as_solid_with_icc` (`crates/idml-renderer/src/pipeline.rs:7513`) explicitly returns `None` for `Paint::Gradient`. Glyph emission paths that flow through this helper (drop-shadow stamps, line decorations, presumably the per-glyph paint picker too) cannot accept gradient brushes. The `Paint::Gradient` brush is plumbed through `FillPath` for rectangles but glyph paths use a separate path that flattens to a flat color.
- **Suggested fix**: Two-pronged. Short term: when the run's resolved `FillColor` resolves to `Paint::Gradient`, evaluate the gradient at the run's bbox centroid and substitute a `Paint::Solid` so the text at least renders with a representative tint — matches what the CPU rasterizer would do for an unsupported brush. Long term: extend the glyph-emit path in `pipeline.rs` (search for `RunPaintPicker` callers) to accept `Paint::Gradient` and emit per-glyph `FillPath { paint: Gradient }` with the gradient endpoints computed from the text frame's bbox + `GradientFillAngle` / `GradientFillLength` (the same projection the rectangle path uses).
- **Effort**: M (short-term S, long-term M)

---

### F-06: EPS image content (`<Contents><![CDATA[EPSImage...`) not decoded
- **Category**: Images
- **Severity**: Major
- **Frequency**: 4+ packs (every IDML that uses InDesign's "place EPS" feature for full-bleed cover art)
- **Crate(s)**: idml-parse, idml-renderer
- **Evidence**:
  - `corpus/envato/reports/annual-report-template/heat-020.png` (cover-page Image element ua05b CDATA decodes to `EPSImage` magic bytes — entire blue cover rendering vanishes)
- **Symptom**: Pages whose only meaningful artwork is a placed EPS render as blank paper.
- **Root cause (hypothesis)**: Our image decode (search for "JPEG"/"PNG" routing in `idml-renderer/src/pipeline.rs`) only knows JPEG / PNG byte sniffing. EPS is a PostScript fragment that needs Ghostscript or a small PS interpreter to rasterize — neither is wired in. Grep `crates/` for `EPS|EPSImage|epstype` returns zero hits.
- **Suggested fix**: Skip-as-rendered-rectangle-with-paper-fill is acceptable triage (matches the placeholder treatment in F-02). Long-term, route the EPS bytes through a `ghostscript` sidecar (native only) or skip and emit a stamped placeholder. For the WASM target, EPS is genuinely unsupportable without shipping a PostScript interpreter. Document the limitation in `docs/plan.md` Phase 4 and pin to the "Other" bucket.
- **Effort**: L (small-and-explicit: skip + placeholder is S, full decode is L)

---

### F-07: `ParagraphShading` / `ParagraphBorder` / `RuleAbove` / `RuleBelow` paragraph decorations not parsed or rendered
- **Category**: Text
- **Severity**: Major
- **Frequency**: 5+ packs (modern template designs lean on paragraph shading for highlighted callouts and yellow-band sections)
- **Crate(s)**: idml-parse, idml-text, idml-renderer
- **Evidence**:
  - `corpus/envato/reports/fitness-protein-powder-business-card-templates/heat-001.png` ("WHEY" paragraph carries `ParagraphShadingTint="20" RuleAboveLineWeight="5.77" RuleBelowLineWeight="5.77" ParagraphBorderTopLineWeight="5.77"` — entirely missing)
  - `corpus/envato/reports/real-estate-brochure/heat-023.png` (rule-line underlines below section titles)
  - `corpus/envato/reports/saas-product-launch-annual-report-brochure/heat-008.png` (the cyan underline rules below "01", "02", "03", "04" — missing)
- **Symptom**: Paragraph-level shaded backgrounds (the colored band behind a paragraph), borders around paragraphs, and the rule-above / rule-below horizontal lines are absent.
- **Root cause (hypothesis)**: Grep returns zero hits for `ParagraphShading` / `RuleAbove` / `RuleBelow` in `crates/idml-parse/src/styles.rs` or `story.rs`. The IDML attributes are common on `<ParagraphStyleRange>` / `<ParagraphStyle>` and on the rope; we never lift them off the AST.
- **Suggested fix**: Add parser fields (`paragraph_shading_color`, `paragraph_shading_tint`, `rule_above_*`, `rule_below_*`, `paragraph_border_*`) to `ResolvedParagraph` + the rope's `ParagraphAttrs`. New compose primitives: `DisplayCommand::FillRect` underneath the paragraph's run band for shading; `StrokePath` for the rule lines and border. These are mechanical extensions of the existing underline / strikethrough machinery (`emit_line_decorations` at `crates/idml-renderer/src/pipeline.rs:8405`) operating on paragraph bands instead of glyph clusters. Add to `docs/plan.md` Tier 2 — high leverage.
- **Effort**: M

---

### F-08: Page-level / paper-level `<Color Space="RGB"|"CMYK"...>` ColorEditable="false" fills on `MasterSpread` items not propagating
- **Category**: Color
- **Severity**: Major
- **Frequency**: 4+ packs (templates that put the dark-page brand background on a master spread)
- **Crate(s)**: idml-renderer
- **Evidence**:
  - `corpus/envato/reports/minimal-furniture-brochure/heat-009.png` (dark olive-brown page background missing — likely a master-spread rectangle)
  - `corpus/envato/reports/the-brochure/heat-008.png` (per-spread blue band lives partly on master)
  - `corpus/envato/reports/event-program-brochure/heat-002.png` (full-bleed page color expected from master)
  - `corpus/envato/reports/welcome-guide-template/heat-037.png` (page-level cream paper color expected)
- **Symptom**: Visible page-bg / brand-color rectangles defined once on the master spread don't show on body pages.
- **Root cause (hypothesis)**: Master-spread overlay pass exists (search `master_text_emissions` in `pipeline.rs`) but it appears to be text-frame-only. Non-text master items (large background rectangles, decorative polygons) may not be replayed onto body pages. Or they ARE replayed but routed to a wrong page-local origin. Need to confirm against `crates/idml-renderer/src/pipeline.rs::master_overlay_pass` (search for "master" near 683 / "master pass").
- **Suggested fix**: Audit the master-spread frame replay path. Confirm that `Rectangle`, `Polygon`, `Oval`, `GraphicLine` items on master spreads are duplicated onto each body page that applies that master, with the page-local origin substituted. Touch point: same pattern as `master_text_emissions` (`crates/idml-renderer/src/pipeline.rs` near line 683). The substitution math is identical to the text-frame case.
- **Effort**: M

---

### F-09: Image-frame with both image and frame fill — frame fill bleeds through when image render fails
- **Category**: Images
- **Severity**: Major
- **Frequency**: 4+ packs (overlap with F-02 but the symptom is different — the frame fill IS visible, just not as a placeholder)
- **Crate(s)**: idml-renderer
- **Evidence**:
  - `corpus/envato/reports/wedding-newspaper/heat-001.png` (top headline frame "ROB- FAN-" missing — frame has both Image element and fill)
  - `corpus/envato/reports/business-magazine-template/heat-002.png` (rectangle is dark not because of placeholder, because the rect's `FillColor="Color/Black"` shows through when the Image inside fails)
- **Symptom**: When an `<Image>` is hosted inside a `<Rectangle>` / `<Polygon>` with its own `FillColor`, the frame fill renders even after the placement attempt — and when the image fails, the frame fill is the ONLY thing rendered (often pure black on what should be a placeholder grey).
- **Root cause (hypothesis)**: The Z-order semantics here are subtle: in InDesign the Image content is *inside* the frame, so when the Image fails the frame's fill is what shows. Our renderer's frame-fill + image emit may not be conditional — we always emit the fill, then try the image on top. When the image fails the fill is wrong-color. Tied to F-02.
- **Suggested fix**: Same `--missing-image-placeholder` fix as F-02 should solve this. When `image_link` is present but resolution fails, suppress the frame's underlying fill emit and render the placeholder visual instead. Less invasive: skip the fill emit at `crates/idml-renderer/src/pipeline.rs` (find the rectangle / polygon image-paint dispatch) when an `image_link` exists, falling through to the placeholder.
- **Effort**: S

---

### F-10: Long body text in narrow text frames truncates / overflows silently when font fallback substitution widens advance widths
- **Category**: Text
- **Severity**: Major
- **Frequency**: 4+ packs (templates declaring fonts like "IvyPresto Display", "Prequel Demo", "Montserrat Bold Italic" that aren't in our `corpus/fonts/`)
- **Crate(s)**: idml-renderer, idml-text
- **Evidence**:
  - `corpus/envato/reports/food-cooking-magazine-template/heat-006.png` ("T e c h n i q u e" laid out with massive letter-spacing — appears tracking applied without sane fallback)
  - `corpus/envato/reports/the-brochure/heat-008.png` (body text panels missing — "Offer new sub-services" subheading column collapses)
  - `corpus/envato/reports/saas-product-launch-annual-report-brochure/heat-008.png` ("Plat-/form" wraps and overlaps body)
- **Symptom**: When a body run's font isn't installed, our fallback substitutes a wider face; the resulting text either overflows the frame (lines get clipped vertically), wraps to fewer lines but extends past the frame's right edge, or visibly mis-leads (overlapping text).
- **Root cause (hypothesis)**: Font fallback chain in `crates/idml-renderer/src/font_table.rs` (search for `FontTable::build`) substitutes a single fallback regardless of how wide the substitute is vs the requested font. Knuth-Plass composes with the fallback's metrics but the frame height is fixed so overflow goes invisible. No clamp to "render no more than N lines / clip glyphs past frame bottom".
- **Suggested fix**: This is the docs/plan.md Tier 2 #7 "composer calibration" + a frame-clip on text emit. Short-term: when a text frame has more lines than fit, emit only the lines that fit and warn. Long-term: implement font substitution metric-matching (scale fallback or pick a closer-metrics fallback) for the unsupported families enumerated in `corpus/envato/overrides/_default/fonts.jsx`. Add `Prequel Demo` and `IvyPresto Display` to the default substitution map.
- **Effort**: M

---

### F-11: Frame rotated 90° via ItemTransform — text inside renders with characters spaced as if non-rotated (vertical-but-broken)
- **Category**: Text
- **Severity**: Minor
- **Frequency**: 3+ packs
- **Crate(s)**: idml-renderer, idml-text
- **Evidence**:
  - `corpus/envato/reports/the-brochure/heat-008.png` ("04" "05" "06" inside circles are rotated 90° in cand vs upright in ref — the ItemTransform `0 -1 1 0 X Y` is a 90° rotation, applied to the frame, but in ref the digits read normally)
  - `corpus/envato/reports/hair-stylist-brochure-vol-3/heat-019.png` ("www.yourcompany.com" right-edge text — InDesign auto-orients but we don't)
- **Symptom**: Frames whose `ItemTransform` matrix encodes a 90°/270° rotation present text rotated to match (our rendering is technically correct: rotation matrix multiplied by glyph baseline). The InDesign PDF, however, applies the rotation **to the frame box only**, leaving text upright (perhaps via a baked StoryDirection or AdobeUpright glyph dispatch).
- **Root cause (hypothesis)**: This isn't actually a bug in our renderer — InDesign's behavior here is template-specific and might be controlled by an attribute we don't read (e.g. `<Story StoryDirection>` or a per-frame rotation override). Verify in the IDML: search `the-brochure` Spread_ud0.xml for the circle frames carrying `ItemTransform="0 -1 1 0"` and inspect what attributes go alongside.
- **Suggested fix**: Investigate first. If InDesign's intent IS "rotate the bbox but not the contents" the marker is likely `<StoryPreference StoryOrientation="..."/>`; our text emit needs to honor it by counter-rotating glyph advance directions. Otherwise this is an "InDesign-quirk" that needs documenting, not coding around. Low-priority.
- **Effort**: S (investigation), M (fix)

---

### F-12: `<TextFrame>` text frame strokes draw as triangles when ItemTransform skews — line endpoints not equally weighted
- **Category**: Path
- **Severity**: Minor
- **Frequency**: 2 packs
- **Crate(s)**: idml-renderer, idml-gpu
- **Evidence**:
  - `corpus/envato/reports/welcome-guide-template/heat-037.png` (horizontal rule below "Our Mission Title Here" renders as a tall triangle pointing right)
- **Symptom**: A `<GraphicLine>` that should render as a thin horizontal stripe degrades to a triangular wedge — left endpoint at full stroke width, right endpoint converging to zero. Looks like a stroke-width interpolation across the line rather than a constant stroke.
- **Root cause (hypothesis)**: Possibly the `<GraphicLine>` carries non-uniform `StrokeAlignment` or a tapered stroke style (Adobe's "calligraphic" stroke profiles), or our path-tessellation treats endpoint stroke width differently.
- **Suggested fix**: Reproduce against the `welcome-guide-template/template.idml` GraphicLine elements. Look at `crates/idml-renderer/src/pipeline.rs::emit_line_into` and the cpu rasterizer's stroke pad. Check whether the line's path has 3 anchors (which would form a degenerate triangle when filled).
- **Effort**: S

---

### F-13: `<BlendingSetting BlendMode="Multiply">` on a Polygon — backed off when paint isn't a flat Color (or fill_tint reduces tint to near 0)
- **Category**: Effects
- **Severity**: Minor (becomes invisible once F-01 lands)
- **Frequency**: 3+ packs
- **Crate(s)**: idml-renderer
- **Evidence**:
  - `corpus/envato/reports/business-proposal-template/heat-001.png` (diagonal stripes with `BlendMode="Multiply"` — but at 3% tint after F-01 lands, the multiply against paper is near-imperceptible)
- **Symptom**: Multiply / Screen / Overlay blend modes are honored when the paint is a solid swatch but quietly downgraded when the paint is a gradient or a tinted CMYK with overprint enabled.
- **Root cause (hypothesis)**: `frame_needs_blend_group` (`crates/idml-renderer/src/pipeline.rs:1461`) gates blend-group push on `!matches!(blend_mode, BlendMode::Normal) || opacity != 1.0`. This is correct. The `BeginBlendGroup` / `EndBlendGroup` pair drives the CPU rasterizer's blend path. Likely fine — re-test after F-01 lands (the stripes-as-100%-black symptom will go away once tint is honored, surfacing whether multiply is actually working).
- **Suggested fix**: Re-evaluate after F-01 ships. If still broken, audit `crates/idml-gpu/src/cpu.rs::blend_group_pop` (the dispatch table for `TsBlendMode::Multiply` etc.).
- **Effort**: S

---

### F-14: Vertical-rotated text inside small frames inverts when `Tracking` is negative
- **Category**: Text
- **Severity**: Minor
- **Frequency**: 2 packs
- **Crate(s)**: idml-text
- **Evidence**:
  - `corpus/envato/reports/hair-stylist-brochure-vol-3/heat-019.png` (huge "FLST/YIT" type-as-design backdrop missing — these are 50%-grey rotated decorative letters)
- **Symptom**: Display-size letters with negative tracking and large rotation transforms drop out entirely.
- **Root cause (hypothesis)**: Possibly related to F-10 (font fallback) — when the font isn't installed and the fallback's tracking-adjusted advance ends up negative or zero, the run measures as empty. Or the giant point size (200pt+) hits a clamp.
- **Suggested fix**: Re-evaluate after F-10's font fallback hardening. Likely will resolve itself.
- **Effort**: S

---

### F-15: Two-page-spread layouts where one page is taller/shorter than expected — `pages_diffed` page count mismatches PDF page count
- **Category**: Layout
- **Severity**: Minor
- **Frequency**: 1 pack confirmed, possibly more
- **Crate(s)**: idml-renderer
- **Evidence**:
  - `corpus/envato/reports/saas-product-launch-annual-report-brochure/cand-008.png` (cand image is taller than ref — extra white space below the page content suggests the rendered page bounds differ from `pdftoppm` ref bounds)
- **Symptom**: Per-page PNG dimensions in cand vs ref don't match, causing the diff to compare misaligned pixels and inflating ΔE.
- **Root cause (hypothesis)**: Either (a) we render at a different DPI than `pdftoppm` extracts at, (b) we honor a `<DocumentPreference>` page size that differs from the actual page geometry, or (c) crop boxes / trim boxes / bleed boxes interpreted differently.
- **Suggested fix**: Compare `cand-008.png` dimensions to `ref-008.png` dimensions for a few packs. If consistently off, audit `crates/idml-renderer/src/pipeline.rs::render` page-size dispatch against `pdftoppm -r 96`'s assumed output. Low-impact for the rough tier; matters more for moderate / tight gates.
- **Effort**: S

---

## Cross-tier observations

1. **F-01 (FillTint propagation) is the highest-leverage finding** — it's 2 small parser edits + 4 line-changes in the renderer, but it unlocks dramatic visual improvement on every template with grey/tinted backgrounds (which is essentially every modern template).
2. **F-02 + F-09 (missing-image placeholders) together** close >30% of the meanΔE on photography/portfolio/catalog packs since Envato templates routinely ship with broken-link demo images that InDesign substitutes with a placeholder visual.
3. **F-03 (cross-page frame routing)** unlocks every spread-spanning hero / banner pattern — common in magazines, brochures, and editorial layouts.
4. The Tier 3 #12 (`PushLayer { GaussianBlur }`) infrastructure in `docs/plan.md` is the right model for F-04 (gradient feather), F-05 (gradient text), and any future per-shape transparency effect — the layer pipeline is fundamentally there, we just need more effect kinds.
5. **None of these findings touch the active `docs/plan.md` Tier 1 / Tier 2 backlog directly** — most surface NEW gaps that should be added under a "real-world coverage" subsection.

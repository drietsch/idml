# Cycle 2 findings — `moderate` tier (5 < meanΔE ≤ 20)

Audited 15 packs across the meanΔE spectrum (5.28 to 18.83):
green-energy-newsletter, minimal-furniture-brochure, business-proposal,
newspaper, indesign-magazine, modern-architecture-portfolio-template,
magazine, newspaper-template, gridtastic-grid-kit, hr-employee-handbook,
food-cooking-magazine-template, real-estate-brochure, catalog,
magazine-editorial-layout, brochure, lifestyle-magazine-layout,
project-case-study-template, church-newsletter-template.

Findings sorted by Severity desc, Frequency desc, Effort asc.

---

### F-01: Embedded image bytes inside `<Image>` / `<Contents>` CDATA never decoded
- **Category**: Images
- **Severity**: Blocker
- **Frequency**: 8+/18 packs sampled (newspaper, newspaper-template, food-cooking-magazine-template, church-newsletter-template, magazine-editorial-layout, indesign-magazine, hr-employee-handbook, project-case-study-template)
- **Crate(s)**: paged-parse, paged-renderer
- **Evidence**:
  - `corpus/envato/reports/newspaper-template/heat-005.png` (ref has dense "YOUR IMAGE GOES HERE" tile pattern from 30+ embedded JPEGs; cand renders nothing for those cells)
  - `corpus/envato/reports/church-newsletter-template/heat-002.png` (ref shows tiled JPEG placeholders; cand has empty whitespace)
  - `corpus/envato/reports/food-cooking-magazine-template/heat-009.png` (full-page tile of placeholders → blank gray rectangle in cand)
  - `corpus/envato/reports/newspaper/heat-002.png` (data-table cell pattern that's actually 50+ embedded JPEGs)
- **Symptom**: Pages with placed JPEGs that ship inside the IDML (rather than as external files) render as blank rectangles or X-marker missing-image placeholders. The `<Image>` element's `<Properties><Contents><![CDATA[base64 …]]></Contents></Properties>` payload is ignored end-to-end.
- **Root cause (hypothesis)**: `crates/paged-parse/src/spread.rs:2009-2036` captures only `LinkResourceURI` / `href` from `<Image>`. No code path parses the `<Contents>` CDATA. The renderer's asset-resolver lookup in `crates/paged-renderer/src/pipeline.rs:7775-7796` then returns `None` for the URI (which often points at the original author's filesystem like `file:/Users/fern/Dropbox/.../YOUR%20IMAGE%20GOES%20HERE.jpg`), and the P-02 placeholder fires. Workspace grep for `b"Contents"\|StoredState=\"Embedded\"\|base64` against `paged-parse` returns zero hits. IDMLs from InDesign with the "embed link" workflow universally ship every placed image as inline base64 in `<Contents>`.
- **Suggested fix**: Two-step. (1) In `crates/paged-parse/src/spread.rs` `<Image>` parser (~`:2009`), when the element has a `<Contents>` child, base64-decode the CDATA payload into a `Vec<u8>` and stash it on the parent shape (new `Rectangle::image_bytes: Option<Vec<u8>>`, plus the matching Oval / Polygon fields P-16 added). (2) In `crates/paged-renderer/src/pipeline.rs:7775` extend `page_image_cache` / `decoded_cache` lookup: if the asset resolver returns `None` but the frame carries `image_bytes`, decode those directly via the existing `decode_image_bytes` helper. This is the same pattern P-14 (EPS sniff) already touches. Cross-link: indirectly extends P-02 (missing-image placeholder) — these aren't missing, they're embedded.
- **Effort**: M (parser + ~3 shape fields + renderer-path wiring; small base64 crate dependency).

---

### F-02: Headline `AutoSizingTextFrame` (width-grow) silently truncated to fixed frame
- **Category**: Text
- **Severity**: Blocker
- **Frequency**: 7+/18 packs sampled (indesign-magazine, brochure, church-newsletter-template, project-case-study-template, lifestyle-magazine-layout, real-estate-brochure, hr-employee-handbook)
- **Crate(s)**: paged-parse, paged-renderer, paged-text
- **Evidence**:
  - `corpus/envato/reports/indesign-magazine/heat-001.png` ("MAGAZINE" cover → "MAG" in cand; "BRIEF ANGLES A VIRTUE UNDETECTED" → "BRIEF AN GLES" in cand; "interview ZAFARAHI ANASTASIA" → "interview ZAFARAHI" in cand; "20 USEFUL TIPS Build Your Skills" → "20 Build Your")
  - `corpus/envato/reports/brochure/cand-001.png` vs `ref-001.png` ("Product Design" → "Prod / uct" — word truncated mid-glyph)
  - `corpus/envato/reports/church-newsletter-template/cand-002.png` vs `ref-002.png` ("THE MESSENGER / Weekly Newsletter of the Church / ISSUE NO.4" → "THE / Weekly Newsletter of the / IS")
  - `corpus/envato/reports/project-case-study-template/cand-015.png` ("MARKETING PROJECT" → "MAR / KET")
- **Symptom**: Display-size headlines that exceed the IDML text frame's stated width or height get clipped to the first 3-6 characters or the first 1-2 words. InDesign's stored geometry intentionally undersizes the frame because `<TextFramePreference AutoSizingType=...>` is set to grow the frame at composition time. Our renderer doesn't honor that growth and the natural Knuth-Plass break + hard frame-clip drops everything past the original right/bottom edge.
- **Root cause (hypothesis)**: Workspace grep for `b"AutoSizingType"\|b"AutoSizingReferencePoint"\|b"MinimumWidthForAutoSizing"` against `paged-parse` returns zero hits. The IDML spec attaches these as `<TextFramePreference>` attributes (`AutoSizingType="WidthOnly" | "WidthAndHeight" | "HeightOnly"`). Parser at `crates/paged-parse/src/spread.rs` reads `TextColumnCount` / `TextColumnFixedWidth` etc. but the auto-sizing controls fall through. The renderer then treats the frame as fixed-bounds and Knuth-Plass + frame-clip at `crates/paged-renderer/src/pipeline.rs:1979` (overflow-clip path landed under P-17) silently drops anything past the stored right/bottom edge.
- **Suggested fix**: Parse `<TextFramePreference AutoSizingType="…" AutoSizingReferencePoint="…" MinimumWidthForAutoSizing="N" MinimumHeightForAutoSizing="N" UseMinimumHeightForAutoSizing="bool">` in `crates/paged-parse/src/spread.rs` near the existing `TextFramePreference` block (~line 2110 in current code). Plumb through to `TextFrame::auto_sizing: Option<AutoSizingType>`. In `crates/paged-renderer/src/pipeline.rs` near the text-frame width calc (~`:1900-2000`), when `auto_sizing == WidthOnly | WidthAndHeight`, expand the column width to fit the longest token's measured advance — pinned to the IDML's `MinimumWidth*` floor — before invoking Knuth-Plass. Cross-link: this is what's blocking the P-17 fallback path from helping these covers (P-17 emits one word per line — but the frame is too narrow for even one word, so it still drops).
- **Effort**: M.

---

### F-03: Gradient fill on `<Polygon>` / `<Oval>` renders as flat fallback colour
- **Category**: Color, Effects
- **Severity**: Major
- **Frequency**: 5+/18 packs sampled (brochure, food-cooking-magazine-template, lifestyle-magazine-layout, modern-architecture-portfolio-template, magazine)
- **Crate(s)**: paged-renderer
- **Evidence**:
  - `corpus/envato/reports/brochure/cand-001.png` vs `ref-001.png` (cover page: ref has dark-blue→navy linear gradient page bg + 3 dark-blue gradient circles; cand renders the page bg as flat dark navy and drops every gradient circle entirely)
  - IDML evidence: `brochure/template.idml` `Spreads/Spread_uc8.xml` carries `<Polygon FillColor="Gradient/New Gradient Swatch" GradientFillAngle="90">` (page bg) and three `<Oval FillColor="Gradient/New Gradient Swatch copy" ItemTransform="0 1 -1 0 …">` (rotated gradient circles).
- **Symptom**: Polygons and Ovals whose `FillColor` resolves to a `Gradient/…` swatch render as solid fallback (often paper-white or the gradient's stop-0 colour), not as the linear/radial gradient the IDML specifies. Rectangles with the same gradient swatch render correctly; the bug is shape-specific.
- **Root cause (hypothesis)**: Suspect path lives at `crates/paged-renderer/src/pipeline.rs:6885` (Oval) and `:3764` (Polygon) — both call `fill_paint_module` which resolves gradient swatches into `Paint::Gradient` correctly for Rectangles via `color_id_to_paint_with_list_dir` at `crates/paged-renderer/src/pipeline.rs:8615`. For Ovals the `path_dims` passed in is `(rect.w, rect.h)` of the unit-ellipse-scaled bbox; for Polygons it's `Geometry::Polygon::bbox`. The gradient endpoints get baked relative to those dims — but when the shape's `ItemTransform` is a 90° rotation (e.g. brochure's `0 1 -1 0`), the gradient line projects incorrectly onto the post-transform ellipse. Need to either pre-multiply the gradient line by the `ItemTransform` rotation OR project `GradientFillStart` / `GradientFillLength` (which are *in spread coords*) into the shape's inner-coord frame before stuffing into `Paint::Gradient`.
- **Suggested fix**: Inspect `color_id_to_paint_with_list_dir` at `crates/paged-renderer/src/pipeline.rs:8615` — the gradient-line projection accepts `gradient_angle_deg` + `gradient_length_pt` + `path_dims_pt` but never consults the shape's `ItemTransform`. Add a transform parameter and apply the inverse to the gradient line before the unit-rect mapping. Confirm by re-rendering `brochure/cand-001.png` — the dark-blue→navy gradient circles must reappear at their `ItemTransform="0 1 -1 0"` positions. Cross-link: cycle-1 P-11 (gradient *on glyph fill*) was solved via midpoint-substitute; this entry is the same gradient brush, on shapes, where flat-fallback is also visible.
- **Effort**: M.

---

### F-04: Master-page items render at saturated colour vs reference's "low-display" / non-printing rendering
- **Category**: Color, Effects
- **Severity**: Major
- **Frequency**: 4+/18 packs sampled (gridtastic-grid-kit, hr-employee-handbook, project-case-study-template, real-estate-brochure)
- **Crate(s)**: paged-renderer, corpus curation
- **Evidence**:
  - `corpus/envato/reports/gridtastic-grid-kit/cand-001.png` vs `ref-001.png` (master-page rectangles in `Color/r71g200b245` bright-cyan; cand renders at full saturation; ref shows ~10% tinted near-paper-white. Confirmed via `MasterSpreads/MasterSpread_ud4.xml`: rectangles have no `FillTint`, no `<TransparencySetting>`, no `BlendMode`)
  - `corpus/envato/reports/project-case-study-template/cand-015.png` (right-side master "Black" rectangle: cand renders as black, ref renders as paper/white — entire rectangle absent)
  - `corpus/envato/reports/hr-employee-handbook/heat-001.png` (entire page-1 theme: cand=dark teal/blue, ref=dark red — every spot of color shifted)
- **Symptom**: Pages whose ref export shows master-page rectangles at reduced opacity / inverted theme / non-printing rendering diverge sharply from cand. Cand picks up the IDML-declared colour at full saturation and renders it; ref shows a different palette altogether.
- **Root cause (hypothesis)**: Two-part. (a) Several packs ship with a `<Layer Printable="true|false">` annotation we don't honor — gridtastic carries a "guides" layer (`uc4`) with all the cyan rectangles flagged as guides, which InDesign suppresses from print but our renderer treats as visible (check `crates/paged-parse/src/designmap.rs::Layer.printable` vs `crates/paged-renderer/src/pipeline.rs` master-spread routing). (b) For hr-employee-handbook the theme palette was customised pre-PDF-export by the corpus author (echo of cycle-1 INF-2: theme-color override pre-export). Pack-level audit needed to disentangle.
- **Suggested fix**: (1) Parse `<Layer Printable="...">` (presently `paged-parse/src/designmap.rs` reads `Visible` and `Name` but not `Printable`) and skip items whose layer is `Printable="false"` in the renderer's per-frame emit. (2) For colour-theme drift, add a `manifest.json` `note` per pack and exclude from gated-tier promotion (same as cycle-1 INF-2 procedure). Cross-link cycle-1 P-21 (won't-fix for layers it didn't reach) — same `<Layer>` parsing gap.
- **Effort**: S for (1) layer parse; M for (2) corpus annotation sweep.

---

### F-05: Body-text Knuth-Plass wrap drifts ±1 line and shifts hyphen positions vs InDesign export
- **Category**: Text
- **Severity**: Major
- **Frequency**: 12+/18 packs sampled (universal across magazines + columned layouts)
- **Crate(s)**: paged-text, paged-renderer
- **Evidence**:
  - `corpus/envato/reports/magazine/heat-014.png` (justified body in two columns; every line position shifted ~5px → red overlay everywhere)
  - `corpus/envato/reports/modern-architecture-portfolio-template/cand-005.png` vs `ref-005.png` ("Hicitio quasiti onsequi … veniminvende" — cand hyphenates "venimin-vende", ref doesn't)
  - `corpus/envato/reports/minimal-furniture-brochure/heat-014.png` (title "Simplicity Meets Sustainability": cand wraps at "Sus-/tainability/bility", ref at "Sustaina-/bility")
  - `corpus/envato/reports/lifestyle-magazine-layout/cand-006.png` ("CON" / "TRIB" — cand drops the trailing `-` hyphen InDesign added at the line break; ref shows "CON-" / "TRIBU-")
- **Symptom**: Body text and large headlines wrap at different word/line boundaries than the reference PDF. Subtle cases shift by 1 line per paragraph; severe cases drop the inserted hyphen character entirely.
- **Root cause (hypothesis)**: Convergence with cycle-1 P-07 (composer calibration — DEFERRED). Probable contributors: (a) `MinimumWordSpacing` / `MaximumWordSpacing` / `MinimumLetterSpacing` / `MaximumGlyphScaling` from the IDML's `ParagraphStyle` are parsed (`crates/paged-parse/src/styles.rs:407-416`) but the Knuth-Plass breaker at `crates/paged-text/src/paragraph_breaker.rs` may not consult them — workspace grep for `maximum_word_spacing` in `paged-text/src/` is worth a sweep. (b) The auto-inserted hyphen character on a soft break isn't emitted into the glyph stream — visible in `lifestyle-magazine-layout/cand-006.png` where "CON" stops mid-word with no trailing dash.
- **Suggested fix**: Cycle-1 P-07 effort scope. Two concrete sub-tasks: (1) Plumb `min/max_word_spacing`, `min/max_letter_spacing`, `min/max_glyph_scaling` from `ResolvedParagraphAttrs` → `LayoutOptions` → the breaker's badness function. (2) In `crates/paged-text/src/layout.rs` line-break emission, when a `Discretionary` / `auto-hyphenation` break fires mid-cluster, append the soft-hyphen glyph (`-`) at end of the current line — workspace grep for `hyphen_char\|soft_hyphen` in `paged-text/src/` should show whether the breaker already tracks this.
- **Effort**: L (composer calibration is its own multi-week track per cycle-1 P-07).

---

### F-06: Multi-line headline / single-word-per-line text bug on wide TextFrames
- **Category**: Text
- **Severity**: Major
- **Frequency**: 4+/18 packs sampled (real-estate-brochure, business-proposal, newspaper, indesign-magazine)
- **Crate(s)**: paged-renderer, paged-text
- **Evidence**:
  - `corpus/envato/reports/real-estate-brochure/cand-019.png` vs `ref-019.png` ("To be a world-class property company that is innovative & trustworthy." renders as 7 single-word lines: "To / be / a / world-class / property / company / that"; ref shows 2 lines of 5-6 words each. Frame is 487pt wide; words are ~110pt at 30pt Bold — at least 3 fit per line.)
  - `corpus/envato/reports/business-proposal/cand-003.png` (right-column quote "Si tectur, od ea evendae roresci…": cand stacks one short word per line in a column ~25pt wide; ref shows the same content in 8 short lines of 3-4 words)
  - `corpus/envato/reports/newspaper/cand-002.png` (multiple right-column captions wrap as 1-char-per-line)
- **Symptom**: A subset of `<TextFrame>` paragraphs wrap dramatically narrower than the actual frame width — every word lands on its own line. The visible glyph size is correct, the frame is correctly placed; only the wrap-width is broken.
- **Root cause (hypothesis)**: Verified for `real-estate-brochure` page 19: frame `u7688` (story `u768d`) has `<TextFramePreference TextColumnCount="1" TextColumnFixedWidth="487.56">` and `<PathGeometry>` 487.56pt wide. Paragraph style "30 Pt Headline:Left" cascades from `20/25:Left` (`MaximumWordSpacing="100" MinimumWordSpacing="90"` — both percentages). Suspect the breaker's column width is being mis-computed — maybe (a) `Tracking="50"` from the `8/15` base style cascades through (despite `20/25:Left`'s `Tracking="0"` override) and we apply 50pt of tracking per glyph; or (b) `MaximumWordSpacing="100"` is interpreted as absolute pt instead of percentage, so each space-glyph advances 100pt; or (c) the column width gets divided by something it shouldn't. Need an inspector dump of the wrap path.
- **Suggested fix**: Add a `RUST_LOG=trace` debug dump of `column_width_pt` + the first paragraph's `LayoutOptions::word_spacing` for `real-estate-brochure` page 19. If the latter is in absolute pt rather than the percentage normalization, fix the unit conversion in `crates/paged-text/src/layout.rs` paragraph composer where word/letter spacing is applied. Likely a 1-line `/ 100.0` somewhere. Cross-link: companion symptom to F-05's composer-calibration track but the magnitude (one-word-per-line) is unrelated to the ±1-line drift and likely a separate units bug.
- **Effort**: S (one bug, one-line fix once located) → M (worst case if it's a deeper unit-system rework).

---

### F-07: `<Table>`-like grid content (real tables, IDML `<Table>` element) appears unrendered
- **Category**: Tables
- **Severity**: Major
- **Frequency**: Unclear without broader sweep; likely 2-3 packs in the moderate set + many across the rough/clean tiers (cycle-1 noted similar absences)
- **Crate(s)**: paged-parse, paged-renderer
- **Evidence**:
  - Workspace grep across `crates/paged-parse/src/` and `crates/paged-renderer/src/` for `b"Table"\|<Cell\|<Row\|TableStyle` returns zero functional hits (only TOC-style "Contents" strings unrelated to tables).
  - Reports surface table-shaped regions as blank: cand often has zero glyphs where ref shows tabular text. Distinguishing "embedded-image grid" (F-01) from "real `<Table>` cells" requires per-pack IDML probe — newspaper-template + church-newsletter-template confirmed F-01 (embedded JPEGs masquerading as a grid). At least one other pack (catalog page 9) shows a transparency-checker grid in ref which neither matches F-01 nor F-02 — possible real-table candidate.
- **Symptom**: Reference renders a multi-row, multi-column data grid. Candidate is blank or shows only the surrounding text frame border.
- **Root cause (hypothesis)**: IDML `<Table>` / `<Row>` / `<Cell>` element family is not parsed at all. `crates/paged-parse/src/story.rs` recognises only `<ParagraphStyleRange>` / `<CharacterStyleRange>` / `<Content>` / `<Br/>` — `<Table>` lives inside `<CharacterStyleRange>` in real IDMLs and we'd silently drop the entire subtree. Cross-check: workspace grep for the inspector dump tags would show whether tables are visible upstream.
- **Suggested fix**: Two-step. (1) Land `<Table>` parsing in `crates/paged-parse/src/story.rs` — at minimum the table dimensions (`BodyRowCount`, `ColumnCount`), each cell's text content, and the table's `AppliedTableStyle` reference. (2) Add `DisplayCommand::Table { cells: Vec<Cell>, transform: Transform }` to `paged-compose` and a renderer pass at `crates/paged-renderer/src/pipeline.rs` that walks cells, places each cell's text via the existing per-paragraph composer, and strokes the table's cell borders. Sized large because tables are their own typographic concept (vertical alignment, cell padding, header-row repetition, merged cells, …). Cross-link: a real-`<Table>` audit pass would surface fixtures in the rough/blocker tiers where this matters most.
- **Effort**: L.

---

### F-08: Image-placeholder `<Rectangle>` rendered with white/no fill instead of InDesign's gray "missing-image" indicator
- **Category**: Images
- **Severity**: Minor
- **Frequency**: 5+/18 packs sampled (magazine-editorial-layout, modern-architecture-portfolio, minimal-furniture-brochure, catalog, project-case-study-template)
- **Crate(s)**: paged-renderer
- **Evidence**:
  - `corpus/envato/reports/magazine-editorial-layout/cand-015.png` vs `ref-015.png` (placeholder rectangles: cand=light-gray 20% tint; ref=medium-gray 50% tint, with darker / heavier-weight diagonal X lines)
  - `corpus/envato/reports/catalog/ref-009.png` (transparency-checkerboard pattern in ref vs blank cand — checkerboard is InDesign's "frame with no image but checker preview" indicator)
  - `corpus/envato/reports/modern-architecture-portfolio-template/cand-005.png` (placeholder rects slightly lighter in cand than ref)
- **Symptom**: Empty image frames render in cand as 20%-tint paper-grey with thin diagonal X marks; the InDesign-exported reference shows them as 50%-tint medium-grey with heavier black diagonals OR as a transparency-checker pattern. ΔE delta is small but per-pixel covers a large area (full-page placeholders).
- **Root cause (hypothesis)**: P-02 (cycle 1) wired the missing-image placeholder as 30% grey fill + diagonal X — that matches well for half the packs but not for layouts where InDesign treats the frame as having a clip-but-no-content (~50% gray) or where Display Performance was "Typical" at PDF export time (which bakes the checkerboard). The fix is corpus-curation-dependent, not pure renderer.
- **Suggested fix**: First-pass: dump a histogram of empty-frame grays from the reference PDFs (e.g. via `pdftoppm` of an isolated empty frame in 3-4 packs) and pick a single canonical grey + line weight that matches InDesign's default "Typical Display" output. Adjust `placeholder_fill` / `placeholder_line_weight` at `crates/paged-renderer/src/pipeline.rs` (per the P-02 helper). Lower-priority since ΔE impact is bounded but a fresh value of ~50% grey + 1.5pt black X would cover most of the variance.
- **Effort**: S.

---

### F-09: Soft-hyphen / discretionary break character dropped at line break (AllCaps + long word)
- **Category**: Text
- **Severity**: Minor
- **Frequency**: 2+/18 packs sampled (lifestyle-magazine-layout, food-cooking-magazine-template, possibly green-energy-newsletter)
- **Crate(s)**: paged-text
- **Evidence**:
  - `corpus/envato/reports/lifestyle-magazine-layout/cand-006.png` vs `ref-006.png` ("contributors" word in AllCaps wraps to "CON / TRIB" in cand; ref shows "CON- / TRIBU-" with explicit trailing hyphens marking soft breaks)
  - `corpus/envato/reports/green-energy-newsletter/cand-004.png` (similar: "I think I look great in green…" headline drops several letters at line-break points — visible as text simply ending early)
- **Symptom**: When the Knuth-Plass breaker selects a mid-word hyphenation point, the trailing hyphen glyph isn't emitted into the rasterised output. Only the prefix portion of the broken word renders; the visual cue that the word continues on the next line is absent.
- **Root cause (hypothesis)**: Soft-hyphen-emit gap in the line-break path. Workspace grep for `b"hyphen"` in `crates/paged-text/src/layout.rs` should expose whether hyphenation-break points carry a "render-hyphen-here" flag through to glyph emission, or whether the breaker only records the break offset without recording the inserted glyph.
- **Suggested fix**: When `paragraph_breaker` reports a Penalty break with `flagged=true` (hyphenation), the line-emit path in `crates/paged-text/src/layout.rs` should append the hyphen glyph (`-`, U+002D) at the line's terminal x-position, using the same face as the breaking word. Verify via the existing `text_glyph_level.rs` tests by adding a fixture for "CONTRIBUTORS" in a narrow column.
- **Effort**: S.

---

### F-10: AllCaps headline drops final-letter font fallback / wrong-font letter substitution
- **Category**: Fonts, Text
- **Severity**: Minor
- **Frequency**: 3+/18 packs sampled (project-case-study-template, brochure, indesign-magazine)
- **Crate(s)**: paged-renderer
- **Evidence**:
  - `corpus/envato/reports/project-case-study-template/cand-015.png` (heat shows "MINARI STUDIO / ARCHITECT AGENCY" overlays poorly: cand shows letterforms drift wider than ref; the "MINARI STUDIO" header letters are heavier in cand)
  - `corpus/envato/reports/brochure/cand-001.png` ("Product Design" headline appears in black in cand vs white in ref — the per-run FillColor=Paper from the headline's CharacterStyleRange isn't reaching the glyph emit when the underlying paragraph style sets a darker default)
- **Symptom**: Headlines composed from one font family + AllCaps capitalization, often with a paper/white run colour on a coloured frame background, render with slightly wider glyphs and (separately) with the wrong fill colour on cover-page headlines.
- **Root cause (hypothesis)**: Two distinct items lumped here for the per-pack frequency count. (a) Font substitution drift (INF-1 from cycle 1) — covered by per-pack font calibration overrides. (b) The "Product Design" black-in-cand-vs-white-in-ref is suspicious — investigation needed at the run-level FillColor cascade (`crates/paged-scene/src/lib.rs:529-580` `merge_below_character` / `merge_below_paragraph`) for the *combination* of paragraph-style FillColor=Black + character-style FillColor=Paper. Cycle-1 P-18 closed the audit hypothesis but only for cases where the *direct run* FillColor is set; this may be a different cascade rule (character style adds Paper, paragraph style adds Black, and the precedence is being inverted).
- **Suggested fix**: (a) Pack-level fonts overrides per INF-1. (b) Write a glyph-level regression in `crates/paged-renderer/tests/text_glyph_level.rs` mirroring brochure cover: paragraph style FillColor=Black, character style FillColor=Paper, no run-direct color. Assert the glyph emits Paper. If it doesn't, fix the cascade ordering at `crates/paged-scene/src/lib.rs:529`.
- **Effort**: S for the cascade audit; L for font-pack calibration (per-pack labour).

---

## Summary

- F-01 (embedded `<Contents>` images) is the single biggest unlock — affects ~half of the magazine/newsletter packs in this tier and is a clean parser-plus-decoder addition.
- F-02 (AutoSizingTextFrame) is the dominant *visual* regression on cover pages — "MAGAZINE" rendering as "MAG" is the most striking single-glance failure across the sampled set.
- F-05/F-06 (composer wrap drift + single-word-per-line) jointly drive most of the body-text ΔE; F-06 is likely a focused units bug worth chasing first before tackling the larger F-05/P-07 calibration track.
- F-03 (gradients on Polygon/Oval) and F-04 (master-layer printability) are mid-effort but each unlocks specific high-visibility cover pages.
- F-07 (real IDML `<Table>` parsing) is the lone tier-1 gap that would require a multi-week design effort but isn't blocking the bulk of this tier; defer until after F-01 / F-02 / F-06 land.

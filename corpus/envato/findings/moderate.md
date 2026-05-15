# Moderate-tier audit (5 < meanΔE ≤ 20)

Sampled **11 of 26 packs** across the meanΔE range: `book-template-design`,
`green-energy-newsletter`, `brand-guideline-template`, `business-proposal`,
`newspaper`, `church-newsletter-template`, `digital-bridesmaid-planner-template`,
`soccer-career-flyer-templates`, `annual-report`, `hr-employee-handbook`,
`catalog`, `magazine`, `annual-report-template-8b5d40`, `newspaper-template`,
`newspaper-newsletter-layout`, `brochure`, `capability-statement-brochure`,
`white-blue-modern-company-annual-report`. (18 of 26, in practice.)

Two strong signals dominate the tier:

- **Empty image frames render nothing** — InDesign's PDF export stamps a
  uniform-gray rectangle with a diagonal X across any image frame that has no
  linked content (or many "YOUR IMAGE / GOES HERE" template overlays). Our
  renderer early-returns when `image_link.is_none()`. This single gap is the
  largest contributor to ΔE on most cover/template pages in the tier (it can
  cover 30–50% of the page area).
- **Rotated text frames lose their text** — IDML stories whose host frame
  carries a rotation `ItemTransform` (e.g. vertical "MARES", "Agency" /
  "Creative", "2030" sidebar labels) emit no glyphs in the candidate. The
  renderer has a post-emit rotation pass (`pipeline.rs:2613`) but the layout
  still composes against the AABB of the rotated rect, not the rect's
  rotated local axes, so width/height mismatch suppresses the line.

Sub-signals: font weight is consistently heavier than InDesign's
fallback-substituted font (this is the font-substitution drift the brief
called out and is not in scope for "real" fixes; flagged once at the end).

---

### F-01: Empty image frames render no placeholder; reference PDFs stamp a gray + diagonal-X "missing content" box
- **Category**: Images
- **Severity**: Blocker
- **Frequency**: ≥10 of 18 sampled packs (catalog, hr-employee-handbook, capability-statement-brochure, annual-report, magazine, church-newsletter-template, newspaper, newspaper-newsletter-layout, digital-bridesmaid-planner-template, brochure, annual-report-template-8b5d40 partial — likely all 26 in the tier)
- **Crate(s)**: idml-parse, idml-compose, idml-renderer
- **Evidence**:
  - `corpus/envato/reports/catalog/cand-009.png` vs `ref-009.png` (entire page reads as gray X-cross checkerboard fields; candidate is white)
  - `corpus/envato/reports/hr-employee-handbook/heat-001.png` (huge upper rectangle missing — the diagonal-X rectangle)
  - `corpus/envato/reports/capability-statement-brochure/ref-001.png` vs `cand-001.png` (gray X-cross box dominates the lower 2/3 of the cover)
  - `corpus/envato/reports/annual-report/ref-001.png` vs `cand-001.png` (full diagonal-X image placeholder behind the "2025" callout block)
- **Symptom**: A Rectangle / Polygon whose `<Image>` child has no `LinkResourceURI` (template scaffolding, link broken, or a designer's reserved-for-photo frame) emits nothing. InDesign's PDF export stamps a 30% gray fill with a black diagonal cross marking the frame's "this is an image slot" identity. Our candidate leaves the area white, so meanΔE for these pages reads 6–17 even when every other element is correct.
- **Root cause (hypothesis)**: `emit_rectangle_image` (`pipeline.rs:6950`) early-returns the moment `rect.image_link.is_none()`. The parser (`spread.rs:1949-1996`) only sets `image_link` when a `LinkResourceURI` / `href` attribute is found — an `<Image>` element with no link silently leaves the field `None`, and the renderer can't distinguish "no image frame at all" from "image frame with unlinked content".
- **Suggested fix**:
  1. Add a parsed `has_image_element` (or `image_kind: ImageKind { Linked(uri), Unlinked, None }`) on `Rectangle` / `Polygon` so the parser can flag frames that nest an `<Image>` element regardless of `LinkResourceURI` (`crates/idml-parse/src/spread.rs:1949`).
  2. In `emit_rectangle_image` (`crates/idml-renderer/src/pipeline.rs:6950`), when the flag is set and `image_link` is `None`, intern a small "missing image" primitive: a 30% gray fill clipped to the rect's path plus two `StrokePath` diagonals (`top-left → bottom-right`, `top-right → bottom-left`) with the frame's stroke colour (or black at ~1pt if none).
  3. The pipeline already has all the geometry it needs (`outer`, `r`, corner-path). The added stamp lives at the same emit site as the image, so it picks up effects/blend-group routing without further plumbing.
- **Effort**: S

### F-02: Rotated text frames (ItemTransform with sin ≠ 0) drop their glyphs
- **Category**: Text
- **Severity**: Blocker
- **Frequency**: 4+ sampled packs (business-proposal "2030" sidebar, soccer-career-flyer-templates "MARES" vertical title, white-blue-modern-company-annual-report "Agency" / "Creative" vertical labels, annual-report-template-8b5d40 vertical chapter markers)
- **Crate(s)**: idml-renderer, idml-text
- **Evidence**:
  - `corpus/envato/reports/business-proposal/cand-001.png` vs `ref-001.png` (vertical "2030" label inside the dark rounded panel is missing in candidate)
  - `corpus/envato/reports/soccer-career-flyer-templates/cand-001.png` vs `ref-001.png` (giant vertical "MARES" wordmark + the soccer-player silhouette overlay both gone)
  - `corpus/envato/reports/white-blue-modern-company-annual-report/cand-001.png` vs `ref-001.png` ("Agency" + "Creative" rotated labels on the left edge of the upper composition missing)
- **Symptom**: Text frames whose `ItemTransform` carries a rotation (`m[1]` / `m[2]` ≠ 0) render their fill rectangle correctly (the post-emit rotation pass handles paths), but no glyphs land — the frame appears as a blank rect on a coloured panel.
- **Root cause (hypothesis)**: The story-emission path computes `column_width_pt` from the frame's AABB after `transform_bounds(b, item_transform)` (used at e.g. `pipeline.rs:484`, `pipeline.rs:1144`, `pipeline.rs:1193`). For a 90°-rotated 30 pt × 600 pt sidebar, AABB swaps the axes to 600 pt wide × 30 pt tall — so the compose call gets a column width of 600 pt and `column_height` of 30 pt, the text fits in 1 line that's clipped or rejected. The post-emit pass at `pipeline.rs:2613` rotates whatever glyphs were emitted, but if compose decides nothing fits, nothing rotates. Layout must use the **un-transformed** (inner-coord) width / height (`frame.bounds.width()` / `.height()`) and let the rotation pass handle the visual placement — exactly mirroring how rotated rect fills work.
- **Suggested fix**: In `crates/idml-renderer/src/pipeline.rs:1144` (chain-head sizing) and `pipeline.rs:1193` (per-frame heights), swap `transform_bounds(frame.bounds, frame.item_transform)` for `frame.bounds` when computing `column_width_pt` / `column_height_pt`. Keep `transform_bounds` only for page-routing / wrap-obstacle computations where the spread-coord AABB is what matters. The existing `rotate_transform_around(...)` pass at `pipeline.rs:2618` then takes over and places the glyphs along the rotated axis.
- **Effort**: M

### F-03: Large background rectangle / gradient fills missing on cover & section-divider pages
- **Category**: Layout
- **Severity**: Blocker
- **Frequency**: 3+ sampled packs (magazine page 15 entire-gray page, brochure page 1 blue-gradient cover, white-blue-modern-company-annual-report page 24 multi-rect cover composition)
- **Crate(s)**: idml-renderer, idml-parse
- **Evidence**:
  - `corpus/envato/reports/magazine/cand-015.png` vs `ref-015.png` (reference is fully gray with a centered chapter box; candidate is fully white)
  - `corpus/envato/reports/brochure/cand-001.png` vs `ref-001.png` (reference has full-page blue gradient + circle + wave; candidate is white with just the triangle dots and "BROCHURE" text)
  - `corpus/envato/reports/white-blue-modern-company-annual-report/cand-024.png` vs `ref-024.png` (reference has overlapping blue + white rectangles forming a "T" pattern; candidate fills the entire upper region with one solid blue rect — overlapping white rect missing)
- **Symptom**: Either a full-page background fill rectangle is missing entirely (magazine), or some rectangles in a stack don't render (brochure's white wave shape, white-blue's white rectangle overlapping the blue background). The result is pages that look fundamentally different from the reference, often dominated by the wrong colour.
- **Root cause (hypothesis)**: Three candidate causes I couldn't fully separate from the rendered artefacts alone:
  (a) Master-spread routing: full-page background rectangles often live on the master spread; the master-application loop at `crates/idml-renderer/src/pipeline.rs:274` uses centroid-based page routing, which can miss large rectangles whose centroid falls outside the live page's bounds.
  (b) Z-order: when many rectangles stack with later-drawn white rects "punching out" the underlying colour, dropping any single rect in the stack changes which area shows the underlying colour. The IDML `spread.rectangles` order is the draw order; if order isn't preserved across the master-apply / group-lift passes, the visual result diverges.
  (c) Gradient endpoints — brochure's missing wave/circle could be `<Gradient>` shapes whose path is parsed but whose fill paint resolves to transparent because the radial/angle path isn't recognised.
- **Suggested fix**:
  1. Add a debug instrumentation flag to `idml-inspect` that dumps "rectangles emitted vs. rectangles in the spread" per page; run against `magazine.idml` page 15 — if rectangle count drops between scene and emit, the routing in `pipeline.rs:274-410` is the culprit; otherwise the issue is in fill-paint resolution.
  2. The most likely surgical fix: relax centroid-based page routing in the master apply (`pipeline.rs:328`) — for items whose AABB strictly contains the live page rect (full-page backgrounds), assign them to **every** containing live page rather than the centroid's nearest. The "rectangle-bigger-than-page" case currently picks one page only.
- **Effort**: M

### F-04: Threaded-story headlines / overflow text drop after the head frame
- **Category**: Text
- **Severity**: Major
- **Frequency**: 3+ sampled packs (newspaper-template "Newspa-" hyphenated big headline + "Aims to Reform Health Care", annual-report "ANNUAL RE-" hyphenated title, newspaper-newsletter-layout "The Church Bell")
- **Crate(s)**: idml-renderer, idml-text
- **Evidence**:
  - `corpus/envato/reports/newspaper-template/ref-001.png` vs `cand-001.png` (reference shows the giant "Newspa-" hyphenated wordmark continuing as "per" elsewhere; candidate has neither half of the title)
  - `corpus/envato/reports/annual-report/cand-001.png` vs `ref-001.png` (reference shows "ANNUAL RE-" hyphenated as the page title; candidate has no headline at all)
  - `corpus/envato/reports/newspaper-newsletter-layout/cand-002.png` vs `ref-002.png` (reference's "The Church" / "Bell" stacked layout missing; candidate shows "The Church Bell" overlaid mid-page in the wrong frame)
- **Symptom**: Stories that visibly overflow their head frame (the InDesign exports hyphenate words because they don't fit) lose all of their content in the candidate, or end up in the wrong frame. The pattern matches a thread chain whose continuation frames aren't getting their lines.
- **Root cause (hypothesis)**: The wrap / overflow path in `emit_paragraph_into_chain` (around `crates/idml-renderer/src/pipeline.rs:1979` `column_width_pt` check) may silently drop the paragraph when `column_width` is too narrow for a single token. For a giant headline whose first-line word is wider than the head frame, the layout returns zero lines instead of advancing to the next frame in the chain. Compare the "The Church Bell" case: candidate renders the entire title in *one* frame (the second one in chain), not split across two frames — suggesting the head-frame attempt produces no glyphs and the second-frame attempt fits the whole title.
- **Suggested fix**: In `crates/idml-renderer/src/pipeline.rs:1979`, when `column_width_pt` ≤ the longest measured glyph cluster's width, emit the glyph anyway (overflowing the frame's right edge) and let the next paragraph / line break naturally. Mirrors InDesign's behaviour where the headline word does overflow / hyphenate even when the column is technically too narrow. Cross-link: composer calibration spike B in `docs/plan.md` Tier 2 #7 should pick this up as a calibration target.
- **Effort**: M

### F-05: Drop-cap paragraphs render only the cap; the wrapping body text is dropped
- **Category**: Text
- **Severity**: Major
- **Frequency**: 1+ sampled (green-energy-newsletter page 6 — likely also affects other text-heavy magazine packs)
- **Crate(s)**: idml-text, idml-renderer
- **Evidence**:
  - `corpus/envato/reports/green-energy-newsletter/cand-006.png` vs `ref-006.png` (candidate's left column ends after a giant solitary "N" cap; reference shows the cap with 5+ lines of body text wrapped to its right, then continues into the next column)
  - `corpus/envato/reports/green-energy-newsletter/heat-006.png` (the entire left column is red)
- **Symptom**: The drop-cap glyph emits at the correct size and position, but no body text appears to its right or beneath it. The remainder of the paragraph (and often the rest of the column) is missing.
- **Root cause (hypothesis)**: `drop_cap_column_widths` (`crates/idml-text/src/layout.rs` referenced from `pipeline.rs:2124`) returns carved widths for the first M lines. If the carved widths are too narrow (or zero) for any single word, the line-breaker emits zero lines and the paragraph emission silently produces no glyphs. The cap itself comes from a separate emit path (`drop_cap_spec_emit` at `pipeline.rs:2067`), so it shows up regardless. The carved-width computation may not account for cap kerning / side-bearing for the substituted font, producing widths that are 0 or negative.
- **Suggested fix**: Guard `drop_cap_column_widths` in `crates/idml-text/src/layout.rs` (the function called at `pipeline.rs:2124`) so each per-line carved width is at least `max_word_width + epsilon` (or the column's natural width when carving yields ≤ 0). When carving would produce a degenerate column, fall back to "compose at natural width starting from line M+1 only" — the cap remains, the wrap is sacrificed, but the body text reaches the page. Add a regression in `text_glyph_level.rs` that loads a 3-line drop-cap paragraph against a narrow column and asserts ≥ 3 glyph rows past the cap.
- **Effort**: M

### F-06: Text frames with `<Image>` placeholder overlays ("YOUR IMAGE / GOES HERE") not rendering their text
- **Category**: Text
- **Severity**: Major
- **Frequency**: 5+ sampled packs (newspaper, newspaper-newsletter-layout, church-newsletter-template, annual-report-template-8b5d40, digital-bridesmaid-planner-template)
- **Crate(s)**: idml-renderer, idml-parse
- **Evidence**:
  - `corpus/envato/reports/newspaper/ref-006.png` vs `cand-006.png` (5×N grid of yellow "YOUR IMAGE / GOES HERE" boxes — every single one absent in candidate)
  - `corpus/envato/reports/church-newsletter-template/ref-001.png` vs `cand-001.png` (10+ image-frame text overlays gone)
  - `corpus/envato/reports/annual-report-template-8b5d40/ref-010.png` vs `cand-010.png` (top row of "YOUR IMAGE / GOES HERE" repetitions — candidate shows them as nearly-invisible faded yellow because layer order / underlying fill is wrong)
- **Symptom**: Empty image frames in many templates carry a *story* (anchored or sibling text frame) reading "YOUR IMAGE / GOES HERE" as designer placeholder. Reference renders these. Candidate either drops them entirely or renders the text but at the wrong layer order (under the page background, invisible).
- **Root cause (hypothesis)**: Almost certainly related to F-01 (empty image frames) — these are typically text frames stacked inside / under empty image frames. If F-01's gray placeholder were also rendered, the text would also surface because the text frame itself is a normal Story-bearing frame. There may also be a stroke-on-empty-frame issue (image frames often have a 1pt black stroke that should still draw when the image is unlinked).
- **Suggested fix**: Fixing F-01 will resolve most of these. Separately verify in `crates/idml-renderer/src/pipeline.rs:514` that empty image frames still call `emit_rectangle_into` (which handles stroke); some path in `module/frame.rs` may be flagging "image frames skip non-image emission".
- **Effort**: S (mostly a side-effect of F-01)

### F-07: Centroid-based master-page routing drops items whose centroid lies outside the live page
- **Category**: Layout
- **Severity**: Major
- **Frequency**: Hard to count; suspected in 5+ packs (any cover page with a master-applied full-bleed background)
- **Crate(s)**: idml-renderer
- **Evidence**:
  - `corpus/envato/reports/magazine/cand-015.png` (entire page should be gray background, is white)
  - `corpus/envato/reports/brochure/cand-001.png` (full-page blue gradient missing)
- **Symptom**: Large rectangles / images applied via the master spread don't reach the live page. Pages look "stripped".
- **Root cause (hypothesis)**: `master_page_for` (`crates/idml-renderer/src/pipeline.rs:328`) uses the bounds centroid to pick which master-page-index the item belongs to. For full-bleed items whose centroid lands across the page-fold or off-page, the wrong index is picked and the live-page coordinate translation `(dx, dy)` then offsets the item out of view.
- **Suggested fix**: In `pipeline.rs:328`, when the item's AABB area is ≥ 0.5 × master-page-area AND the AABB intersects a given master page, route the item to that page (not just the centroid winner). Add a unit test in `pipeline_lib::` that constructs a master with one full-bleed rectangle spanning both master pages and asserts the rectangle reaches both live pages.
- **Effort**: S

### F-08: Decimal-tab leader characters (TOC-style dot fills) collapse to a single dot or are absent on real-world content
- **Category**: Text
- **Severity**: Minor
- **Frequency**: 1+ sampled (book-template-design page 1 "BOOK TITLE HERE" beneath sees a single dot vs reference's 5-dot ellipsis-style leader)
- **Crate(s)**: idml-text
- **Evidence**:
  - `corpus/envato/reports/book-template-design/cand-001.png` vs `ref-001.png` (under "BOOK TITLE HERE" the reference shows "• • • •" — five dots — candidate shows a single "—" or dash)
- **Symptom**: TabStop with `Leader="."` or similar tiles correctly in our `tab_stop_leader_dots_tile_across_the_gap` test but real-world templates produce 1 tile instead of N. The leader-tiling stride may be over-counting in the AdoptOSdistinct case where the leader character's `font_id` resolves to the substitute font (whose `.` glyph width differs from the original).
- **Root cause (hypothesis)**: The tiling stride in `idml-text::layout::apply_tab_stops_with_leaders` (recall it does `floor(gap / leader_width)`) uses the shaped leader's advance — when the substitute font is wider, `floor` collapses to 0 or 1 tiles. This is partially font drift, but the leader strategy doesn't degrade gracefully — InDesign tiles "as many as fit" with kerned reflow.
- **Suggested fix**: Investigate; lowest impact in this tier. May be subsumed by font-substitution calibration work.
- **Effort**: S

### F-09: Anchored / inline-list "▶" marker glyphs render inconsistently across multi-arrow lines
- **Category**: Text
- **Severity**: Minor
- **Frequency**: 1+ sampled (annual-report-template-8b5d40 page 10: reference renders "▶ Humilime ▶ Recenti ▶ Casimirus"; candidate renders only "▶Recenti" with the other two arrow markers missing)
- **Crate(s)**: idml-text, idml-renderer
- **Evidence**:
  - `corpus/envato/reports/annual-report-template-8b5d40/cand-010.png` vs `ref-010.png` (3 items in nav strip; candidate shows 1)
- **Symptom**: A run containing multiple `▶` (U+25B6) glyphs interspersed with words renders some glyphs but drops the others. Suggests a partial font-fallback chain where the `▶` glyph is missing from the run's primary face and only the first one bridges via fallback.
- **Root cause (hypothesis)**: `layout_runs` per-run face cache may bind the run's face once and skip glyph fallback for subsequent missing-glyph clusters. The fallback-font-chain plumbing (mentioned in recent commit `multifont-line-fallback`) covers missing-font slots but may not cover missing-glyph-within-a-found-font.
- **Suggested fix**: Check `crates/idml-text/src/layout.rs` shaping loop — when rustybuzz returns `.notdef` (glyph id 0) for a cluster, retry the cluster against the configured fallback face list. Currently only the run-level fallback applies.
- **Effort**: M

### F-10: Stroke-on-empty-frame (frames with no fill, only stroke) renders inconsistently
- **Category**: Path
- **Severity**: Minor
- **Frequency**: 2+ sampled (book-template-design page 1 — 4 hollow squares + barcode lines at bottom render in candidate, but the line-divider geometry under "BOOK TITLE HERE" differs; capability-statement-brochure page 1 — circle outline renders correctly)
- **Crate(s)**: idml-renderer
- **Evidence**:
  - `corpus/envato/reports/book-template-design/cand-001.png` vs `ref-001.png` (in reference the 4 hollow squares are rendered slightly larger; barcode renders thinner; horizontal line below "ISSUE DATE" exists in candidate but is offset)
- **Symptom**: Frames with no fill but a defined stroke render with subtly different line weights / positions vs. reference. Cumulative effect on small line-art-heavy pages.
- **Root cause (hypothesis)**: Stroke alignment / weight handling near `crates/idml-renderer/src/module/corner_path.rs:14` and `pipeline.rs:6605` — could be a half-pixel rounding issue with `StrokeAlignment="Inside"` vs. the reference's expectation. Not all pages exhibit this, only the line-art-dense ones.
- **Suggested fix**: Compare `stroke_alignment_offset` math in `module/corner_path.rs` against InDesign-PDF expectations using a generated geometry fixture with all three alignment modes. Likely a 0.5-px nudge on `Inside` or `Center` strokes.
- **Effort**: S

### F-11: Font-substitution drift (font weight / glyph metrics) — informational, not a renderer bug
- **Category**: Fonts
- **Severity**: Minor
- **Frequency**: All 18 sampled packs (universal across the tier)
- **Crate(s)**: idml-renderer (font table), test harness
- **Evidence**: Nearly every cand/ref comparison shows heavier candidate text (book-template-design page 4, hr-employee-handbook "EMPLOYEE HANDBOOK", capability-statement-brochure "CAPABILITY STATEMENT", brand-guideline-template lower-quality match).
- **Symptom**: Candidate consistently renders text in a heavier weight than reference. Body-text wraps at fewer characters per line in candidate (5 lines vs 2 in some cases). This single difference accounts for a large fraction of ΔE on text-dense pages.
- **Root cause (hypothesis)**: The fallback font configured in `overrides/_default/` (or similar) substitutes for the original IDML's licensed font but at a different weight class. InDesign's reference PDFs are baked with InDesign's *own* fallback (typically Minion Pro for serifs, Myriad Pro for sans). Our renderer uses Open Sans / Roboto / Lora etc. from `corpus/fonts/`. These are licensable, but their weight axis ≠ InDesign's substitute.
- **Suggested fix**: Out of scope for renderer fixes. The pack-specific font calibration is the right track (the brief flags this explicitly). Adding per-pack `*.fonts.sh` substitution overrides — like `corpus/generated/text-advanced.fonts.sh` — to align with InDesign's fallback weight would shrink ΔE 30–50% across this tier without renderer changes. Cross-link: `docs/plan.md` "Cross-cutting risks" `text-advanced font-vs-PDF mismatch`.
- **Effort**: L (one-off-per-pack labor, not engineering)

### F-12: Vertical text (rotated TextFrame) — separate variant of F-02 worth its own line
- **Category**: Text
- **Severity**: Minor
- **Frequency**: 2+ packs (business-proposal "2030", soccer-career-flyer-templates "MARES")
- **Crate(s)**: idml-renderer
- **Evidence**: Same as F-02 evidence.
- **Symptom**: Same root cause as F-02 but specifically the "90° rotated" case is the most visible.
- **Root cause (hypothesis)**: Identical to F-02.
- **Suggested fix**: Fixing F-02 closes this. Listed separately because the rotated case is reachable by a faster targeted patch: detect `frame_linear[1].abs() + frame_linear[2].abs() > 0.9` (i.e. 90°-ish) and swap `frame.bounds.width()` / `.height()` for the column dims, leaving the general affine case as the wider fix.
- **Effort**: S (targeted variant)

### F-13: Rounded-rectangle corner geometry vs. CornerRadius cascade — possibly under-inheriting from object-style
- **Category**: Path
- **Severity**: Minor
- **Frequency**: 1+ sampled (business-proposal page 1 — main "Business Proposal" panel renders as sharp-cornered rect in candidate vs. rounded rect in reference)
- **Crate(s)**: idml-renderer
- **Evidence**:
  - `corpus/envato/reports/business-proposal/cand-001.png` vs `ref-001.png` (the dark panel containing "Business Proposal" has sharp corners; reference shows softly rounded corners on the right side; orange circle is also clipped behind the rounded edge in reference but the candidate's circle is fully visible — the rounded shape is missing)
- **Symptom**: Reference rounded-rect renders without rounding in candidate.
- **Root cause (hypothesis)**: `corner_radius` may not be cascading from an applied object style. Check `crates/idml-renderer/src/module/object_style.rs:58` — the cascade only fills the radius when `frame.corner_radius.is_none()`. If the parser sets it to `Some(0.0)` for explicit "no rounding" attributes vs. `None` for "inherit", the cascade is skipped incorrectly. Alternatively, the parser may not parse `CornerOption` correctly when it lives on the object style rather than the rect.
- **Suggested fix**: Trace `business-proposal/template.idml` to confirm whether `CornerOption` / `CornerRadius` lives on the panel rectangle or on its applied object style. If the latter, ensure `module/object_style.rs:58` cascades both fields together (not only when `corner_radius` is `None`).
- **Effort**: S

### F-14: Z-order or transparency: white "knockout" rectangles over coloured rects rendering as solid colour
- **Category**: Layout
- **Severity**: Minor
- **Frequency**: 1+ sampled (white-blue-modern-company-annual-report page 24 — reference shows white rectangle overlapping blue, creating "T" pattern; candidate shows full blue rectangle, no white overlap)
- **Crate(s)**: idml-renderer
- **Evidence**:
  - `corpus/envato/reports/white-blue-modern-company-annual-report/cand-024.png` vs `ref-024.png`
- **Symptom**: Multiple stacked rectangles with later white rects "punching out" the underlying colour don't render correctly — final image shows only the underlying colour, not the white overlay.
- **Root cause (hypothesis)**: Either (a) the white rectangles are master-spread items that aren't being routed (overlaps F-07), (b) draw order is being reordered (group-lift pass at `pipeline.rs:350-410` could swap the order if a group's `ItemTransform` decomposition picks the wrong sort key), or (c) Paper-coloured fills are being mapped to fully transparent.
- **Suggested fix**: First check whether the white rectangles are `fill=Paper`; if so, confirm `color_id_to_paint` resolves `Color/Paper` to opaque white not transparent. Diff `idml-inspect`'s frame dump for page 24 — count rectangles emitted vs. the spread XML's count.
- **Effort**: M

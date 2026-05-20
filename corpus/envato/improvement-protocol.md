# Envato fidelity improvement protocol

Living catalog of renderer improvements identified by a multi-agent
audit of the envato corpus (61 packs, rendered + diffed against
InDesign-exported reference PDFs). Each entry has structured fields
plus a `Status` you flip as work progresses.

## How to use this doc

1. **Pick** the next item to work on from the priority table below —
   default to top-of-table (highest severity × frequency, lowest
   effort).
2. **Claim** by editing the row's `Status` to `in-progress` and
   adding your name + a date stamp.
3. **Land the fix**. When the commit lands, set `Status` to `fixed`
   and cite the commit SHA + a one-line summary in the entry's
   "Resolution" line (added when transitioning to `fixed`).
4. **Verify** by re-running `corpus/envato/test.sh <pack>` against
   the packs cited in `Evidence`. When meanΔE drops measurably and
   the heatmap no longer shows the documented symptom, flip
   `Status` to `verified` and add the before/after numbers.

Status taxonomy:

- `open` — discovered, no work started.
- `in-progress` — claimed and being worked on.
- `fixed` — commit landed, but harness numbers not re-measured yet.
- `verified` — confirmed by a re-run of the harness on the cited
  packs.

When a finding turns out to **not be a renderer bug** (corpus
curation, font-licensing, expected behaviour), tag `Status:
won't-fix` with a one-line justification — keep the entry so future
audits don't re-file the same observation.

## Sources

- Raw per-tier findings: `corpus/envato/findings/{clean,moderate,rough}.md`.
- Each cell with a file path links to a real artefact on disk
  (gitignored under `corpus/envato/reports/`; regenerate with
  `corpus/envato/test.sh`).
- File:line citations in "Suggested fix" point at HEAD of the repo
  at the audit's run-date (2026-05-14); a fix may refactor those
  sites — confirm with `git log -L`.

## Priority table

Sorted by (Severity desc, Frequency desc, Effort asc).

| ID    | Title                                                                                  | Cat       | Sev      | Freq      | Effort | Status |
|-------|----------------------------------------------------------------------------------------|-----------|----------|-----------|--------|--------|
| P-01  | FillTint dropped for TextFrame / Polygon / Oval / GraphicLine                          | Color     | Blocker  | 14+/61    | S      | fixed (9f4500f) |
| P-02  | Missing-link image placeholders render as raw fill (no gray + diagonal X)              | Images    | Blocker  | 20+/61    | S      | fixed (0d9df67) |
| P-03  | Rotated text frames drop glyphs (column width uses rotated AABB)                       | Text      | Blocker  |  6+/61    | M      | fixed (a9a6e44) |
| P-04  | Cross-page / spread-spanning frames clipped to single page via AABB centroid           | Layout    | Blocker  |  8+/61    | M      | fixed (86e21dc) |
| P-05  | Master-spread routing drops large non-text background items                            | Layout    | Blocker  |  5+/61    | M      | fixed (adc70e9) |
| P-06  | Variable-font `wght` axis silently no-ops on single-weight TTFs (Bold→Regular)         | Fonts     | Major    |  8+/61    | S      | fixed (1567602) |
| P-07  | Body-text wrap drifts ±1 line vs InDesign on every paragraph (composer calibration)    | Text      | Major    | 10+/61    | M      | fixed (50dd457) |
| P-08  | `HorizontalScale` (and `Skew`) parsed but never applied                                | Text      | Major    |  6+/61    | M      | fixed (a68be60) |
| P-09  | `<GradientFeatherSetting>` (transparency feather) ignored                              | Effects   | Major    |  6+/61    | M      | reopened in cycle 2 as Q-04 (Rectangle path landed cycle 1; non-Rect extension still needed) |
| P-10  | `ParagraphShading` / `RuleAbove` / `RuleBelow` / `ParagraphBorder` not parsed          | Text      | Major    |  5+/61    | M      | reopened in cycle 2 as Q-09 (still deferred; resized L after audit confirmed scope) |
| P-11  | Gradient-painted glyphs flatten to blank or single fallback color                      | Text      | Major    |  5+/61    | M      | fixed (53bc983) |
| P-12  | `Capitalization=SmallCaps` falls back to AllCaps shape (wrong glyph heights)           | Text      | Major    |  4+/61    | M      | fixed (2b878ee) |
| P-13  | Long body text overflows when font-substitute is wider than original                   | Text      | Major    |  4+/61    | M      | fixed (3c6bf8d) |
| P-14  | `<EPSImage>` content not decoded (placed-EPS cover art renders blank)                  | Images    | Major    |  4+/61    | L*     | fixed (48e7163) |
| P-15  | Polygon / Oval frames with `PathOpen` collapse to AABB rectangle                       | Path      | Major    |  4+/61    | M      | fixed (5d95256) |
| P-16  | `<Oval>` frames cannot host placed images (parser drops the `<Image>` child)           | Images    | Major    |  3+/61    | M      | fixed (3b0aca0) |
| P-17  | Threaded-story headline overflow: lines wider than head frame drop instead of bleeding | Text      | Major    |  3+/61    | M      | fixed (a523b4c) |
| P-18  | Per-run `FillColor` on `CharacterStyleRange` not honoured (in-line color emphasis)     | Color     | Major    |  3+/61    | S      | fixed (3a9a939) |
| P-19  | Drop-cap paragraphs: cap renders, wrapping body text drops                             | Text      | Major    |  1+/61    | M      | fixed (6f3d9d6) |
| P-20  | Multi-glyph cluster fallback: `▶` and similar marker glyphs drop after first instance  | Text      | Major    |  1+/61    | M      | fixed (a60384b) |
| P-21  | Decimal-tab leader characters: collapses to 1 tile when substitute font is wider       | Text      | Minor    |  1+/61    | S      | deferred — no TabStop Leader= attributes in any envato pack; cited symptom unrelated to leader tiling |
| P-22  | Stroke alignment: `Inside` / `Center` ½-px nudge vs reference                          | Path      | Minor    |  2+/61    | S      | fixed (80eb915) |
| P-23  | Corner radius cascade from applied object style not honoured                           | Path      | Minor    |  1+/61    | S      | reopened in cycle 2 as Q-16 (per-corner radius scope clarified; promoted to Major) |
| P-24  | `<GraphicLine>` strokes render as tapered triangle instead of constant-width line      | Path      | Minor    |  2+/61    | S      | deferred — symptom is open-polygon stroke (not GraphicLine); arrowhead LineEnd unsupported |
| P-25  | Trailing-newline phantom paragraph emits second numbered marker                        | Text      | Minor    |  1+/61    | S      | fixed (dbe9318) |
| P-26  | Page dimensions of candidate vs reference don't match (off by DPI / page-box)          | Layout    | Minor    |  1+/61    | S      | verified — pixel dimensions match across all 61 packs |
| P-27  | BlendMode `Multiply` on tinted-fill polygons — re-test after P-01 lands                | Effects   | Minor    |  3+/61    | S      | verified — closed by P-01 |
| P-28  | Vertical-rotated text inside small frames drops glyphs with negative tracking          | Text      | Minor    |  2+/61    | S      | open   |
| P-29  | Frame-rotated bounding box should not always rotate text contents (`StoryOrientation`) | Text      | Minor    |  3+/61    | S      | open   |
| P-30  | Z-order: white "Paper" knockout rectangles not punching through underlying colour      | Layout    | Minor    |  1+/61    | M      | reopened in cycle 2 as Q-10 (ItemLayer stack-index ordering — broader scope confirmed) |
| INF-1 | Font-substitution drift: per-pack `fonts.{sh,jsx}` calibration not a renderer fix      | Fonts     | Info     | all       | L      | open   |
| INF-2 | Page-level theme/background colour mismatch — reference PDFs were re-themed pre-export | Color     | Info     |  5+/61    | S      | open   |

\* P-14 is sized as `L` for full EPS decoding via a Ghostscript sidecar; a placeholder-only triage path (matches P-02) is `S`.

---

## Findings

### P-01: FillTint dropped for TextFrame / Polygon / Oval / GraphicLine
- **Category**: Color
- **Severity**: Blocker
- **Frequency**: 14+/61 packs (every layout with grey backgrounds, low-tint stripe overlays, image-placeholder greys, decorative tinted panels)
- **Crate(s)**: idml-parse, idml-renderer
- **Evidence**:
  - `corpus/envato/reports/business-proposal-template/heat-001.png` (3% black diagonal stripes → 100% black)
  - `corpus/envato/reports/welcome-guide-template/heat-037.png` (15% black placeholder rect → 100% black)
  - `corpus/envato/reports/travel-guide-brochure-template-indd-canva/heat-001.png` (15% black big rect → 100% black)
  - `corpus/envato/reports/real-estate-brochure/heat-023.png` (5% black lower-page panel → 100% black)
  - `corpus/envato/reports/lifestyle-magazine-layout/heat-017.png` (tinted gradient bg lost)
  - `corpus/envato/reports/minimal-interior-design-catalog/heat-021.png` (dark page bg fail)
- **Symptom**: Background tinted shapes render at 100% strength of the swatch colour rather than the IDML's intended `FillTint=N%`. The 3% black diagonal stripes in `business-proposal-template/p1` come out solid black instead of barely-visible grey; the same pattern explains every dark-page brochure cover that the renderer turns into a black box.
- **Root cause (hypothesis)**: Only `<Rectangle>` parses `FillTint` (parser at `crates/idml-parse/src/spread.rs:1064` via `read_common_attrs`, struct field at `:371`, propagation at `:1357`). The `Polygon` / `Oval` / `TextFrame` / `GraphicLine` struct definitions don't have a `fill_tint` field at all. The renderer's `ResolvedFrame::from_*` constructors for non-rectangle shapes hardcode `fill_tint: None` (`crates/idml-renderer/src/module/frame.rs:145, 207, 250, 289`).
- **Suggested fix**: Two coordinated edits.
  1. Add `pub fill_tint: Option<f32>` to `Polygon` / `Oval` / `TextFrame` / `GraphicLine` structs in `crates/idml-parse/src/spread.rs:841` (Polygon) and siblings; populate from `common.fill_tint` at their construction sites.
  2. Read it through in the four `from_*` constructors at `crates/idml-renderer/src/module/frame.rs:145, 207, 250, 289`. The downstream paint pipeline already handles tint correctly via `apply_fill_tint` at `crates/idml-renderer/src/pipeline.rs:8361`.
- **Effort**: S — two parser-field additions + four 1-line renderer edits.
- **Resolution**: Added `fill_tint` to TextFrame / Oval / Polygon structs in `idml-parse` (GraphicLine has no fill), populated from `common.fill_tint`, and wired through the matching `ResolvedFrame::from_*` constructors so `apply_fill_tint` now scales the resolved paint for every shape kind.

### P-02: Missing-link image placeholders render as raw fill (no gray + diagonal X)
- **Category**: Images
- **Severity**: Blocker
- **Frequency**: 20+/61 packs (every Envato template ships with broken `LinkResourceURI` paths; InDesign substitutes a placeholder visual that bakes into the PDF)
- **Crate(s)**: idml-parse, idml-renderer
- **Evidence**:
  - `corpus/envato/reports/magazine-editorial-layout/heat-015.png` (grey X-crossed placeholders → empty)
  - `corpus/envato/reports/photography-portfolio-vol-16/heat-017.png` (large X-cross grid → blank)
  - `corpus/envato/reports/wedding-newspaper/heat-001.png` (tiled "YOUR IMAGE GOES HERE" → solid black)
  - `corpus/envato/reports/catalog/cand-009.png` vs `ref-009.png` (entire page is gray X-cross fields; cand is white)
  - `corpus/envato/reports/hr-employee-handbook/heat-001.png` (huge upper diagonal-X rectangle missing)
  - `corpus/envato/reports/capability-statement-brochure/cand-001.png` (placeholder dominates the lower 2/3 of the cover)
  - `corpus/envato/reports/business-magazine-template/heat-002.png` (placeholder tile → dark fill)
- **Symptom**: A Rectangle / Polygon whose `<Image>` child has no resolvable `LinkResourceURI` (template scaffolding, broken link, designer's reserved photo slot) emits nothing — or worse, emits the host frame's raw `FillColor` (often black) — instead of InDesign's 30% grey + diagonal-X placeholder. On image-driven templates this dominates ΔE.
- **Root cause (hypothesis)**: `emit_rectangle_image` (`crates/idml-renderer/src/pipeline.rs:6950`) early-returns the moment `rect.image_link.is_none()`. The parser (`crates/idml-parse/src/spread.rs:1949`) only sets `image_link` when a `LinkResourceURI` is found — an `<Image>` element with no link silently leaves the field `None`, and the renderer can't distinguish "no image at all" from "image frame with unlinked content". The polygon path has the analogous gap at `crates/idml-renderer/src/pipeline.rs:7059`.
- **Suggested fix**:
  1. Add a parser flag for `has_image_element` (or `image_kind: ImageKind { Linked(uri), Unlinked, None }`) on Rectangle / Polygon / Oval / TextFrame so the parser can mark frames that nest an `<Image>` element regardless of resolvability (`crates/idml-parse/src/spread.rs:1949`).
  2. In each image-emit site (`pipeline.rs:6950` rectangle, `:7059` polygon, plus the soon-to-exist oval/textframe paths), when the flag is set and `image_link` is unresolved, intern a small "missing image" stamp: a 30% gray fill clipped to the host path + two diagonal `StrokePath` strokes (TL→BR and TR→BL) at ~0.5 pt. Wire a `RasterOptions::missing_image_placeholder: bool` (default `true`) so headless / production hosts can disable.
- **Effort**: S — single point of plumbing, all geometry already available.
- **Resolution**: Added `has_image_element` flag to Rectangle / Polygon (set when the parser sees `<Image>` / `<EPSImage>` / `<PDF>` / `<ImportedPage>`); when image resolution fails and the flag is set, the renderer stamps a 30% grey fill clipped to the host path plus two diagonal 0.5pt strokes. Gated by a default-on `PipelineOptions::missing_image_placeholder` toggle.

### P-03: Rotated text frames drop glyphs (column width uses rotated AABB)
- **Category**: Text
- **Severity**: Blocker
- **Frequency**: 6+/61 packs (every sidebar with vertical labels, "2030"-style rotated callouts, "MARES" wordmarks, "Agency"/"Creative" edge labels)
- **Crate(s)**: idml-renderer, idml-text
- **Evidence**:
  - `corpus/envato/reports/business-proposal/cand-001.png` vs `ref-001.png` ("2030" vertical sidebar label missing)
  - `corpus/envato/reports/soccer-career-flyer-templates/cand-001.png` vs `ref-001.png` (giant vertical "MARES" wordmark + player silhouette absent)
  - `corpus/envato/reports/white-blue-modern-company-annual-report/cand-001.png` vs `ref-001.png` ("Agency" + "Creative" rotated edge labels missing)
  - `corpus/envato/reports/brown-fashion-brochure/heat-005.png` ("TREND" vertical label absent)
  - `corpus/envato/reports/employment-application/heat-001.png` ("PAGE 01 / 03" — "/ 03" rotated 90° in ref, horizontal in cand)
- **Symptom**: A text frame whose `ItemTransform` carries a rotation (`m[1]` / `m[2]` ≠ 0) renders its fill rectangle correctly but emits no glyphs. The frame appears blank on a coloured panel.
- **Root cause (hypothesis)**: Story-emission computes `column_width_pt` from the frame's AABB after `transform_bounds(b, item_transform)` at `crates/idml-renderer/src/pipeline.rs:1144` and `:1193`. For a 90°-rotated 30×600 pt sidebar, the AABB swaps axes to 600×30 — so compose receives `column_width=600, column_height=30`, the text fits in zero or one clipped line, and the post-emit rotation pass at `:2613` has nothing to rotate.
- **Suggested fix**: In `crates/idml-renderer/src/pipeline.rs:1144` (chain-head sizing) and `:1193` (per-frame heights), use `frame.bounds.width()` / `frame.bounds.height()` (inner coords) for `column_width_pt` / `column_height_pt`. Keep `transform_bounds` only for page-routing / wrap-obstacle computations where the spread-coord AABB is what matters. The existing rotation pass at `:2613` / `rotate_transform_around` then places glyphs along the rotated axis correctly.
- **Effort**: M (small surgical change; verifying with rotated-text glyph-level test).
- **Resolution**: Switched column-width sizing in `StoryEmitter::new` to `chain[0].bounds.width()` (inner coords) so 90°-rotated TextFrames feed the composer the frame's narrow-side width, not the swapped spread AABB. Added `rotated_text_frame_emits_glyphs_along_rotated_axis` in `crates/idml-renderer/tests/text_glyph_level.rs` to lock the behaviour.

### P-04: Cross-page / spread-spanning frames clipped to single page via AABB centroid
- **Category**: Layout
- **Severity**: Blocker
- **Frequency**: 8+/61 packs (every spread-spanning hero band, gradient backdrop, bleed-the-gutter polygon)
- **Crate(s)**: idml-renderer
- **Evidence**:
  - `corpus/envato/reports/the-brochure/heat-008.png` (blue header `<Polygon>` spans pages 8+9, renders on one only)
  - `corpus/envato/reports/lifestyle-magazine-layout/heat-017.png` (red gradient page bg crosses the gutter)
  - `corpus/envato/reports/minimal-interior-design-catalog/heat-021.png` (page-spanning black backdrop missing on one side)
  - `corpus/envato/reports/event-program-brochure/heat-002.png` (full-bleed blue page-bg vanishes on one side)
  - `corpus/envato/reports/saas-product-launch-annual-report-brochure/heat-008.png` (dark backdrop missing from upper half)
- **Symptom**: Wide design elements (spread-spanning gradient backgrounds, two-page header bands, "bleed-the-gutter" decoratives) render on exactly one page of the spread; the other half is dropped.
- **Root cause (hypothesis)**: `page_for_frame` (`crates/idml-renderer/src/pipeline.rs:6407`) computes the AABB centroid and returns the *first* page whose bounds contain it. Frames straddling the gutter end up routed to whichever page wins the centroid test. Eight call sites consume this (`:485, :515, :553, :579, :598, :745, :769, :824`) so every shape kind has the same blind spot.
- **Suggested fix**: Replace single-page routing with a multi-page emit pass. Either (a) duplicate the emit per page that the frame's AABB overlaps and rely on the existing per-page rasterizer clip, or (b) introduce a per-spread display list with one final clip-to-page-rect when paginating. Option (a) is simpler — change `let local_idx = page_for_frame(...).unwrap_or(0);` to `for local_idx in pages_overlapping(...)` at all 8 call sites between `:485` and `:824`. Cross-link: not yet in `docs/plan.md` — add under a "spread-spanning frames" line in Tier 2.
- **Effort**: M.
- **Resolution**: Added `pages_overlapping_frame` and rewrote the four non-text shape emit loops (Rectangle / Oval / GraphicLine / Polygon) to emit on every overlapping local page. TextFrames continue to use centroid routing (single story per frame). Per-page rasterizers handle the off-page clip.

### P-05: Master-spread routing drops large non-text background items
- **Category**: Layout
- **Severity**: Blocker
- **Frequency**: 5+/61 packs (any cover or section-divider whose background lives on a master spread)
- **Crate(s)**: idml-renderer
- **Evidence**:
  - `corpus/envato/reports/magazine/cand-015.png` vs `ref-015.png` (page should be fully gray, is fully white)
  - `corpus/envato/reports/brochure/cand-001.png` vs `ref-001.png` (full-page blue gradient cover missing)
  - `corpus/envato/reports/minimal-furniture-brochure/heat-009.png` (dark olive-brown page bg absent)
  - `corpus/envato/reports/the-brochure/heat-008.png` (per-spread blue band lives partly on master)
  - `corpus/envato/reports/welcome-guide-template/heat-037.png` (page-level cream paper colour expected from master)
- **Symptom**: Visible page-background / brand-colour rectangles defined once on the master spread don't show on body pages. Pages look "stripped".
- **Root cause (hypothesis)**: Two interacting issues:
  1. The master-spread routing loop (`master_page_for` / centroid test at `crates/idml-renderer/src/pipeline.rs:328`) uses bounds-centroid to pick which master page an item belongs to; full-bleed items whose centroid lands across the page-fold or off-page get the wrong index.
  2. The master-overlay pass appears text-frame-only (`master_text_emissions` near `pipeline.rs:683`); non-text master items (Rectangle, Polygon, Oval, GraphicLine) may not be duplicated onto body pages at all.
- **Suggested fix**: Audit `pipeline.rs:274-410` master-apply path. Two coordinated changes:
  1. At `:328`, relax centroid routing: when item's AABB area is ≥ 0.5 × master-page area AND it intersects a given master page, assign the item to that page (not just the centroid winner). For full-bleed items, assign to every overlapping page.
  2. Extend the master overlay pass near `:683` to replay Rectangle/Polygon/Oval/GraphicLine, not only text frames. Substitution math is identical to the text-frame case (page-local origin translation).
  Add a regression in `pipeline_lib::tests` covering one full-bleed rectangle spanning two master pages → asserts it reaches both live pages.
- **Effort**: M (mostly mechanical; expansion of an existing replay pass).
- **Resolution**: Replaced strict centroid routing with an `item_belongs` helper that admits items whose AABB area is ≥ 50% of a master page AND overlaps the target master page; extended the master overlay loop to also replay Polygon / Oval / GraphicLine (was Rectangle + TextFrame only). New synthetic regression `master_full_bleed_rectangle_reaches_both_body_pages` in `text_glyph_level.rs`.

### P-06: Variable-font `wght` axis silently no-ops on single-weight TTFs
- **Category**: Fonts
- **Severity**: Major
- **Frequency**: 8+/61 packs (every pack using Bold/Light/Medium against a non-variable fallback in `corpus/fonts/`)
- **Crate(s)**: idml-renderer
- **Evidence**:
  - `corpus/envato/reports/interior-design-catalog/heat-014.png` ("WORKSPACE" Montserrat Bold renders at Inter Bold weight which differs visibly)
  - `corpus/envato/reports/brown-fashion-brochure/heat-002.png` ("ABOUT OUR BRAND" — Vollkorn SC Black → SourceSerif4 has no `wght` axis, renders Regular)
  - `corpus/envato/reports/employment-application/heat-002.png` ("EDUCATION HISTORY" — Open Sans Bold → OpenSans.ttf is single-weight, `set_variations(wght=700)` is a no-op)
  - `corpus/envato/reports/catalog-brochure-template/heat-001.png` ("Catalog" hero — DM Sans Bold → Inter, weight off)
- **Symptom**: Headings + emphasised runs render at the wrong weight, typically Regular instead of Bold/Light. Most visible as thicker/thinner strokes vs reference.
- **Root cause (hypothesis)**: `FontTable::build` at `crates/idml-renderer/src/pipeline.rs:8972` calls `face.set_variations(&[Variation { tag: wght_tag, value: wght }])` unconditionally for every `(font_id, wght_bits)` pair. For non-variable TTFs (`SourceSerif4.ttf`, `OpenSans.ttf`, `Roboto-Regular.ttf`, etc.) the variation is silently dropped. The `_default/fonts.sh` map at `corpus/envato/overrides/_default/fonts.sh` mostly registers bare-family entries, so Bold/Light/Medium variants all resolve to the same single-weight file.
- **Suggested fix**: Two-pronged.
  1. In `FontTable::build` at `crates/idml-renderer/src/pipeline.rs:8966`, detect whether the parsed `ttf_parser::Face` exposes the `wght` axis via `face.variation_axes()` — if not, log a one-shot diagnostic and skip `set_variations`.
  2. Enrich `corpus/envato/overrides/_default/fonts.{sh,jsx}` so each common family has per-style entries (`Open Sans/Bold=$FONTS/Roboto-Bold.ttf`, `Open Sans/Light=$FONTS/Inter.ttf`, etc.). The `font_key` lookup at `crates/idml-renderer/src/asset.rs:165` already prefers `(family, style)` over bare-family.
- **Effort**: S — diagnostic + a handful of override entries.
- **Resolution**: Probe `variation_axes()` before `set_variations` at all four bake sites in `pipeline.rs`; skip the bake when `wght` is absent. Added per-family `/Bold` entries to `_default/fonts.{sh,jsx}` routing common sans + serif families to `Roboto-Bold.ttf` so emboss actually fires.

### P-07: Body-text wrap drifts ±1 line vs InDesign on every paragraph
- **Category**: Text
- **Severity**: Major
- **Frequency**: 10+/61 packs (universal across the clean tier; affects every text-dense page in the corpus)
- **Crate(s)**: idml-text, idml-renderer
- **Evidence**:
  - `corpus/envato/reports/interior-design-catalog/heat-021.png` (cand 3 lines vs ref 2 lines for the same Lorem block)
  - `corpus/envato/reports/ancient-building-magazine/heat-011.png` (Lorem reshapes per-line)
  - `corpus/envato/reports/furniture-product-catalog/heat-008.png` (shifted word breaks across 4 lines)
  - `corpus/envato/reports/brand-guidelines/heat-005.png` (5 lines vs 6 in ref)
  - `corpus/envato/reports/catalog-brochure-template/heat-001.png` (4-column footer wraps to 2 lines per column instead of single-line)
  - `corpus/envato/reports/employment-application/heat-001.png` (wraps one line earlier)
- **Symptom**: Identical paragraph text shapes to slightly different widths in our renderer vs the reference PDF. Each glyph lands at almost-but-not-quite the InDesign x-position; the drift is small per-character (~1–3% of advance) but cumulative — by the end of a 60-char line we typically over- or under-run by 5–15 px, triggering a wrap one word earlier (or later). p99 ΔE consistently lands in 60–100 at the wrapped-word edges.
- **Root cause (hypothesis)**: Composer not calibrated against real InDesign output. `corpus/envato/overrides/_default/fonts.sh` maps common Adobe faces to one of seven OFL fallbacks (Inter / Roboto / OpenSans / Lora / SourceSerif4 / CormorantGaramond / RobotoSlab); their per-glyph advance widths differ by 1–5% at most code points. Compounded by `MinimumWordSpacing` / `DesiredWordSpacing` / `MaximumWordSpacing` (parsed by the styles cascade) not being routed into the breaker — `idml-text` reads only the bare `stretch_ratio` constant from `ComposeOptions`.
- **Suggested fix**: `crates/idml-text/src/compose.rs:179` (`stretch_ratio`) and `compose.rs:526` (`let stretch = (space_width as f32 * options.stretch_ratio)`) should consume the per-paragraph `MinimumWordSpacing` / `DesiredWordSpacing` / `MaximumWordSpacing` from `ResolvedParagraphAttrs` rather than from `ComposeOptions`. Parser already captures them in the styles cascade; plumb through `ResolvedParagraphAttrs` then read in `emit_paragraph_into_chain` at `crates/idml-renderer/src/pipeline.rs:1756`. Cross-link: `docs/plan.md` Tier 2 #7 (Composer calibration) is the canonical home. Re-run `spikes/composer-calibration` after to confirm parity gain.
- **Effort**: M.
- **Resolution**: Added `desired_space_ratio` to `ComposeOptions` so the breaker scales glue natural width by `DesiredWordSpacing/100`; switched stretch/shrink denominator from `desired` to a constant 100 so the Min..=Desired..=Max band lives at the right absolute position regardless of desired ≠ 100.

### P-08: `HorizontalScale` (and `Skew`) parsed but never applied
- **Category**: Text
- **Severity**: Major
- **Frequency**: 6+/61 packs (most visible on display-type, but every paragraph technically affected — the default of 100 hides it)
- **Crate(s)**: idml-parse, idml-text, idml-renderer
- **Evidence**:
  - `corpus/envato/reports/catalog-brochure-template/heat-001.png` ("Catalog" hero — ref has wider glyph stretch, cand at default 100%)
  - `corpus/envato/reports/brand-guidelines/heat-001.png` (background "Brand" ghost word)
  - `corpus/envato/reports/ancient-building-magazine/heat-011.png` (stretched headings in ref)
  - `corpus/envato/reports/employment-application/heat-001.png` ("LFLV" sample — letter spacing differs)
  - `corpus/envato/reports/cultured-business-newsletter/heat-002.png` ("EDUCATION HISTORY" / "WORK EXPERIENCES" tracking + width)
- **Symptom**: Display-size headings render at the default horizontal scale instead of the IDML-specified value. Glyphs look narrower/wider than the InDesign reference at the same point size + font.
- **Root cause (hypothesis)**: `crates/idml-parse/src/story.rs:1088` reads `HorizontalScale` into `CharacterRun::horizontal_scale: Option<f32>`, but a workspace-wide grep across `crates/idml-text/`, `crates/idml-compose/`, `crates/idml-renderer/` shows zero downstream readers. Same story for `Skew` (`story.rs:1126` parses, no reader).
- **Suggested fix**: Thread `horizontal_scale` through `idml-text::StyledRun` (sibling to `tracking` at `crates/idml-text/src/layout.rs:295`). Apply at the shaping site by scaling each glyph's `x_advance` by `horizontal_scale / 100.0`; the per-pt baking at `crates/idml-text/src/shape.rs:43` is where the scale gets folded into 1/64-pt advances today — multiply by H-scale factor there. Render-side: glyph emission affine at `crates/idml-renderer/src/pipeline.rs:1944` needs to fold `(scale_x, 1.0)` into the glyph transform. `Skew` plumbs identically (shear column).
- **Effort**: M.
- **Resolution**: Threaded `horizontal_scale` through `ResolvedRunAttrs` → `StyledRun::horizontal_scale_pct` → `PositionedGlyph::x_scale`. layout_runs scales per-glyph `x_advance` + `x_offset` by `HS/100`; `emit_glyph_slice` / `_stroke` fold the same factor into the FillPath/StrokePath affine x-column. Skew parses but is not yet applied on the emit side. Regression test `horizontal_scale_folds_into_glyph_advance_and_affine`.

### P-09: `<GradientFeatherSetting>` ignored (transparency feather + linear/radial gradient overlays)
- **Category**: Effects
- **Severity**: Major
- **Frequency**: 6+/61 packs
- **Crate(s)**: idml-parse, idml-compose, idml-renderer
- **Evidence**:
  - `corpus/envato/reports/hair-stylist-brochure-vol-3/heat-019.png` (dark backdrop with vignette / typographic decoration)
  - `corpus/envato/reports/lifestyle-magazine-layout/heat-017.png` (corner-to-corner red gradient is the entire page background)
  - `corpus/envato/reports/business-proposal-template/heat-001.png` (gradient-feathered black squares render as flat black)
  - `corpus/envato/reports/minimal-interior-design-catalog/heat-021.png` (page-spanning rect with `<GradientFeatherSetting>`)
- **Symptom**: Decorative gradient-feathered backgrounds (faded edges, corner-to-corner radial vignettes) render as flat fill instead of feather-to-alpha gradient.
- **Root cause (hypothesis)**: `<GradientFeatherSetting Angle="X" Length="Y" GradientStart="x y">` is a transparency effect under `<TransparencySetting>`. Workspace grep shows zero references to `GradientFeather` in `crates/`. We parse `<BlendingSetting>` but not the gradient-feather flavour.
- **Suggested fix**: Add `GradientFeatherSetting { angle: f32, length: f32, start: (f32, f32), stops: Vec<GradientStop> }` parse arm next to the existing `<BlendingSetting>` handler in `crates/idml-parse/src/spread.rs`. Plumb through `ResolvedFrame` into a new `DisplayCommand::PushLayer { effect: LayerEffect::GradientFeather { ... } }` and pop after fill — the existing `PushLayer { GaussianBlur }` plumbing (`docs/plan.md` Tier 3 #12) is the model to mirror. CPU side: a per-pixel alpha mask multiplied by a linear/radial gradient evaluated in the path's bbox.
- **Effort**: M.
- **Deferred**: Audit was inaccurate — gradient feather IS wired end-to-end for Rectangles (parser at `spread.rs:1680`, `FrameEffects::gradient_feather`, `emit_effects_pre/post_fill`, `DisplayCommand::GradientFeather`, `render_gradient_feather` CPU rasterizer, plus a unit test). Extending the `effects` bag + emit hooks to Polygon / Oval / TextFrame / GraphicLine is its own batch (4 parser sites + 4 emit sites). Punted to a follow-up cycle.

### P-10: `ParagraphShading` / `RuleAbove` / `RuleBelow` / `ParagraphBorder` not parsed or rendered
- **Category**: Text
- **Severity**: Major
- **Frequency**: 5+/61 packs (modern templates lean heavily on paragraph shading for highlighted callouts + yellow-band sections)
- **Crate(s)**: idml-parse, idml-text, idml-renderer
- **Evidence**:
  - `corpus/envato/reports/fitness-protein-powder-business-card-templates/heat-001.png` ("WHEY" — `ParagraphShadingTint`, `RuleAboveLineWeight`, `RuleBelowLineWeight`, `ParagraphBorderTopLineWeight` all in source, all missing)
  - `corpus/envato/reports/real-estate-brochure/heat-023.png` (rule-line underlines below section titles)
  - `corpus/envato/reports/saas-product-launch-annual-report-brochure/heat-008.png` (cyan underline rules below "01" / "02" / "03" / "04")
- **Symptom**: Paragraph-level shaded backgrounds (the colored band behind a paragraph), borders around paragraphs, and the rule-above / rule-below horizontal lines are entirely absent.
- **Root cause (hypothesis)**: Workspace grep returns zero hits for `ParagraphShading` / `RuleAbove` / `RuleBelow` in `crates/idml-parse/src/styles.rs` or `story.rs`. The IDML attributes are common on `<ParagraphStyleRange>` / `<ParagraphStyle>` and on the rope; we never lift them off the AST.
- **Suggested fix**: Add parser fields (`paragraph_shading_color`, `paragraph_shading_tint`, `rule_above_*`, `rule_below_*`, `paragraph_border_*`) to `ResolvedParagraph` + the rope's `ParagraphAttrs`. New compose primitives: `DisplayCommand::FillRect` underneath the paragraph's run band for shading; `StrokePath` for rule lines and border. Mechanical extensions of the existing underline/strikethrough machinery at `crates/idml-renderer/src/pipeline.rs:8405` (`emit_line_decorations`) operating on paragraph bands instead of glyph clusters. Add to `docs/plan.md` Tier 2 — high leverage.
- **Effort**: M.
- **Deferred**: 4 distinct feature families (Shading, RuleAbove, RuleBelow, Border) each needing parser + cascade + ResolvedParagraphAttrs + per-paragraph emit hooks — total >= ~30 fields and 4 emit sites. Punted to a focused batch.

### P-11: Gradient-painted glyphs flatten to blank or single fallback colour
- **Category**: Text
- **Severity**: Major
- **Frequency**: 5+/61 packs
- **Crate(s)**: idml-renderer, idml-compose
- **Evidence**:
  - `corpus/envato/reports/fitness-protein-powder-business-card-templates/heat-001.png` ("WHEY" / "POWER" — `FillColor="Gradient/New Gradient Swatch 2"`, title disappears)
  - `corpus/envato/reports/the-brochure/heat-008.png` (white subhead "Quisque id odio..." absent)
  - `corpus/envato/reports/business-magazine-template/heat-002.png` (gradient-styled content variant missing)
- **Symptom**: Display titles painted with a gradient drop out completely or render as a flat fallback.
- **Root cause (hypothesis)**: `paint_as_solid_with_icc` at `crates/idml-renderer/src/pipeline.rs:7513` returns `None` for `Paint::Gradient`. Glyph emission paths through this helper (drop-shadow stamps, line decorations, per-glyph paint picker) cannot accept gradient brushes. The `Paint::Gradient` brush is plumbed through `FillPath` for rectangles but glyph paths use a separate path that flattens to flat colour.
- **Suggested fix**: Two-pronged.
  1. Short term: when the run's resolved `FillColor` resolves to `Paint::Gradient`, evaluate the gradient at the run's bbox centroid and substitute a `Paint::Solid` so text renders with a representative tint.
  2. Long term: extend the glyph-emit path (`pipeline.rs` `RunPaintPicker` callers) to accept `Paint::Gradient` and emit per-glyph `FillPath { paint: Gradient }` with endpoints computed from the text frame's bbox + `GradientFillAngle` / `GradientFillLength` (same projection the rectangle path uses).
- **Effort**: M (short-term S, long-term M).
- **Resolution**: Short-term substitute. New `gradient_midpoint_paint` evaluates the gradient swatch at t=0.5 and returns a `Paint::Solid`. Both `build_run_paint_picker_with_cmyk` and `build_run_paint_picker_resolved` consult it when `color_id_to_paint` returns None, so gradient-fill display titles now paint instead of dropping to the frame default. Long-term per-glyph gradient brushes still deferred.

### P-12: `Capitalization=SmallCaps` falls back to AllCaps shape (wrong glyph heights)
- **Category**: Text
- **Severity**: Major
- **Frequency**: 4+/61 packs
- **Crate(s)**: idml-renderer
- **Evidence**:
  - `corpus/envato/reports/brown-fashion-brochure/heat-002.png` ("BEST SELLER OUR BRAND" — Vollkorn SC + SourceSerif4 substitute drops smcp encoding)
  - `corpus/envato/reports/employment-application/heat-001.png` ("YOUR COMPANY NAME.")
  - `corpus/envato/reports/interior-design-catalog/heat-014.png` ("INTERIOR DESIGN" subhead — ref small-caps height for trailing letters, cand all-cap)
  - `corpus/envato/reports/cultured-business-newsletter/heat-001.png` ("CULTURED BUSINESS" subhead)
- **Symptom**: Small-caps text renders as full-height capitals; the visual rhythm of capital-tall + small-tall letters collapses. Width changes too because small-caps glyphs are narrower than full caps.
- **Root cause (hypothesis)**: `crates/idml-renderer/src/pipeline.rs:1925` matches `Capitalization` and uppercases via `src.to_uppercase()` for both `AllCaps` and `SmallCaps` (acknowledged stopgap in the comment at `:1915-1918`). Substitute fonts have no smcp lookup, so OT routing alone wouldn't fully fix this without an SC-equipped fallback.
- **Suggested fix**:
  1. Drive an `smcp` OT feature through rustybuzz when `Capitalization=SmallCaps`. `crates/idml-text/src/shape.rs:40` shapes with `&[]` features today; add a feature-passing parameter.
  2. When the resolved font has no smcp lookup, scale lowercase glyphs by `cap_height / x_height` ratio (already cached in `FontMetrics` at `crates/idml-renderer/src/pipeline.rs:8981`). Plumb `metrics_for(font_id)` into per-glyph emit so the renderer can scale lowercase glyphs in place.
  3. Until those land, limit the AllCaps fallback at `:1926` to `AllCaps` only; `SmallCaps` passes through without uppercasing — preserves original case which beats forced AllCaps for any font without small-caps lookups.
- **Effort**: M.
- **Resolution**: Took the documented short-term step (3) — case-pass-through for SmallCaps / CapToSmallCap. Full smcp OT routing + scaled-lowercase fallback deferred to a follow-up cycle.

### P-13: Long body text overflows when font-substitute is wider than original
- **Category**: Text
- **Severity**: Major
- **Frequency**: 4+/61 packs (templates declaring fonts like "IvyPresto Display", "Prequel Demo", "Montserrat Bold Italic" missing from `corpus/fonts/`)
- **Crate(s)**: idml-renderer, idml-text
- **Evidence**:
  - `corpus/envato/reports/food-cooking-magazine-template/heat-006.png` ("T e c h n i q u e" with massive letter-spacing)
  - `corpus/envato/reports/the-brochure/heat-008.png` ("Offer new sub-services" subheading column collapses)
  - `corpus/envato/reports/saas-product-launch-annual-report-brochure/heat-008.png` ("Plat-/form" wraps and overlaps body)
- **Symptom**: When a body run's font isn't installed, the fallback substitutes a wider face; the resulting text either overflows the frame, wraps to fewer lines but extends past the right edge, or overlaps other content.
- **Root cause (hypothesis)**: Font fallback chain in `crates/idml-renderer/src/asset.rs`/`pipeline.rs` substitutes one fallback regardless of how wide it is vs the requested font. Knuth-Plass composes with the fallback's metrics but frame height is fixed, so overflow goes invisible. No clamp on "render no more than N lines / clip glyphs past frame bottom".
- **Suggested fix**: Convergence with P-07 (composer calibration, `docs/plan.md` Tier 2 #7).
  1. Short-term frame-clip: when a text frame has more lines than fit, emit only the fitting lines and warn.
  2. Long-term: font-substitution metric-matching (pick a closer-metrics fallback) for the families enumerated in `corpus/envato/overrides/_default/fonts.{sh,jsx}`. Add `Prequel Demo`, `IvyPresto Display`, etc. to the default substitution map.
- **Effort**: M.
- **Resolution**: Short-term frame-clip — when a line's baseline lands past the height of the last frame in its chain, drop it. Tracked via `PipelineStats::dropped_overflow_lines` for diagnostics. Long-term metric-matching deferred.

### P-14: `<EPSImage>` content not decoded
- **Category**: Images
- **Severity**: Major
- **Frequency**: 4+/61 packs (every IDML using InDesign's "place EPS" feature for full-bleed cover art)
- **Crate(s)**: idml-parse, idml-renderer
- **Evidence**:
  - `corpus/envato/reports/annual-report-template/heat-020.png` (cover-page Image element CDATA decodes to `EPSImage` magic bytes — entire blue cover absent)
- **Symptom**: Pages whose only meaningful artwork is a placed EPS render as blank paper.
- **Root cause (hypothesis)**: Image decode only sniffs JPEG/PNG. EPS is a PostScript fragment needing Ghostscript or a small PS interpreter — neither is wired in. Workspace grep for `EPS|EPSImage` returns zero hits.
- **Suggested fix**: Two paths.
  1. Triage (S): skip-as-rendered-rectangle-with-paper-fill or P-02 placeholder — matches the placeholder treatment for missing links.
  2. Full decode (L): route EPS bytes through a `ghostscript` sidecar (native only) or skip and emit a stamped placeholder. For WASM, EPS is genuinely unsupportable without shipping a PostScript interpreter. Document the limitation in `docs/plan.md` Phase 4.
- **Effort**: S for triage, L for full decode.
- **Resolution**: Triage path. `decode_image_bytes` now sniffs `%!PS` magic and returns None with a clearer warning. The P-02 placeholder path already fires when decode returns None and `has_image_element` is set, so EPS rectangles now stamp the missing-image visual instead of blank paper. Full decode (Ghostscript sidecar) deferred.

### P-15: Polygon / Oval frames with `PathOpen` collapse to AABB rectangle
- **Category**: Path
- **Severity**: Major
- **Frequency**: 4+/61 packs (ancient-building-magazine, modern-resume, resume-template-teacher, cultured-business-newsletter)
- **Crate(s)**: idml-parse, idml-renderer
- **Evidence**:
  - `corpus/envato/reports/ancient-building-magazine/heat-011.png` (top-right capsule/oval polygon renders as rectangle)
  - `corpus/envato/reports/modern-resume-reference-job-application-template/heat-001.png` (rounded-rect photo placeholder rectangular in cand)
  - `corpus/envato/reports/cultured-business-newsletter/heat-001.png` (inline placeholder rounded corners squared)
  - `corpus/envato/reports/employment-application/heat-001.png` ("LFLV" sample-frame rounded corner is a hard rectangle)
- **Symptom**: Polygon and Oval frames that host placeholder text or are the visible fill (no `<Image>` child) render as their bounding-box rectangle. Curved geometry of polygon's bezier anchors / oval's ellipse is ignored.
- **Root cause (hypothesis)**: `emit_polygon_into` at `crates/idml-renderer/src/pipeline.rs:3430` interns `polygon_path_from_anchors` only when `Geometry::Polygon { anchors, .. }` is non-empty (`:3470-3485`). The geometry adapter collapses anchor-less polygons to `Geometry::Rect`. Several placeholder frames carry their geometry as `<GeometryPathType>` with `PathOpen="true"` that we never parse — the parser routes them through the Rect path. `polygon_path_from_anchors` at `pipeline.rs:3351` also always emits a closing CubicTo regardless of the parsed open/closed flag.
- **Suggested fix**:
  1. Parse `PathOpen` in `crates/idml-parse/src/spread.rs` (probe `b"PathOpen"` near line 2720) into a `Polygon::path_open: bool` field.
  2. At `crates/idml-renderer/src/pipeline.rs:3409` (auto-close branch), gate the closing CubicTo + final Close on `!path_open`.
  3. For Oval frames hosting no image and no text, `emit_oval_into` at `pipeline.rs:6493` should emit the ellipse via the existing `Geometry::Oval` arm; confirm `fill_paint_module` at `:6529` doesn't fall through to the unit-rect path when `path_id = None`. Add an oval path interner mirroring `corner_path_module`.
- **Effort**: M.
- **Resolution**: Parser lifts `PathOpen` onto a parallel `subpath_open: Vec<bool>` for Polygon / GraphicLine / TextFrame; `polygon_path_from_anchors_with_open` skips closing CubicTo + Close per contour. Oval frames already route through `Geometry::Oval` → `emit_ellipse_transformed_blend`, no auto-rect collapse there. Tests: `polygon_path_open_lifts_to_subpath_open_flag`, `polygon_compound_path_open_records_per_contour_flags`, `polygon_path_from_anchors_with_open_skips_close_for_open_contour`.

### P-16: `<Oval>` frames cannot host placed images
- **Category**: Images
- **Severity**: Major
- **Frequency**: 3+/61 packs
- **Crate(s)**: idml-parse, idml-renderer
- **Evidence**:
  - `corpus/envato/reports/modern-resume-reference-job-application-template/heat-001.png` (central rounded photo placeholder absent)
  - `corpus/envato/reports/resume-template-teacher/heat-001.png` (photo-holder oval absent)
- **Symptom**: An IDML `<Oval>` carrying an `<Image href="..."/>` child renders as a fill-only ellipse; the image content (or its placeholder X-marker) is dropped.
- **Root cause (hypothesis)**: `Oval` struct definition at `crates/idml-parse/src/spread.rs:672` does not declare `image_link` / `image_item_transform` fields; `Rectangle` (`:381`) and `Polygon` (`:881`) both have them. The renderer's `emit_oval_into` at `crates/idml-renderer/src/pipeline.rs:6493` consequently has no image hook.
- **Suggested fix**:
  1. Add `image_link: Option<String>` + `image_item_transform: Option<[f32; 6]>` to `Oval` at `crates/idml-parse/src/spread.rs:672`.
  2. Parse them at the same site Rectangle parses them.
  3. Add `emit_oval_image` in `pipeline.rs` modeled on `emit_polygon_image` at `:7059`, using the oval's parametric ellipse path as the clip.
- **Effort**: M.
- **Resolution**: Parser adds `image_link` / `has_image_element` / `image_item_transform` to `Oval`; the `<Image>` / `<EPSImage>` / `<PDF>` / `<ImportedPage>` handler now matches `CurrentFrameKind::Oval(i)` and populates those fields. Renderer adds `emit_oval_image` (interns `UNIT_ELLIPSE_KEY` for the clip path) plus `emit_oval_missing_image_placeholder` (30% grey ellipse + diagonal X).

### P-17: Threaded-story headline overflow drops the headline instead of bleeding
- **Category**: Text
- **Severity**: Major
- **Frequency**: 3+/61 packs (newspaper-template "Newspa-" hyphenated wordmark + "Aims to Reform Health Care"; annual-report "ANNUAL RE-"; newspaper-newsletter-layout "The Church Bell")
- **Crate(s)**: idml-renderer, idml-text
- **Evidence**:
  - `corpus/envato/reports/newspaper-template/cand-001.png` vs `ref-001.png` (giant "Newspa-" wordmark absent in cand)
  - `corpus/envato/reports/annual-report/cand-001.png` vs `ref-001.png` ("ANNUAL RE-" page title absent)
  - `corpus/envato/reports/newspaper-newsletter-layout/cand-002.png` vs `ref-002.png` ("The Church" / "Bell" stacked layout missing)
- **Symptom**: Stories that visibly overflow their head frame (InDesign exports hyphenate words that don't fit) lose all content in cand, or end up in the wrong frame.
- **Root cause (hypothesis)**: The wrap path in `emit_paragraph_into_chain` near `crates/idml-renderer/src/pipeline.rs:1979` may drop the paragraph when `column_width` is too narrow for a single token. Giant headlines whose first word is wider than the head frame return zero lines instead of advancing to the next frame in the chain.
- **Suggested fix**: At `crates/idml-renderer/src/pipeline.rs:1979`, when `column_width_pt` ≤ longest measured glyph cluster's width, emit the glyph anyway (overflowing the frame's right edge) and let natural line break advance. Mirrors InDesign's headline-overflow / hyphenate behaviour. Cross-link: composer calibration `docs/plan.md` Tier 2 #7.
- **Effort**: M.
- **Resolution**: When `paragraph_breaker::total_fit` returns no breakpoints even at the loosest fallback tolerance, the composer now synthesises one Breakpoint per Box (= word) plus the paragraph-end Penalty so the breaker fall-back emits each word as its own line. Headlines now overflow the right edge instead of dropping silently.

### P-18: Per-run `FillColor` on `CharacterStyleRange` not honoured
- **Category**: Color, Text
- **Severity**: Major
- **Frequency**: 3+/61 packs
- **Crate(s)**: idml-renderer, idml-scene
- **Evidence**:
  - `corpus/envato/reports/brown-fashion-brochure/heat-002.png` ("OUR BRAND" should be CMYK 35/53/96/38 gold/brown — renders close to black)
  - `corpus/envato/reports/modern-resume-reference-job-application-template/heat-001.png` (skill bar progress fills should be pink/lavender, render black)
  - `corpus/envato/reports/brand-guidelines/heat-005.png` (subdued separator dash renders same as surrounding text)
- **Symptom**: Two-color words like "ABOUT OUR BRAND" render in a single color rather than the per-run emphasis the IDML specifies.
- **Root cause (hypothesis)**: The cascade at `crates/idml-scene/src/lib.rs:263` starts with `ResolvedRunAttrs::from_run(run)` then merges below — the run's own `fill_color` should win. But the per-run paint pickup at `crates/idml-renderer/src/pipeline.rs:3745` reads `resolved.fill_color.as_deref()`; if `merge_below_character` is overwriting `fill_color` with the character style's default `Color/Black`, the run-direct colour is lost.
- **Suggested fix**: Audit `crates/idml-scene/src/lib.rs:268-275` cascade order. The expected "direct > applied character style > applied paragraph style" means `merge_below_character` should *not* overwrite `acc.fill_color` when `acc.fill_color.is_some()`. Add an integration test in `crates/idml-renderer/tests/` covering a two-run paragraph where the second run sets `FillColor` directly on its `CharacterStyleRange` (no `AppliedCharacterStyle`), asserting the second run emits a `FillPath` with the expected paint id.
- **Effort**: S.
- **Resolution**: Audit hypothesis was inaccurate. `merge_below_character` and `merge_below_paragraph` both gate `fill_color` on `is_none()` already (idml-scene/src/lib.rs:529, :580); the run-direct colour does win. The visual diffs the audit cited are due to other paths (font substitution, gradient flattening — already addressed under P-11). Locked the behaviour with a new glyph-level regression test so it can't silently regress.

### P-19: Drop-cap paragraphs render the cap but drop the wrapping body text
- **Category**: Text
- **Severity**: Major
- **Frequency**: 1+/61 packs (green-energy-newsletter; likely also other text-heavy magazine packs)
- **Crate(s)**: idml-text, idml-renderer
- **Evidence**:
  - `corpus/envato/reports/green-energy-newsletter/cand-006.png` vs `ref-006.png` (cand has giant solitary "N" cap; ref has cap with 5+ wrapped lines beside it)
  - `corpus/envato/reports/green-energy-newsletter/heat-006.png` (entire left column red)
- **Symptom**: The drop-cap glyph emits at correct size + position, but no body text appears beside or beneath it.
- **Root cause (hypothesis)**: `drop_cap_column_widths` (referenced from `pipeline.rs:2124`) returns carved widths for the first M lines. If carved widths are too narrow / zero for any single word, the line-breaker emits zero lines and the paragraph silently produces no glyphs. The cap itself comes from `drop_cap_spec_emit` at `pipeline.rs:2067` so it survives.
- **Suggested fix**: Guard `drop_cap_column_widths` in `crates/idml-text/src/layout.rs` so each per-line carved width is at least `max_word_width + epsilon`. When carving would produce a degenerate column, fall back to "compose at natural width starting from line M+1 only". Add a regression in `text_glyph_level.rs` for a 3-line drop-cap paragraph against a narrow column asserting ≥3 glyph rows past the cap.
- **Effort**: M.
- **Resolution**: Added `drop_cap_column_widths_with_min` (idml-text) that clamps every carved line up to a floor passed in by the caller. The pipeline measures the widest run-shaped token using the run's actual face + size and passes that as the floor, so paragraph_breaker always has a feasible fit even when the cap would otherwise carve the column below the widest word. Compose-level unit test covers the clamp.

### P-20: Multi-glyph cluster fallback drops `▶` after first instance
- **Category**: Text
- **Severity**: Major
- **Frequency**: 1+/61 packs (annual-report-template-8b5d40; pattern likely in any nav strip with repeated symbol-font markers)
- **Crate(s)**: idml-text, idml-renderer
- **Evidence**:
  - `corpus/envato/reports/annual-report-template-8b5d40/cand-010.png` vs `ref-010.png` (ref shows "▶ Humilime ▶ Recenti ▶ Casimirus"; cand shows only "▶Recenti")
- **Symptom**: A run containing multiple `▶` (U+25B6) glyphs interspersed with words renders some glyphs but drops the others.
- **Root cause (hypothesis)**: `layout_runs` per-run face cache binds the run's face once and skips glyph fallback for subsequent missing-glyph clusters. Recent `multifont-line-fallback` commit covers missing-font slots but not missing-glyph-within-found-font.
- **Suggested fix**: Check `crates/idml-text/src/layout.rs` shaping loop — when rustybuzz returns `.notdef` (glyph id 0) for a cluster, retry the cluster against the configured fallback face list. Currently only run-level fallback applies.
- **Effort**: M.
- **Resolution**: Added `StyledRun::fallback_faces` (slice of `&Face`). `layout_runs` now calls `shape_with_per_cluster_fallback`: for any glyph the primary face shaped to `.notdef`, retry that cluster's source substring against each fallback face and pick the first all-non-notdef shape. The renderer populates the pool from every distinct sibling face in the paragraph, so a `▶` cluster in a serif-body run can pull from a sans-marker run on the same line.

### P-21: Decimal-tab leader collapses to single tile when substitute font is wider
- **Category**: Text
- **Severity**: Minor
- **Frequency**: 1+/61 packs
- **Crate(s)**: idml-text
- **Evidence**:
  - `corpus/envato/reports/book-template-design/cand-001.png` vs `ref-001.png` (ref shows 5 dots, cand shows 1 dot or dash)
- **Symptom**: TabStop with `Leader="."` tiles correctly in unit tests but real-world templates produce 1 tile instead of N. The tiling stride over-counts when the leader character's substitute font width differs from original.
- **Root cause (hypothesis)**: Tiling stride in `idml-text::layout::apply_tab_stops_with_leaders` does `floor(gap / leader_width)`. When the substitute font is wider, `floor` collapses to 0 or 1 tiles. Partially font drift, but doesn't degrade gracefully.
- **Suggested fix**: Investigate. May be subsumed by font-substitution calibration (INF-1). Otherwise: when `leader_width` exceeds a heuristic threshold relative to gap, accept partial overrun rather than dropping all tiles.
- **Effort**: S.
- **Deferred**: No `Leader=` or `TabStop` attributes are present in any of the 61 envato pack templates (verified via per-pack grep of unzipped Resources/Styles.xml). The cited `book-template-design/cand-001.png` "5 dots → 1 dot" difference is unrelated to leader tiling — the dots in the reference are part of a separate decorative element, not a Leader-tabbed paragraph. Cannot reproduce the symptom in the codebase; existing `apply_tab_stops_with_leaders` unit tests cover the tiling path and pass. Punted until a pack with an actual `<TabStop Leader="...">` surfaces.

### P-22: Stroke alignment Inside/Center ½-px nudge
- **Category**: Path
- **Severity**: Minor
- **Frequency**: 2+/61 packs
- **Crate(s)**: idml-renderer
- **Evidence**:
  - `corpus/envato/reports/book-template-design/cand-001.png` vs `ref-001.png` (hollow squares + barcode + line-divider geometry differ subtly)
- **Symptom**: Frames with stroke and no fill render with subtly different line weights/positions vs reference. Cumulative effect on line-art-dense pages.
- **Root cause (hypothesis)**: `stroke_alignment_offset` math near `crates/idml-renderer/src/module/corner_path.rs:14` and `pipeline.rs:6605` — likely a half-pixel rounding issue with `StrokeAlignment="Inside"` vs reference expectation.
- **Suggested fix**: Compare `stroke_alignment_offset` math against InDesign-PDF expectations using a generated geometry fixture with all three alignment modes. Likely a 0.5-px nudge on `Inside` or `Center` strokes.
- **Effort**: S.
- **Resolution**: The math is correct — verified against `corpus/generated/geometry` (passing at meanΔE 0.108, p99 0.000, SSIM 0.994 with thresholds 0.13/0.5/0.99). Inside ⇒ +stroke/2 inward, Outside ⇒ −stroke/2, Center/None ⇒ 0, then `inset_rect` shrinks/grows the rect by exactly the stroke width. Locked with four unit tests in `pipeline::tests` covering each alignment branch + the composed inset rect. The book-template-design positional drift cited in the evidence is a separate frame-position issue unrelated to stroke alignment (parser/style cascade, see P-23).

### P-23: Corner radius cascade from applied object style not honoured
- **Category**: Path
- **Severity**: Minor
- **Frequency**: 1+/61 packs
- **Crate(s)**: idml-renderer
- **Evidence**:
  - `corpus/envato/reports/business-proposal/cand-001.png` vs `ref-001.png` (main "Business Proposal" panel: sharp corners in cand, rounded in ref)
- **Symptom**: Rounded-rect renders as sharp-cornered when corner radius lives on the applied object style instead of the rectangle.
- **Root cause (hypothesis)**: `crates/idml-renderer/src/module/object_style.rs:58` cascade only fills the radius when `frame.corner_radius.is_none()`. If parser sets `Some(0.0)` for explicit "no rounding" vs `None` for "inherit", the cascade is skipped incorrectly. Or `CornerOption` isn't parsed when on the object style.
- **Suggested fix**: Trace `business-proposal/template.idml` to confirm where `CornerOption` lives. If on the object style, ensure `module/object_style.rs:58` cascades `corner_option` and `corner_radius` together.
- **Effort**: S.
- **Deferred**: The cascade at `module/object_style.rs:58` is correct — it preserves `Some(0.0)` and fills `None`. The actual bug producing the cited symptom is that Rectangle u1b4 in `business-proposal/template.idml` carries per-corner attributes (`TopRightCornerOption="RoundedCorner"`, `TopRightCornerRadius="42.51968503937008"`, `BottomRightCornerOption="RoundedCorner"`, `BottomRightCornerRadius="42.51968503937008"`) which the parser doesn't read at all — `read_corner_attrs` only reads the legacy `CornerRadius` + `CornerOption`. Adding per-corner support (4 parser fields, 4 cascade fields, a per-corner `rounded_rect_path` variant) is materially larger than the sized S effort. Punted to a focused batch.

### P-24: `<GraphicLine>` strokes render as tapered triangle
- **Category**: Path
- **Severity**: Minor
- **Frequency**: 2/61 packs
- **Crate(s)**: idml-renderer, idml-gpu
- **Evidence**:
  - `corpus/envato/reports/welcome-guide-template/heat-037.png` (horizontal rule below "Our Mission Title Here" — tall triangle pointing right)
- **Symptom**: A `<GraphicLine>` that should render as a thin horizontal stripe degrades to a triangular wedge — left endpoint at full stroke width, right endpoint converging to zero.
- **Root cause (hypothesis)**: Possibly non-uniform `StrokeAlignment`, a tapered stroke style ("calligraphic" stroke profiles), or path-tessellation treating endpoint stroke widths differently. Could also be a degenerate 3-anchor path forming a triangle when filled.
- **Suggested fix**: Reproduce against `welcome-guide-template/template.idml` GraphicLine elements. Look at `crates/idml-renderer/src/pipeline.rs::emit_line_into` and the CPU rasterizer's stroke pad. Check whether the line's path has 3 anchors.
- **Effort**: S.
- **Deferred**: The cited triangle in `welcome-guide-template/heat-037.png` isn't a GraphicLine — Spread_ua10 (page 13 named, page 37 rendered) has zero `<GraphicLine>` elements. The triangle is a 3-anchor `PathOpen="true"` Polygon (e.g. `ua23` with anchors forming an L-shape) whose open stroke renders correctly post-P-15 but visually differs from the ref's "horizontal rule" because the ref bakes an arrowhead-tipped line (`RightLineEnd="CircleArrowHead"` on the actual GraphicLine `u1604` in a different spread). Closing the gap requires either (a) parsing & rendering `LeftLineEnd` / `RightLineEnd` arrowheads (LineEnd/ArrowHead parsing currently absent — workspace grep returns zero hits) or (b) a per-polygon stroke-line-cap audit. Neither fits the sized S effort. Punted to a focused batch.

### P-25: Trailing-newline phantom paragraph emits second numbered marker
- **Category**: Text
- **Severity**: Minor
- **Frequency**: 1/61 packs
- **Crate(s)**: idml-renderer
- **Evidence**:
  - `corpus/envato/reports/cultured-business-newsletter/heat-001.png` ("01" page-number circle shows ghosted "0/1")
  - `corpus/envato/reports/cultured-business-newsletter/heat-004.png` ("Oct 10, 2020" date pill reflowed)
- **Symptom**: A paragraph that visually reads as one line ghosts in the heatmap as two overlapping renders.
- **Root cause (hypothesis)**: `split_paragraph_at_breaks` at `crates/idml-renderer/src/pipeline.rs:5549` splits at every `\n` in any run's text; a trailing `\n` at the end of the story produces a second empty sub-paragraph that still emits the numbering counter.
- **Suggested fix**: At `pipeline.rs:5549`, after the split, drop a trailing sub-paragraph whose every run is `\n`-only or empty. Add a glyph-level test in `crates/idml-renderer/tests/text_glyph_level.rs` covering a paragraph ending in `\n`.
- **Effort**: S.
- **Resolution**: Tail guard at the end of `split_paragraph_at_breaks`: while the last sub-paragraph's runs are entirely empty or `\n`-only AND the list has > 1 sub, pop it (carrying SpaceAfter forward). Interior empty subs from `<Br/><Br/>` patterns are kept intact since they encode "advance one line of vertical space". Two unit tests in `pipeline::tests`: trailing-`\n`-on-single-run, and all-`\n` trailing run after visible content.

### P-26: Candidate vs reference page dimensions don't match
- **Category**: Layout
- **Severity**: Minor
- **Frequency**: 1+/61 packs (possibly more)
- **Crate(s)**: idml-renderer
- **Evidence**:
  - `corpus/envato/reports/saas-product-launch-annual-report-brochure/cand-008.png` (taller than `ref-008.png` — extra white space below page content)
- **Symptom**: Per-page PNG dimensions in cand vs ref don't match, causing the diff to compare misaligned pixels and inflating ΔE.
- **Root cause (hypothesis)**: Either we render at a different DPI than `pdftoppm`, or honor a `<DocumentPreference>` page size that differs from the actual page geometry, or interpret crop/trim/bleed boxes differently.
- **Suggested fix**: Compare `cand-XXX.png` dimensions to `ref-XXX.png` across packs. If consistently off, audit page-size dispatch in `crates/idml-renderer/src/pipeline.rs::render` against `pdftoppm -r 144`'s assumed output.
- **Effort**: S.
- **Resolution**: Verified — swept every `cand-NNN.png` vs `ref-NNN.png` pair across all 61 reports directories via `sips -g pixelHeight -g pixelWidth`; zero dimensional mismatches. The `saas-product-launch-annual-report-brochure/cand-008.png` "taller than ref" symptom was a pre-Wave-1 issue resolved upstream (likely closed by P-04 cross-page routing + P-05 master-spread routing).

### P-27: BlendMode Multiply on tinted-fill polygons — re-test after P-01
- **Category**: Effects
- **Severity**: Minor (likely invisible once P-01 lands)
- **Frequency**: 3+/61 packs
- **Crate(s)**: idml-renderer
- **Evidence**:
  - `corpus/envato/reports/business-proposal-template/heat-001.png` (diagonal stripes with `BlendMode="Multiply"` — at 3% tint after P-01, multiply against paper is near-imperceptible)
- **Symptom**: Multiply/Screen/Overlay blend modes honored on solid swatches but downgraded on gradients or tinted CMYK with overprint.
- **Root cause (hypothesis)**: `frame_needs_blend_group` at `crates/idml-renderer/src/pipeline.rs:1461` gates blend-group push correctly. Likely fine — re-test after P-01 (the stripes-as-100%-black symptom goes away once tint is honoured, then we'll see whether multiply actually works).
- **Suggested fix**: Re-evaluate after P-01. If still broken, audit `crates/idml-gpu/src/cpu.rs::blend_group_pop` (dispatch table for `TsBlendMode::Multiply`).
- **Effort**: S.
- **Resolution**: Verified closed by P-01. Inspected `corpus/envato/reports/business-proposal-template/cand-001.png` vs `ref-001.png` — the 3% black diagonal stripe pattern now renders as the intended barely-visible light grey in both cand and ref, with the multiply blend respecting the tinted base. The "stripes-as-100%-black" symptom is gone once FillTint cascades into Polygon (P-01 commit `9f4500f`).

### P-28: Vertical-rotated text drops glyphs with negative tracking
- **Category**: Text
- **Severity**: Minor
- **Frequency**: 2/61 packs
- **Crate(s)**: idml-text
- **Evidence**:
  - `corpus/envato/reports/hair-stylist-brochure-vol-3/heat-019.png` (huge "FLST/YIT" 50%-grey rotated decorative letters missing)
- **Symptom**: Display-size letters with negative tracking and large rotation transforms drop out entirely.
- **Root cause (hypothesis)**: Likely related to P-13 (font fallback) — when the font isn't installed and the fallback's tracking-adjusted advance ends up negative or zero, the run measures as empty. Or giant point size (200pt+) hits a clamp.
- **Suggested fix**: Re-evaluate after P-13 lands; likely resolves itself.
- **Effort**: S.
- **Resolution**: Verified closed by Wave 2 fixes (P-08 / P-13 / P-23 combined). Re-ran `corpus/envato/test.sh hair-stylist-brochure-vol-3`: `pack.json` `worst_mean_de` dropped from 72.97 → 21.59 and `worst_ssim` rose from 0.281 → 0.798 vs the pre-Wave-1 snapshot. Re-inspected `heat-019.png`: the giant rotated "STYLIST"/"BEAUTY" decorative letters now render — remaining delta is positional overlap between cand/ref glyph placement, not the "glyphs missing" symptom this entry tracked.

### P-29: Frame-rotated bounding box should not always rotate text contents
- **Category**: Text
- **Severity**: Minor
- **Frequency**: 3+/61 packs
- **Crate(s)**: idml-renderer, idml-text
- **Evidence**:
  - `corpus/envato/reports/the-brochure/heat-008.png` ("04" / "05" / "06" inside circles — rotated 90° in cand, upright in ref)
  - `corpus/envato/reports/hair-stylist-brochure-vol-3/heat-019.png` ("www.yourcompany.com" right-edge text)
- **Symptom**: Frames whose `ItemTransform` encodes a 90°/270° rotation present text rotated to match. InDesign keeps the text upright (perhaps via a `StoryDirection` or `StoryOrientation` attribute).
- **Root cause (hypothesis)**: Probably an attribute we don't read (e.g. `<StoryPreference StoryOrientation="..."/>`) that gates whether text counter-rotates the frame's rotation.
- **Suggested fix**: Investigate first — grep an IDML's `Spread_*.xml` for the rotated frames + their `<Story>` / `<StoryPreference>`. If the marker is `StoryOrientation`, honor it in text emit by counter-rotating glyph advance directions. Otherwise document as InDesign quirk.
- **Effort**: S (investigation), M (fix).
- **Deferred**: Investigation confirmed `StoryPreference StoryOrientation="..."` does appear in `corpus/envato/packs/the-brochure/template.idml` (values "Horizontal" / "Unknown" observed across spreads). The IDML carries the attribute but our parser ignores it — fix requires plumbing `StoryOrientation` through `idml-parse` (`StoryPreference`), `idml-scene` (cascade), and counter-rotation in text emit at the four shape-frame emit sites. Exceeds the sized S+M effort for this batch; punted to a focused follow-up.

### P-30: Paper-coloured knockout rectangles not punching through underlying colour
- **Category**: Layout
- **Severity**: Minor
- **Frequency**: 1+/61 packs
- **Crate(s)**: idml-renderer
- **Evidence**:
  - `corpus/envato/reports/white-blue-modern-company-annual-report/cand-024.png` vs `ref-024.png` (ref shows white rectangle overlapping blue forming "T" pattern; cand shows full blue with no white overlap)
- **Symptom**: Multiple stacked rectangles with later white rects "punching out" the underlying colour don't render correctly — final image shows only the underlying colour.
- **Root cause (hypothesis)**: Either (a) the white rectangles are master-spread items not routed (overlaps P-05), (b) draw order is being reordered (group-lift pass at `pipeline.rs:350-410` could swap sort keys), or (c) Paper-coloured fills are being mapped to transparent.
- **Suggested fix**: Check whether the white rectangles are `fill=Paper`; if so, confirm `color_id_to_paint` resolves `Color/Paper` to opaque white not transparent. Diff `idml-inspect`'s frame dump for page 24 — count rectangles emitted vs the spread XML's count.
- **Effort**: M.
- **Deferred**: Investigated `Spreads/Spread_u21fc.xml` (the page-24 spread). It contains exactly one `FillColor="Color/Paper"` Rectangle (`u2219`, ItemLayer `ub8`) plus one `FillColor="Color/Blue"` Rectangle (`u221a`, ItemLayer `ueb`, with a large `-12032` y-translation in `ItemTransform`). Paper resolution itself is healthy (`crates/idml-parse/src/graphic.rs:416` defaults `Color/Paper` to RGB 255 255 255). The candidate shows full blue with the white rect entirely absent and the "Let's Move Together With Us" text frame also missing — i.e. items on layers `ub8` / `uf0` aren't reaching page 24's raster while layer `ueb`'s blue rect is. Visible delta has a cause outside Paper-fill resolution (likely ItemLayer stacking order or cross-spread routing of the heavily-translated blue rect); needs deeper z-order / layer-stack investigation than this batch's effort budget allows. Punted.

---

## Informational entries (not renderer fixes)

### INF-1: Font-substitution drift — per-pack `fonts.{sh,jsx}` calibration is the right tool
- **Category**: Fonts
- **Severity**: Info
- **Frequency**: All 61 packs to varying degrees
- **Crate(s)**: n/a (test-harness calibration)
- **Evidence**: Universal — every cand/ref comparison shows weight or width drift vs InDesign's Adobe-substituted fonts.
- **Symptom**: Candidate consistently renders text at slightly different weight / advance than reference. Body text wraps at fewer characters per line; headings render at off-weight.
- **Root cause (hypothesis)**: `corpus/envato/overrides/_default/fonts.{sh,jsx}` substitutes Adobe-licensed faces with one of seven OFL fallbacks. InDesign references the same IDML with *its own* fallback (typically Minion Pro for serifs, Myriad Pro for sans). Our renderer uses Inter/Roboto/Lora/Cormorant — licensable but with different per-glyph advance widths and weight axes.
- **Suggested fix**: Out of scope for renderer fixes. Author per-pack `corpus/envato/overrides/<pack>/fonts.{sh,jsx}` sidecars (modelled on the existing `corpus/samples/manual-sample.fonts.sh`) to align the renderer's substitute with InDesign's substitute for that pack. Cross-link: `docs/plan.md` "Cross-cutting risks" — `text-advanced font-vs-PDF mismatch`.
- **Effort**: L (one-off-per-pack labour, not engineering).

### INF-2: Page-level theme/background colour mismatch — reference PDFs re-themed pre-export
- **Category**: Color
- **Severity**: Info (corpus curation, not renderer)
- **Frequency**: 5+/61 packs (resume-template-teacher, employment-application, cultured-business-newsletter, brown-fashion-brochure, modern-resume)
- **Crate(s)**: corpus/envato (pack curation), idml-fidelity (gate-mode flagging)
- **Evidence**:
  - `corpus/envato/reports/cultured-business-newsletter/heat-001.png` (banner blue in ref, orange in cand — IDML's actual FillColor matches cand)
  - `corpus/envato/reports/resume-template-teacher/heat-001.png` (ref has deep red bg; IDML's `Color/ue637` is CMYK 4/3/2/0 → near-white, cand renders that correctly)
  - `corpus/envato/reports/employment-application/heat-001.png` (form field tints differ between ref and IDML-specified)
- **Symptom**: Page-level backgrounds or large fill regions render in different colours between cand and ref, but spot-checking the IDML's actual `FillColor` confirms cand picks the IDML-specified colour.
- **Root cause (hypothesis)**: Corpus curation issue. Envato packs ship with placeholder swatches that the demo-PDF generator overrode at PDF-export time. Not a renderer bug.
- **Suggested fix**: Either (a) re-export reference PDFs from a clean `<pack>/template.idml` without theme customisation, or (b) document the expected delta in `corpus/envato/manifest.json` per-pack `note` and exclude affected packs from the gated tier. Block mean-ΔE-driven promotion to `gated` until ref PDFs are regenerated.
- **Effort**: S.
- **Status**: fixed (b789fbe). Annotated all 5 packs (`resume-template-teacher`, `employment-application`, `cultured-business-newsletter`, `brown-fashion-brochure`, `modern-resume-reference-job-application-template`) with a `note` in `corpus/envato/manifest.json` so future gated-tier promotion skips these until their reference PDFs are re-exported.

---

## Cross-cutting observations

1. **P-01 + P-02 together are the single biggest win.** Both are `S` effort and unlock dramatic visual improvement on the majority of the corpus. Recommended first step.
2. **P-03 / P-04 / P-05 are the missing-piece blockers in layout.** Cross-page frame routing, master-spread propagation for non-text items, and rotated-text layout sizing all stem from the same "use AABB instead of inner rect / iterate overlapping pages" pattern.
3. **The `PushLayer { GaussianBlur }` infrastructure** (`docs/plan.md` Tier 3 #12) is the right home for P-09 (gradient feather) and the gradient-text variants of P-11 — a generic effect-layer plumbing is more useful than per-effect specials.
4. **None of the audit findings overlap with the existing `docs/plan.md` Tier 1 / Tier 2 backlog.** Most surface NEW gaps. After fixing the top blockers, add a "Real-world coverage" subsection to `docs/plan.md` listing the remaining open items here so the backlog and the protocol stay in sync.
5. **INF-1 (font calibration) doesn't move on its own.** The audit's renderer-fix priorities (P-01..P-30) assume per-pack font calibration progress happens in parallel; ΔE numbers in `pack.json` will still drift even after every renderer item is fixed until the substitutions per pack are tuned. The two tracks are independent.

---

## Appendix: re-running the audit

After landing a batch of fixes:

```bash
# Re-render the corpus end-to-end (caches: idempotent unless IDML/fonts changed).
corpus/envato/test.sh

# Inspect new per-pack metrics.
python3 corpus/envato/summarize.py

# Spot-check a specific finding's pack.
open corpus/envato/reports/<pack>/heat-NNN.png \
     corpus/envato/reports/<pack>/cand-NNN.png \
     corpus/envato/reports/<pack>/ref-NNN.png
```

To regenerate the per-tier audit, re-bucket packs (the strata shift
as fixes land), then re-launch the three audit agents with updated
bucket lists. See `corpus/envato/README.md` § "Improvement audit"
for the agent prompt skeleton.

---

# Cycle 2 (audited 2026-05-15)

Second audit pass after the 22 cycle-1 P-* commits landed and the
corpus was re-rendered. Sources:
`corpus/envato/findings-cycle2/{clean,moderate,rough}.md`.

The cycle-2 strata shifted dramatically: clean grew 10→13, most
cycle-1 rough packs moved to moderate (25→10), and 8 packs
**regressed** (cycle-1 fixes painted previously-invisible content
on top of still-missing backgrounds — net visual coverage up,
per-pixel ΔE up). Cycle 2 explicitly investigates those regressions
and adds new findings.

`Q-NN` IDs distinguish cycle-2 entries from cycle-1's `P-NN`.

## Cycle 2 priority table

Sorted by (Severity desc, Frequency desc, Effort asc).

| ID    | Title                                                                              | Cat       | Sev      | Freq     | Effort | Status |
|-------|------------------------------------------------------------------------------------|-----------|----------|----------|--------|--------|
| Q-01  | ObjectStyle FillTint cascade gap — placeholder rects render at 100% strength       | Color     | Blocker  |  9+/61   | S      | fixed (9bd0353) |
| Q-02  | `<TextFramePreference AutoSizingType=...>` ignored — display headlines clipped     | Text      | Blocker  | 13+/61   | M      | open   |
| Q-03  | Embedded image bytes in `<Image>/<Contents>` CDATA never decoded                   | Images    | Blocker  |  8+/61   | M      | open   |
| Q-04  | `<GradientFeatherSetting>` extension to Polygon / Oval / TextFrame / GraphicLine   | Effects   | Blocker  |  5+/61   | M      | TextFrame + Polygon emit hooks landed; Oval needs ellipse path interning; GraphicLine has no fill |
| Q-05  | BlendMode (Multiply, ColorBurn, …) composites against transparent paper as α=0     | Effects   | Blocker  |  4+/61   | S      | fixed (bd601f6) |
| Q-06  | Inline `<PDF>` content treated as missing image; placeholder stamps over content   | Images    | Blocker  |  3+/61   | S      | fixed (82531be) |
| Q-07  | `Tracking` (em-units) under-applied — display words render at natural spacing      | Text      | Major    |  3+/61   | S      | deferred — tracking is already wired end-to-end; evidence is table content (gates on Q-18) |
| Q-08  | Gradient `FillColor` on Polygon / Oval renders as flat fallback (ItemTransform)    | Color     | Major    |  5+/61   | M      | open   |
| Q-09  | `ParagraphShading` / `RuleAbove` / `RuleBelow` / `ParagraphBorder` (P-10 redux)    | Text      | Major    |  5+/61   | L      | open   |
| Q-10  | ItemLayer stack-index ignored for z-ordering (subsumes P-30)                       | Layout    | Major    |  4+/61   | M      | open   |
| Q-11  | `<Rectangle>` with multi-anchor `<PathGeometry>` collapses to AABB                 | Path      | Major    |  3+/61   | S      | open   |
| Q-12  | TextFrame fill colour dropped on full-bleed coloured text frames                   | Color     | Major    |  2+/61   | S      | open   |
| Q-13  | Phantom paragraph leak past P-25 — duplicate rendered paragraphs on some pages     | Text      | Major    |  2+/61   | M      | misdiagnosed; actual symptom is text-sizing drift covered by Q-02 / Q-15 |
| Q-14  | Decode-failed-but-link-resolved vs link-missing: misapplied placeholder            | Images    | Major    |  4+/61   | S      | open   |
| Q-15  | Single-word-per-line wrap on wide TextFrames (likely word-spacing units bug)       | Text      | Major    |  4+/61   | S      | open   |
| Q-16  | Per-corner `CornerOption` (asymmetric radii) ignored (promoted from P-23)          | Path      | Major    |  3+/61   | M      | open   |
| Q-17  | `<Layer Printable="false">` not honoured                                           | Layout    | Major    |  4+/61   | S      | already implemented; regression test pinned this cycle |
| Q-18  | Real `<Table>` / `<Row>` / `<Cell>` IDML element family unparsed                   | Tables    | Major    |  2+/61   | L      | open   |
| Q-19  | `<PatternColor>` / pattern fills render as flat colour                             | Color     | Major    |  2+/61   | M      | confirmed not subsumed by Q-03 (business-proposal-template still flat); deferred |
| Q-20  | Composer wrap drift extension — soft-hyphen + min/max spacing (P-07 follow-up)     | Text      | Major    | 12+/61   | L      | open   |
| Q-21  | AllCaps headline cascade audit — paragraph-style vs character-style FillColor      | Text      | Minor    |  3+/61   | S      | cascade pinned green; residual brochure symptom past this layer |
| Q-22  | Placeholder grey vs InDesign reference — recalibrate fill % + diagonal weight      | Images    | Minor    |  5+/61   | S      | open   |
| Q-23  | Soft-hyphen glyph dropped at auto-hyphenation line break                           | Text      | Minor    |  2+/61   | S      | hyphenator + emit paths already implemented; contract pinned this cycle. Residual envato symptom traced past this layer. |
| Q-24  | BlendMode formulae audit (HardLight / Overlay / SoftLight / ColorBurn) post-Q-05   | Effects   | Minor    |  1+/61   | M      | renderer documented to follow W3C Compositing/Blending L1 (tiny-skia); PDF 1.7 Annex H reconciliation deferred — needs per-mode pixel tests against specific fail cases |
| Q-25  | Font weight drift Light/Thin → Regular (INF-1 follow-up)                           | Fonts     | Minor    |  2+/61   | S      | renderer telemetry landed; per-pack curation deferred |

## Cycle 2 findings

### Q-01: ObjectStyle FillTint cascade gap
- **Category**: Color
- **Severity**: Blocker
- **Frequency**: 9+/61 packs (interior-design-catalog, ancient-building-magazine, business-proposal-template, brown-fashion-brochure, welcome-guide-template, wedding-newspaper, travel-guide-brochure-template-indd-canva, annual-report-template-8b5d40)
- **Crate(s)**: idml-parse, idml-renderer
- **Evidence**:
  - `corpus/envato/reports/welcome-guide-template/heat-002.png` (placeholder rects → solid black; should be 15% grey)
  - `corpus/envato/reports/wedding-newspaper/heat-001.png` (tiled "YOUR IMAGE GOES HERE" → solid black)
  - `corpus/envato/reports/travel-guide-brochure-template-indd-canva/heat-001.png` (central panel solid black; ref 15% grey)
  - `corpus/envato/reports/interior-design-catalog/heat-016.png` (bottom-page placeholder: solid black; ref 15% grey)
- **Symptom**: Image-placeholder rectangles + decorative panels that cascade their fill from an `<ObjectStyle>` carrying `FillColor="…" FillTint="N"` paint at 100% strength. The frame omits FillTint inline; the cascade drops the tint floor. Dominant driver of the welcome-guide / wedding-newspaper / travel-guide regressions.
- **Root cause (hypothesis)**: `ResolvedObject` at `crates/idml-parse/src/styles.rs:152` lists five fields (`fill_color`, `stroke_color`, `stroke_weight`, `corner_radius`, `corner_option`) — no `fill_tint`. `object_style_cascade` at `crates/idml-renderer/src/module/object_style.rs:42` consequently can't propagate it.
- **Suggested fix**: Add `pub fill_tint: Option<f32>` (and `pub stroke_tint: Option<f32>` for symmetry) to `ResolvedObject` at `crates/idml-parse/src/styles.rs:152`; populate from `<ObjectStyle FillTint="…">` in the parser; cascade in `object_style_cascade` at `crates/idml-renderer/src/module/object_style.rs:42` next to `fill_color`.
- **Effort**: S
- **Resolution**: 9bd0353 — added `fill_tint` + `stroke_tint` to ObjectStyleDef + ResolvedObject; populated from `<ObjectStyle FillTint="…"/StrokeTint="…">`; cascaded `fill_tint` into ResolvedFrame in `object_style_cascade`.

### Q-02: `AutoSizingTextFrame` ignored — display headlines clipped
- **Category**: Text
- **Severity**: Blocker
- **Frequency**: 13+/61 packs (business-proposal-template, resume-template-teacher, book-template-design, brand-guidelines, catalog-brochure-template, interior-design-catalog, indesign-magazine, brochure, church-newsletter-template, project-case-study-template, lifestyle-magazine-layout, real-estate-brochure, hr-employee-handbook)
- **Crate(s)**: idml-parse, idml-renderer
- **Evidence**:
  - `corpus/envato/reports/indesign-magazine/heat-001.png` ("MAGAZINE" → "MAG")
  - `corpus/envato/reports/business-proposal-template/heat-001.png` ("BUSINESS PROPOSAL" → "BUSI / PRO")
  - `corpus/envato/reports/brochure/cand-001.png` vs `ref-001.png` ("Product Design" → "Prod / uct")
  - `corpus/envato/reports/church-newsletter-template/cand-002.png` vs `ref-002.png` ("THE MESSENGER" → "THE")
  - `corpus/envato/reports/project-case-study-template/cand-015.png` ("MARKETING PROJECT" → "MAR / KET")
- **Symptom**: Display headlines clip to the first 3-6 characters or 1-2 words because the IDML stores the frame undersized expecting composition-time growth. P-17's frame-clip then drops anything past the original edge.
- **Root cause (hypothesis)**: Workspace grep for `AutoSizingType` / `AutoSizingReferencePoint` / `MinimumWidthForAutoSizing` / `UseMinimumHeightForAutoSizing` in `idml-parse` returns zero hits. The IDML attaches these as `<TextFramePreference>` attributes; our parser drops them.
- **Suggested fix**: Parse the four `AutoSizing*` attributes in `crates/idml-parse/src/spread.rs` near the existing `<TextFramePreference>` block (~line 2110). Plumb through to `TextFrame::auto_sizing: Option<AutoSizingType>`. In `crates/idml-renderer/src/pipeline.rs` near text-frame width calc (~`:1900-2000`), when `auto_sizing == WidthOnly | WidthAndHeight`, expand column width to fit the longest token's measured advance, pinned to the IDML's `MinimumWidth*` floor, before invoking Knuth-Plass.
- **Effort**: M

### Q-03: Embedded image bytes in `<Image>/<Contents>` CDATA never decoded
- **Category**: Images
- **Severity**: Blocker
- **Frequency**: 8+/61 packs (newspaper, newspaper-template, food-cooking-magazine-template, church-newsletter-template, magazine-editorial-layout, indesign-magazine, hr-employee-handbook, project-case-study-template)
- **Crate(s)**: idml-parse, idml-renderer
- **Evidence**:
  - `corpus/envato/reports/newspaper-template/heat-005.png` (30+ embedded JPEG tiles → nothing)
  - `corpus/envato/reports/church-newsletter-template/heat-002.png` (tiled placeholders → empty)
  - `corpus/envato/reports/food-cooking-magazine-template/heat-009.png` (full-page tile → blank)
  - `corpus/envato/reports/newspaper/heat-002.png` (data-table cells of embedded JPEGs)
- **Symptom**: Pages with placed JPEGs that ship inline in the IDML (rather than as external files) render as blank rectangles or P-02 placeholders. The `<Image>` element's `<Properties><Contents><![CDATA[base64 …]]></Contents></Properties>` payload is ignored end-to-end.
- **Root cause (hypothesis)**: `crates/idml-parse/src/spread.rs:2009-2036` captures only `LinkResourceURI` / `href`. No code path parses `<Contents>`. The asset-resolver lookup in `crates/idml-renderer/src/pipeline.rs:7775-7796` returns `None`, P-02 placeholder fires.
- **Suggested fix**: (1) In `crates/idml-parse/src/spread.rs` `<Image>` parser (~`:2009`), when the element has a `<Contents>` child, base64-decode the CDATA into `Vec<u8>` and stash on the parent shape (new `Rectangle::image_bytes: Option<Vec<u8>>`, similarly for Oval / Polygon / TextFrame). (2) In `crates/idml-renderer/src/pipeline.rs:7775`, extend `page_image_cache` lookup: if the asset resolver returns `None` but the frame carries `image_bytes`, decode via existing `decode_image_bytes` helper.
- **Effort**: M

### Q-04: `<GradientFeatherSetting>` extension to Polygon / Oval / TextFrame / GraphicLine
- **Category**: Effects
- **Severity**: Blocker
- **Frequency**: 5+/61 packs (hair-stylist-brochure-vol-3, soccer-career-flyer-templates, fitness-protein-powder-business-card-templates, the-brochure, annual-report-template-8b5d40)
- **Crate(s)**: idml-parse, idml-compose, idml-renderer
- **Evidence**:
  - `corpus/envato/reports/hair-stylist-brochure-vol-3/heat-001.png` (gradient-feathered backdrop missing on cover)
  - `corpus/envato/reports/soccer-career-flyer-templates/heat-001.png` (orange page bg with multiple gradient-feathered Polygons → blank)
  - `corpus/envato/reports/fitness-protein-powder-business-card-templates/heat-001.png` (gradient-feathered Rectangle backgrounds gone; ties to Q-05 Multiply-on-transparent)
- **Symptom**: Decorative gradient-feathered backdrops on non-Rectangle shapes paint as flat fill (or nothing when frame.fill_color is None). Cycle 1's `PushLayer { GradientFeather }` plumbing for Rectangle was never extended.
- **Root cause (hypothesis)**: `effects: Option<FrameEffects>` lives only on `Rectangle` (`crates/idml-parse/src/spread.rs:470`). `Polygon` (`:881`), `Oval` (`:707`), `TextFrame` (`:443`), `GraphicLine` (`:750`) lack the field and the matching `emit_effects_pre_fill` / `emit_effects_post_fill` calls in their per-shape emit paths in `pipeline.rs`.
- **Suggested fix**: Mechanical extension of cycle 1's Rectangle path. Add `pub effects: Option<FrameEffects>` to the four parser structs, populate from the same parse arm. Mirror Rectangle emit hooks at `pipeline.rs:7038-7058` into `emit_polygon_into`, `emit_oval_into`, `emit_text_frame_into`, the GraphicLine emit site. Compose-side `DisplayCommand::GradientFeather` + CPU `render_gradient_feather` are already shape-agnostic — no rasterizer changes needed.
- **Effort**: M
- **Cross-link**: cycle-1 P-09 (deferred there).

### Q-05: BlendMode composites against transparent paper as α=0
- **Category**: Effects
- **Severity**: Blocker
- **Frequency**: 4+/61 packs (fitness-protein-powder-business-card-templates, soccer-career-flyer-templates, business-proposal-template, hair-stylist-brochure-vol-3)
- **Crate(s)**: idml-renderer, idml-gpu
- **Evidence**:
  - `corpus/envato/reports/fitness-protein-powder-business-card-templates/heat-001.png` (Multiply Rectangle → transparent over white instead of red over paper; primary driver of the +63% regression)
  - `corpus/envato/reports/soccer-career-flyer-templates/heat-001.png` (HardLight / Overlay / ColorBurn stack composes to nothing)
- **Symptom**: When a frame uses a non-Normal BlendMode and the spread doesn't draw an explicit Paper rectangle behind it, the blend group composites against α=0 backdrop and the frame's contribution annihilates (Multiply×0=0).
- **Root cause (hypothesis)**: `BeginBlendGroup` at `crates/idml-gpu/src/cpu.rs:1513` snapshots the parent's existing pixels for the non-isolated semantic, but the parent pixmap is cleared transparent rather than to opaque paper-white. InDesign treats the page as opaque white paper; we treat it as PDF's transparent device.
- **Suggested fix**: (a) Quick win (S): when the snapshot region is fully α=0 at `crates/idml-gpu/src/cpu.rs:1541`, substitute opaque white. (b) Correct fix (M): paint an opaque Paper rect at page bbox before any spread items in `crates/idml-renderer/src/pipeline.rs::render` page-init.
- **Effort**: S (snapshot patch) / M (paper init)
- **Resolution**: bd601f6 — S-path landed. When the `BeginBlendGroup` snapshot is fully α=0, substitute it with opaque paper before the bypass; the existing `near_paper`-driven SrcOver-on-paper pass then runs normally. Unit test `q05_multiply_group_over_transparent_paper_renders_as_multiply_on_white` guards.

### Q-06: Inline `<PDF>` content treated as missing image
- **Category**: Images
- **Severity**: Blocker
- **Frequency**: 3+/61 packs (soccer-career-flyer-templates, annual-report-template, the-brochure)
- **Crate(s)**: idml-parse, idml-renderer
- **Evidence**:
  - `corpus/envato/reports/soccer-career-flyer-templates/heat-001.png` (Rectangle u6aa3 hosts a `<PDF>` element with inline base64 — placeholder grey-X stamps over the player silhouette + textured backdrop)
  - `corpus/envato/reports/annual-report-template/heat-001.png` (cover Rectangle ua055: 35MB embedded `<Image>` undecodable; placeholder X over what should be blue gradient cover)
- **Symptom**: Pages whose hero artwork is a placed PDF render as InDesign's missing-image placeholder. Where the placeholder lands on a transparent backdrop, white-on-color text from above reads as light-grey-on-grey (much worse ΔE).
- **Root cause (hypothesis)**: `crates/idml-parse/src/spread.rs:2007` treats `<PDF>` like `<Image>` — flips `has_image_element=true` so P-02 placeholder fires, but never extracts the inline `<Contents>` CDATA. `decode_image_bytes` at `crates/idml-renderer/src/pipeline.rs:7967` sniffs `%!PS` (P-14 EPS triage) and would similarly bail on `%PDF-`.
- **Suggested fix**: Triage (S): in the parser, when `<PDF>` carries `<Contents>` but no `LinkResourceURI`, set `has_inline_pdf: bool` distinct from `has_image_element`. In the missing-image-placeholder emit, special-case inline-PDF rectangles to emit Paper fill rather than grey + X-cross (matches InDesign's "placed PDF can't render → frame fill shows"). Defer full Ghostscript/pdfium decode (L).
- **Effort**: S triage / L full decode
- **Resolution**: 82531be — S-triage landed. `has_inline_pdf` flag set during `<PDF>` parse when no LinkResourceURI; placeholder emit short-circuits so the frame's intrinsic FillColor (already emitted upstream) shows through. Full decode deferred.

### Q-07: `Tracking` under-applied — display words render at natural spacing
- **Category**: Text
- **Severity**: Major
- **Frequency**: 3+/61 packs (employment-application, interior-design-catalog, ancient-building-magazine)
- **Crate(s)**: idml-text, idml-renderer
- **Evidence**:
  - `corpus/envato/reports/employment-application/cand-001.png` vs `ref-001.png` ("LFLV" in cand vs "L F L V" in ref)
  - `corpus/envato/reports/interior-design-catalog/heat-016.png` ("LAUDRY" hero: cand natural spacing, ref wide tracking)
  - `corpus/envato/reports/interior-design-catalog/heat-010.png` ("BATHROOM" hero: same pattern)
- **Symptom**: Display headlines authored with a large positive `Tracking` value (typical Envato section titles tracked 400-1000 thousandths-of-em) render with natural inter-letter advance.
- **Root cause (hypothesis)**: `Tracking` likely parsed at `<CharacterStyleRange Tracking="…">` but not propagated to per-glyph advance in `shape_run` or `compose_paragraph`. Sibling gap to cycle 1's P-08 (HorizontalScale/Skew).
- **Suggested fix**: Grep `crates/idml-text/src/` for `tracking`. If `shape_run` doesn't apply it, thread the per-run tracking (`tracking * font_size_pt / 1000.0` extra advance per cluster) into the advance accumulator in the shaping loop.
- **Effort**: S
- **Deferred**: Tracking is already plumbed end-to-end: parser → cascade (`ResolvedRunAttrs.tracking`, both character and paragraph fold-in) → `StyledRun.tracking` → `apply_tracking` in `layout_runs`. The cited evidence (employment-application "REFERENCES" table cells, interior-design-catalog "LAUDRY" pricing table) is text inside `<Table>` IDML elements that our parser drops entirely (Q-18). Re-audit after Q-18 lands; if the regression is still visible on non-table headlines, file as a new Q.

### Q-08: Gradient `FillColor` on Polygon / Oval flattens (ItemTransform projection)
- **Category**: Color, Effects
- **Severity**: Major
- **Frequency**: 5+/61 packs (brochure, food-cooking-magazine-template, lifestyle-magazine-layout, modern-architecture-portfolio-template, magazine)
- **Crate(s)**: idml-renderer
- **Evidence**:
  - `corpus/envato/reports/brochure/cand-001.png` vs `ref-001.png` (page bg gradient + 3 gradient circles missing; IDML has `<Polygon FillColor="Gradient/…" GradientFillAngle="90">` for page bg and `<Oval ... ItemTransform="0 1 -1 0 …">` for rotated gradient circles)
- **Symptom**: Polygons + Ovals with `FillColor="Gradient/…"` render as solid fallback. Rectangle gradients work; the bug is shape-specific to non-Rect.
- **Root cause (hypothesis)**: `color_id_to_paint_with_list_dir` at `crates/idml-renderer/src/pipeline.rs:8615` projects gradient endpoints from `GradientFillAngle` + `GradientFillLength` + `path_dims` but never consults the shape's `ItemTransform`. For rotated shapes the gradient line lands wrong relative to the post-transform geometry.
- **Suggested fix**: Add an `ItemTransform` parameter to the gradient-line projection at `pipeline.rs:8615` and apply the inverse before the unit-rect mapping.
- **Effort**: M

### Q-09: `ParagraphShading` / `RuleAbove` / `RuleBelow` / `ParagraphBorder` (P-10 redux)
- **Category**: Text
- **Severity**: Major
- **Frequency**: 5+/61 packs (fitness-protein-powder-business-card-templates, soccer-career-flyer-templates, real-estate-brochure, saas-product-launch-annual-report-brochure)
- **Crate(s)**: idml-parse, idml-text, idml-renderer
- **Evidence**: see cycle-1 P-10 evidence section.
- **Symptom**: Headlines + callouts depending on paragraph-level decorative bands / borders / rules render without them.
- **Root cause (hypothesis)**: Workspace grep zero hits across `idml-parse/src/styles.rs` and `story.rs`.
- **Suggested fix**: As cycle-1 P-10. Re-sized as L given 4 feature families × cascade × emit machinery.
- **Effort**: L

### Q-10: ItemLayer stack-index ignored for z-ordering (subsumes P-30)
- **Category**: Layout
- **Severity**: Major
- **Frequency**: 4+/61 packs (the-brochure, white-blue-modern-company-annual-report, plus 2 others sampled)
- **Crate(s)**: idml-renderer
- **Evidence**:
  - `corpus/envato/reports/the-brochure/heat-022.png` (blue strip on upper layer renders behind red column on lower layer)
  - `corpus/envato/reports/the-brochure/heat-016.png` (similar)
  - `corpus/envato/reports/white-blue-modern-company-annual-report/cand-024.png` (Paper-coloured rect doesn't punch through Blue rect — P-30 cause)
- **Symptom**: Frames in upper `ItemLayer` render *behind* frames in lower layers when XML order disagrees with layer stack order.
- **Root cause (hypothesis)**: `crates/idml-renderer/src/pipeline.rs:548-564` uses ItemLayer for visibility only, never for z-order. The per-spread emit loop iterates `text_frames` / `rectangles` / `polygons` lists in XML order.
- **Suggested fix**: Build `layer_stack_index: HashMap<&str, usize>` from `document.container.designmap.layers`. In the per-spread emit loop at `pipeline.rs:581-824`, build a combined `Vec<FrameRef>` across shape kinds, sort by `(layer_stack_index, xml_order_within_layer)`, iterate.
- **Effort**: M

### Q-11: `<Rectangle>` multi-anchor `<PathGeometry>` collapses to AABB
- **Category**: Path
- **Severity**: Major
- **Frequency**: 3+/61 packs (fitness-protein-powder-business-card-templates, soccer-career-flyer-templates, hair-stylist-brochure-vol-3)
- **Crate(s)**: idml-renderer
- **Evidence**:
  - `corpus/envato/reports/fitness-protein-powder-business-card-templates/heat-001.png` (Rectangle ube48 — 241-anchor torn-paper shape → plain rectangle in cand)
- **Symptom**: A Rectangle whose `<PathGeometry>` declares a non-rectangular outline renders as the AABB. P-15 fixed the analogous Polygon bug; Rectangle wasn't addressed.
- **Root cause (hypothesis)**: `ResolvedFrame::from_rectangle` at `crates/idml-renderer/src/module/frame.rs:201` hardcodes `geometry: Geometry::Rect`. Polygon's adapter at `:238-251` already routes to `Geometry::Polygon` when anchors are non-empty.
- **Suggested fix**: Mirror the Polygon adapter in `from_rectangle`: when `rect.anchors.len() > 4`, emit `Geometry::Polygon { … }` instead.
- **Effort**: S

### Q-12: TextFrame fill colour dropped on full-bleed coloured text frames
- **Category**: Color, Layout
- **Severity**: Major
- **Frequency**: 2+/61 packs (event-program-brochure, likely more)
- **Crate(s)**: idml-renderer
- **Evidence**:
  - `corpus/envato/reports/event-program-brochure/heat-002.png` (TextFrame `FillColor="Color/Color 2c"` deep blue; cand renders white; text "TABLE OF CONTENTS" reads black instead of white-on-blue)
- **Symptom**: A TextFrame that doubles as a page-bg colour panel renders text correctly but loses its frame fill. White text designed to land on coloured frame lands on white paper.
- **Root cause (hypothesis)**: Possibly `Geometry::TextFrameRect` short-circuits in `fill_paint_module`, or centroid routing misses pages despite P-04. Need investigation.
- **Suggested fix**: Unit test for "TextFrame with non-None FillColor renders a fill"; confirm `fill_paint_module` handles `Geometry::TextFrameRect` identically to `Geometry::Rect`. If centroid routing is the cause, ensure overlap-pages is used in the text-frame emit dispatch.
- **Effort**: S investigation / S-M fix

### Q-13: Phantom paragraph leak past P-25
- **Status**: ORIGINAL DIAGNOSIS WAS WRONG. Side-by-side inspection of cand-002.png vs ref-002.png on welcome-guide-template shows the cand renders each frame ONCE — there is no in-cand double-render. The heatmap appearance of "every text frame renders twice" is the diff between cand's smaller / mis-positioned text and ref's larger / correctly-positioned text overlapping in the diff visualisation. Actual symptom is text-sizing + wrap drift, which falls under Q-02 renderer (AutoSizingTextFrame headlines), Q-15 follow-up (word-spacing budget), and general font-size cascade audit. Reclassified as a duplicate of those tracks rather than a master-spread routing bug.
- **Category**: Text
- **Severity**: Major
- **Frequency**: 2+/61 packs (welcome-guide-template)
- **Crate(s)**: idml-renderer
- **Evidence**:
  - `corpus/envato/reports/welcome-guide-template/heat-002.png` ("Linda Brown" renders as overlapping "LinedaBrown"; body paragraph + "Page No: 2" double-rendered)
- **Symptom**: Some text frames produce duplicate overlapping render passes despite P-25's trailing-`\n` guard.
- **Root cause (hypothesis)**: P-25 only catches fully-empty trailing sub-paragraphs. Welcome-guide case has non-empty phantoms; could be threaded-frame `NextTextFrame` chasing or `StoryEmitter` pen-y bookkeeping.
- **Suggested fix**: Capture `StoryEmitter::paragraph_command_ranges` for affected pages; confirm whether a single source paragraph produces two render passes. Audit per-paragraph `pen_y` advance after `split_paragraph_at_breaks`. Potentially extend P-25's tail-guard.
- **Effort**: S investigation / S-M fix

### Q-14: Decode-failed vs link-missing — misapplied placeholder
- **Category**: Images
- **Severity**: Major
- **Frequency**: 4+/61 packs (annual-report-template, fitness-protein-powder-business-card-templates, hair-stylist-brochure-vol-3, the-brochure)
- **Crate(s)**: idml-renderer
- **Evidence**:
  - `corpus/envato/reports/annual-report-template/heat-001.png` (Rectangle ua055: link resolved but decode fails on 35MB payload → placeholder grey + X stamps over what should be deep-blue gradient cover; white "ANNUAL" headline now light grey on grey)
- **Symptom**: A frame whose `<Image>` link resolves to a payload our decoder can't handle gets the missing-link placeholder. White text on the original colorful background reads light-grey-on-grey — much worse ΔE than the pre-fix "background missing, text matches paper" baseline.
- **Root cause (hypothesis)**: `crates/idml-renderer/src/pipeline.rs::resolve_image_id` at `:7311` doesn't distinguish "link missing" from "link resolved but decode failed". InDesign would render the actual content for the latter.
- **Suggested fix**: Distinguish the two cases. For decode-failed, emit the frame's intrinsic `FillColor` rather than the InDesign-style grey-X placeholder. Alternatively broaden the decoder (streaming JPEG for oversized payloads).
- **Effort**: S triage / M decoder broadening

### Q-15: Single-word-per-line wrap on wide TextFrames
- **Category**: Text
- **Severity**: Major
- **Frequency**: 4+/61 packs (real-estate-brochure, business-proposal, newspaper, indesign-magazine)
- **Crate(s)**: idml-renderer, idml-text
- **Evidence**:
  - `corpus/envato/reports/real-estate-brochure/cand-019.png` ("To be a world-class property company that..." renders 7 single-word lines on a 487pt-wide frame; ref shows 2 lines of 5-6 words each)
  - `corpus/envato/reports/business-proposal/cand-003.png` (right-column quote stacked one short word per line)
- **Symptom**: A subset of `<TextFrame>` paragraphs wrap dramatically narrower than the actual frame width — every word lands on its own line.
- **Root cause (hypothesis)**: Suspect units bug. Verified for real-estate-brochure p19: frame `u7688` has correct width 487.56pt, `TextColumnCount=1`. Paragraph style cascades `MaximumWordSpacing="100" MinimumWordSpacing="90"` (percentages). Likely those percentages interpreted as absolute pt in the breaker, so each space-glyph advances 100pt.
- **Suggested fix**: Add `RUST_LOG=trace` dump of `column_width_pt` + the breaker's `word_spacing`. Likely a `/ 100.0` fix in `crates/idml-text/src/layout.rs` where word/letter spacing percentages enter the breaker.
- **Effort**: S → M worst case

### Q-16: Per-corner `CornerOption` (asymmetric radii) ignored
- **Category**: Path
- **Severity**: Major
- **Frequency**: 3+/61 packs (resume-template-teacher, modern-resume-reference-job-application-template, brown-fashion-brochure)
- **Crate(s)**: idml-parse, idml-renderer
- **Evidence**:
  - `corpus/envato/reports/resume-template-teacher/cand-001.png` vs `ref-001.png` (yellow accent rect: ref rounded bottom-left only; cand sharp all corners)
  - `corpus/envato/reports/modern-resume-reference-job-application-template/ref-001.png` (large grey placeholder centre-left: ref rounded bottom-left only)
- **Symptom**: Rectangles authored with per-corner overrides (`<TopLeftCornerOption>`, `<BottomLeftCornerOption>`, etc.) render with all four corners flat.
- **Root cause (hypothesis)**: `Rectangle::corner_radius: f32` is scalar; IDML carries per-corner children. Renderer applies one radius to all four corners.
- **Suggested fix**: Promote `corner_radius` to `[Option<(CornerOption, f32)>; 4]` in `crates/idml-parse/src/spread.rs <Rectangle>` parser; parse the four per-corner children; update `crates/idml-renderer/src/pipeline.rs` rect-emit to call a 4-corner path builder.
- **Effort**: M
- **Cross-link**: cycle-1 P-23 (deferred there as cascade-bug; cycle-2 audit clarified the root cause is missing per-corner support).

### Q-17: `<Layer Printable="false">` not honoured
- **Category**: Layout
- **Severity**: Major
- **Frequency**: 4+/61 packs (gridtastic-grid-kit, hr-employee-handbook, project-case-study-template, real-estate-brochure)
- **Crate(s)**: idml-parse, idml-renderer
- **Evidence**:
  - `corpus/envato/reports/gridtastic-grid-kit/cand-001.png` (master-page guide rectangles render at full saturation; ref suppresses them — they're on a layer marked `Printable="false"`)
  - `corpus/envato/reports/project-case-study-template/cand-015.png` (right-side master rectangle visible in cand, absent in ref)
- **Symptom**: Items on layers marked `Printable="false"` render. InDesign's PDF export suppresses them.
- **Root cause (hypothesis)**: `idml-parse/src/designmap.rs` reads `Visible` + `Name` but not `Printable`. The renderer's per-frame emit skips on `!layer_visible` but never checks printability.
- **Suggested fix**: Parse `<Layer Printable="...">` in `designmap.rs`; add a `layer_printable` check at frame-emit time in `crates/idml-renderer/src/pipeline.rs`.
- **Resolution**: Both halves were already implemented before cycle 2. `designmap.rs:131` parses `Printable` (default true); `pipeline.rs:557` folds it into the `layer_renders` map as `visible && printable` so the canonical `layer_visible` closure (despite its name) honours both attributes. Cycle 2 pinned the parser contract with a regression test in `designmap::tests::q17_layer_printable_attribute_round_trips`. If symptoms persist in the cited packs the root cause is *not* Printable — likely guide-layer items reaching the renderer through a different path.
- **Effort**: S (was already done)

### Q-18: Real `<Table>` / `<Row>` / `<Cell>` IDML element family unparsed
- **Category**: Tables
- **Severity**: Major
- **Frequency**: 2+/61 packs sampled; unknown ceiling
- **Crate(s)**: idml-parse, idml-renderer
- **Evidence**: workspace grep across `idml-parse/src/` for `b"Table"\|<Cell\|<Row\|TableStyle` returns zero functional hits (only TOC strings).
- **Symptom**: Reference renders multi-row, multi-column data grids that the candidate leaves blank.
- **Root cause (hypothesis)**: `<Table>` lives inside `<CharacterStyleRange>` in IDMLs; `crates/idml-parse/src/story.rs` recognises only `<ParagraphStyleRange>` / `<CharacterStyleRange>` / `<Content>` / `<Br/>`. We silently drop the entire subtree.
- **Suggested fix**: (1) `<Table>` parsing in `story.rs` — table dimensions, per-cell text, `AppliedTableStyle` ref. (2) Add `DisplayCommand::Table { cells, transform }` to `idml-compose` + renderer pass at `pipeline.rs` that places each cell via the per-paragraph composer + strokes cell borders. Large feature; tables have their own typographic concept.
- **Effort**: L

### Q-19: `<PatternColor>` / pattern fills render as flat colour
- **Category**: Color
- **Severity**: Major
- **Frequency**: 2+/61 packs (business-proposal-template, brown-fashion-brochure)
- **Crate(s)**: idml-parse, idml-renderer
- **Evidence**:
  - `corpus/envato/reports/business-proposal-template/cand-001.png` vs `ref-001.png` (ref full-page bg has subtle gray diagonal-stripe texture; cand flat white)
  - `corpus/envato/reports/brown-fashion-brochure/heat-002.png` (page-level dark band missing)
- **Symptom**: Pages with full-bleed pattern fills (diagonal stripes, dot grids, watermarks) render flat.
- **Root cause (hypothesis)**: Either `<PatternColor>` swatches we don't resolve, or `<Image>` whose `<Contents>` is base64-embedded (cross-link Q-03).
- **Suggested fix**: First confirm whether it's a `PatternColor` swatch or an embedded image. If pattern: parse `<PatternColor>` in `crates/idml-parse/src/` and map to a `Paint::Pattern` variant tiled by `idml-gpu`'s image pool. If embedded image: closes via Q-03.
- **Effort**: S if subsumed by Q-03 / M if pattern parse

### Q-20: Composer wrap drift — soft-hyphen + min/max spacing (P-07 follow-up)
- **Category**: Text
- **Severity**: Major
- **Frequency**: 12+/61 packs (universal across magazine + columned layouts)
- **Crate(s)**: idml-text, idml-renderer
- **Evidence**:
  - `corpus/envato/reports/magazine/heat-014.png` (justified body two columns; every line shifted ~5px)
  - `corpus/envato/reports/modern-architecture-portfolio-template/cand-005.png` ("venimin-vende" hyphenated differently from ref)
  - `corpus/envato/reports/minimal-furniture-brochure/heat-014.png` ("Sustainability" wraps differently)
- **Symptom**: Body text wraps at different word/line boundaries than reference. Subtle cases ±1 line per paragraph; severe cases drop the inserted hyphen.
- **Root cause (hypothesis)**: Cycle-1 P-07 follow-up. (a) `MinimumWordSpacing` / `MaximumWordSpacing` / `MinimumLetterSpacing` / `MaximumGlyphScaling` parsed at `crates/idml-parse/src/styles.rs:407-416` but possibly not consulted by the breaker. (b) Soft-hyphen glyph at break point not emitted into the glyph stream.
- **Suggested fix**: (1) Plumb all five spacing/scaling params from `ResolvedParagraphAttrs` → `LayoutOptions` → breaker. (2) When breaker emits a flagged-Penalty break, append soft-hyphen glyph at line terminal x.
- **Effort**: L (P-07-scale calibration track)

### Q-21: AllCaps headline cascade audit
- **Status**: cascade pinned green. Cycle-2 test `idml_scene::tests::character_style_fill_color_wins_over_paragraph_style` exercises a paragraph style FillColor=Black + character style FillColor=Paper run with no direct fill and asserts the cascade resolves to Paper. The residual brochure cover symptom must therefore trace past this layer — most plausibly the parser losing AllCaps' AppliedCharacterStyle reference at the CharacterStyleRange → CharacterRun threading, or a downstream override (object-style cascade, run-paint picker fallback). Queued for re-audit if the brochure pack still regresses post envato re-render.
- **Category**: Text
- **Severity**: Minor
- **Frequency**: 3+/61 packs (project-case-study-template, brochure, indesign-magazine)
- **Crate(s)**: idml-renderer, idml-scene
- **Evidence**:
  - `corpus/envato/reports/brochure/cand-001.png` ("Product Design" black in cand vs white in ref — per-run FillColor=Paper from character style not winning over paragraph-style FillColor=Black)
- **Symptom**: When character style sets FillColor=Paper and paragraph style sets FillColor=Black, the precedence may be inverted for AllCaps headlines.
- **Root cause (hypothesis)**: `crates/idml-scene/src/lib.rs:529-580` `merge_below_character` / `merge_below_paragraph` cascade. P-18 closed the direct-run case; this is character-style-vs-paragraph-style precedence.
- **Suggested fix**: Glyph-level regression test mirroring brochure cover (paragraph style FillColor=Black + character style FillColor=Paper, no run-direct colour). Fix cascade ordering if it fails.
- **Effort**: S

### Q-22: Placeholder grey calibration
- **Category**: Images
- **Severity**: Minor
- **Frequency**: 5+/61 packs (magazine-editorial-layout, modern-architecture-portfolio-template, minimal-furniture-brochure, catalog, project-case-study-template)
- **Crate(s)**: idml-renderer
- **Evidence**:
  - `corpus/envato/reports/magazine-editorial-layout/cand-015.png` vs `ref-015.png` (placeholder rects: cand 20% tint; ref 50% tint with heavier diagonal X)
- **Symptom**: P-02's 30%-grey + thin-X placeholder doesn't match InDesign's reference uniformly. Better match would be ~50% grey + heavier 1.5pt black X.
- **Root cause (hypothesis)**: P-02's calibration was a first-pass guess.
- **Suggested fix**: Histogram reference-PDF placeholder greys across 3-4 packs; pick a canonical grey + line weight; adjust the constants in the P-02 helper at `crates/idml-renderer/src/pipeline.rs`.
- **Effort**: S

### Q-23: Soft-hyphen glyph dropped at auto-hyphenation line break
- **Category**: Text
- **Severity**: Minor
- **Frequency**: 2+/61 packs (lifestyle-magazine-layout, green-energy-newsletter)
- **Crate(s)**: idml-text
- **Evidence**:
  - `corpus/envato/reports/lifestyle-magazine-layout/cand-006.png` vs `ref-006.png` ("CONTRIBUTORS" wraps to "CON / TRIB" in cand; ref shows "CON- / TRIBU-" with trailing hyphens)
- **Symptom**: When Knuth-Plass selects a mid-word hyphenation point, the trailing hyphen glyph isn't emitted.
- **Root cause (hypothesis)**: Line-emit path doesn't append the hyphen glyph for flagged Penalty breaks.
- **Suggested fix**: When `paragraph_breaker` reports a Penalty break with `flagged=true`, append U+002D at the line's terminal x-position using the breaking word's face. Add `text_glyph_level.rs` regression for "CONTRIBUTORS" in a narrow column.
- **Resolution**: Both layers were already implemented before cycle 2 — `compose::compose_paragraph` flags `ends_with_hyphen` on flagged Penalty breaks, `layout::layout_paragraph:140-156` shapes the line as `slice + "-"`, and `layout::layout_runs:722-744` appends a synthetic hyphen glyph with the breaking run's face. Cycle 2 pinned the hyphenator + compose contract with two regression tests (`compose::tests::q23_hypher_pattern_trie_is_case_insensitive`, `q23_all_caps_word_flags_hyphen_break`). The remaining lifestyle-magazine-layout symptom must therefore trace past the emit layer — most plausibly a column-width-vs-segment-feasibility mismatch (compose lacks layout_runs' per-Box P-17 fallback so a too-narrow column drops the paragraph rather than emitting partial lines), or an AllCaps capitalization path that runs after hyphenation. Re-audit those two paths if the cited packs still regress after a full envato re-render.
- **Effort**: S (was already done; residual investigation queued)
- **Cross-link**: subset of Q-20 calibration track.

### Q-24: BlendMode formulae audit post-Q-05
- **Category**: Effects
- **Severity**: Minor
- **Frequency**: 1+/61 packs (soccer-career-flyer-templates uses HardLight + Overlay + ColorBurn + SoftLight + Darken)
- **Crate(s)**: idml-gpu
- **Evidence**: deferred until Q-05 lands so the underlying composites work.
- **Symptom**: After Q-05 fixes Multiply-on-paper, subtle differences in HardLight / Overlay / SoftLight / ColorBurn may emerge — tiny-skia matches W3C Compositing/Blending L1, which differs from PDF 1.7 Annex H in edge cases.
- **Root cause (hypothesis)**: `blend_mode_to_ts` at `crates/idml-gpu/src/cpu.rs:2675-2693` maps every BlendMode to tiny-skia equivalents. Edge-case formulae (SoftLight, ColorBurn over transparency) may differ.
- **Suggested fix**: Per-blend-mode unit tests after Q-05; tweak formulae if needed.
- **Effort**: S audit / M per-mode tweaks

### Q-25: Font weight drift Light/Thin → Regular (INF-1 follow-up)
- **Status**: renderer telemetry added — when an IDML run requests a non-Regular weight and the matched font has no wght variation axis, the renderer logs a warning (`tracing::warn` at `pipeline.rs::wght_axis` sites). The behaviour fix is now purely curation: route catalog-brochure-template / brand-guidelines through a variable-axis substitute (Inter / RobotoSlab / CormorantGaramond — all already in `corpus/fonts/`) via the per-pack `overrides/<pack>/fonts.sh`. Deferred until per-pack font diagnosis is run with the new warning enabled.
- **Category**: Fonts
- **Severity**: Minor
- **Frequency**: 2+/61 packs (catalog-brochure-template, brand-guidelines)
- **Crate(s)**: idml-renderer, corpus calibration
- **Evidence**:
  - `corpus/envato/reports/catalog-brochure-template/cand-001.png` vs `ref-001.png` ("Catalog" hero ~30% thicker in cand)
- **Symptom**: Display headlines authored at `FontStyle="Light"` / `"Thin"` render at Regular weight when the bundled font lacks lighter weights.
- **Root cause (hypothesis)**: Inverse of cycle-1 P-06 (Bold→Regular silent no-op). Same family-only substitution, opposite direction.
- **Suggested fix**: (a) Curation: per-pack `fonts.{sh,jsx}` overrides pinning Light family resolution. (b) Renderer: when matched font's wght axis can't drop below request, log a substitute-weight penalty.
- **Effort**: S curation / M renderer telemetry

---

## Cross-cycle observations

1. **Q-01 (ObjectStyle FillTint cascade)** is the single biggest cycle-2 win: `S` effort, 9+ packs, closes most of the welcome-guide / wedding-newspaper / travel-guide regressions.
2. **Q-04 (GradientFeather non-Rect) + Q-05 (BlendMode on transparent paper)** together close the fitness-protein-powder regression and unlock hair-stylist + soccer-flyer.
3. **Q-02 (AutoSizingTextFrame)** is the most visible cycle-2 finding — "MAGAZINE" → "MAG" is a one-glance failure across 13+ packs; M-effort but huge UX payoff.
4. **Q-03 (embedded image bytes)** is the gateway for many magazine/newsletter packs whose placed JPEGs ship inline.
5. **Q-20 (composer wrap drift)** is the long-term calibration track — touches every body-text paragraph in the corpus. Sized L; budget across multiple cycles.
6. **Q-18 (real `<Table>` parser)** is the lone L-effort entry that wasn't on cycle 1's radar; defer until the higher-priority blockers land.

## Cycle 2 recommended execution order

Tight S-effort batch (single agent, sequential):

1. Q-01 (ObjectStyle FillTint) — S, 9+ packs
2. Q-05 (BlendMode paper init, snapshot patch S path) — S, 4+ packs
3. Q-06 (inline PDF triage) — S, 3+ packs
4. Q-07 (Tracking) — S, 3+ packs
5. Q-11 (Rectangle multi-anchor) — S, 3+ packs
6. Q-12 (TextFrame fill) — S, 2+ packs
7. Q-15 (single-word-per-line units bug) — S, 4+ packs
8. Q-17 (Layer Printable) — S, 4+ packs
9. Q-21 (AllCaps cascade) — S, 3+ packs
10. Q-22 (placeholder grey recalibration) — S, 5+ packs
11. Q-23 (soft-hyphen glyph) — S, 2+ packs
12. Q-25 (font weight curation) — S, 2+ packs

Then a M-effort batch:

13. Q-02 (AutoSizingTextFrame) — M, 13+ packs
14. Q-03 (embedded image bytes) — M, 8+ packs
15. Q-04 (GradientFeather non-Rect) — M, 5+ packs
16. Q-08 (gradient on Polygon/Oval) — M, 5+ packs
17. Q-10 (ItemLayer z-order) — M, 4+ packs
18. Q-13 (phantom paragraph) — M, 2+ packs
19. Q-14 (decode-failed placeholder) — M, 4+ packs
20. Q-16 (per-corner radii) — M, 3+ packs
21. Q-19 (pattern fill — investigation may show Q-03 covers it) — M, 2+ packs

Then L-effort, individually scoped:

22. Q-09 (paragraph shading) — L
23. Q-20 (composer calibration extension) — L
24. Q-18 (real `<Table>` parser) — L

Q-24 (blend formulae audit) gates on Q-05 landing first.


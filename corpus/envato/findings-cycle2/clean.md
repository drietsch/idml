# Cycle 2 findings — `clean` tier (worst meanΔE ≤ 5)

Sampled 9 of 13 packs spanning the tier (cleanest to top): interior-design-catalog,
employment-application, ancient-building-magazine, catalog-brochure-template,
brand-guidelines, modern-resume-reference-job-application-template,
brown-fashion-brochure, business-proposal-template, book-template-design,
resume-template-teacher.

Per pack: worst page (full cand/ref/heat triple) + median page (heat only).

Findings sorted by Severity desc, Frequency desc, Effort asc. Cross-links to
cycle-1 protocol items (P-NN) and cycle-2 moderate/rough tier findings
(M-F-NN, R-F-NN) included where applicable.

---

### F-01: `AutoSizingTextFrame` truncation reaches clean tier — display headlines clip to first 1–2 words
- **Category**: Text
- **Severity**: Blocker
- **Frequency**: 6+/9 packs sampled (business-proposal-template, resume-template-teacher, book-template-design, brand-guidelines, catalog-brochure-template, interior-design-catalog)
- **Crate(s)**: idml-parse, idml-renderer, idml-text
- **Evidence**:
  - `corpus/envato/reports/business-proposal-template/heat-001.png` ("COMPANY" → "COM"; "BUSINESS PROPOSAL" → "BUSI / PRO"; "Brochure Template" → "Bro…Temp")
  - `corpus/envato/reports/resume-template-teacher/heat-001.png` ("AUSTIN PARSONS" → "AUSTIN / PAR"; "CONTACT ME" → "CON"; "EXPERIENCES" → "EX"; "EDUCATIONS" → "ED"; "HARD SKILLS" → "HARD")
  - `corpus/envato/reports/book-template-design/heat-004.png` ("your title goes here" → "your title" — second line missing entirely)
  - `corpus/envato/reports/brand-guidelines/heat-005.png` ("Design Brand Guidelines" → "Design Brand Guide-" mid-word hyphen)
  - `corpus/envato/reports/catalog-brochure-template/heat-001.png` ("Catalog" hero word still visible but the heatmap shows the entire frame's content drift because the auto-sized width was wrong)
- **Symptom**: Display-size headlines that authored intentionally with `AutoSizingType="WidthOnly" | "WidthAndHeight"` get clipped to the first 3–6 characters or first 1–2 words. InDesign undersizes the stored frame because the frame is supposed to grow at composition time; our renderer treats the stored geometry as fixed-bounds, then Knuth-Plass + P-17 frame-clip silently drops everything past the original right/bottom edge. This is the **same** root cause as cycle-2 moderate `F-02` — but it surfaces in the clean tier too because *every* Envato resume/proposal/catalog template uses the same author idiom (small frame + auto-grow + display weight).
- **Root cause (hypothesis)**: See cycle-2 `moderate.md` F-02 for the full breakdown. The `<TextFramePreference AutoSizingType=… MinimumWidthForAutoSizing=… MinimumHeightForAutoSizing=… UseMinimumHeightForAutoSizing=…>` attributes are unparsed. Workspace-wide grep against `idml-parse` for these names returns zero hits.
- **Suggested fix**: Same as cycle-2 moderate F-02 — parse the four `AutoSizing*` attributes on `<TextFramePreference>` in `crates/idml-parse/src/spread.rs` (~line 2110), plumb through to `TextFrame::auto_sizing`, then expand column width/height in `crates/idml-renderer/src/pipeline.rs` (~`:1900-2000`) before Knuth-Plass when auto-sizing is `WidthOnly` / `WidthAndHeight`. Pinning to the IDML's `MinimumWidth*` floor avoids over-growth. Cross-link cycle-2 moderate F-02.
- **Effort**: M

---

### F-02: `ObjectStyle` `FillTint` cascade gap reaches the cleanest fixtures — placeholder rectangles paint at 100% strength
- **Category**: Color
- **Severity**: Major
- **Frequency**: 4+/9 packs sampled (interior-design-catalog, ancient-building-magazine, business-proposal-template, brown-fashion-brochure)
- **Crate(s)**: idml-parse, idml-renderer
- **Evidence**:
  - `corpus/envato/reports/interior-design-catalog/heat-016.png` (large bottom-page placeholder rect: ref renders ~15% grey, cand renders solid black)
  - `corpus/envato/reports/interior-design-catalog/heat-010.png` (twin placeholder rects: ref both ~15% grey, cand both solid red/dark)
  - `corpus/envato/reports/business-proposal-template/heat-001.png` (bottom-right rect: ref dark maroon / tinted, cand pure black)
- **Symptom**: Image-placeholder rectangles + decorative panels that cascade their fill from an `<ObjectStyle>` carrying `FillColor="…" FillTint="N"` paint at 100% strength. The frame itself omits FillTint; the cascade drops the tint floor. **Same root cause as cycle-2 rough F-01** — but landing in the clean tier because the affected pages happen to have low overall meanΔE (clean-tier scoring is dominated by white-bg pages, and the placeholder rects are usually below the page fold).
- **Root cause (hypothesis)**: `ResolvedObject` at `crates/idml-parse/src/styles.rs:152` enumerates five fields (`fill_color`, `stroke_color`, `stroke_weight`, `corner_radius`, `corner_option`) — no `fill_tint`. The `object_style_cascade` at `crates/idml-renderer/src/module/object_style.rs:38-65` consequently can't propagate `FillTint`.
- **Suggested fix**: See cycle-2 rough F-01. Three lines: add `pub fill_tint: Option<f32>` field, populate from `<ObjectStyle FillTint="…">` in parser, cascade in `object_style_cascade`. Same change closes rough F-01 — a single fix wins on three tiers.
- **Effort**: S

---

### F-03: Tracked-headline letter advance under-applied — display words render with normal spacing instead of explicit tracking
- **Category**: Text
- **Severity**: Major
- **Frequency**: 3+/9 packs sampled (employment-application, interior-design-catalog, ancient-building-magazine)
- **Crate(s)**: idml-text, idml-renderer
- **Evidence**:
  - `corpus/envato/reports/employment-application/cand-001.png` vs `ref-001.png` (top-right "LFLV" in cand vs "L F L V" in ref — ref is the same text with explicit `Tracking="…"` of ~600-1000 units; cand collapses to the natural advance)
  - `corpus/envato/reports/interior-design-catalog/heat-016.png` ("LAUDRY" hero: cand puts letters with normal spacing, ref has wide tracking — heatmap shows characteristic positional drift on every letter)
  - `corpus/envato/reports/interior-design-catalog/heat-010.png` ("BATHROOM" hero: same pattern)
- **Symptom**: Small-cap / display headlines authored with a large positive `Tracking` value (typical Envato pattern: section titles tracked 400–1000 units) render with normal inter-letter advance. Visually, ref has tracking like `L  E  T  T  E  R  E  D`, cand renders `LETTERED`. Body text and most paragraphs are unaffected — this only bites the few runs that carry a large explicit `Tracking`.
- **Root cause (hypothesis)**: `Tracking` (in IDML's thousandths-of-em units) is likely parsed at the `<CharacterStyleRange Tracking="…">` level but not propagated all the way to the per-glyph advance in `shape_run` or its caller `compose_paragraph`. Symptom matches: would have to verify whether `shape_run` ever multiplies by `tracking_em` per cluster. The cycle-1 P-08 fix wired `HorizontalScale`/`Skew` through composition — this is the sibling fix for `Tracking` (separate attribute, separate code path).
- **Suggested fix**: Grep `crates/idml-text/src/` for `tracking` usage. If `shape_run` doesn't apply it: thread the per-run tracking value (`tracking * font_size_pt / 1000.0` extra advance per cluster) into the advance accumulator in the shaping loop. Cross-link cycle-1 P-08 (sibling fix, same pattern).
- **Effort**: S

---

### F-04: Background pattern fill / placed-pattern texture renders as flat colour
- **Category**: Images
- **Severity**: Major
- **Frequency**: 2+/9 packs sampled (business-proposal-template, brown-fashion-brochure)
- **Crate(s)**: idml-parse, idml-renderer
- **Evidence**:
  - `corpus/envato/reports/business-proposal-template/cand-001.png` vs `ref-001.png` (ref full-page bg has subtle gray diagonal-stripe texture pattern; cand renders flat white)
  - `corpus/envato/reports/business-proposal-template/heat-001.png` (the dominant red regions are the diagonal-stripe texture deltas, not text)
  - `corpus/envato/reports/brown-fashion-brochure/heat-002.png` (the page-level dark band at bottom in ref doesn't exist in cand; could be a placed pattern background being dropped)
- **Symptom**: Pages with full-bleed pattern fills (diagonal stripes, dot grids, watermark textures) render as flat paper-white. The pattern is either a `<PatternColor>` swatch we don't resolve, or an `<Image>` whose `<Contents>` CDATA carries the embedded pattern bitmap (cross-link cycle-2 moderate F-01).
- **Root cause (hypothesis)**: Two candidates. (a) IDML `<Pattern …>` / `<PatternColor>` swatches: workspace grep against `idml-parse` for `b"Pattern"` should be empty for the relevant path — confirm by examining the pack IDML's `Resources/Swatches.xml`. (b) An `<Image>` whose payload is base64-embedded in `<Contents>` — same gap as cycle-2 moderate F-01. Distinguishing them needs one minute of IDML inspection but per the stall-avoidance rule I skipped it.
- **Suggested fix**: Either (a) parse `<PatternColor>` in `crates/idml-parse/src/swatches.rs` (likely doesn't exist as a module yet — search for `swatches::` and find where `<Color>` is parsed) and map to a `Paint::Pattern` variant tiled by `idml-gpu`'s image pool; or (b) reuse the cycle-2 moderate F-01 embedded-bytes path. Cross-link cycle-2 moderate F-01.
- **Effort**: M (pattern parse), S if it's the embedded-image path.

---

### F-05: Per-corner radius (asymmetric `CornerOption`) ignored — placeholder rectangles render all four corners with the same radius
- **Category**: Path
- **Severity**: Minor
- **Frequency**: 3+/9 packs sampled (resume-template-teacher, modern-resume-reference-job-application-template, brown-fashion-brochure)
- **Crate(s)**: idml-parse, idml-renderer
- **Evidence**:
  - `corpus/envato/reports/resume-template-teacher/cand-001.png` vs `ref-001.png` (left-side yellow accent rect: ref has rounded bottom-left corner only; cand renders sharp square; the dark image placeholder has the same asymmetric corner)
  - `corpus/envato/reports/modern-resume-reference-job-application-template/ref-001.png` vs `cand-001.png` (large grey placeholder centre-left: ref rounded bottom-left corner only; cand sharp)
- **Symptom**: Rectangles authored with `CornerOption="Rounded" CornerRadius="N"` on a *single corner* (via per-corner overrides in the `<TopLeftCornerOption>`, `<BottomLeftCornerOption>` etc. children of `<Rectangle>`) render with all four corners flat. The cycle-1 P-23 entry deferred this; it surfaces visibly in clean-tier resumes / brochures.
- **Root cause (hypothesis)**: P-23 deferred. The current `Rectangle::corner_radius: f32` is scalar; the IDML spec carries `<TopLeftCornerOption Type="…" Radius="…">` (and the other three) as separate elements, each with their own type+radius. Renderer's rounded-rect emit path takes one radius and applies it to all four.
- **Suggested fix**: Promote `corner_radius` to `[Option<(CornerOption, f32)>; 4]` in `crates/idml-parse/src/spread.rs` `<Rectangle>` parser; parse the four per-corner children; update `crates/idml-renderer/src/pipeline.rs`'s rect-emit path to call a 4-corner path builder (or fall back to `Path::with_corners` if the radii diverge). Cross-link cycle-1 P-23.
- **Effort**: M

---

### F-06: Font-weight substitution drift: candidate renders heavier than reference on display headlines (Light/Thin → Regular)
- **Category**: Fonts
- **Severity**: Minor
- **Frequency**: 2+/9 packs sampled (catalog-brochure-template, brand-guidelines)
- **Crate(s)**: idml-renderer (fontique fallback), corpus calibration
- **Evidence**:
  - `corpus/envato/reports/catalog-brochure-template/cand-001.png` vs `ref-001.png` ("ĆERAMIC DECORATION" and "Catalog" hero: cand strokes ~30% thicker than ref. Same letterforms — just heavier weight)
  - `corpus/envato/reports/brand-guidelines/cand-005.png` vs `ref-005.png` ("Design Brand Guide-" header: cand weight is heavier than ref)
- **Symptom**: Display headlines authored at `FontStyle="Light"` / `FontStyle="Thin"` render at `Regular` weight when the bundled font lacks the lighter weight files. This is the **inverse** of cycle-1 P-06 (which fixed Bold → Regular silent no-op on single-weight TTFs). Same family-only substitution scheme, opposite direction.
- **Root cause (hypothesis)**: cycle-1 P-06 patch normalises the variable-axis `wght` request. When the substitute font has only Regular (no Light), the renderer picks Regular without a width/weight penalty signal. There's likely no synthetic stroke-narrowing fallback, and the corpus `fonts.{sh,jsx}` files don't pin Light family resolution.
- **Suggested fix**: Two paths. (a) Curation-only — add `fonts.sh` overrides per pack (cross-link cycle-1 INF-1). (b) Renderer-side — when the matched font's `wght` axis can't drop below the request, log+score a substitute-weight penalty for the heatmap so the corpus author can decide. The renderer already does the matching; surface the gap instead of silently round-tripping to `Regular`.
- **Effort**: S (curation), M (renderer telemetry)

---

### F-07: Page-level paper / theme color mismatch — clean-tier pack 11 of ancient-building-magazine shows full inversion
- **Category**: Color
- **Severity**: Minor
- **Frequency**: 1+/9 packs sampled (ancient-building-magazine page 11 — INF-2 echo)
- **Crate(s)**: corpus curation
- **Evidence**:
  - `corpus/envato/reports/ancient-building-magazine/cand-011.png` vs `ref-011.png` (ref: cream paper + grey placeholders + blue accent stripe; cand: black bg + dark maroon placeholders + dark red stripe)
  - `corpus/envato/reports/ancient-building-magazine/heat-011.png` (entire page glows red — every non-text pixel is misaligned)
- **Symptom**: One page in an otherwise-clean pack shows a fully inverted/wrong color palette. The IDML's stored swatches don't match the reference PDF's swatches — the corpus author re-themed before PDF export (or the IDML's Paper swatch defaults are misinterpreted as black instead of paper-white on this single page).
- **Root cause (hypothesis)**: cycle-1 INF-2 (theme/background colour swap pre-export). The other 11 pages of this pack render cleanly; the difference on page 11 is that it's the only page using the dark-cream "Paper" + accent colors that the author swapped pre-export. Could also be a `<Layer Printable="false">` issue (see cycle-2 moderate F-04) but more likely INF-2.
- **Suggested fix**: Pack-level — add a `manifest.json` note flagging "theme override pre-export, page 11 affected"; consider excluding from clean-tier promotion. No renderer change. Cross-link cycle-1 INF-2 and cycle-2 moderate F-04.
- **Effort**: S

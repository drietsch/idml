# Cycle 3 plan — parser / renderer

Companion to `corpus/envato/comparison-report-cycle2-truly-final.md`.
Cycle 2 closed 22 of 25 Q-items; cycle 3 opened with Q-18 (font
substitutions for table-bearing packs) and Q-20 (Min/Desired/Max
LetterSpacing + GlyphScaling plumbing). This plan covers the five
tracks identified after the Q-cycle wound down.

## Sequencing

Two tracks land in parallel as the foundation, then features stack on
top:

```
Week 1-2  [foundation]
  ├─ Track 1: Decoder + ICC broadening      ── concrete metric win
  └─ Track 2: Calibration A/B harness       ── enables every future text tweak

Week 3-4  [features off the foundation]
  ├─ Track 4a: Custom <StrokeStyle> dash
  ├─ Track 4b: <PastedSmoothShade> gradient mesh
  ├─ Track 4c: Q-08 radial-on-polygon
  └─ Track 4d: Q-09 ParagraphBorder per-corner radii

Week 4-6  [major feature]
  └─ Track 3: Anchored object positioning

Week 6-7  [breadth]
  └─ Track 5: Spec-coverage gaps (conditional text, cross-refs, ...)

Week 7-8  [closeout]
  ├─ Q-20 calibration rounds (now safe with A/B harness)
  ├─ Master-spread routing audit (Q-13 follow-up)
  └─ Cycle-3 comparison report
```

Tracks 1, 2, 3 are independent and can run in parallel sub-cycles.
Tracks 4 and 5 are batches of small independent items.

---

## Track 1 — Decoder + colour-profile broadening

**Goal:** close the +12.5 ΔE annual-report-template regression and
the ~+1 ΔE drift on Q-03 newspaper packs by handling JPEG payloads
the `image` crate can't, and threading embedded ICC profiles
through the gradient interpolator.

### 1a. Streaming JPEG for oversized payloads

- Add a `streaming-jpeg` feature on `paged-renderer` that swaps in the
  `jpeg-decoder` crate (already an `image` transitive dep) directly.
  Standard `image::load_from_memory` materialises the whole payload
  into RGBA8 before returning; for the 35MB annual-report-template
  cover that means a 280MB allocation. `jpeg-decoder::Decoder::new`
  + `decode_into` lets us stream row-by-row into a downsampled buffer.
- Path: `crates/paged-renderer/src/pipeline.rs::decode_image_bytes`.
  Add a `decode_image_bytes_with_target_max(bytes, max_px)` variant
  that downsamples to `max_px` pixels on either dimension.
- Wire it in `resolve_image_id` so `DecodeFailed` cases retry once
  with a downsample.

**Files:** `crates/paged-renderer/src/pipeline.rs` (~+150 lines).
**Test:** small synthetic IDML with a 4000×4000 JPEG; assert it
decodes via the new path.
**Effort:** S+ (2 days).

### 1b. Embedded ICC profile threading

- `jpeg-decoder` exposes `decode_with_color_profile` returning the
  embedded ICC bytes. Pipe them through `paged_color::IccTransform`
  alongside the document-level CMYK profile.
- For RGB JPEGs that carry no profile, assume sRGB IEC61966-2.1
  (already the document default).
- For CMYK JPEGs, route the per-pixel CMYK → sRGB through the
  embedded profile rather than the doc default.

**Files:** `crates/paged-color/src/lib.rs` (add per-image ICC variant),
`crates/paged-renderer/src/pipeline.rs::decode_image_bytes`.
**Test:** synthetic CMYK JPEG with embedded "Coated FOGRA39" profile;
assert decoded pixel matches a known-good reference per-channel.
**Effort:** M (3-4 days).

### 1c. CMYK gradient interpolation refinement (optional)

The Q-08 + cycle-2 gradient work already interpolates in CMYK
space when all stops carry a `<Color>` with CMYK values (`pipeline.rs:9000-9027`).
What's missing is the *boundary* case where one stop is a
process-CMYK swatch and another is a Pantone spot — current code
falls back to sRGB-linear, which is duller than InDesign's
preview-CMYK behaviour.

**Files:** `crates/paged-renderer/src/pipeline.rs::color_id_to_paint_with_list_dir`.
**Effort:** S (1 day if 1b lands first; can borrow its CMYK→sRGB path).

### Expected corpus impact

| Pack | mean_de before | expected after |
|---|---:|---:|
| annual-report-template | 69.18 | 25-35 (cover photo renders, text deltas remain) |
| newspaper / -template / -newsletter-layout | ~8 each | -1 to -2 each |
| charity-ebook-digital-magazine-template | 11.82 | ~9 |
| Other Q-03 packs (embedded-image color drift) | various | -0.5 to -1.5 each |

Aggregate target: −1.5 to −2.5 mean ΔE corpus-wide.

---

## Track 2 — Calibration A/B harness — *deferred to next cycle*

Investigated and deferred during cycle-3 execution. The candidate
side (instrument the composer to emit per-line
`(page_idx, first_byte, last_byte, baseline_y, width)` records)
is straightforward but multi-day; the reference side
(`pdftotext -layout`-based line geometry reconstruction) is the
real risk the plan flagged. Building only the candidate side
ships a half-harness whose output we can't validate against the
reference PDFs that drive the existing pixel-ΔE gate.

The harness's only immediate beneficiary — Q-20 calibration —
also defers, since calibration needs A/B measurement to converge.
The corpus-wide pixel-ΔE gate (`corpus/generated/diff.sh`)
remains the regression net in the meantime; future text-only
calibration cycles can pick up the harness work.

Original plan retained below for reference.

### Original goal + sub-tracks

**Goal:** build the infrastructure that lets composer / shaper changes
land safely without coin-flipping against 61 packs. Q-20 already
landed the Min/Max LetterSpacing + GlyphScaling plumbing but
explicitly deferred the actual calibration because no harness exists
to validate.

### 2a. Per-line break-decision extraction

- Extend `corpus/envato/test.sh` to emit a `breaks.json` per pack
  capturing `[(page_idx, line_idx, first_byte, last_byte, baseline_y,
  width)]` for each laid-out line.
- Add a parallel `breaks-ref.json` extracted from the reference PDF
  via `pdftotext -layout` + `pdftoppm`-based geometry probing.

**Files:** new `corpus/envato/breaks-extract.py`, modifications to
`crates/paged-renderer/src/bin/inspect.rs` (add `--emit-breaks`).
**Effort:** M (4-5 days). The reference-side extraction is the bulk
because `pdftotext` doesn't surface line geometry directly — needs
per-line bounding-box reconstruction.

### 2b. Break-decision diff metric

- Score per-line divergence as a separate metric from pixel ΔE.
  Three sub-scores: (a) line count mismatch, (b) per-line byte-range
  mismatch (Jaccard-ish on `[first_byte, last_byte]`), (c) per-line
  baseline_y drift.
- Surface in `corpus/envato/reports/summary.json` alongside `worst_mean_de`.

**Files:** `corpus/envato/compare.py`, `corpus/envato/test.sh`.
**Effort:** S (2-3 days).

### 2c. Gating + iteration loop

- Pick a sub-corpus of 5-10 packs that exercise body-text wrap
  (magazine, modern-architecture-portfolio-template, etc.). Pin
  their break-decision metric in `fidelity-thresholds.json`.
- Document the iteration protocol: change → harness run → compare
  break score → merge or revert.

**Effort:** S (1-2 days).

### Expected corpus impact (downstream)

The harness itself is metric-neutral. It unlocks:
- Q-20 calibration: tune `apply_paragraph_compose_options`'s
  stretch-floor + letter-spacing budget. Estimated −1 to −2 ΔE on
  12+/61 body-text packs.
- Optical kerning toggle.
- Glyph advance rounding mode (round-half-to-even vs truncate).
- Ligature on/off matching InDesign's `OpenTypeFeatures` flags.

---

## Track 3 — Anchored object positioning — *deferred, no corpus impact*

Investigated and skipped during cycle-3 execution. A precise count
of `<TextFrame>` / `<Rectangle>` / `<Polygon>` / `<Group>` declared
inside a `<CharacterStyleRange>` (the IDML serialisation of a true
inline anchored frame) across all 60+ Envato packs returned **1
match**. The 442 `AnchoredObjectSetting` hits in spread XML are
the default serialisation InDesign attaches to every frame, not
actual anchored references.

A 5-7-day breaker change + post-pass emission for a single
inline anchored frame in the entire corpus is the wrong order of
priorities. Reopen if a body of corpus material appears where
inline anchored figures matter (typically: editorial /
technical-illustration packs we haven't yet ingested).

Original plan retained below for reference.

### Original goal + sub-tracks

**Goal:** anchored `<TextFrame>` / `<Rectangle>` / `<Polygon>` /
`<Group>` declared inside a `<CharacterStyleRange>` render at the
correct y relative to the anchor character, not as free-floating
frames.

### 3a. Layout reservation

- Extend `paged-text::layout::StyledRun` with optional
  `anchored_inline: Option<AnchoredInline>` carrying the frame's
  width / height / baseline-offset.
- In `compose_paragraph` / `layout_runs`, treat each anchored frame
  as a `Box` of (width × line_height) — the breaker reserves space
  rather than placing a glyph.
- Output a per-frame anchor-position (page_idx, x, y) the renderer
  consumes on the post-emit pass.

**Files:** `crates/paged-text/src/layout.rs`, `crates/paged-text/src/compose.rs`.
**Effort:** M-L (5-7 days). Touches both the breaker and the
post-break glyph positioning.

### 3b. Anchored-object emission pass

- New `StoryEmitter::emit_anchored_objects` that runs after the
  glyph pass on each frame. Walks each paragraph's
  `anchored_frames`, looks up the breaker's reserved position, and
  dispatches per shape kind into the existing `emit_text_frame_into`
  / `emit_rectangle_into` / etc.
- Honour `<AnchoredObjectSetting>` modes: `Inline`, `AboveLine`,
  `Custom` (with `AnchorPoint`, `AnchorXOffset`, `AnchorYOffset`).

**Files:** `crates/paged-renderer/src/pipeline.rs`.
**Effort:** M (4-5 days).

### 3c. Tests + regression coverage

- Unit tests: anchored frame in a 5-word paragraph; assert the
  paragraph's measured width includes the anchored frame's width.
- Integration test: synthetic IDML with an anchored inline figure +
  body wrap-around. Compare against a hand-laid reference PNG.

**Effort:** S (2 days).

### Expected corpus impact

Hard to estimate without a survey — would need to count anchored
objects per pack. Realistic target: 3-5+ packs improve by 2-5 ΔE
each (where anchored figures currently render at frame-top instead
of inline).

---

## Track 4 — Missing renderer features surfaced by cycle 2

Four independent S-M items. Each lands its own commit; can run in
parallel as separate worktree sub-agents (the cycle-2 sub-agent
pattern worked well for these scoped extensions).

### 4a. Custom `<StrokeStyle>` dash patterns

Q-19 was misdiagnosed — `business-proposal-template`'s dense
diagonal-stripe cover is a custom `<StrokeStyle>` dash applied to a
wide stroke that visually reads as a pattern. The parser reads
`StrokeStyle` references but only recognises the built-in
`StrokeStyle/$ID/Solid` / `Dashed` / `Dotted` variants.

- Parse custom `<StrokeStyle>` definitions from `Resources/Styles.xml`
  (the IDML serialises dash arrays + caps explicitly).
- Map to `paged_compose::Stroke`'s dash field.
- Render via tiny-skia's `Stroke.dash` (already supported).

**Files:** `crates/paged-parse/src/styles.rs`, `crates/paged-renderer/src/pipeline.rs::stroke_for`.
**Effort:** S (2-3 days).

### 4b. `<PastedSmoothShade>` gradient mesh — *deferred, no corpus impact*

Investigated and skipped during cycle-3 execution. The
`<PastedSmoothShade>` entries in `brown-fashion-brochure`,
`business-proposal-template`, `brochure`, and
`catalog-brochure-template` all serialise as
`Visible="false"` swatch declarations in `Resources/Graphic.xml`
and **zero spread page items reference them as fill paint** (grep
across every `Spreads/*.xml` returns 0 hits). They are vestigial
Illustrator paste artifacts attached to the document's swatch
table, not active mesh fills the renderer would draw.

Decoding the binary CDATA payload (an Illustrator-proprietary
gradient mesh serialisation) would be ~M effort with no
measurable corpus delta until an IDML actually references one as
a paint. Reopen if/when that happens.

**Files (when revisited):** `crates/paged-parse/src/graphic.rs`,
`crates/paged-renderer/src/pipeline.rs`, possibly
`crates/paged-gpu/src/cpu.rs`.

### 4c. Q-08 radial-on-polygon gradient

The cycle-2 Q-08 fix landed unit-rect → bbox rebasing for linear
gradients on polygon paths. Radial gradients have a different
tiny-skia API (`Radial` vs `Linear`); the agent left this as a
follow-up.

**Files:** `crates/paged-renderer/src/module/fill_paint.rs::rebase_gradient_to_bbox`.
**Effort:** S (1-2 days).

### 4d. Q-09 ParagraphBorder per-corner radii

The cycle-2 Q-09 ParagraphBorder agent intentionally skipped
`ParagraphBorder{TopLeft,TopRight,BottomLeft,BottomRight}Corner{Option,Radius}`.
With Q-16's `rounded_rect_path_per_corner` already in place, this is
a thin extension.

**Files:** `crates/paged-parse/src/styles.rs` (ParagraphBorder struct +
parse), `crates/paged-renderer/src/pipeline.rs` (border emit uses
per-corner radii).
**Effort:** S (1-2 days).

---

## Track 5 — Spec coverage breadth

Three lower-leverage but real items. Each unlocks specific IDMLs.

### 5a. Conditional text — *deferred, no corpus impact*

Investigated and skipped during cycle-3 execution. Zero
`<Condition>` declarations and zero `AppliedConditions=` attributes
across all 60+ Envato packs (Envato is dominated by marketing
brochures; conditional text is a localisation/technical-doc
feature these packs don't use). Implementing the parser + filter
would add untested code paths with no measurable corpus delta.

Reopen if/when an IDML appears in the corpus that uses conditions.
The plan's sketch (parse `<Condition Visible="…">` into a table;
filter spread / story runs by their `AppliedConditions` against
the visible set) still applies.

**Files (when revisited):** `crates/paged-parse/src/designmap.rs`,
`crates/paged-parse/src/story.rs`,
`crates/paged-renderer/src/pipeline.rs`.

### 5b. Cross-references — *deferred, no corpus impact*

Investigated and skipped during cycle-3 execution. The 549
`CrossReference*` matches across the corpus are all
`<CrossReferenceFormat>` declarations in `Resources/Preferences.xml`
(the 9 default templates InDesign ships, present in every IDML).
Zero packs contain a `<CrossReferenceSource>` element — no story
actually inserts a cross-reference. Implementing the
formatter would add untested code paths with no measurable corpus
delta.

The plan's sketch (parse `<CrossReferenceSource>` + format-token
substitution like `<pageNumber/>` / `<chapter/>`) still applies
when a real IDML uses one.

**Files (when revisited):** `crates/paged-parse/src/story.rs`,
`crates/paged-scene/src/lib.rs` (cross-ref resolver),
`crates/paged-renderer/src/pipeline.rs`.

### 5c. Hidden cross-references + index entries

`<HiddenText>` and `<Index>` entries are page-flow-affecting but
non-rendering. Currently treated as visible runs.

**Files:** `crates/paged-parse/src/story.rs`.
**Effort:** S (1-2 days).

---

## Closeout

After tracks 1-5 land, the final cycle-3 deliverables:

- Q-20 calibration: 2-3 rounds using the new break-decision harness.
- Master-spread routing audit: re-run the welcome-guide-template
  diagnostic with instrumentation, document any real bugs.
- `corpus/envato/comparison-report-cycle3-final.md`.

## Risk + estimate

- **Track 1** has the highest concrete metric ROI; low conceptual
  risk because the work is well-bounded by `image` / `jpeg-decoder`
  APIs.
- **Track 2** is foundational; medium risk because the reference-side
  extraction depends on `pdftotext`'s layout output being reliable
  enough.
- **Track 3** is the biggest single feature; high risk if anchored
  objects appear in many corpus packs we haven't audited yet (could
  bite layout assumptions we don't know about).
- **Tracks 4 + 5** are each contained S/M items with clear scope.

Total: ~7-8 weeks for a single focused engineer; ~5 weeks with
sub-agent parallelism on tracks 4 / 5 / 5b / 5c.

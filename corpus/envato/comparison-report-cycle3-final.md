# Envato corpus: cycle 3 final

Snapshot at cycle-3 end (`73c44e0` — Tracks 5b + 3 deferral docs).
Baseline reference is cycle-2 truly-final (`03813a2`). Plan
companion: [`docs/verso/cycle-3-plan.md`](../../docs/verso/cycle-3-plan.md).

## Headline

- 12/12 generated fixtures pass `corpus/generated/diff.sh`
  (the hard fidelity gate) at their pinned per-fixture thresholds.
- 413/413 workspace tests passing, 0 failed.
- **10 commits** on `main` since the plan landed (3 small leaf
  items shipped before plan execution + 7 during).
- 4 features landed (1a, 1b, 1c, 4a). 5 tracks deferred with
  documented "no corpus impact" findings (4b, 5a, 5b, 3, 2).

## Track status

| Track | Status | Commit / Notes |
|---|---|---|
| 1a — Streaming JPEG decode | ✅ landed | `3ab9bb8` |
| 1b — Embedded ICC for CMYK JPEGs | ✅ landed | `c7ebff4` |
| 1c — CMYK gradient RGB-stop boundary | ✅ landed | `ccbdf8b` |
| 2 — Calibration A/B harness | ⏸ deferred | Half-harness would ship without reference-side validation; downstream Q-20 also defers |
| 3 — Anchored object positioning | ⏸ deferred | 1 truly-inline anchored shape across 60+ corpus packs — wrong priority |
| 4a — Custom `<DashedStrokeStyle>` | ✅ landed | `abe2da3` |
| 4b — `<PastedSmoothShade>` mesh | ⏸ deferred | Every corpus instance is `Visible="false"`; 0 spread references |
| 4c — Radial-on-polygon | ✅ landed | `975e653` (pre-plan) |
| 4d — ParagraphBorder per-corner radii | ✅ landed | `8f8cf13` (pre-plan) |
| 5a — Conditional text | ⏸ deferred | 0 `<Condition>` / `AppliedConditions=` across corpus |
| 5b — Cross-references | ⏸ deferred | 549 hits are all default `<CrossReferenceFormat>` templates; 0 real `<CrossReferenceSource>` |
| 5c — `<HiddenText>` / `<Index>` / `<Note>` | ✅ landed | `fd756f2` (pre-plan) |

**Shipped**: 7 of 12 (1a, 1b, 1c, 4a, 4c, 4d, 5c).
**Deferred with documented findings**: 5 (2, 3, 4b, 5a, 5b).

## The corpus-impact-zero finding

The most material outcome of cycle 3 is the audit that found
the original plan's "Week 3-4 features" (4b) and "Week 6-7 breadth"
(5a, 5b) plus the "Week 4-6 major feature" (Track 3) all have
**zero impact** on the current 60+ pack corpus:

| Track | What we grep'd for | Hits |
|---|---|---:|
| 4b | `<PastedSmoothShade>` referenced as paint in any `Spreads/*.xml` | 0 |
| 5a | `<Condition>` declarations + `AppliedConditions=` attrs | 0 |
| 5b | `<CrossReferenceSource>` (the actual inline reference, not the format template) | 0 |
| 3 | `<TextFrame>` / `<Rectangle>` / `<Polygon>` / `<Group>` inside a `<CharacterStyleRange>` | 1 |

The Envato corpus is dominated by marketing brochures and
magazines, which don't use conditional text, cross-references,
gradient meshes, or inline anchored frames. The cycle-3 plan
was sized against the IDML spec's surface area, not the corpus's
actual usage. Cycle 4 should pre-audit corpus prevalence before
sizing tracks.

## What landed (corpus-relevant)

### Track 1a — Oversized JPEG decode (3ab9bb8)

The renderer previously routed all images through
`image::load_from_memory`, which fully materialises RGBA8 in one
allocation. The annual-report-template cover JPEG decodes to
~198MB at full size. New `decode_image_bytes_with_target_max`
pre-flights JPEG dimensions via `jpeg-decoder::Decoder::read_info`
and, for payloads with longest edge >4096px, decodes at the
largest JPEG-native DCT scale (k/8, k ∈ 1..=8) whose output still
fits the cap. Handles L8 / L16 / RGB24 / CMYK32 source formats.
Computes `k` ourselves rather than passing `max_px` to
`Decoder::scale()` directly — the decoder's "smallest factor ≥
requested" semantics would otherwise round up past the cap.

Tests: `track_1a_oversized_jpeg_routes_through_streaming_decoder`,
`track_1a_small_jpeg_keeps_native_dimensions`.

### Track 1b — Embedded ICC for CMYK JPEGs (c7ebff4)

`jpeg-decoder::Decoder::icc_profile()` exposes the concatenated
APP2 segments. For CMYK32 pixel format, we build a one-shot
`IccTransform` from those bytes and run the buffer through a new
batch `IccTransform::cmyk_bytes_to_rgb_bytes` method (wrapping
lcms2's `transform_pixels`). Chunked at 4096 pixels so peak
intermediate memory stays ~28KB instead of allocating two parallel
buffers. Falls back to Adobe-naive multiplicative on missing /
invalid profile or wasm32.

### Track 1c — Gradient CMYK-space interp with RGB-stop boundary (ccbdf8b)

Loosened the guard on the existing CMYK-space tessellation path
from `all(|s| s.cmyk.is_some())` to `any(|s| s.cmyk.is_some())`.
Stops without an `effective_cmyk()` (RGB / LAB / Gray process
swatches, spot-with-non-CMYK-alternate) now get a naive sRGB→CMYK
approximation rather than dropping the gradient to sRGB-linear
blending. Closes the boundary case where one RGB stop dragged the
whole gradient out of CMYK space.

### Track 4a — Custom `<DashedStrokeStyle>` Pattern (abe2da3)

New `StyleSheet::stroke_styles: BTreeMap<String, StrokeStyleDef>`
populated from `<DashedStrokeStyle>` / `<DottedStrokeStyle>` /
`<StripedStrokeStyle>` / `<WavyStrokeStyle>` elements in
`Resources/Styles.xml`. `stroke_for` now takes an optional
stroke-styles lookup; a custom dashed pattern wins over the
built-in name table and feeds the dash slot directly (custom
patterns are absolute pt, unlike named built-ins which scale by
line weight). Rectangle path threads the lookup;
polygon / oval / text-frame / graphic-line stroke paths still
build `Stroke::new` without dash because the parsed structs
don't carry `stroke_type` for those shapes today (a separate
gap; not Q-19's diagonal-stripe cover, which is a rectangle).

## Track 2 / Q-20 — Why they slip together

Track 2 (the A/B harness) and Q-20 (composer wrap calibration) are
joined at the hip:

- Q-20 already plumbed Min/Desired/Max LetterSpacing + GlyphScaling
  through the composer in `2c0b61b` (pre-cycle-3) but explicitly
  deferred the actual calibration tuning.
- Calibration needs A/B measurement — change a knob, re-measure
  break decisions per line, decide merge vs revert.
- Half the harness (candidate-side: instrument the composer to
  emit per-line `(page_idx, first_byte, last_byte, baseline_y,
  width)` records via a new `idml-inspect --emit-breaks`) is
  one-day work.
- Half the harness (reference-side: reconstruct per-line geometry
  from `pdftotext -layout` output) is the multi-day risk — the
  plan flagged this as the bulk of the 4-5 day estimate.
- Building only the candidate side ships an unvalidatable
  artifact, so the slip is correct: defer both, keep the
  corpus-wide pixel-ΔE gate (`corpus/generated/diff.sh`) as the
  regression net.

The Q-20 plumbing in `2c0b61b` was kept because it doesn't change
behaviour by itself — the values are read from IDML and forwarded
to the composer; the composer's existing free-floating defaults
still win until calibration narrows them.

## Cycle-3 commit list

```
73c44e0 Tracks 5b + 3: defer — no corpus impact
c1828f3 Track 5a: defer — conditional text has no corpus impact
1cfbcd1 Track 4b: defer — PastedSmoothShade has no corpus impact
abe2da3 Track 4a: honour custom <DashedStrokeStyle> Pattern attribute
ccbdf8b Track 1c: extend CMYK-space gradient interp to RGB-stop boundaries
c7ebff4 Track 1b: thread JPEG-embedded ICC profile through CMYK decode
3ab9bb8 Track 1a: route oversized JPEGs through jpeg-decoder DCT scaling
8f8cf13 Track 4d: honour per-corner ParagraphBorder radii
fd756f2 Track 5c: suppress <HiddenText>/<Index>/<Note> from story flow
975e653 Track 4c: rebase RadialGradient endpoints to polygon bbox
9195ad7 docs: cycle-3 plan covering 5 tracks
```

## Q-13 closeout note

The plan listed "Master-spread routing audit (Q-13 follow-up)" in
its closeout. Reviewing the git history, Q-13 was already
reclassified in cycle 2 (`3466dde`) — the master-spread duplication
hypothesis was wrong; the actual symptom was Q-02/Q-15 text-sizing
drift. No further audit needed.

## What cycle 4 should pick up

In rough priority order:

1. **Track 2 + Q-20**: build the A/B harness for real (candidate
   side via `inspect.rs --emit-breaks`, reference side via a Python
   helper using `pdftotext -layout` + `pdftoppm`-based geometry
   probing) and run the deferred Q-20 calibration rounds. Pin a
   sub-corpus's break-decision metric in
   `fidelity-thresholds.json`.
2. **Track 1b coverage**: the JPEG-ICC path is implemented but
   needs corpus telemetry to confirm Q-03 newspaper packs actually
   take the ICC branch (`tracing::debug!` instrumentation would
   help).
3. **Stroke-type plumbing**: extend `stroke_type` to the parsed
   `Polygon` / `Oval` / `TextFrame` / `GraphicLine` structs and
   thread through their renderer paths so custom dash patterns
   work for non-rectangle shapes too. Currently only rectangles
   honour `<StrokeType>`.
4. **Q-18 (Table parser)**: still deferred from cycle 2; the
   single largest unaddressed corpus gap. Multi-day.
5. **Reopen deferred tracks (4b, 5a, 5b, 3) only when a corpus
   pack actually exercises them.** Pre-audit before sizing.

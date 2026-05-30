# Cycle 7 Track 3 — company-profile-template ΔE root-cause

Inspected the worst-page heatmaps for `company-profile-template`
(mean ΔE 29.5, p99 84). The deltas cluster into two distinct
patterns; this finding documents both with concrete file
references so cycle 8 can size the work properly.

## Page 20 (worst page, mean ΔE 29.5) — image-rect off-page routing

**Reference**: top 65% covered by a grid of "YOUR IMAGE GOES HERE"
placeholder-image tiles in deep red (the InDesign-resolved JPEG
content for `LinkResourceURI=".../YOUR IMAGE GOES HERE.jpg"`);
bottom 35% dark grey with contact text + FUELWAVE logo.

**Candidate**: entire page rendered as dark grey background. No
image tiles. No FUELWAVE logo. Contact text positioned but
incomplete (missing "Contact Information:" heading; missing
"Email:" line; different word wrap on the bottom-right URL).

The IDML has one image-bearing Rectangle on `Spreads/Spread_u114.xml`:

```
<Rectangle Self="ubb6b" ItemTransform="1 0 0 1 9.5 -4301.6">
  <Image Self="ubc9a" ItemTransform="0.8203125 0 0 0.8203125 -630.5 3797.38">
    <Link LinkResourceURI="file:/.../YOUR IMAGE GOES HERE.jpg" ... />
  </Image>
</Rectangle>
```

`Spread_u114` is the LAST spread in the designmap and hosts page 20.
The Rectangle's `ItemTransform.ty = -4301.6` combined with the Image
child's `ItemTransform.ty = 3797.38` and the page's
`ItemTransform="1 0 0 1 -612 -396"` puts the effective placement…
somewhere the candidate's page-routing logic isn't selecting
"page 20". The InDesign export resolved it onto page 20 (the
heatmap shows where).

**Root cause hypothesis (to verify in cycle 8)**: the renderer
selects a Rectangle's target page by its
center-in-page-bounds check. With this rect's nested-transform
chain producing a center far outside any page's bounds, the
fallback "first page of the spread" route fires — *but* this
spread might only have one page in the renderer's view. Either
the nested-image transform inversion is incorrect, or the
fallback-page selection isn't matching what InDesign considers
page 20's pasteboard.

**Fix path (deferred)**: instrument
`crates/paged-renderer/src/pipeline.rs::build_document`'s
page-routing for this Rectangle (around the
`page_idx` selection that calls `emit_rectangle_into` +
`emit_rectangle_image` at lines 814-832), print the rect's
spread-coord center + each page's bounds for `company-profile-template`
page 20. Then compare against InDesign's placement.
Cycle-8 work.

## Pages 1, 6, 17 (mean ΔE 20-26) — same image-routing pattern, multi-frame

Spot-checks of the other top-3 worst pages show the same shape:
multiple image-bearing rectangles on each spread route differently
between the renderer and InDesign. The deeper page tracks (4, 8-10,
14, 19) show smaller deltas because they have fewer image-bearing
rectangles relative to the page's total area.

Quantitative summary:

```
page   mean_de   p99_de   ssim
  20    29.53    71.52   0.594
   1    26.21    72.18   0.637
   6    21.13    72.18   0.555
  17    20.21    72.18   0.562
  19    17.40    74.55   0.674
   9    12.32    72.18   0.762
   4    10.78    74.55   0.730
  14     7.65    84.14   0.671
   8     5.96    84.14   0.637
  10     5.44    84.14   0.646
```

Cumulative the top-4 pages contribute ~50% of the pack's ΔE
budget. Fixing the image-rect page-routing would plausibly move
this pack from mean ΔE 29.5 → 12-15.

## What was NOT the cause

- **Q-20 calibration**: ruled out. The non-zero-LS paragraphs in
  this pack aren't the dominant ΔE source. Body text positions
  shown in the heatmaps differ by single characters, not whole
  lines.
- **Missing-image placeholder**: the renderer's grey-X placeholder
  logic (`emit_rectangle_missing_image_placeholder` at
  `pipeline.rs:8402`) is wired correctly — but only fires when the
  Rectangle is routed to a page. The routing skips the page 20
  rect entirely.
- **Font substitution**: contact text uses fonts the harness
  already overrides correctly. Position differences exist but
  they're sub-pixel.

## Cycle-7 Track 3 net

No code fix landed — the page-routing investigation is one to
multi-day scope and the right cycle-8 owner. This finding hands
that work over with concrete file references and a verification
path.

A side benefit: the methodology (heatmap-driven inspection +
spread XML correlation) generalises to the other LetterSpacing
packs. Cycle 8 could batch this analysis across all 8 to scope
total page-routing work.

# Cycle 5 Track 3 — Q-20 calibration: Round 1 + deferral findings

Cycle 3 deferred Q-20 calibration because there was no A/B harness.
Cycle 4 built the harness. Cycle 5 wired body-text packs through it
(Track 2). This track attempts the actual calibration.

## Round 1: `AVG_CHARS_PER_WORD` 5.0 → 4.7

The constant feeds the letter-spacing → per-word stretch budget at
`crates/idml-renderer/src/pipeline.rs::apply_paragraph_compose_options`:

```rust
const AVG_CHARS_PER_WORD: f32 = 4.7;
let space_width = lopts.compose.column_width as f32 / 80.0;
let stretch_add = ((ls_max - ls_desired) * AVG_CHARS_PER_WORD / space_width).max(0.0);
let shrink_add = ((ls_desired - ls_min) * AVG_CHARS_PER_WORD / space_width).max(0.0);
lopts.compose.stretch_ratio = (lopts.compose.stretch_ratio + stretch_add).min(2.0);
```

5.0 was cycle-3's round-number placeholder; English-language averages
(Norvig 2009) put the true value at 4.7. 6% smaller `stretch_add`.

### Measurement

Pre-round vs post-round `line_count_delta_sum` on all 12 gated
fixtures:

```
fixture                                            pre_Δl   post_Δl      Δ
annual-report-template-8b5d40                          98        98     +0
business-magazine-template                            423       423     +0
company-profile-template                              267       267     +0
food-cooking-magazine-template                         63        63     +0
newspaper                                             481       481     +0
newspaper-newsletter-layout                            41        41     +0
newspaper-template                                    488       488     +0
square-catalog-brochure-template                       85        85     +0
tables                                                 13        13     +0
text                                                    3         3     +0
text-advanced                                           6         6     +0
wedding-newspaper                                      75        75     +0
```

Zero deltas across the board.

### Why no signal: ceiling saturation

The body styles in these packs carry typical InDesign defaults like
`MaximumLetterSpacing="25"  MinimumLetterSpacing="-5"  DesiredLetterSpacing="0"`
(verified on `newspaper`'s `ParagraphStyle/Body, Left Justify`).

At a typical `column_width = 120pt` (10-pica column):
- `space_width = 120 / 80 = 1.5pt`
- `stretch_add = (25 - 0) * 4.7 / 1.5 = 78.3` — well above `.min(2.0)`
- Even at 5.0: `stretch_add = 83.3`

Both clamp to 2.0. The 6% reduction has no observable effect because
the formula saturates the ceiling before AVG_CHARS_PER_WORD matters.

The root cause is the formula itself: `* CHARS_PER_WORD / space_width`
makes `stretch_add` scale linearly with `ls_max - ls_desired` (large
in InDesign IDMLs) and inversely with column width. Both factors push
the result far past `.min(2.0)`.

### What landed

- AVG_CHARS_PER_WORD = 4.7 (correctness improvement; no metric
  shift today, sets up future calibration where the saturation is
  fixed).
- All 12 break-gated fixtures still pass.
- `corpus/generated/diff.sh` 12/12.

### What's deferred

**Rounds 2 + 3 (stretch-floor tightening, per-glyph budget
refinement) skipped this cycle.** Both presuppose the metric is
sensitive to the knobs being tuned; today it isn't, because:

1. The metric noise floor on multi-page packs (`Δl=400+` from
   structural page misalignment, per Track 2 findings) drowns
   any small wrap shift a one-knob calibration would produce.
2. The formula saturates `.min(2.0)` before the per-line wrap
   decision picks up on the change.

## Recommendation for cycle 6

Before more calibration rounds, fix the harness's sensitivity. Two
options identified in the Track 2 findings:

1. **Story-/page-range filtering** on `--emit-breaks`: lets the
   harness isolate a single body paragraph and compare just that.
2. **Strict-pair word-match weighting** in `breaks-compare.py`:
   gate baseline-drift / word-match contributions on pairs where
   first/last words actually match. Surfaces real wrap-decision
   shifts inside the structural-divergence noise.

And reshape the Q-20 formula so AVG_CHARS_PER_WORD changes can
matter:

3. **Cap `stretch_add` on a tighter ceiling** (e.g. `.min(0.5)`)
   so the budget is bounded before the breaker absorbs it.

The work is well-scoped; both pieces (1+2) are 1-2 days each. (3)
is a design call that needs measurement on body packs *after*
1+2 sharpen the metric.

## Conclusion

The A/B harness infrastructure ships at cycle-5 end. Q-20
calibration starts paying dividends in cycle 6 once the metric's
sensitivity catches up to what the knobs can actually change.

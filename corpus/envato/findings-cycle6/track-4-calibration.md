# Cycle 6 Track 4 — Q-20 calibration: Rounds A+B + noise-floor finding

Cycle 5 deferred Q-20 calibration because the metric saturated.
Cycle 6 Tracks 1-3 fixed the saturation. Track 4 ran calibration
rounds against the now-sensitive harness; the result reveals a
**second** sensitivity wall — the multi-page per-pack metric noise
floor — that single-knob composer tweaks can't move through.

## Round A — `LS_BUDGET_PT_FOR_FULL_STRETCH` 24.0 → 12.0

Halves the LS-budget normalisation so smaller IDML LS spreads
contribute proportionally more to the stretch_add. Tighter
sensitivity to LS-spread variation across paragraphs.

Result: one fixture (`square-catalog-brochure-template`) moved
`word_match_rate_mean` from 0.093 → 0.095 (+0.002, well inside
measurement noise). Every other fixture: zero change.

## Round B — Conditional Q-15 stretch floor

`stretch_ratio.max(0.1)` (Q-15) was an unconditional fallback
for paragraphs with zero word-space budget. Made it conditional on
the IDML *not* carrying an explicit `MaximumWordSpacing` attribute,
so paragraphs that set Max=X get exactly the X-derived budget.

Result: zero movement on every fixture, because every pack in the
sub-corpus already sets `MaximumWordSpacing` explicitly — the floor
wasn't firing on them. Change is conservative and lands as
correctness improvement that future zero-budget IDMLs will get.

## Round C — not attempted

The plan listed Round C as "shrink_ratio ceiling re-test". With
Rounds A+B showing no usable signal, Round C is deferred until the
noise-floor is broken.

## The noise-floor finding

After Tracks 1+2+3 made the harness more sensitive in theory, the
real bottleneck is the per-pack candidate-vs-reference structural
divergence:

- The 8 LetterSpacing packs all have hundreds of lines of
  unmatched cand-vs-ref content (image-bearing frames, master
  spreads, unrendered content). Δl=400+ on most.
- The `word_match_rate_mean` floor is ~0.01 on most of these packs
  because the candidate's filtered/full content rarely aligns with
  the PDF's first/last words page-by-page.
- A composer tweak that re-wraps one paragraph in one frame
  changes `line_count_delta_sum` by maybe 1 against a baseline of
  400-500. That's 0.2-0.25% movement — well below the harness's
  measurement noise.

The sensitivity tools we built (--break-story-id, --break-page-range,
--strict-pairs) DO work, but only against fixtures where the
candidate's filtered content actually has a matching reference
counterpart. The Envato packs in the manifest don't have that
property because:

1. The candidates' lorem-style placeholder text doesn't match the
   reference PDFs' real content (no real word_match possible).
2. Filtering by story isolates one frame on the cand side but
   pdftotext still sees the whole reference page.

## What's actually needed for productive calibration

The cycle 7 plan needs to **add a synthetic LS-aware body-text
fixture** to `corpus/generated/` where:

- Candidate and reference render identical content (real English,
  not lorem)
- The IDML carries non-default `Min/MaxLetterSpacing` values
- A single body paragraph fills a single column on a single page

On that fixture, the harness would show 0.95+ word_match and small
single-digit Δl. Then a composer tweak that re-wraps the paragraph
would produce a 1-2 line shift = ~10-20% movement, clearly visible
above noise.

This is cycle-7 work. It's the right shape: a focused fixture
designed for calibration sensitivity, not borrowed from a
visually-diverse Envato pack.

## What landed in Track 4

- `LS_BUDGET_PT_FOR_FULL_STRETCH = 12.0` (Round A): slightly more
  aggressive LS contribution; verified non-regressing.
- Conditional Q-15 stretch floor (Round B): correctness
  improvement for future zero-budget IDMLs.
- All 12 break-gated fixtures still pass; `corpus/generated/diff.sh`
  12/12; `cargo test --workspace` clean.

## Net: cycle 6 ships the sensitivity tools; cycle 7 ships the
signal source

Tracks 1+2+3 make the harness sensitive *given the right fixture*.
Track 4 proved the multi-page Envato packs aren't the right
fixture; a synthetic one is. Cycle 7 builds it.

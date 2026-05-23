# Envato corpus: cycle 6 final

Snapshot at cycle-6 end (`1ea37a0` — Track 4 deferral findings).
Baseline reference is cycle-5 final (`5cd2025`). Plan companion:
[`docs/verso/cycle-6-plan.md`](../../docs/verso/cycle-6-plan.md).

## Headline

- 12/12 generated fixtures pass `corpus/generated/diff.sh`.
- 12/12 break-decision fixtures pass `breaks-gate.sh`.
- 418/418 workspace tests passing.
- **5 commits** for cycle 6: 1 plan + 4 track commits.
- 3 sensitivity tools landed (story/page filters, strict-pairs,
  Q-20 formula reshape). 1 sub-track (Track 4 calibration rounds)
  ran but surfaced a second sensitivity wall that needs a
  different fixture design to break.

## Track status

| Track | Status | Commit |
|---|---|---|
| 1 — `--break-story-id` / `--break-page-range` | ✅ landed | `a28c21d` |
| 2 — `--strict-pairs` in breaks-compare | ✅ landed | `fac0527` |
| 3 — Q-20 formula reshape | ✅ landed | `46fb9ef` |
| 4 — Q-20 calibration Rounds A+B + finding | ✅ landed; Round C deferred | `1ea37a0` |

## Track-by-track summary

### Track 1 — Story / page-range filters (a28c21d)

`PipelineOptions::break_story_filter` + `break_page_range` plus
matching `--break-story-id` / `--break-page-range` CLI flags on
`idml-inspect`. `StoryEmitter::break_filter_passes` checked at
both BreakRecord push sites (body + table cell paths).
`break-thresholds.json` fixtures now accept optional `story_id` /
`page_range` fields.

Known limitation: pdftotext doesn't see story boundaries, so a
per-story candidate filter still compares against the page's
full reference content. That's Track 2's matching fix.

### Track 2 — `--strict-pairs` weighting (fac0527)

`breaks-compare.py --strict-pairs` gates `baseline_drift_p99`
contribution on word-endpoint match: only pairs whose first/last
words actually align contribute to the drift histogram.
`word_match_rate_mean` still sees every pair so structural
divergence remains visible.

Manifest fixtures opt in via a `strict_pairs: true` field.

### Track 3 — Q-20 formula reshape (46fb9ef)

The cycle-5 formula
`(ls_max - ls_desired) * AVG_CHARS_PER_WORD / space_width`
saturated `.min(2.0)` on typical IDML LS values, making cycle-5
Round 1's AVG_CHARS_PER_WORD tweak invisible. Replaced with a
bounded mapping:

```
stretch_add = (ls_max - ls_desired) / 24pt, clamped [0, 0.5]
shrink_add  = (ls_desired - ls_min)  / 24pt, clamped [0, 0.25]
```

Cycle-6 Track 4 Round A subsequently tightened the divisor to
12.0 for higher sensitivity. Both changes corpus-neutral on
generated fixtures (LS not customised); `company-profile-template`
showed Δl=267 → 262 — small but real metric movement.

### Track 4 — Calibration Rounds A+B (1ea37a0)

- Round A (`LS_BUDGET_PT_FOR_FULL_STRETCH` 24.0 → 12.0): one
  fixture's `word_match_rate` moved +0.002 (inside noise).
- Round B (conditional Q-15 stretch floor on `MaximumWordSpacing`
  absence): zero movement; lands as correctness for future
  zero-budget IDMLs.
- Round C (shrink ceiling) deferred.

**The second sensitivity wall**: the Envato body-text packs in the
manifest have per-page structural divergence (image-bearing frames,
master spreads, lorem-vs-real-text) of Δl=400+ per pack. A
composer tweak that re-wraps one paragraph moves the metric by
1 against that baseline — well below measurement noise. The
filtering tools (Track 1) and strict-pair gating (Track 2) work
*in principle* but the corpus doesn't have the right fixture for
them to surface signal.

`findings-cycle6/track-4-calibration.md` documents the deferral
with concrete cycle-7 scope: build a focused synthetic LS-aware
body-text fixture in `corpus/generated/` where candidate and
reference render identical content. That fixture would show
0.95+ word_match and single-digit Δl — making calibration knob
movements visible at ~10-20% metric movement.

## Cycle-6 commit list

```
1ea37a0 cycle-6 Track 4: Rounds A+B; second sensitivity wall identified
46fb9ef cycle-6 Track 3: Q-20 formula reshape
fac0527 cycle-6 Track 2: --strict-pairs in breaks-compare
a28c21d cycle-6 Track 1: --break-story-id and --break-page-range filters
8a6dc67 docs: cycle-6 plan covering 4 tracks
```

## What cycle 7 should pick up

In rough priority order:

1. **Calibration-sensitivity fixture** — design + add a generated
   IDML to `corpus/generated/` (e.g. `text-letterspacing.idml`)
   carrying:
   - Real English body text (not lorem)
   - Single column on a single page
   - Non-default `Min/MaxLetterSpacing` on a body paragraph
   - Companion PDF exported with InDesign matching the IDML
   Pin it in `break-thresholds.json` with `strict_pairs: true`.
   On that fixture, a Q-20 knob tweak that re-wraps the paragraph
   becomes detectable at ~10-20% metric movement.

2. **Q-20 calibration Rounds A re-test + new C** — once (1) is
   in place, re-test cycle-6 Round A's LS_BUDGET_PT shift and
   the deferred Round C shrink ceiling against the focused
   fixture.

3. **Drop-cap source-text alignment** — `text-advanced` shows
   word_match=0.0 because the renderer's source text excludes
   the drop-cap glyph that pdftotext sees as the line's first
   word. Either fix the renderer to include the drop cap in its
   source-text view, or document the special-case in
   `breaks-compare.py` and tolerate it.

4. **Reference-side per-frame filtering** — the long-tail issue
   from Track 1: pdftotext doesn't know story boundaries. Could
   approximate by using `--bbox-layout`'s `<block>` grouping plus
   a per-pack frame-bbox table to skip lines outside the
   filtered story's frame. Multi-day work; defer unless the
   cycle-7 fixture approach doesn't surface enough Q-20 signal.

5. **Hold the deferred-tracks line** — Tracks 3/4b/5a/5b from
   cycles 3-4 still have zero corpus exercise. Don't reopen.

## Honest assessment

Cycle 6 was foundational — built the sensitivity tooling — without
producing visible per-pack ΔE reductions. That's the right
ordering: blindly tuning composer knobs without a sensitive metric
risks regressions invisible to the harness. Cycle 7's focused
fixture should let calibration produce its first measurable wins.

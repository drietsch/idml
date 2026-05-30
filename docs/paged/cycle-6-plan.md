# Cycle 6 plan — parser / renderer

Companion to `corpus/envato/comparison-report-cycle5-final.md`.
Cycle 5 shipped the A/B harness end-to-end + body-text pack wiring,
but Q-20 calibration deferred again because the metric isn't
sensitive enough to detect calibration shifts inside the
per-pack structural-divergence noise (Δl=400+) AND the Q-20 formula
saturates `.min(2.0)` before AVG_CHARS_PER_WORD changes matter.

Cycle 6 fixes both blockers, then runs the deferred calibration.

## Sequencing

```
Week 1   [sensitivity]
  ├─ Track 1: --story-id / --page-range filters on inspect
  └─ Track 2: strict-pair weighting in breaks-compare.py

Week 2   [composer + calibration]
  ├─ Track 3: Q-20 formula reshape (saturation fix)
  └─ Track 4: Q-20 calibration rounds (gated on 1+2+3)

Week 2-3 [closeout]
  └─ Cycle-6 comparison report
```

Tracks 1+2 are independent and can run as parallel sub-agents.
Track 3 is independent of 1+2 but should land before Track 4. Track
4 gates on all three.

---

## Track 1 — Story/page-range filtering on `--emit-breaks`

**Goal:** isolate a single body-text paragraph or page range so the
A/B harness can compare apples to apples without the pack's
structural divergence (image frames, master spreads, unrendered
content) drowning the signal.

### 1a. `--story-id <id>` filter

When set, `paged-inspect --emit-breaks` writes records only for the
matching story (by `Self` id). `StoryEmitter::current_story_id`
already carries the value; gate the push on equality.

**Files:** `crates/paged-renderer/src/bin/inspect.rs`,
`crates/paged-renderer/src/pipeline.rs` (extend `PipelineOptions`
with `Option<String>` filter or a closure-style accept fn).
**Effort:** S (1-2 hours).

### 1b. `--page-range A:B` filter

Half-open `[A, B)` page-index range. Push only when
`target_page` falls inside the range. Combines with 1a — both
filters AND together.

**Effort:** S (30-60 min after 1a).

### 1c. Manifest extension + per-pack tightening

`break-thresholds.json` fixtures grow optional `story_id` /
`page_range` fields. When set, `breaks-gate.sh` passes the matching
flags to `paged-inspect`. Re-baseline at least 2 of the noisy
LetterSpacing packs (newspaper, business-magazine-template) against
a known body story / specific page so the metric shows real wrap
signal.

**Files:** `corpus/envato/break-thresholds.json`,
`corpus/envato/breaks-gate.sh`.
**Effort:** S (1-2 hours).

### Expected impact

A correctly-filtered fixture should show `Δl` in the single digits
and `word_match` ≥ 0.5 on body packs — small enough that a Q-20
knob change produces visible signal.

---

## Track 2 — Strict-pair weighting in `breaks-compare.py`

**Goal:** today `breaks-compare.py` includes every cand-ref pair
(in zip order) in the baseline-drift / word-match metrics, even
pairs where the lines obviously don't correspond. A strict-pair
mode counts only pairs whose first/last words actually match,
surfacing the real wrap-decision divergence.

- Add `strict_pairs: bool` option (CLI flag `--strict-pairs`).
- When set, filter `pairs` to only those where
  `word_endpoints_match(...) == 1` before computing
  `baseline_drift` / `word_match_rate`.
- The line-count delta metric is unaffected (still raw cand vs
  ref counts).
- Document the behaviour in the script docstring.

**Files:** `corpus/envato/breaks-compare.py`,
`corpus/envato/breaks-gate.sh` (pass the flag through).
**Effort:** S (1-2 hours).

### Expected impact

Strict-pair `baseline_drift_p99` and `word_match_rate_mean` become
metrics-on-validated-pairs-only. Numbers on noisy packs become
meaningful instead of garbage.

---

## Track 3 — Q-20 formula reshape

**Goal:** the cycle-5 Track 3 finding was that
`apply_paragraph_compose_options`'s letter-spacing → per-word
stretch budget saturates `.min(2.0)` on typical IDML LS values,
making AVG_CHARS_PER_WORD changes invisible.

Concretely, `newspaper`'s `Body, Left Justify` carries
`MaximumLetterSpacing="25" MinimumLetterSpacing="-5"
DesiredLetterSpacing="0"`. At a 120pt column, the current formula
yields `stretch_add = 25 * 4.7 / 1.5 = 78`, clamped to 2.0.

### 3a. Bounded mapping

Replace the linear `* AVG_CHARS_PER_WORD / space_width` with a
bounded mapping that scales LS values into the stretch domain in
proportion to *space-glyph advance*, not raw pt:

```rust
// stretch_add caps at 0.5 (50% of natural advance) instead of 2.0.
// Below the cap, the contribution scales linearly with LS budget.
let ls_budget_pt = (ls_max - ls_desired).max(0.0);
let stretch_add = (ls_budget_pt / 24.0).clamp(0.0, 0.5);
// shrink mirror: 24pt budget == full 50% shrink contribution
let ls_shrink_pt = (ls_desired - ls_min).max(0.0);
let shrink_add = (ls_shrink_pt / 24.0).clamp(0.0, 0.25);
```

24pt is a tunable starting point — calibrated from `newspaper`'s
25pt LS budget mapping to ~1.0 (i.e. 100% of natural advance) before
clamping. AVG_CHARS_PER_WORD goes away — it was an accidental
amplification factor.

**Files:** `crates/paged-renderer/src/pipeline.rs::apply_paragraph_compose_options`.
**Effort:** S (1-2 hours; existing unit tests + harness gate cover
the change).

### 3b. Verify zero regression on generated fixtures

`corpus/generated/diff.sh` 12/12 must stay green. The generated
fixtures don't customise LS so the branch shouldn't fire for them
at all — verify.

**Effort:** trivial.

### Expected impact

Q-20 changes (Round 1's AVG_CHARS_PER_WORD constant, Round 2's
floor adjustment, future shrink-ratio tweaks) now produce measurable
metric shifts on body-text packs. Without this, Track 4 is blind.

---

## Track 4 — Q-20 calibration rounds (now sensitive)

**Goal:** with Tracks 1-3 in place, the harness can see what Q-20
knob changes do. Run the calibration cycle 5 deferred.

### Round A: stretch-floor at 0.0

The Q-15 floor (`stretch_ratio.max(0.1)`) is a safety net for
zero-budget paragraphs. Investigate whether removing it on
paragraphs whose `MaximumWordSpacing > MinimumWordSpacing` (i.e.
they have real budget) improves wrap decisions on the body-text
packs. Conditional on `corpus/generated/diff.sh` staying green.

### Round B: alternative AVG_CHARS_PER_WORD (post-Track-3)

With the saturation removed, retest Round-1's tweak. Hypothesis:
the 4.7 value now produces measurable shift. (Or revert to 5.0 if
4.7 is worse.)

### Round C: shrink_ratio ceiling

Today the formula caps shrink at `.min(0.5)`. With Track 3's
reshape, the ceiling changes — verify the new cap is appropriate.

Each round: tweak → `corpus/generated/diff.sh` → `breaks-gate.sh`
→ merge or revert. Loosening a threshold to chase a passing run
is a regression in disguise (CLAUDE.md rule).

**Files:** `crates/paged-renderer/src/pipeline.rs::apply_paragraph_compose_options`,
`corpus/envato/break-thresholds.json` (re-baseline if metric
shifts).
**Effort:** S-M per round (1-2 hours including gate verification).

### Expected impact

Plan target: **−1 to −2 mean ΔE on the 9 LetterSpacing packs**.
Realistic per-round contribution: −0.3 to −0.8 ΔE.

---

## Closeout

- `corpus/envato/comparison-report-cycle6-final.md`.
- If the calibration moves per-pack ΔE meaningfully, tighten the
  pinned break-thresholds.json values (don't add slack — the
  cycle-5 generous thresholds were sized for the unfiltered
  metric).

## Risk + estimate

- **Track 1** is contained: clap flag parsing + filter check at
  the push site. Low risk.
- **Track 2** is local to `breaks-compare.py`. Low risk.
- **Track 3** changes composer behaviour. Mitigated by
  `corpus/generated/diff.sh` + workspace tests. The formula is
  conservative (caps at 0.5 vs the old saturating 2.0); if
  regressions appear, fall back to a smaller cap.
- **Track 4** is exploratory but each round is gated; reverts
  are cheap.

Total: ~1-2 weeks for one focused engineer.

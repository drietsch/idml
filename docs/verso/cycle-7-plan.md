# Cycle 7 plan — parser / renderer

Companion to `corpus/envato/comparison-report-cycle6-final.md`.
Cycle 6 built the harness sensitivity tooling but Track 4 surfaced
a second wall: the multi-page per-pack metric noise drowns single-
knob calibration shifts. Cycle 7's first work item should be a
focused calibration fixture; the practical constraint is that
InDesign-baked reference PDFs require a manual export step that
isn't always possible in a single dev session. Cycle 7 ships what
*can* land without that dependency.

## Sequencing

```
Week 1   [foundation + correctness]
  ├─ Track 1: Synthetic LS-aware fixture + self-diff harness
  └─ Track 2: Drop-cap source-text alignment

Week 1-2 [investigation]
  └─ Track 3: Real-pack ΔE root-cause investigation

Week 2   [closeout]
  └─ Cycle-7 comparison report
```

Tracks 1, 2, 3 are independent and can run as parallel sub-agents.

## Pre-flight check

| Item | Status |
|---|---|
| Reference PDF export tooling | InDesign-dependent; manual |
| Q-20 formula reshape | Cycle 6 landed |
| `--strict-pairs` in compare | Cycle 6 landed |
| Story/page-range filters | Cycle 6 landed |
| Current per-pack noise floor | Δl=400+ on body packs |

---

## Track 1 — Synthetic LS-aware fixture + self-diff harness

**Goal:** the cycle-6 finding was that the harness needs a fixture
where candidate and reference content align cleanly. The
canonical answer is an InDesign-baked PDF; the pragmatic
alternative is a **self-diff** that compares the current
candidate's BreakRecords against a snapshot pinned in tree. Catches
composer regressions during refactors without needing InDesign.

### 1a. Add `text-letterspacing.idml` to `idml-gen`

A single-page IDML with:
- One column, ~120pt wide
- Real English body paragraph (Lorem-ipsum-free; "Pack my box…"
  pangram + filler so the breaker has actual word choices)
- One paragraph style carries non-default
  `MinimumLetterSpacing=-5 DesiredLetterSpacing=0 MaximumLetterSpacing=25`
- A second paragraph at default LS for control
- Uses Open Sans (vendored in corpus/fonts)

**Files:** new `crates/idml-gen/src/samples/text_letterspacing.rs`
+ registration in the bin.
**Effort:** S (2-3 hours).

### 1b. Pin a self-diff break baseline

`corpus/generated/text-letterspacing.breaks.jsonl` — checked in,
the candidate-side BreakRecord output at the time of pinning. New
`corpus/generated/breaks-diff.sh` runs `idml-inspect --emit-breaks`
on `text-letterspacing.idml` and diffs against the pinned JSONL.

Diff metric: `line_count_delta` + per-line first-byte / last-byte
equality. Fails if any line's break decision shifts.

**Files:** `corpus/generated/text-letterspacing.breaks.jsonl`,
`corpus/generated/breaks-diff.sh`.
**Effort:** S (2-3 hours).

### 1c. Q-20 knob micro-bench

With (1a) + (1b) in place, the harness is sensitive enough to
detect when a Q-20 tweak changes the synthetic fixture's break
decisions. Document the workflow: tweak →
`corpus/generated/breaks-diff.sh` → pin if intentional, revert if
not. The InDesign-baked reference comparison stays the gold
standard for "matches InDesign" but the self-diff catches all
unintentional composer drift in the meantime.

**Effort:** documentation only — half-hour.

### Expected impact

Cycle 7's sensitive composer-regression net. Doesn't directly move
per-pack ΔE, but lets cycle 8+ confidently tune Q-20 knobs against
a fixture where movement is visible at ~10-20% metric shift.

---

## Track 2 — Drop-cap source-text alignment

**Goal:** cycle 5 Track 1 found `text-advanced` showed
`word_match_rate=0.0` because the renderer's `source_text` skips
the drop-cap glyph that pdftotext sees as the first word of the
opening line. Fix the renderer's `BreakRecord::source_text` to
include the drop-cap so the metric becomes meaningful for any
fixture with drop caps.

### 2a. Identify the drop-cap-skipping branch

In `emit_paragraph_into_chain`, the drop-cap splice replaces the
first N bytes of the first run with the dropped slice (rendered as
a separate large glyph). The line's `byte_range` then starts *past*
the drop cap, so when we slice `paragraph_text[byte_range]` the
drop-cap chars are missing.

**Files:** `crates/idml-renderer/src/pipeline.rs` —
`emit_paragraph_into_chain` and the drop-cap splice site at
~line 2670.

### 2b. Include drop-cap text in the first line's source_text

When the paragraph has a drop cap AND the line is the first one,
prepend the dropped slice's bytes back into `source_text`. Doesn't
change the breaker's view of where lines start; only affects what
the BreakRecord reports.

**Files:** `crates/idml-renderer/src/pipeline.rs`.
**Effort:** S (1-2 hours).

### 2c. Re-baseline `text-advanced`

After (2b), `text-advanced`'s `word_match_rate_mean` should rise
above 0.0. Re-pin in `break-thresholds.json`.

**Effort:** trivial.

### Expected impact

`text-advanced` becomes a useful break-decision regression net for
drop-cap-bearing paragraphs. May also surface drop-cap-related
bugs that the prior 0.0 metric was hiding.

---

## Track 3 — Real-pack ΔE root-cause investigation

**Goal:** the 8 LetterSpacing packs sit at mean ΔE 10-30 against
their reference PDFs. The cycle-3 final report attributed most of
the delta to "cross-cutting issues (text wrap, font sub, editorial
complexity)" but didn't isolate specific renderer bugs. Pick the
best-positioned pack (`company-profile-template` — modest pack
size, recognised cycle-6 metric movement) and use the existing
heatmap + per-page artifacts to identify ONE concrete renderer
issue worth fixing in cycle 7.

### 3a. Heatmap-driven inspection

Run `corpus/envato/test.sh company-profile-template`, examine the
heat-NNN.png artifacts on the worst-Δ pages. Cluster the deltas:
text-wrap differences, image-frame placement, color
divergence, missing/extra graphics.

**Effort:** 2-3 hours of focused inspection + categorisation.

### 3b. Fix the highest-impact cluster

Depending on what 3a surfaces — one concrete fix. Could be image
positioning, text-frame routing, paragraph spacing, or a
font-substitute metric override. Gated on
`corpus/generated/diff.sh` staying green.

**Effort:** S-M (half-day to one day).

### 3c. Document the finding

`corpus/envato/findings-cycle7/track-3-realpack-investigation.md`.
Even if the fix is small or deferred, the categorisation of
remaining deltas is useful for cycle 8 sizing.

### Expected impact

−1 to −3 ΔE on `company-profile-template`, plus categorised
findings for cycle 8 work.

---

## Closeout

- `corpus/envato/comparison-report-cycle7-final.md`.
- If Track 3 surfaces a corpus-wide fix, run it across all body
  packs and quantify the broader impact.

## Risk + estimate

- **Track 1** is contained; the only risk is the synthetic fixture
  doesn't exercise the Q-20 branch as expected (mitigated by
  verifying with `--emit-breaks` before pinning).
- **Track 2** is a precise renderer change with the existing
  `text-advanced` fixture as a regression target.
- **Track 3** is exploratory; the visible-on-heatmap approach
  scopes the work.

Total: ~1-2 weeks for a single focused engineer.

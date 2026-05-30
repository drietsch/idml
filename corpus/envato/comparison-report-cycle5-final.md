# Envato corpus: cycle 5 final

Snapshot at cycle-5 end (`8922a4b` — Track 3 deferral). Baseline
reference is cycle-4 final (`bb3264a`). Plan companion:
[`docs/paged/cycle-5-plan.md`](../../docs/paged/cycle-5-plan.md).

## Headline

- 12/12 generated fixtures pass `corpus/generated/diff.sh`.
- 12/12 break-decision fixtures pass `breaks-gate.sh`
  (up from 2 at cycle-4 end).
- 418/418 workspace tests passing.
- **5 commits** for cycle 5: 1 plan + 4 track commits.
- 3 features landed (Track 1, 2, 4). 1 sub-track deferred
  (Track 3 Rounds 2+3) with concrete cycle-6 scoping.

## Track status

| Track | Status | Commit |
|---|---|---|
| 1 — Source-text plumbing for harness | ✅ landed | `b9e04d2` |
| 2 — Body-text Envato pack wiring | ✅ landed | `c26b82c` |
| 4 — Threshold expansion + cell-paragraph breaks | ✅ landed | `62269da` |
| 3 — Q-20 calibration Round 1 (AVG_CHARS_PER_WORD) | ✅ landed | `8922a4b` |
| 3 — Q-20 calibration Rounds 2 + 3 | ⏸ deferred | needs metric sensitivity first; see findings-cycle5/track-3-calibration.md |

## Track-by-track summary

### Track 1 — Source-text plumbing (b9e04d2)

The cycle-4 `word_match_rate_mean` metric was a loose byte-span
heuristic because `BreakRecord` only carried byte ranges. Plumbed
each line's `source_text` through to the harness so
`breaks-compare.py` can do strict first/last-word equality matching
(lowercased + punctuation-stripped, with hyphenation continuation
tolerance).

- New `BreakRecord::source_text` field; populated from the
  pre-built paragraph-text concatenation, sliced by `byte_range`.
- Gated on `collect_breaks`; production renders pay zero cost.
- `breaks-compare.py` extracts cand first/last words from the new
  field, tests against the ref line's first_word/last_word. Old
  candidate JSONLs without `source_text` fall back to the legacy
  heuristic.

Thresholds re-baselined: the stricter metric is harder, so
`text`'s `word_match_rate` drops 0.938 → 0.562 (real signal —
candidate has 3 extra lines vs ref). `text-advanced` drops to 0.0
because the renderer's source-text view skips the drop-cap glyph
that pdftotext sees as the first word; tracked as a separate
drop-cap issue.

### Track 2 — Body-text Envato pack wiring (c26b82c)

`breaks-gate.sh` learned a new manifest schema where a fixture can
point at an Envato pack (`pack: "newspaper"`) instead of a
generated IDML. For pack fixtures, the gate derives IDML/PDF paths
from `corpus/envato/packs/<pack>/` and sources the per-pack
font-sub sidecar at `corpus/envato/overrides/<pack>/fonts.sh`
(with `_default` as fallback). Mirrors the convention
`corpus/envato/test.sh` already uses.

Pre-audit (already done in the plan): a grep over all 61 unpacked
packs identified 8 that customise `Min/MaxLetterSpacing` (the Q-20
calibration sub-corpus). All 8 + `newspaper` pinned with observed
baselines. **9 new pinned fixtures.**

The baselines are noisy because pack-wide candidate-vs-reference
page alignment is structurally divergent (image-bearing frames,
master spreads, unrendered content). Thresholds are conservative
regression nets sized to catch catastrophic breakage. Cycle 6's
first task: sharpen the metric (story/page-range filtering +
strict-pair weighting) so it can detect Q-20-relevant shifts
inside the structural noise.

### Track 4 — Cell-paragraph breaks + tables pin (62269da)

`emit_cell_paragraph` was bypassing `BreakRecord` collection; the
`tables` fixture emitted only 8 candidate lines (body paragraphs
outside cells) vs 53 reference lines. Wired the same collection
into the cell path; tables now emits 66 lines, Δl=13,
`word_match=0.943`. Pinned in the manifest.

`text-wrap` deferred — no reference PDF in `corpus/generated/`.

### Track 3 — Q-20 Round 1 (8922a4b)

`AVG_CHARS_PER_WORD` 5.0 → 4.7 (Norvig 2009 English-corpus
average). Zero metric shift across all 12 fixtures because the
`(ls_max - ls_desired) * CHARS_PER_WORD / space_width` formula
saturates `.min(2.0)` on typical InDesign LS values
(e.g. `newspaper`'s Body styles: Max=25 Min=-5 → stretch_add ≈ 78
clamped to 2.0). 6% smaller doesn't escape the clamp.

Lands as a correctness improvement; sets up future calibration
once the formula's saturation is fixed.

**Rounds 2 + 3 deferred** to cycle 6. They presuppose metric
sensitivity that today doesn't exist:

1. Per-pack noise floor (Δl=400+ from page misalignment) drowns
   any small wrap shift.
2. The Q-20 formula clamps before AVG_CHARS_PER_WORD changes
   matter.

`findings-cycle5/track-3-calibration.md` documents the deferral
with concrete cycle-6 recommendations.

## Cycle-5 commit list

```
8922a4b cycle-5 Track 3: AVG_CHARS_PER_WORD 5.0 → 4.7; calibration deferred
62269da cycle-5 Track 4: wire table-cell BreakRecord collection + pin tables
c26b82c cycle-5 Track 2: wire 9 Envato packs through breaks-gate
b9e04d2 cycle-5 Track 1: real word matching for the A/B harness
600bf1b docs: cycle-5 plan covering 4 tracks
```

## What cycle 6 should pick up

In rough priority order:

1. **Harness sensitivity** — three pieces, all 1-2 days each:
   - `--emit-breaks --story-id <id>` / `--page-range A:B` on
     `paged-inspect` so callers can isolate a single body paragraph.
   - `breaks-compare.py` strict-pair mode: only count baseline-drift
     and word-match contributions on pairs where first/last words
     match. Surfaces real wrap-decision shifts inside structural
     noise.
   - Q-20 formula reshape: replace
     `* AVG_CHARS_PER_WORD / space_width` with a bounded function
     that doesn't saturate `.min(2.0)` on typical IDML LS values.

2. **Q-20 calibration Rounds 2 + 3** — gated on (1); the harness
   needs to *see* the changes before tuning is productive.

3. **Drop-cap source-text alignment** — `text-advanced` shows
   word_match=0.0 because the renderer's source text skips the
   drop-cap glyph that pdftotext sees as the line's first word.
   Track this as its own Q-item (not Q-20 calibration relevant).

4. **Hold the deferred-tracks line** — cycle 4 confirmed Tracks
   3/4b/5a/5b still have zero corpus exercise. Don't reopen unless
   a new IDML pack actually uses them.

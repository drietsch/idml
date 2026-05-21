# Cycle 4 Track 2 — A/B harness + Q-20 calibration

The cycle-3 carry-over. Cycle-3 deferred this because the candidate
side was ~1 day but the reference-side PDF line-geometry extraction
was the multi-day risk. Cycle 4 committed to building both halves
before declaring the harness usable. Status at cycle-4 end:

| Sub-track | Status |
|---|---|
| 2a — `idml-inspect --emit-breaks` (candidate side) | ✅ landed |
| 2b — `breaks-extract.py` (reference side) | ✅ landed |
| 2c — `breaks-compare.py` + `break-thresholds.json` gate | ✅ landed |
| 2d — Q-20 calibration rounds | ⏸ deferred — needs body-text packs |

## 2a — Candidate side

Plumbed via a new `PipelineOptions::collect_breaks: bool` (default
false → zero-cost in production renders). When set, the renderer
emits one `BreakRecord` per laid-out line with:

```
story_id, paragraph_idx, line_idx, page_idx, frame_idx,
first_byte, last_byte, baseline_y_pt, width_pt
```

byte offsets are paragraph-local; coords are in pt
(divided back from idml_text's 1/64-pt internal units). Records are
collected on `StoryEmitter`'s new `breaks` field and drained into
`BuiltDocument::breaks` at each emitter completion site. The new
`--emit-breaks PATH` flag on `idml-inspect` writes one JSON object
per line to PATH.

## 2b — Reference side

`corpus/envato/breaks-extract.py` runs `pdftotext -bbox-layout`
against the reference PDF — the `-bbox-layout` mode produces clean
XHTML with per-line + per-word bounding boxes. Parsed into the same
schema-shape as the candidate side (plus `block_idx` for
multi-column flow). Baseline is estimated as
`y_max − 0.2 · (y_max − y_min)` (descender ≈ 20% of line height) so
candidate-vs-reference baseline drift can be compared after a
per-page constant-offset alignment.

Limitations documented in the script's docstring: hyphenation splits,
multi-column reading order, embedded-glyph ASCII look-alikes.
`pdfminer.six` is the stated fallback if `-bbox-layout` proves too
lossy on a body-text-heavy pack.

## 2c — Metric + gate

`corpus/envato/breaks-compare.py` scores three axes:

1. **`line_count_delta_sum`**: |cand_lines − ref_lines| summed across
   pages. Detects composer-level break-decision changes (a tightened
   letter-spacing budget that re-flows a paragraph from 4 lines to 3
   shows up here).
2. **`word_match_rate_mean`**: per matched line, does the candidate's
   byte span roughly correlate with the reference's pt-width? A
   loose heuristic (within 0.5×..2× of an estimated 6-glyphs-per-pt
   ratio). Surfaced as a 0..1 rate; rough but useful for flagging
   wild divergence.
3. **`baseline_drift_pt_p99`**: per matched line, the |Δ| between
   candidate baseline (frame-local) and reference baseline (page-
   local), anchored to a per-page offset (so the constant margin
   shift cancels). Reports intra-page line-spacing differences.

Per-fixture thresholds live in `corpus/envato/break-thresholds.json`.
`corpus/envato/breaks-gate.sh` runs the harness end-to-end and
fails when any fixture breaches its pinned thresholds.

### Baselines pinned at cycle-4 end

```
fixture            cand   ref    Δl   wrate  drift99
text                 19    16     3   0.938   0.0088
text-advanced        27    23     6   0.682  14.4062
```

Thresholds carry ~25–30% headroom over the observed values so
ordinary cycle-to-cycle drift doesn't paper-cut the gate, but a
real regression (an extra line on a page, a tracking knob that
collapses wrap) trips it. Run via:

```
./corpus/envato/breaks-gate.sh                  # gate all manifest fixtures
./corpus/envato/breaks-gate.sh text             # gate one
IDML_BREAKS_GATE=advisory ./corpus/envato/breaks-gate.sh  # never fail
```

## 2d — Q-20 calibration rounds (deferred)

The harness is operational but the Q-20 calibration that cycle 3
deferred — tuning `apply_paragraph_compose_options`'s stretch floor
+ letter-spacing budget — needs *signal* to converge against. The
text / text-advanced fixtures don't set custom `MinimumWordSpacing` /
`MinimumLetterSpacing` / `GlyphScaling`, so the Q-20 branches at
`crates/idml-renderer/src/pipeline.rs:10357,10381` never fire on
them. Calibration must run against Envato body-text packs where
those attributes are non-default — magazine,
modern-architecture-portfolio-template, newspaper, etc.

Those packs need per-pack font substitution (already encoded by
`corpus/envato/test.sh` and the `overrides/<pack>.fonts.sh` shims).
Wiring the breaks-gate harness through that font-substitution
flow + running 2-3 calibration rounds is the next dedicated piece
of work — cleanly scoped, but not a half-day item.

Estimated cycle-5 effort: 2-3 days to wire the body-text-pack
harness flow, then 2-3 calibration rounds on the resulting signal.
The Q-20 plumbing in commit `2c0b61b` remains unchanged; the
defaults still win until calibration narrows them.

## Files added

```
crates/idml-renderer/src/pipeline.rs   (+~50 lines: BreakRecord type,
                                         StoryEmitter Vec, line-loop push,
                                         BuiltDocument::breaks field)
crates/idml-renderer/src/bin/inspect.rs  (+--emit-breaks flag, JSONL write)
corpus/envato/breaks-extract.py        (new — reference-side extractor)
corpus/envato/breaks-compare.py        (new — diff metric)
corpus/envato/break-thresholds.json    (new — per-fixture gate config)
corpus/envato/breaks-gate.sh           (new — gate driver)
```

## Verification

- `cargo test --workspace`: 416/416 passing (3 new from Track 3,
  no new tests for Track 2 — harness verified end-to-end against
  text + text-advanced).
- `./corpus/generated/diff.sh`: 12/12 fixtures within tolerance.
  The Track 2a push is gated on `collect_breaks` (default false),
  so production renders pay zero cost.
- `./corpus/envato/breaks-gate.sh`: 2/2 pinned fixtures within
  thresholds.

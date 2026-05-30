# Envato corpus: cycle 4 final

Snapshot at cycle-4 end (`e15f9a9` — Track 5 Q-07 closeout). Baseline
reference is cycle-3 final (`f83cf8c`). Plan companion:
[`docs/paged/cycle-4-plan.md`](../../docs/paged/cycle-4-plan.md).

## Headline

- 12/12 generated fixtures pass `corpus/generated/diff.sh`
  (the hard fidelity gate) at their pinned per-fixture thresholds.
- 418/418 workspace tests passing (5 new this cycle: 3 stroke-type
  adapter pins, 2 Q-07 tracking pins).
- **6 commits** on `main` for cycle 4 (1 plan + 5 track commits).
- 4 features landed (1c finding, 4 telemetry, 3 plumbing, 2a-c
  harness, 5 pin). 1 sub-track deferred (2d Q-20 calibration) with
  documented "needs body-text pack font wiring" rationale.

## Track status

| Track | Status | Commit / Notes |
|---|---|---|
| 1 — Pre-audit + plan-state cleanup | ✅ landed | `ba42916` |
| 2a — `paged-inspect --emit-breaks` | ✅ landed | `7993c34` |
| 2b — `breaks-extract.py` | ✅ landed | `7993c34` |
| 2c — `breaks-compare.py` + gate | ✅ landed | `7993c34` |
| 2d — Q-20 calibration rounds | ⏸ deferred | Needs body-text packs through harness; see findings-cycle4/track-2-ab-harness.md |
| 3 — Stroke-type plumbing | ✅ landed | `49782d9` |
| 4 — ICC branch telemetry | ✅ landed | `973639f` |
| 5 — Q-07 Tracking re-audit | ✅ landed (closed) | `e15f9a9` |

## Track-by-track summary

### Track 1 — Pre-audit findings (ba42916)

Applied cycle-3's lesson ("audit corpus prevalence first") via a
half-day re-grep across all 61 unpacked packs + a Q-18 spot-check:

- **Q-18 closed**: the cycle-3 final report's "still deferred,
  multi-day" line was stale. Commit `ace96e8` (cycle 3) had already
  shipped the table renderer + Muli/Kozuka font substitutions.
- **Deferred-track sweep unchanged**: Track 4b (`PastedSmoothShade`
  as paint), 5a (`<Condition>` + `AppliedConditions=`), 5b
  (`<CrossReferenceSource>`) all still zero corpus hits. Track 3
  (inline shapes in `CharacterStyleRange`) still 1 hit
  (catalog-brochure-template). All four stay parked.
- **Q-07 unblocked** for Track 5 since Q-18 is closed.
- Table-bearing packs show ~2× median ΔE vs non-table packs
  (20.41 vs 11.10) but the gap is cross-cutting (editorial
  complexity, wrap, font sub), not a missing-parser problem.

Findings in `corpus/envato/findings-cycle4/track-1-pre-audit.md`.

### Track 2 — A/B break-decision harness (7993c34)

The cycle-3 critical-path carry-over. Cycle 4 commits to building
both halves end-to-end:

**2a** — `PipelineOptions::collect_breaks` flag (default false,
zero cost). When set, `StoryEmitter` accumulates one `BreakRecord`
per laid-out line with `(story_id, paragraph_idx, line_idx,
page_idx, frame_idx, first_byte, last_byte, baseline_y_pt,
width_pt)`. Drained into `BuiltDocument::breaks`.
`--emit-breaks PATH` on `paged-inspect` writes JSONL.

**2b** — `corpus/envato/breaks-extract.py` parses
`pdftotext -bbox-layout`'s XHTML to emit one record per detected
line (with per-page + per-block indexing). Baseline estimated as
`y_max − 0.2·height`.

**2c** — `corpus/envato/breaks-compare.py` scores three axes
(line_count_delta_sum, word_match_rate_mean,
baseline_drift_pt_p99). `corpus/envato/breaks-gate.sh` runs the
harness against the pinned fixtures in
`corpus/envato/break-thresholds.json` and fails on threshold
breach. Two fixtures pinned at cycle-4 end:

```
fixture            cand   ref    Δl   wrate  drift99
text                 19    16     3   0.938   0.0088
text-advanced        27    23     6   0.682  14.4062
```

**2d** — Q-20 calibration rounds deferred. The text/text-advanced
fixtures don't carry custom `MinimumWordSpacing` /
`MinimumLetterSpacing` / `GlyphScaling`, so the Q-20 branches at
`pipeline.rs:10357,10381` never fire. Calibration needs Envato
body-text packs (magazine, modern-architecture-portfolio-template,
newspaper) wired through the harness with per-pack font sub
overrides — 2-3 days of follow-on work, plus the calibration
rounds themselves. Documented in
`findings-cycle4/track-2-ab-harness.md`.

### Track 3 — Stroke-type plumbing (49782d9)

Closed the asymmetry the cycle-3 4a commit left behind. Custom
`<DashedStrokeStyle>` / `<DottedStrokeStyle>` / `<StripedStrokeStyle>`
/ `<WavyStrokeStyle>` patterns now flow through Oval, Polygon,
GraphicLine, and TextFrame — not just Rectangle.

- Moved `stroke_type` from rect-only `StrokeStyleAttrs` onto
  `CommonAttrs` so every shape's `read_common_attrs` picks up the
  attribute uniformly.
- Added `pub stroke_type` to TextFrame, Oval, GraphicLine, Polygon
  parser structs.
- Wired through `from_*` adapters in `module/frame.rs` and routed
  the corresponding `emit_*_into` stroke calls through `stroke_for`
  with `Some(&document.styles.stroke_styles)`. `emit_rectangle_polygon_path`
  now also takes `document` (was previously bypassing the lookup).
- Three new unit tests cover the adapter threading on Oval,
  Polygon, GraphicLine.

### Track 4 — ICC branch telemetry (973639f)

Added `tracing::debug!(target: "paged_renderer::icc", …)` at the
two missing branch points in `cmyk32_to_rgba` (success + no-
profile), and `--trace-icc` on `paged-inspect` to install a
`tracing-subscriber` fmt layer. Confirmed Track 1b fires on the
expected Q-03 packs:

```
pack                                                icc  naive  rej
newspaper                                            32      0    0
newspaper-template                                   30      0    0
newspaper-newsletter-layout                           0      0    0
charity-ebook-digital-magazine-template              33      0    0
annual-report-template                                0      0    0
```

Findings in `corpus/envato/findings-cycle4/track-4-icc-coverage.md`.

### Track 5 — Q-07 closed; tracking pinned (e15f9a9)

The cycle-2 deferral of Q-07 gated on Q-18; Track 1a unblocked it.
Review of `apply_tracking` (shape.rs:250) + its call sites
(layout.rs:450 multi-font path, pipeline.rs:4654 text-on-path,
pipeline.rs:6696 table cells) confirmed coverage is uniform. No
specific Q-07 corpus signal to chase: the cycle-2 deferral was on
the table renderer, which Q-18 closed.

Two synthetic-IDML pins in `text_glyph_level.rs` build 4-A strings
at Tracking={0, 200, -100}, render through `build_document`, and
assert the emitted glyph span widens / tightens by the expected
±~20pt margin. These guard against composer refactors that drop
`apply_tracking` between shape and emit.

Findings in `corpus/envato/findings-cycle4/track-5-q07-closeout.md`.

## Cycle-4 commit list

```
e15f9a9 cycle-4 Track 5: Q-07 closed; pin Tracking through layout_runs
7993c34 cycle-4 Track 2: A/B break-decision harness end-to-end
49782d9 cycle-4 Track 3: extend stroke_type to Oval / Polygon / GraphicLine / TextFrame
973639f cycle-4 Track 4: ICC branch telemetry via --trace-icc
ba42916 cycle-4 Track 1: pre-audit findings — Q-18 closed, deferred tracks unchanged
e1b227f docs: cycle-4 plan covering 5 tracks
```

## What cycle 5 should pick up

In rough priority order:

1. **Track 2d (Q-20 calibration)**: wire the body-text Envato packs
   (magazine, modern-architecture-portfolio-template, newspaper,
   newspaper-newsletter-layout) through `breaks-gate.sh` with the
   existing per-pack font sub overrides from
   `corpus/envato/overrides/`. Once the harness shows signal on
   packs that customise `MinimumLetterSpacing` /
   `MaximumLetterSpacing` / `MinimumGlyphScaling`, run 2-3
   calibration rounds against
   `apply_paragraph_compose_options`'s stretch floor + letter-
   spacing budget. Estimated: 2-3 days for harness wiring, 2-3
   days for calibration.
2. **Track 2 source-text plumbing**: the cycle-4
   `word_match_rate_mean` metric is a loose heuristic because the
   candidate side only carries byte ranges, not source text. Plumb
   the paragraph's source bytes into `BreakRecord` (gated on the
   same `collect_breaks` flag) so the compare script can do real
   first-word / last-word matching against `pdftotext`'s output.
3. **break-thresholds.json expansion**: pin 5-10 more body-text
   fixtures (the generated `text-wrap`, `tables`, plus 3-5 Envato
   packs once they're wired) so the break-decision regression net
   covers a representative sub-corpus.
4. **Reopen deferred tracks** only when a corpus pack actually
   exercises them. Cycle 4's audit confirmed the cycle-3 findings
   still hold — Track 3 anchored objects, 4b PastedSmoothShade,
   5a conditional text, 5b cross-references all stay parked.

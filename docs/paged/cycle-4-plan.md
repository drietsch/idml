# Cycle 4 plan — parser / renderer

Companion to `corpus/envato/comparison-report-cycle3-final.md`.
Cycle 3 landed 7 of 12 tracks; the rest were deferred with documented
"no corpus impact" findings. Cycle 4 carries forward the items that
*do* have corpus impact and applies cycle 3's main lesson: **pre-audit
corpus prevalence before sizing a track**.

## Sequencing

```
Week 1   [audit + small leaves]
  ├─ Track 1: Pre-audit + plan-state cleanup       ── unblocks correct sizing
  └─ Track 4: Track-1b ICC branch telemetry        ── hours, slotted alongside

Week 2-3 [foundation]
  └─ Track 2: A/B harness (candidate + reference)  ── carry-over from cycle 3

Week 3-4 [features off the foundation]
  ├─ Track 2d: Q-20 calibration rounds             ── needs Track 2 first
  └─ Track 3: stroke-type plumbing for non-rect    ── parallel to 2d

Week 4   [follow-up]
  └─ Track 5: Q-07 Tracking re-audit               ── Q-18 closed, now unblocked

Week 5   [closeout]
  └─ Cycle-4 comparison report
```

Tracks 1, 3, 4 are independent and can run in parallel sub-agents.
Track 2 is the critical-path foundation; Track 2d gates on it. Track 5
gates on Track 1's re-audit confirming Q-18 is truly closed.

---

## Track 1 — Pre-audit pass + plan-state cleanup

**Goal:** apply cycle 3's lesson ("the plan was sized against the IDML
spec's surface area, not the corpus's actual usage") to cycle 4 before
sizing anything else, and clean up two stale plan-state entries that
contradict the actual git history.

### 1a. Resolve the Q-18 stale-status contradiction

The cycle-3 final report's "What cycle 4 should pick up" item #4 says
*"Q-18 (Table parser): still deferred from cycle 2; the single largest
unaddressed corpus gap. Multi-day."* This is wrong: commit `ace96e8`
("Q-18 (cycle 3 open): table renderer already code-complete; add
Muli/Kozuka substitutions") inspected the parser + renderer and shipped
the missing font substitutions. The table renderer handles
content-driven row growth, per-cell text layout, alternating row
strokes, and explicit cell-edge overrides today.

- Re-run a Q-18 spot-check: render the table-bearing cycle-2 packs
  (employment-application, annual-report-template, …) and quantify
  current ΔE deltas. If they're inside threshold, mark Q-18 closed
  and drop it from the cycle-4 backlog.
- If a residual table-rendering gap exists, file it as a new Q-item
  with concrete reproduction, not as "Q-18 still open".

**Files:** `corpus/envato/comparison-report-cycle3-final.md` (footnote
correction), `corpus/envato/findings-cycle2/` (audit log addition).
**Effort:** S (half-day).

### 1b. Corpus prevalence sweep of remaining deferred tracks

Re-grep the corpus for the four still-deferred tracks (4b, 5a, 5b, 3)
once per cycle so we have a fresh signal — IDMLs added between
cycles can change the picture. Output a table mirroring the
cycle-3 report's "corpus-impact-zero finding" section.

**Files:** `corpus/envato/comparison-report-cycle4-precheck.md` (new).
**Effort:** S (half-day, scripted greps).

### 1c. Q-07 + Q-18 dependency audit

Q-07 (Tracking re-audit) was deferred in cycle 2 with note *"gates on
Q-18 — re-audit after the table renderer lands"*. If Track 1a confirms
Q-18 is closed, Q-07 becomes a leaf item — Track 5 below picks it up.
If Q-18 has residual gaps, Q-07 stays gated and Track 5 defers again.

**Effort:** part of 1a — no separate budget.

### Expected corpus impact

Track 1 itself is metric-neutral. It unblocks correct sizing for
Tracks 2/3/5 and prevents the cycle-3 pitfall of plan-vs-corpus
mismatch.

---

## Track 2 — A/B harness + Q-20 calibration

**Goal:** the cycle-3 carry-over. Build the break-decision A/B harness
so composer / shaper changes (starting with Q-20's already-plumbed
Min/Desired/Max LetterSpacing + GlyphScaling) can land with a
break-decision regression net, not just a pixel-ΔE one.

Cycle 3 deferred this because the candidate side is ~1 day but the
reference side (`pdftotext -layout` line-geometry reconstruction)
is multi-day and was the real risk. Cycle 4 commits to building both
halves before declaring the harness usable.

### 2a. Candidate-side break extraction

- Add `--emit-breaks <path>` to `idml-inspect`. Walk the laid-out
  story, emit `[(page_idx, frame_idx, line_idx, first_byte,
  last_byte, baseline_y_pt, width_pt)]` per line as JSON Lines.
- Source the data from `StoryEmitter`'s existing per-frame line
  bookkeeping; no new layout state needed. Match the schema agreed in
  the cycle-3 plan exactly so downstream tooling can be written
  reference-side-first.

**Files:** `crates/idml-renderer/src/bin/inspect.rs`,
`crates/idml-renderer/src/pipeline.rs` (expose per-line records on
`StoryEmitter`).
**Effort:** S (1-2 days).

### 2b. Reference-side break extraction

- New `corpus/envato/breaks-extract.py`. Runs `pdftotext -layout`
  per PDF page to get word boxes, then reconstructs lines by
  clustering on `y` within a tolerance. Each output line carries
  `[(page_idx, line_idx, first_word_text, last_word_text,
  baseline_y_pt, width_pt)]`.
- Match candidate lines by `(page_idx, baseline_y_pt±tol)` not by
  byte offset — the PDF doesn't expose source bytes.
- Acknowledge the limits in the script's docstring: split words
  (hyphenation, shy hyphen), embedded glyphs, and multi-column
  flow are the known failure modes. Skip pages where word-count
  candidate vs reference diverges by >10% rather than producing
  garbage matches.

**Files:** new `corpus/envato/breaks-extract.py`,
`corpus/envato/test.sh` (invoke alongside pixel diff).
**Effort:** M (3-4 days). This is the historically-flagged risk —
budget it accordingly. If `pdftotext -layout` proves too lossy on
the body-text packs we care about, fall back to `pdfminer.six`'s
`LTTextLineHorizontal` (richer per-line geometry).

### 2c. Break-decision diff metric + gate

- `corpus/envato/compare.py` consumes both files. Three sub-scores:
  (a) line-count delta per page, (b) per-line first-word/last-word
  match rate (0..1), (c) per-line baseline-y drift (pt).
- Surface in `corpus/envato/reports/summary.json` next to
  `worst_mean_de`. Pin per-pack break-decision thresholds in a new
  `corpus/envato/break-thresholds.json` (start with 5-10 body-text
  packs: magazine, modern-architecture-portfolio-template, newspaper,
  newspaper-newsletter-layout).

**Files:** `corpus/envato/compare.py`,
`corpus/envato/break-thresholds.json` (new),
`corpus/envato/test.sh`.
**Effort:** S (1-2 days, after 2a + 2b land).

### 2d. Q-20 calibration rounds

With 2a-c green on a sub-corpus, tune
`apply_paragraph_compose_options`'s stretch-floor + letter-spacing
budget. Iterate: change a knob → harness run → compare break score →
merge or revert. Target 2-3 calibration rounds.

**Files:** `crates/idml-text/src/compose.rs::apply_paragraph_compose_options`.
**Effort:** S-M (2-3 days; the harness makes this safe rather than
inherently fast).

### Expected corpus impact

Harness itself is metric-neutral. Q-20 calibration target: −1 to −2
mean ΔE on the 12+/61 body-text packs that currently drift from
InDesign's line breaks. Also unlocks future composer tweaks (optical
kerning toggle, glyph-advance rounding mode, ligature flag matching)
that have been blocked on regression infra.

---

## Track 3 — Stroke-type plumbing for non-rectangle shapes

**Goal:** finish cycle 3's Track 4a (`abe2da3`). Custom
`<DashedStrokeStyle>` / `<DottedStrokeStyle>` / `<StripedStrokeStyle>`
/ `<WavyStrokeStyle>` patterns now feed the dash slot, but only when
applied to a `Rectangle`. Parser structs for `Oval` / `Polygon` /
`GraphicLine` don't capture `stroke_type` at all
(`crates/idml-parse/src/spread.rs:593` defines it on `Rectangle`
only); `from_oval` / `from_polygon` / `from_graphic_line` in
`crates/idml-renderer/src/module/frame.rs:244,289,329` hard-code
`stroke_type: None`. Until both are wired, a polygon or oval with a
custom dash pattern silently falls back to solid.

### 3a. Extend parser structs

- Add `pub stroke_type: Option<String>` to `Oval`, `GraphicLine`,
  `Polygon` mirror the `Rectangle` field. Populate via
  `attr(e, b"StrokeType")` in each shape's parse path.
- Confirm `TextFrame` already carries `stroke_type` via the shared
  `Rectangle`-derived path (it does — `TextFrame` reuses the
  rectangle attribute set in `crates/idml-parse/src/spread.rs`).

**Files:** `crates/idml-parse/src/spread.rs`.
**Effort:** S (half-day).

### 3b. Wire through frame adapter

- In `crates/idml-renderer/src/module/frame.rs`,
  `from_oval` / `from_polygon` / `from_graphic_line` read the
  parser field instead of `None`.
- Confirm the cycle-3 `stroke_for` lookup (which now takes the
  `stroke_styles: &BTreeMap<…>` table) is called uniformly for all
  shape kinds, not just rectangles.

**Files:** `crates/idml-renderer/src/module/frame.rs`,
`crates/idml-renderer/src/pipeline.rs` (audit `stroke_for` call sites).
**Effort:** S (1 day).

### 3c. Regression coverage

- Synthetic IDML: an oval + a polygon + a graphic line each with a
  custom `<DashedStrokeStyle>` reference. Pin via the
  `corpus/generated/` gate.
- Find a corpus pack that exercises a dashed oval/polygon and add
  it to the body-pack gated subset if one exists; Track 1b's sweep
  will surface candidates.

**Files:** `crates/idml-gen/src/samples/strokes_fills.rs` (extend),
`corpus/generated/fidelity-thresholds.json` (add pages if needed).
**Effort:** S (1 day).

### Expected corpus impact

Limited until Track 1b's sweep identifies non-rectangle dashed
shapes. Expected: 1-3 packs improve by 1-3 ΔE on pages with dashed
ovals/polygons. The real win is closing a known asymmetry in the
renderer — Track 4a left a footnote that this should ship.

---

## Track 4 — Track 1b ICC-branch telemetry

**Goal:** confirm the cycle-3 JPEG-embedded-ICC path (`c7ebff4`) is
actually taken on the Q-03 newspaper packs that motivated it. Right
now the branch is implemented but unobserved — we don't know whether
the corpus packs carry APP2 ICC segments or fall through to the naive
multiplicative fallback.

- Add `tracing::debug!` at the branch points in
  `decode_image_bytes`: "took embedded ICC (n bytes)", "fell back to
  doc-level CMYK profile", "fell back to naive multiplicative".
- Add a `--trace-icc` flag to `idml-inspect` that enables the
  `tracing` subscriber at debug level for the relevant target.
- Run the harness across Q-03 packs once and capture the branch
  distribution in `corpus/envato/findings-cycle4/icc-coverage.md`.

**Files:** `crates/idml-renderer/src/pipeline.rs::decode_image_bytes`,
`crates/idml-renderer/src/bin/inspect.rs`.
**Effort:** S (half-day).

### Expected corpus impact

Metric-neutral. Either confirms the branch fires (telemetry only
needed) or reveals it's never taken (next cycle revisits the CMYK
JPEG-ICC path entirely).

---

## Track 5 — Q-07 Tracking re-audit

**Goal:** re-evaluate Q-07 (Tracking value adherence — letter spacing
drift on tabular numerals) now that Q-18 (Table parser) is closed.
Cycle 2 gated Q-07 on Q-18 because the evidence is table content.

- Render the Q-07 cited packs and measure tracking-attributable drift
  in table-cell text vs reference PDFs.
- If drift is visible, file the renderer fix as a sub-track here.
- If drift is within threshold, document Q-07 closed.

Gates on Track 1a confirming Q-18 is truly closed. If Track 1a
surfaces residual Q-18 gaps, Q-07 defers again.

**Files:** `crates/idml-text/src/shape.rs` (tracking-application path)
if a fix is needed; otherwise `corpus/envato/findings-cycle4/q07.md`.
**Effort:** S-M (1-3 days depending on findings).

### Expected corpus impact

Speculative until Track 1a's spot-check. If a fix lands: −0.5 to −1.5
ΔE on 3-5 table-heavy packs.

---

## Closeout

After tracks 1-5 land:

- Refresh `corpus/envato/break-thresholds.json` with the post-Q-20
  metric (tightened to actual ± 15-25% headroom, per the
  "don't loosen thresholds" rule).
- `corpus/envato/comparison-report-cycle4-final.md`.

## Risk + estimate

- **Track 1** is low-risk plan hygiene. Half-day. Worth doing first
  even though it doesn't ship corpus deltas, because it prevents
  the rest of the plan from being miscalibrated.
- **Track 2** is the cycle-4 critical path. Track 2b (reference-side
  PDF line extraction) is the risk that justified deferring in
  cycle 3. Cycle 4 commits to it, with `pdfminer.six` as a stated
  fallback if `pdftotext -layout` is too lossy.
- **Tracks 3, 4, 5** are each contained S/M items; can run as
  parallel sub-agents once Track 1 finishes its audit.

Total: ~4-5 weeks for a single focused engineer; ~3 weeks with
sub-agent parallelism on tracks 3 / 4 / 5 while Track 2 is in
flight.

# Envato corpus: cycle 7 final

Snapshot at cycle-7 end (`de9f0fc` — Track 3 investigation
findings). Baseline reference is cycle-6 final (`05d4396`). Plan
companion: [`docs/verso/cycle-7-plan.md`](../../docs/verso/cycle-7-plan.md).

## Headline

- 12/12 generated fixtures pass `corpus/generated/diff.sh`.
- 12/12 break-decision fixtures pass `breaks-gate.sh`.
- 1/1 self-diff fixtures pass `breaks-diff.sh` (cycle-7 addition).
- 418/418 workspace tests passing.
- **4 commits** for cycle 7: 1 plan + 3 track commits.
- 2 features landed (Track 1 + Track 2); Track 3 surfaced a
  concrete cycle-8 issue with a documented root-cause hypothesis.

## Track status

| Track | Status | Commit |
|---|---|---|
| 1 — Synthetic LS fixture + self-diff harness | ✅ landed | `57e6d71` |
| 2 — Drop-cap source-text alignment | ✅ landed | `a02746f` |
| 3 — Real-pack ΔE investigation | ✅ landed (findings only) | `de9f0fc` |

## Track-by-track summary

### Track 1 — text-letterspacing fixture + self-diff (57e6d71)

`crates/idml-gen/src/samples/text_letterspacing.rs`: a two-page
A4 fixture, narrow 200pt column, identical real-English body
text. Page 0 default LS; page 1 carries
`MinLetterSpacing=-5 / DesiredLetterSpacing=0 / MaxLetterSpacing=25`
matching newspaper's typical body style.

`corpus/generated/breaks-diff.sh`: regenerates the IDML, runs
`--emit-breaks`, diffs against the in-tree
`text-letterspacing.breaks.jsonl` snapshot. Fails on any
wrap-decision shift (byte-range or baseline_y delta > 1e-3pt).

The `idml-gen::Paragraph` struct gained three optional fields
(`minimum_letter_spacing` / `desired_letter_spacing` /
`maximum_letter_spacing`) so future samples can exercise the
Q-20 path directly. 22 existing call sites updated to None.

Notable finding pinned by the snapshot: at cycle-7 baseline, the
LS-spread-25 paragraph produces *identical* break decisions to
the LS-default control. The cycle-6 Track 3 formula reshape gave
the breaker LS budget but the natural breaks here fit without
needing it. Cycle 8 should narrow the column / pick text with
tighter natural breaks to surface calibration sensitivity.

### Track 2 — Drop-cap text in source_text (a02746f)

`emit_paragraph_into_chain` captures the dropped slice
(`styled_runs[0].text[..split]`) into a local String when
`collect_breaks` is on. The first line's `source_text` builds from
`paragraph_text[0]` (not `first_byte`) so any leading-space the
breaker skipped is included, then prepended with the dropped
slice. Result on text-advanced: the candidate's line 0
`source_text` reports `"In a hole in the ground..."` instead of
the pre-fix `"Ina hole in the ground..."` or `"a hole..."`.

`text-advanced`'s `word_match_rate` stays 0.0 in spite of the
fix because pdftotext's block-segmentation on drop-cap pages
puts the drop-cap "In" baseline-line *between* body lines,
defeating positional zip-pairing in `breaks-compare.py`. That's
a fuzzy-pairing concern for a future cycle; out of scope for
Track 2's source-text fix.

### Track 3 — company-profile-template root-cause (de9f0fc)

Heatmap-driven inspection of the pack (mean ΔE 29.5) identifies
the deltas as **image-bearing Rectangle page-routing
divergence**. The IDML's `Spread_u114.xml` (page 20) hosts a
Rectangle with `ItemTransform="1 0 0 1 9.5 -4301.6"` referencing
`YOUR IMAGE GOES HERE.jpg`. InDesign's export routes this rect
onto page 20 (heatmap shows the placeholder tile grid there).
The candidate's page-routing doesn't select page 20, leaving the
top 65% of the page empty.

Pages 1, 6, 17 show the same pattern at smaller scale; the top-4
pages cumulatively account for ~50% of the pack's ΔE budget.

What's NOT the cause: Q-20 calibration (sub-line text deltas),
missing-image placeholder logic (correctly wired but never fires
because the rect isn't routed), font substitution (sub-pixel).

No code fix landed — the page-routing investigation is multi-day
scope, right for a cycle-8 owner. Track 3's deliverable is the
categorisation + concrete file references in
`findings-cycle7/track-3-realpack-investigation.md`.

## Cycle-7 commit list

```
de9f0fc cycle-7 Track 3: company-profile-template ΔE root-cause identified
a02746f cycle-7 Track 2: include drop-cap text in first-line BreakRecord
57e6d71 cycle-7 Track 1: text-letterspacing fixture + self-diff harness
135cb11 docs: cycle-7 plan covering 3 tracks
```

## Cycles 6 + 7 retrospective

Cycle 6 built three layers of harness sensitivity (filters,
strict-pair weighting, Q-20 formula reshape). Cycle 7 added the
focused-fixture infrastructure to capitalise on that sensitivity
(self-diff harness, drop-cap source-text, methodology for
real-pack investigation).

Neither cycle delivered measurable per-pack ΔE reductions. That
sounds disappointing but matches how this kind of work
actually progresses: **infrastructure first, then signal-driven
fixes**. Cycle 8 inherits a sensitive harness and a concrete
cycle-7 finding (image-rect page-routing) that should produce
the first material ΔE movement since cycle 3.

## What cycle 8 should pick up

In rough priority order:

1. **Image-rect page-routing** for company-profile-template
   (Track 3's finding). Likely fix:
   - Trace the rect's spread-coord center calculation through
     the nested `ItemTransform` chain.
   - Compare candidate's per-page-bounds containment check
     against InDesign's page assignment.
   - Once company-profile-template moves, batch the same
     investigation across the other 8 LetterSpacing packs.
   Expected impact: −10 to −15 ΔE on company-profile-template;
   spillover gains on similar packs.

2. **Calibration-sensitivity tightening**: narrow the
   text-letterspacing fixture column to ~80pt so the natural
   break points are close to the column edge, where LS budget
   actually decides line breaks. Today's 200pt column lets the
   breaker satisfy KP without leaning on LS.

3. **Fuzzy compare-pair mode**: when the candidate and reference
   have different segmentation (drop caps, multi-block pages),
   pair lines by first-word match rather than position. Would
   let `text-advanced` and the drop-cap-bearing Envato packs
   produce meaningful word_match signal.

4. **Hold the deferred-tracks line** — Tracks 3/4b/5a/5b from
   cycles 3-4 still have zero corpus exercise. Don't reopen.

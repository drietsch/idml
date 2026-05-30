# Cycle 4 Track 1 — pre-audit findings

Outputs from the half-day pre-audit pass (`docs/paged/cycle-4-plan.md`
Track 1). Three sub-items: 1a Q-18 spot-check, 1b corpus prevalence
sweep, 1c Q-07 dependency status.

## 1a — Q-18 (Table parser) is closed; cycle-3 report line is stale

The cycle-3 final report
(`corpus/envato/comparison-report-cycle3-final.md` "What cycle 4
should pick up" item #4) lists Q-18 as *"still deferred from cycle
2; the single largest unaddressed corpus gap. Multi-day."* This
contradicts git history. Commit `ace96e8` ("Q-18 (cycle 3 open):
table renderer already code-complete; add Muli/Kozuka
substitutions") explicitly inspected `crates/paged-parse/src/story.rs`
+ `crates/paged-renderer/src/pipeline.rs::emit_table_into_chain` and
found the parser + renderer code-complete (`Table`, `TableRow`,
`TableColumn`, `TableCell`, `TableBorder`, `TableLineStrokes`
defined; `<Table>` / `<Cell>` / `<Row>` parsed; content-driven row
growth, per-cell text layout, alternating row strokes, and explicit
cell-edge overrides all handled). The missing piece was Muli +
Kozuka Mincho Pro substitutions for the cited packs, which
`ace96e8` added.

### Current corpus metrics on table-bearing packs

| Pack | Tables | Mean ΔE | p99 ΔE | SSIM |
|---|---:|---:|---:|---:|
| annual-report | 44 | 14.40 | 100.00 | 0.732 |
| hr-employee-handbook | 32 | 28.98 | 100.00 | 0.748 |
| capability-statement-brochure | 28 | 13.17 | 100.00 | 0.777 |
| event-program-brochure | 26 | 36.02 | 84.14 | 0.679 |
| employment-application | 9 | 2.55 | 80.04 | 0.906 |
| magazine-editorial-layout | 6 | 20.41 | 100.00 | 0.720 |
| annual-report-template-8b5d40 | 5 | 23.11 | 49.22 | 0.536 |
| annual-report-template | 4 | 69.18 | 100.00 | 0.362 |
| company-profile-template | 3 | 29.53 | 84.14 | 0.555 |
| digital-bridesmaid-planner-template | 2 | 11.12 | 54.52 | 0.630 |
| project-competitor-analysis-template | 1 | 10.60 | 81.05 | 0.818 |
| real-estate-brochure | 1 | 11.17 | 83.14 | 0.764 |

### Table vs non-table comparison

```
Table-bearing packs (n=12):  median=20.41  mean=22.52  range=2.55..69.18
Non-table packs     (n=49):  median=11.10  mean=14.55  range=2.11..54.12
```

Table-bearing packs do show ~2× the median ΔE of non-table packs.
But this is **confounded by editorial complexity**, not driven by
missing table-rendering code: table-bearing packs in this corpus
are dominated by multi-page editorial layouts (annual reports, hr
handbooks, brochures) where body-text wrap, font substitution, and
graphic density all contribute. annual-report-template's 69.18
mean ΔE was diagnosed in cycle 3 as a cover-photo decode problem
(addressed by Track 1a/1b/1c), not tables. employment-application
(small inline table) sits at 2.55 — well inside any reasonable
table-only threshold.

### Conclusion

- Q-18 (Table parser) is **closed**. The cycle-3 final report
  line is retracted by this finding.
- The residual delta on table-bearing packs is cross-cutting
  (Track 2's wrap calibration + future composer tweaks will help
  more than any "table parser" work would).
- No separate Q-18 backlog item carries into cycle 4.

## 1b — Corpus prevalence sweep of still-deferred tracks

Re-ran the cycle-3 greps across all 61 unpacked packs to check
whether the deferred-track findings have shifted.

| Track | What we grep'd for | Cycle 3 hits | Cycle 4 hits |
|---|---|---:|---:|
| 4b | `Fill|StrokeColor=".*PastedSmoothShade"` in any spread / story / graphic XML | 0 | **0** |
| 5a | `<Condition ` declarations | 0 | **0** |
| 5a | `AppliedConditions=` attributes | 0 | **0** |
| 5b | `<CrossReferenceSource>` (real refs, not format templates) | 0 | **0** |
| 3  | Shape opens (`<TextFrame>`/`<Rectangle>`/`<Polygon>`/`<Oval>`/`<Group>`/`<GraphicLine>`) inside a `<CharacterStyleRange>` | 1 (catalog-brochure-template) | **1** (catalog-brochure-template) |

All four still-deferred tracks remain corpus-impact-zero. Stay
parked per cycle-3's recommendation.

Audit script: `/tmp/cycle4-audit.py` (one-shot; not checked in).
Scans each pack's `template.idml` ZIP, concatenating
`Spreads/*.xml`, `Stories/*.xml`, `Resources/Graphic.xml`,
`Resources/Preferences.xml`, and `designmap.xml` into a single
buffer before regex matching.

## 1c — Q-07 (Tracking re-audit) dependency status

Q-07 was deferred in cycle 2 with note *"gates on Q-18 — re-audit
after the table renderer lands"*. Per 1a, Q-18 landed in `ace96e8`
(cycle 3). Q-07 is therefore **unblocked** for cycle 4 Track 5.

Recommended Track 5 scope:

1. Render the Q-07 cited packs through `corpus/envato/test.sh`
   with focus on table-cell text (the original Q-07 evidence
   was tabular-numeral letter-spacing drift).
2. Compute per-cell tracking-attributable drift by isolating
   table-cell regions in the heat-NNN.png artefacts.
3. If drift is visible and tracking-attributable, file the
   renderer fix at `crates/paged-text/src/shape.rs` (tracking
   application path).
4. If drift is within threshold, document Q-07 closed in
   `findings-cycle4/q07-closed.md`.

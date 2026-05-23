# Cycle 8 Track 3 — layer-z fix spillover across the corpus

After landing the Tracks 1+2 fix (Q-10 layer-z sort flipped from
descending to ascending), re-ran `corpus/envato/test.sh` across all
61 packs. The fix is **structural** — affects every pack with
multi-layer page-items — and produces broad spillover.

## Spillover on the 12 table-bearing packs (cycle 4 Track 1 baseline)

```
pack                                                cycle3    cycle8   delta
event-program-brochure                               36.02      7.95   -28.07
hr-employee-handbook                                 28.98      7.02   -21.96
company-profile-template                             29.53      8.34   -21.19    ← Track 1+2 target
magazine-editorial-layout                            20.41      9.25   -11.16
annual-report                                        14.40      7.10    -7.30
digital-bridesmaid-planner-template                  11.12      4.45    -6.67
capability-statement-brochure                        13.17      7.04    -6.13
project-competitor-analysis-template                 10.60      7.77    -2.83
employment-application                                2.55      2.40    -0.15
real-estate-brochure                                 11.17     11.10    -0.07
annual-report-template                               69.18     69.18    +0.00
annual-report-template-8b5d40                        23.11     23.28    +0.17
```

Cumulative ΔE reduction on these 12 packs: **−105 ΔE**. The biggest
single-pack improvement (`event-program-brochure`, −28.07) is
larger than the target pack's. The fix was the right diagnosis:
**every multi-layer Envato pack with bottom-layer items
declared first in the designmap** was affected by the cycle-2 Q-10
sort direction.

## Corpus-wide impact

```
metric             cycle 4 (Track 1)   cycle 8
median (n=61)             11.10           7.77
mean (n=61)               14.55          10.19
```

**−3.33 ΔE median, −4.36 ΔE mean** across the entire 61-pack
corpus. This is the largest cycle-on-cycle improvement since
cycle 2-3 (when the table renderer + image-decode work landed).

## What didn't move

Two packs stayed put:
- `annual-report-template` (69.18): cycle-3 Track 1 diagnosed this
  as a cover JPEG decode issue (the `annual-report-template` cover
  is RGB, not CMYK; cycle-3's Track 1a fixed the streaming-decode
  path but the residual is from font substitution + page-layout
  drift, not layer-z).
- `annual-report-template-8b5d40` (+0.17): rounding-noise level
  movement. This pack's deltas are dominated by font substitution.

## Top remaining offenders (cycle-8 end)

```
pack                                             mean_de
annual-report-template                             69.18  (cover JPEG)
fitness-protein-powder-business-card-templates     55.28
wedding-newspaper                                  27.17
annual-report-template-8b5d40                      23.28
high-quality-brand-guideline-template              21.80
soccer-career-flyer-templates                      17.66
hair-stylist-brochure-vol-3                        16.24
brand-guideline-template                           15.42
brochure                                           14.81
catalog                                            13.68
```

These are the cycle-9 investigation candidates. The methodology
(heatmap → spread XML → root-cause hypothesis) carries forward —
each pack should be analyzable in 1-2 hours.

## Verification

- `cargo test --workspace`: 418/418 (incl. the updated Q-10 test)
- `corpus/generated/diff.sh`: 12/12 within pixel-fidelity tolerance
- `corpus/envato/breaks-gate.sh`: 12/12 within break thresholds
- `corpus/generated/breaks-diff.sh`: self-diff PASS (new
  text-letterspacing fixture's 26-line snapshot unchanged)

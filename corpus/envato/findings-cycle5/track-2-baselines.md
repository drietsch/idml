# Cycle 5 Track 2 — body-text Envato pack baselines

Wired `breaks-gate.sh` to consume the per-pack font-sub convention at
`corpus/envato/overrides/<pack>/fonts.sh` (falling back to
`overrides/_default/fonts.sh`), then pinned baselines for the 8
LetterSpacing packs identified by the cycle-5 pre-audit + `newspaper`
(which already had explicit overrides).

## Manifest schema extension

`break-thresholds.json` fixtures now accept one of two shapes:

```json
// Generated fixture (cycle 4)
{ "name": "...", "candidate_idml": "corpus/generated/<n>.idml",
  "reference_pdf": "corpus/generated/<n>.pdf",
  "font": "corpus/fonts/<n>.ttf",
  "thresholds": { ... } }

// Envato pack (cycle 5+)
{ "name": "...", "pack": "<envato-pack-name>",
  "thresholds": { ... } }
```

For `pack` entries, `breaks-gate.sh` derives the IDML / PDF / font
flags from `corpus/envato/packs/<pack>/{template.idml, reference.pdf}`
+ the override sidecar. Mirrors the convention `corpus/envato/test.sh`
already uses.

## Pinned baselines

```
pack                                               cand    ref    Δl   wrate   drift99
newspaper                                          1077   1558   481   0.001   795.9
newspaper-template                                 1667   2155   488   0.009   662.8
newspaper-newsletter-layout                         396    437    41   0.003   519.0
wedding-newspaper                                   191    266    75   0.005   806.9
annual-report-template-8b5d40                       536    703   167   0.021   505.1
business-magazine-template                          929   1344   423   0.003   439.3
company-profile-template                            722   1034   312   0.008   532.7
food-cooking-magazine-template                      510    543    63   0.000   633.7
square-catalog-brochure-template                    442    523    85   0.093   468.1
```

## What the baselines mean

These are **noisy**. The metric was designed for tight candidate-vs-
reference comparison on the generated fixtures (where the renderer
and InDesign produce nearly-identical line geometry). On real
multi-page packs the candidate side has structural divergences from
the reference that overwhelm the Q-20-relevant per-line wrap signal:

- **Image-bearing frames**: the renderer skips or placeholders some
  embedded images; pdftotext reads any text baked into those images
  as "lines". Either side has phantom lines.
- **Master spreads**: spreads that the renderer routes differently
  vs InDesign's body-flow.
- **Page alignment**: the per-page first-line-anchored baseline
  offset doesn't cancel when the candidate's stories land on
  different pages than the reference's.

Concretely: `newspaper` has 481 lines of delta out of 1558 — ~31%
of the pack's lines don't pair up. The Q-20 signal (a paragraph
re-wrapping from 4 lines to 3 because of a letter-spacing budget
tweak) is buried inside that 31%.

## Implications for Track 3

Calibration sensitivity on these packs is poor today. A 1-line wrap
change on one body paragraph moves `line_count_delta_sum` by 1 against
a baseline of 481 — well below the threshold's 25% headroom (600).
Two paths forward:

1. **Story-/page-range filtering**: extend `--emit-breaks` to take an
   optional `--story-id` or `--page-range` argument so the harness
   can isolate a body-text paragraph and compare only that segment.
   Tighter signal, less noise.
2. **Pair-quality weighting**: in `breaks-compare.py`, only count
   line pairs whose first/last words actually match against the
   metric. Currently every pair contributes to baseline_drift /
   word_match — a strict-pairs-only mode would surface real
   wrap-decision shifts.

Track 3 attempts the calibration despite the noise; if no signal
shifts (likely), 1 or 2 above become the cycle-6 carry-over.

## What's still gated

All 11 fixtures pass `breaks-gate.sh` at cycle-5 end:

- 2 generated (text, text-advanced)
- 9 Envato packs (the 8 LetterSpacing-customising packs + newspaper).

The thresholds are conservative regression nets: any change that
*doubles* `line_count_delta_sum` or *triples* `baseline_drift_pt_p99`
on these packs is caught.

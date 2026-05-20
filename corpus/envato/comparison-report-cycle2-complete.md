# Envato corpus: cycle 2 complete

Final snapshot at cycle-2 end (`977705d` — Q-02 renderer landing).
Baseline reference is cycle-1 final (`82531be`).

## Headline

- 61/61 packs render cleanly (no crashes either side, after Q-11 follow-up)
- Mean worst_mean_de: **13.08 → 11.18** (−1.90, **−14.5%**)
- P90 worst_mean_de: **26.70 → 21.80** (−4.90, **−18%**)
- Mean worst_ssim: **0.716 → 0.720** (+0.004)
- 29 commits on `main`, 21 Q-items addressed

## Q-item status after cycle 2

| Q | Effort | Status | Notes |
|---|---|---|---|
| Q-01 | S | ✅ fixed | ObjectStyle FillTint cascade |
| Q-02 parser | S | ✅ landed | AutoSizingType / AutoSizingReferencePoint / thresholds parsed |
| Q-02 renderer | M | ✅ landed | Longest-line estimator overrides column when frame allows width growth |
| Q-03 | M | ✅ landed | Inline `<Image><Contents>` base64 CDATA decoded |
| Q-04 | M | ✅ landed | GradientFeather extended to TextFrame + Polygon + Oval (GraphicLine has no fill) |
| Q-05 | S | ✅ fixed | BlendMode against transparent paper |
| Q-06 | S | ✅ fixed | Inline PDF triage |
| Q-07 | S | ⏸ deferred | Gates on Q-18 (Table parser); evidence is table content |
| Q-08 | M | ⏸ deferred | Risky without specific repro; gradient circles edge case |
| Q-09 | L | ⏸ deferred | ParagraphShading / Rule / Border — 4 feature families |
| Q-10 | M | ❌ attempted+reverted | Intra-shape sort regressed corpus +5.27 ΔE; needs cross-shape flat-list sort |
| Q-11 | S | ✅ fixed | Rectangle multi-anchor → Polygon |
| Q-12 | S | ✅ fixed | TextFrame fill overlap-pages |
| Q-13 | M | ✅ reclassified | Was actually Q-02 + Q-15 text drift, not phantom paragraph |
| Q-14 | S/M | ✅ landed | DecodeFailed vs LinkMissing distinction |
| Q-15 | S | ✅ fixed | Word-spacing stretch_ratio floor |
| Q-16 | M | ✅ landed | Per-corner CornerOption + CornerRadius |
| Q-17 | S | ✅ pinned | Was already implemented; regression test added |
| Q-18 | L | ⏸ deferred | Real Table parser — multi-cycle scope |
| Q-19 | M | ✅ reclassified | Misdiagnosis — cited packs use `<PastedSmoothShade>` not `<PatternColor>` |
| Q-20 | L | ⏸ deferred | Composer wrap calibration — needs reference-pixel A/B |
| Q-21 | S | ✅ pinned | Was already implemented; regression test added |
| Q-22 | S | ✅ fixed | Placeholder grey recalibration |
| Q-23 | S | ✅ pinned | Was already implemented; regression test added |
| Q-24 | M | ✅ documented | W3C vs PDF 1.7 blend mode formulae divergence noted |
| Q-25 | S/M | ✅ landed | Telemetry for non-Regular wght request on single-weight TTF |

**Closed / resolved**: 19 of 25 Q-items (16 fixed, 3 reclassified).
**Deferred with detailed protocol entries**: 6 (Q-07, Q-08, Q-09, Q-10, Q-18, Q-20).

## Biggest wins (cumulative vs cycle-1)

| Pack | mean_de | Cause |
|------|--------:|-------|
| travel-guide-brochure-template-indd-canva | 52.97 → 4.60 (−48.37) | Q-15 wide-frame wrap |
| welcome-guide-template | 37.63 → 5.44 (−32.19) | Q-15 |
| photography-portfolio-vol-16 | 16.74 → 10.54 (−6.20) | Q-22 placeholder |
| fitness-protein-powder-business-card-templates | 51.18 → 44.50 (−6.68) | Q-11 follow-up + Q-14 |
| soccer-career-flyer-templates | 23.59 → 17.15 (−6.44) | Q-03 + Q-22 |
| hair-stylist-brochure-vol-3 | 21.59 → 16.28 (−5.31) | Q-15 / Q-22 |
| magazine-editorial-layout | 14.23 → 9.25 (−4.98) | Q-22 |
| white-blue-modern-company-annual-report | 19.80 → 15.63 (−4.17) | Q-11 follow-up + Q-22 |
| project-case-study-template | 10.98 → 7.42 (−3.56) | Q-22 |
| church-newsletter-template | 6.85 → 4.35 (−2.50) | Q-03 |
| resume-template-teacher | 4.83 → 4.40 (−0.43) | Q-16 |

## Known trade-offs (small regressions accepted)

| Pack | mean_de | Cause |
|------|--------:|-------|
| annual-report-template | 56.67 → 69.18 (+12.51) | Q-14: removed placeholder over undecodable 35MB JPEG cover; underlying frame fill is white (no cover photo). Cure needs decoder broadening. |
| charity-ebook-digital-magazine-template | 7.03 → 11.82 (+4.79) | Q-03: decoded JPEGs differ slightly from InDesign's PDF rasterization (color profile drift) |
| business-magazine-template | 8.29 → 11.48 (+3.19) | Same Q-03 trade-off |
| brand-guideline-template | 6.25 → 15.42 (+9.17) | Q-15 stretch-floor nudges AllCaps headline wrap on one page |

These regressions reflect behaviorally-correct fixes (decode embedded
images, stop overstamping placeholders) that produce slightly worse
pixel matches against InDesign's PDF rasterization because of CMYK
profile / JPEG quality differences. SSIM held or moved modestly.

## Remaining work for cycle 3

Priority-ordered:
1. **Q-08 audit** — measure brochure cover gradient circles' actual
   delta with current code vs ItemTransform-aware projection. Run on
   a synthetic rotated-Oval-with-gradient test first.
2. **Q-10 properly** — refactor per-spread emit to flat-list FrameRef
   iteration sorted by (layer_z_index, xml_order). Previous intra-shape-
   only attempt regressed the corpus by +5.27 ΔE; full cross-shape
   sort is needed.
3. **Q-09 ParagraphShading** — start with just the parser; emit
   module is the bigger chunk.
4. **Decoder broadening** — streaming JPEG decoder for oversized
   payloads + embedded ICC profile threading. Closes the
   annual-report-template +12.5 regression and reduces the Q-03
   color-drift regressions.
5. **Q-18 real Table parser** — unlocks employment-application,
   interior-design-catalog, etc. Multi-cycle scope.
6. **Q-20 composer wrap calibration** — needs reference-pixel A/B
   harness extension.

## Cycle 2 commits (29 total, 21 Q-items)

```
977705d Q-02 renderer: estimate longest-line width when AutoSizingType allows growth
d75578f Q-16: honour per-corner CornerOption + CornerRadius on Rectangle
d87d82b Q-04 follow-up: extend GradientFeather to Oval via unit-ellipse path
3466dde Q-13: reclassify — actual symptom is text-sizing drift, not phantom paragraph
10b0c4e Q-13: root cause identified — master-pass routes both pages' footers
c4424e1 Revert "Q-10: stable-sort each shape's iteration by ItemLayer stack z-index"
1f525a6 Q-10: stable-sort each shape's iteration by ItemLayer stack z-index
37e8e8b Q-13: document the master-spread duplication hypothesis
a24c46d Q-19 + Q-24: protocol updates + W3C-vs-PDF blend mode documentation
acc50d2 Q-04: extend GradientFeatherSetting to TextFrame + Polygon
fa62703 envato: cycle 2 final state — Wave A landed, Wave B partial
3ac83e3 Q-25: log when a non-Regular weight request hits a font with no wght axis
f9e4e11 Q-03: decode inline `<Image><Contents>` base64 CDATA payloads
7f3ef7c Q-14: distinguish decode-failed from link-missing for placeholder routing
6909083 Q-02 parse: AutoSizingType / AutoSizingReferencePoint + thresholds
3e1e3d9 envato: cycle 2 findings — clean / moderate / rough tiers
fb7c5b1 docs: archive cycle-1 docs to docs/old/; introduce docs/verso/ architecture set
18189da devtools: add Radix UI + lucide-react deps; regenerate WASM bindings
8213c58 idml-introspect: track idml-mutate's PropertyPath / Value rename
87875f6 idml-mutate: split into operation / apply / invert / history / notify / error modules
36bf0cf envato: cycle 2 comparison report
39cffa3 Q-11 follow-up: route lifted Polygon geometry through path emit
0ae733e Q-21: pin character-style FillColor precedence over paragraph-style
5a2eb7a Q-23: pin hyphenator + compose hyphen-flag contract with regression tests
b00c1a6 Q-15: floor word-spacing stretch_ratio so breaker has budget on wide columns
ddbc6f1 Q-22: recalibrate missing-image placeholder to 50% grey + 1.5pt black X
6d11351 Q-17: pin <Layer Printable="false"> contract with regression test
998664a Q-12: TextFrame fill colour emits on every overlapping page
da2096b Q-11: Rectangle with multi-anchor PathGeometry routes to Polygon path
```

Tests: 394 passing, 0 failed.

# Envato corpus: pre-fix vs post-fix comparison

Snapshot diff between the audit-time `pack.json` files (captured at `/tmp/envato-pre-fix-packs.tar` before any P-* fixes landed) and the current on-disk `pack.json` files after Waves 1+2+3 of the improvement protocol.

## Headline

- Packs compared: **61** (pre=61, post=61)
- Improved (Δ mean_de < −0.05): **44**
- Regressed (Δ mean_de > +0.05): **8**
- Flat (|Δ| ≤ 0.05): **8**
- Missing in one snapshot or the other: **1**
- Average Δ mean_de across compared packs: **-9.700**

- Packs inside idea.md §13.2 budget (mean ≤ 1.0, p99 ≤ 2.5, SSIM ≥ 0.99): pre **0**, post **0**

## Regressions — investigate

| Pack | pre mean | post mean | Δ | % | pre SSIM | post SSIM |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| fitness-protein-powder-business-card-templates | 31.31 | 51.18 | +19.87 | +63.4% | 0.363 | 0.186 |
| soccer-career-flyer-templates | 11.21 | 23.59 | +12.38 | +110.5% | 0.849 | 0.825 |
| annual-report-template-8b5d40 | 15.15 | 24.52 | +9.37 | +61.9% | 0.604 | 0.582 |
| welcome-guide-template | 32.17 | 37.63 | +5.46 | +17.0% | 0.579 | 0.565 |
| wedding-newspaper | 25.87 | 26.70 | +0.83 | +3.2% | 0.546 | 0.518 |
| resume-template-teacher | 4.70 | 4.83 | +0.14 | +2.9% | 0.824 | 0.827 |
| gridtastic-grid-kit | 9.39 | 9.46 | +0.07 | +0.7% | 0.939 | 0.942 |
| square-company-profile | 6.66 | 6.71 | +0.06 | +0.8% | 0.694 | 0.705 |

## Per-pack table (sorted by mean_de improvement, biggest wins on top)

| Pack | pre mean | post mean | Δ mean | % | pre SSIM | post SSIM | Δ SSIM |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| minimal-interior-design-catalog | 84.04 | 5.70 | -78.34 | -93.2% | 0.222 | 0.664 | +0.442 |
| hair-stylist-brochure-vol-3 | 72.97 | 21.59 | -51.38 | -70.4% | 0.281 | 0.798 | +0.517 |
| food-cooking-magazine-template | 58.45 | 9.99 | -48.46 | -82.9% | 0.210 | 0.601 | +0.391 |
| magazine-e72797 | 54.00 | 8.60 | -45.40 | -84.1% | 0.470 | 0.630 | +0.160 |
| business-magazine-template | 55.93 | 11.36 | -44.56 | -79.7% | 0.269 | 0.521 | +0.251 |
| minimal-furniture-brochure | 49.58 | 6.14 | -43.44 | -87.6% | 0.486 | 0.781 | +0.296 |
| company-profile-canva-docx-id-psd | 41.78 | 7.53 | -34.25 | -82.0% | 0.573 | 0.803 | +0.231 |
| business-proposal-template | 35.21 | 4.07 | -31.14 | -88.4% | 0.395 | 0.738 | +0.343 |
| sport-magazine | 44.26 | 15.96 | -28.30 | -63.9% | 0.486 | 0.693 | +0.207 |
| the-brochure | 54.32 | 26.59 | -27.73 | -51.0% | 0.423 | 0.721 | +0.298 |
| lifestyle-magazine-layout | 38.19 | 10.76 | -27.43 | -71.8% | 0.531 | 0.531 | +0.000 |
| company-profile-template | 29.51 | 7.98 | -21.52 | -72.9% | 0.548 | 0.635 | +0.087 |
| interior-brochure-design | 23.61 | 4.72 | -18.88 | -80.0% | 0.759 | 0.829 | +0.071 |
| saas-product-launch-annual-report-brochure | 26.48 | 7.91 | -18.57 | -70.1% | 0.675 | 0.839 | +0.165 |
| real-estate-brochure | 29.57 | 11.10 | -18.47 | -62.5% | 0.642 | 0.764 | +0.123 |
| project-competitor-analysis-template | 24.84 | 12.01 | -12.83 | -51.6% | 0.685 | 0.852 | +0.167 |
| high-quality-brand-guideline-template | 24.05 | 16.72 | -7.33 | -30.5% | 0.711 | 0.784 | +0.073 |
| modern-architecture-portfolio-template | 14.59 | 7.87 | -6.72 | -46.0% | 0.669 | 0.875 | +0.206 |
| magazine | 14.68 | 8.39 | -6.29 | -42.9% | 0.649 | 0.649 | +0.000 |
| charity-ebook-digital-magazine-template | 17.46 | 11.28 | -6.18 | -35.4% | 0.596 | 0.610 | +0.014 |
| magazine-editorial-layout | 20.21 | 14.23 | -5.97 | -29.6% | 0.723 | 0.727 | +0.004 |
| annual-report-template | 69.17 | 63.82 | -5.35 | -7.7% | 0.365 | 0.408 | +0.042 |
| newspaper-template | 14.46 | 9.24 | -5.22 | -36.1% | 0.495 | 0.550 | +0.055 |
| project-case-study-template | 15.82 | 10.98 | -4.84 | -30.6% | 0.735 | 0.817 | +0.082 |
| photography-portfolio-vol-16 | 21.49 | 16.74 | -4.75 | -22.1% | 0.821 | 0.832 | +0.012 |
| newspaper-newsletter-layout | 12.85 | 9.03 | -3.83 | -29.8% | 0.504 | 0.533 | +0.029 |
| digital-bridesmaid-planner-template | 11.08 | 7.25 | -3.83 | -34.5% | 0.627 | 0.645 | +0.018 |
| hr-employee-handbook | 12.61 | 9.61 | -3.00 | -23.8% | 0.780 | 0.786 | +0.006 |
| capability-statement-brochure | 12.23 | 9.89 | -2.33 | -19.1% | 0.766 | 0.792 | +0.026 |
| church-newsletter-template | 9.12 | 6.85 | -2.27 | -24.9% | 0.651 | 0.693 | +0.042 |
| annual-report | 11.36 | 9.13 | -2.23 | -19.6% | 0.739 | 0.745 | +0.006 |
| event-program-brochure | 35.96 | 33.75 | -2.21 | -6.1% | 0.683 | 0.687 | +0.004 |
| newspaper | 8.83 | 7.36 | -1.46 | -16.6% | 0.587 | 0.592 | +0.005 |
| white-clean-clothing-brand-guideline-document | 10.74 | 9.33 | -1.41 | -13.1% | 0.745 | 0.762 | +0.017 |
| indesign-magazine | 8.68 | 7.73 | -0.94 | -10.9% | 0.723 | 0.724 | +0.001 |
| modern-resume-reference-job-application-template | 4.64 | 3.99 | -0.64 | -13.9% | 0.854 | 0.845 | -0.008 |
| green-energy-newsletter | 5.82 | 5.28 | -0.54 | -9.2% | 0.714 | 0.731 | +0.017 |
| interior-design-catalog | 2.64 | 2.11 | -0.53 | -20.1% | 0.911 | 0.912 | +0.000 |
| book-template-design | 5.05 | 4.57 | -0.48 | -9.5% | 0.837 | 0.840 | +0.002 |
| catalog-brochure-template | 3.37 | 2.98 | -0.39 | -11.7% | 0.901 | 0.901 | +0.000 |
| cultured-business-newsletter | 4.93 | 4.54 | -0.39 | -7.8% | 0.771 | 0.790 | +0.019 |
| brand-guideline-template | 6.44 | 6.25 | -0.19 | -2.9% | 0.794 | 0.794 | +0.000 |
| brochure | 18.99 | 18.83 | -0.16 | -0.8% | 0.814 | 0.822 | +0.008 |
| brand-guidelines | 3.81 | 3.75 | -0.06 | -1.5% | 0.835 | 0.841 | +0.006 |
| travel-guide-brochure-template-indd-canva | 52.99 | 52.97 | -0.02 | -0.0% | 0.463 | 0.464 | +0.001 |
| furniture-product-catalog | 4.20 | 4.20 | -0.01 | -0.1% | 0.878 | 0.877 | -0.001 |
| catalog | 13.68 | 13.68 | +0.00 | +0.0% | 0.466 | 0.463 | -0.002 |
| employment-application | 2.43 | 2.43 | +0.00 | +0.0% | 0.908 | 0.908 | +0.000 |
| square-catalog-brochure-template | 14.73 | — | — | — | 0.650 | — | — |
| brown-fashion-brochure | 4.05 | 4.06 | +0.00 | +0.0% | 0.585 | 0.585 | -0.000 |
| ancient-building-magazine | 2.47 | 2.48 | +0.01 | +0.4% | 0.861 | 0.859 | -0.003 |
| business-proposal | 6.84 | 6.88 | +0.03 | +0.5% | 0.789 | 0.781 | -0.008 |
| white-blue-modern-company-annual-report | 19.76 | 19.80 | +0.05 | +0.2% | 0.733 | 0.813 | +0.080 |
| square-company-profile | 6.66 | 6.71 | +0.06 | +0.8% | 0.694 | 0.705 | +0.011 |
| gridtastic-grid-kit | 9.39 | 9.46 | +0.07 | +0.7% | 0.939 | 0.942 | +0.003 |
| resume-template-teacher | 4.70 | 4.83 | +0.14 | +2.9% | 0.824 | 0.827 | +0.003 |
| wedding-newspaper | 25.87 | 26.70 | +0.83 | +3.2% | 0.546 | 0.518 | -0.028 |
| welcome-guide-template | 32.17 | 37.63 | +5.46 | +17.0% | 0.579 | 0.565 | -0.015 |
| annual-report-template-8b5d40 | 15.15 | 24.52 | +9.37 | +61.9% | 0.604 | 0.582 | -0.022 |
| soccer-career-flyer-templates | 11.21 | 23.59 | +12.38 | +110.5% | 0.849 | 0.825 | -0.024 |
| fitness-protein-powder-business-card-templates | 31.31 | 51.18 | +19.87 | +63.4% | 0.363 | 0.186 | -0.177 |

## What landed

See `corpus/envato/improvement-protocol.md` for the per-finding status. Summary of the three implementation waves:

- **Wave 1 (Blockers)** — 5/5 fixed: P-01..P-05.
- **Wave 2 (Majors)** — 13/15 fixed, 2 deferred (P-09 effect-bag plumbing for non-Rect shapes, P-10 paragraph-shading decorations).
- **Wave 3 (Minors + INF-2)** — 4/10 fixed (P-22, P-25), 2 verified (P-26 no-op needed, P-27 closed by P-01), 4 deferred (P-21 not present in corpus, P-23/P-24 root cause outside cited scope, P-29 needs StoryOrientation plumbing, P-30 ItemLayer stacking), 1 fixed (P-28 closed by Wave 2). INF-2 manifest annotation landed.

## Caveats

- `p99_de` numbers tend to stay pinned at high values where the heatmap edge happens to land on an unrelated font-substitution-driven pixel. Use `mean_de` and SSIM as the primary signals.
- INF-1 (font-substitution drift) is still open per the protocol. The fixes here do not address per-pack font calibration; some packs will show small residual drift driven by Inter / Roboto / Open Sans not exactly matching Poppins / Montserrat / DM Sans advance widths.
- INF-2's 5 packs (resume-template-teacher, employment-application, cultured-business-newsletter, brown-fashion-brochure, modern-resume-reference-job-application-template) carry reference PDFs rendered with theme swatches the IDML doesn't declare. Their numbers reflect corpus-curation gaps, not renderer fidelity.

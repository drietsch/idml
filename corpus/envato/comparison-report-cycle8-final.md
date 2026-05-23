# Envato corpus: cycle 8 final

Snapshot at cycle-8 end (`4daa1da` — Track 3 spillover findings).
Baseline reference is cycle-7 final (`c6b0fa0`). Plan companion:
[`docs/verso/cycle-8-plan.md`](../../docs/verso/cycle-8-plan.md).

## Headline

- 12/12 generated fixtures pass `corpus/generated/diff.sh`.
- 12/12 break-decision fixtures pass `breaks-gate.sh`.
- 1/1 self-diff fixtures pass `breaks-diff.sh`.
- 418/418 workspace tests passing.
- **6 commits** for cycle 8: 1 plan + 4 track commits + final report.
- **First material per-pack ΔE delivery since cycle 3.**
  Median (n=61) 11.10 → 7.77 (-3.33); mean 14.55 → 10.19 (-4.36).

## Track status

| Track | Status | Commit |
|---|---|---|
| 1 — Diagnose page-routing | ✅ landed | `bb12410` (combined w/ 2) |
| 2 — Fix the routing bug | ✅ landed | `bb12410` |
| 3 — Sweep across body packs | ✅ landed | `4daa1da` |
| 4 — Tighten LS fixture column | ✅ landed | `39c1380` |

## Track-by-track summary

### Tracks 1+2 — Q-10 layer-z sort flipped (bb12410)

Cycle 7 Track 3's "image-bearing Rectangle page-routing"
hypothesis was *almost* right — the diagnostic flag added in Track
1a (`--trace-routing` on `idml-inspect`) confirmed the rect was
correctly routed onto page 20. The actual bug was downstream in
z-order: cycle-2's Q-10 commit had assumed IDML designmap
ordering put the TOP layer first (`designmap[0] = topmost`),
sorted descending so high-index layers painted first.

Real-world IDMLs use the **opposite** convention: `designmap[0]`
= BOTTOM layer (paints first). Verified on
`company-profile-template` where the designmap is
`[Bg, Image, Text]` and the reference PDF shows Bg at the bottom
of the canvas, Image in the middle, Text on top — matching
ascending-by-layer-z order, not descending.

Flipping the sort moved `company-profile-template` from
**mean ΔE 29.53 → 8.34 (-21.19)**, plus broad spillover (see
Track 3). The cycle-2 Q-10 synthetic test was updated to match
the corrected convention (Back layer declared first in designmap).

### Track 3 — Corpus-wide spillover (4daa1da)

Re-ran `corpus/envato/test.sh` across all 61 packs:

| Group | cycle-7 end | cycle-8 end | Δ |
|---|---:|---:|---:|
| Table-bearing (n=12) median | 20.41 | 7.36 | -13.05 |
| Non-table (n=49) median | 11.10 | ~7.7 | -3.4 |
| Corpus median (n=61) | 11.10 | 7.77 | **-3.33** |
| Corpus mean | 14.55 | 10.19 | **-4.36** |

Cumulative ΔE saved on the 12 table-bearing packs alone: −105.
Largest cycle-on-cycle improvement since cycle 2-3.

The Q-10 layer-z sort affected EVERY pack with multi-layer
items — not just the company-profile-template that surfaced it.
Eight body-text-heavy packs each moved by 6-28 ΔE.

### Track 4 — text-letterspacing column 200pt → 150pt (39c1380)

Cycle 7 noted the 200pt column was wide enough that the LS budget
never decided breaks. Narrowing to 150pt produces 13 lines per
page with widths near the column boundary [127, 151] pt — a more
sensitive layout.

Q-20 sensitivity proof still elusive: control vs tuned produce
identical breaks even at 150pt because the default word-spacing
shrink budget (0.20) absorbs the small shrink needed. The
fixture-shape refinement to FORCE Q-20 sensitivity — a
paragraph with `MinimumWordSpacing=DesiredWordSpacing=MaximumWordSpacing=100`
so word-space provides no fitting tool — deferred to cycle 9.

## Cycle-8 commit list

```
4daa1da cycle-8 Track 3: layer-z fix spillover — −4.36 ΔE corpus-wide
bb12410 cycle-8 Tracks 1+2: flip Q-10 layer-z sort; cpt mean ΔE 29.5 → 8.3
39c1380 cycle-8 Track 4: tighten text-letterspacing fixture column 200pt → 150pt
2842a80 docs: cycle-8 plan covering 4 tracks
```

## What cycle 9 should pick up

Top remaining offenders (cycle-8 end), in rough priority order:

1. **annual-report-template (69.18)** — cycle-3 diagnosed as cover
   JPEG decode plus font-substitution drift. Now that the layer-z
   fix is in place, re-investigate; possibly the cover image's
   actual content + the new font sub overrides combine to a
   different residual.

2. **fitness-protein-powder-business-card-templates (55.28)** —
   not previously surfaced as a top offender. Worth a heatmap pass
   to identify whether it's image-routing, font-sub, or text-wrap
   dominated.

3. **wedding-newspaper (27.17)** — heavy editorial layout, was
   already a LetterSpacing pack. Likely combination of font sub +
   composer drift on body text.

4. **high-quality-brand-guideline-template (21.80)** — new top-10
   entrant after the layer-z fix removed the bigger movers above
   it. Investigate.

5. **Q-20 sensitivity fixture refinement** — make
   `text-letterspacing` actually surface Q-20 calibration shifts.
   Set `Min=Desired=Max WordSpacing` to leave no word-space budget,
   forcing LS to be the deciding factor. Then Q-20 calibration
   rounds become productive.

6. **Hold the deferred-tracks line** — Tracks 3/4b/5a/5b from
   cycles 3-4 still have zero corpus exercise. Don't reopen.

## Cycles 6+7+8 retrospective

Three cycles, three outcomes:
- Cycle 6: built sensitivity tooling (filters / strict-pairs / Q-20
  formula reshape) — no per-pack ΔE delivery.
- Cycle 7: focused-fixture infrastructure + drop-cap text fix
  + identified the page-routing finding — no per-pack ΔE delivery.
- Cycle 8: **delivered −4.36 mean / −3.33 median ΔE corpus-wide**.

The infrastructure cycles preceded the impact cycle. That's how
this kind of work progresses: build the diagnostic capability,
use it to find a high-leverage root cause, then ship the fix.
The cycle-7 Track 3 investigation produced the smoking gun; the
cycle-8 trace + sort flip turned it into corpus delivery.

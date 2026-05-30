# Cycle 8 plan — parser / renderer

Companion to `corpus/envato/comparison-report-cycle7-final.md`.
Cycles 6+7 built sensitivity tooling and a focused-fixture harness
but didn't deliver per-pack ΔE reductions. Cycle 7 Track 3 surfaced
the **first concrete corpus-moving finding** since cycle 3: image-
bearing Rectangle page-routing on `company-profile-template` page 20
puts an image rect's effective placement off-page in the candidate
while InDesign renders it on-page. The top-4 pages cumulatively
account for ~50% of the pack's ΔE budget.

Cycle 8's primary goal: **land the first material ΔE movement** by
fixing the routing bug and quantifying the spillover.

## Sequencing

```
Week 1   [diagnosis + fix]
  ├─ Track 1: Diagnose company-profile-template page-routing
  └─ Track 2: Fix the routing bug + verify ΔE move

Week 2   [breadth]
  ├─ Track 3: Sweep the fix across other LetterSpacing packs
  └─ Track 4: Calibration-sensitivity fixture tightening

Week 2-3 [closeout]
  └─ Cycle-8 comparison report
```

Track 1 has to land before Track 2; the rest can run as parallel
sub-agents once Track 2 confirms the fix shape.

---

## Track 1 — Diagnose `company-profile-template` page-routing

**Goal:** confirm cycle-7's hypothesis. The image rect at
`Spreads/Spread_u114.xml` (Self="ubb6b") with
`ItemTransform="1 0 0 1 9.5 -4301.6"` belongs on page 20 per
InDesign but the candidate doesn't route it there.

### 1a. Instrument page-routing

Add a `--trace-routing <story_or_self_id>` tracing flag on
`idml-inspect` (mirroring cycle-6 Track 1's break filters): when
set, emit `tracing::debug!(target = "idml_renderer::routing", …)`
each time a page-item's target page is selected. Captures the rect's
spread-coord center, each candidate page's bounds, and the chosen
page (or rejection reason).

**Files:** `crates/idml-renderer/src/pipeline.rs` (instrumentation
at the page-routing site, ~lines 814-832 from cycle-7's trace),
`crates/idml-renderer/src/bin/inspect.rs` (CLI flag).
**Effort:** S (2-3 hours).

### 1b. Reproduce + capture trace

Run `idml-inspect --trace-routing ubb6b
corpus/envato/packs/company-profile-template/template.idml`,
capture output, save to
`corpus/envato/findings-cycle8/track-1-routing-trace.md`.
Compare with InDesign's resolved page from the reference PDF
(page 20 has the placeholder tiles visible).

**Effort:** S (1 hour after 1a lands).

### 1c. Identify the routing-decision divergence

Likely culprits to verify:
- **Nested ItemTransform composition**: the Rectangle has
  `ItemTransform.ty = -4301.6`; the spread's Page has
  `ItemTransform="1 0 0 1 -612 -396"`. Confirm the rect's
  effective spread-coord origin against InDesign's expected
  placement.
- **Page-bounds containment**: the renderer's routing today
  may compare against the page's `GeometricBounds` (which can
  be 0 0 792 612 — letter portrait) without applying the
  page's own `ItemTransform` to remap to spread coords.
- **Pasteboard fallback**: when no page contains the rect's
  center, the renderer routes to the spread's first page. If
  this fallback fires for a rect that InDesign considers a
  bleed/pasteboard element on a different page, the candidate
  paints it on the wrong page.

**Effort:** S-M (half-day depending on which of the three is
the actual cause).

---

## Track 2 — Fix the routing bug + verify

**Goal:** with Track 1's diagnosis in hand, apply the targeted
fix. Verify on three axes:
1. `company-profile-template` mean ΔE drops materially
2. `corpus/generated/diff.sh` 12/12 holds (no regression on
   pixel-fidelity-pinned fixtures)
3. `breaks-gate.sh` 12/12 holds (no regression on break-
   decision-pinned fixtures)

### 2a. Targeted fix

Implementation depends on Track 1's findings. The cycle-7
hypothesis space (transform composition / bounds containment /
pasteboard fallback) suggests a narrow change at the page-routing
decision point, not a refactor.

**Effort:** S-M (half-day to one day).

### 2b. Re-run the envato gate

Verify `company-profile-template` moves from mean ΔE 29.5 to
~12-15 (cycle-7's quantitative estimate). Refresh pinned
baselines in `corpus/envato/break-thresholds.json` if the
break-decision metric shifts as a side effect.

**Effort:** trivial.

### 2c. Document the fix

`corpus/envato/findings-cycle8/track-2-routing-fix.md` —
before/after numbers + the specific transform-chain change.

### Expected impact

`company-profile-template`: **−10 to −15 mean ΔE** (cycle-7's
quantitative estimate). The fix lands as cycle 8's headline
deliverable.

---

## Track 3 — Sweep the fix across body packs

**Goal:** the routing bug is structural — likely affects every
pack with off-page-bounds image rects. Sweep the remaining
LetterSpacing packs to quantify spillover.

### 3a. Identify candidates

Re-run `corpus/envato/test.sh` against each of the 8 LetterSpacing
packs + the original cycle-7 target. Read per-page ΔE; flag pages
where the candidate shows large empty regions vs the reference's
filled content (indicative of routed-elsewhere image rects).

**Files:** scriptable via the existing test harness; no new code.
**Effort:** S (2-3 hours).

### 3b. Spot-check the fix on 2-3 highest-impact packs

Re-run the harness on the worst pages of `newspaper`,
`newspaper-template`, `wedding-newspaper`. Quantify pre/post ΔE
delta per pack.

**Files:** updates to per-pack pinned baselines in `pack.json`
files under `corpus/envato/reports/<pack>/`.
**Effort:** S (1-2 hours).

### 3c. Categorise spillover findings

`corpus/envato/findings-cycle8/track-3-spillover.md`. Even if
the spillover is small, the categorisation is useful — it tells
us whether the routing bug is the dominant remaining ΔE source
or just one of several.

### Expected impact

**−1 to −3 mean ΔE on 2-4 body packs.** If the routing fix
generalises broadly, the spillover could be larger.

---

## Track 4 — Calibration-sensitivity fixture tightening

**Goal:** cycle-7 Track 1 found the `text-letterspacing` fixture's
200pt column was wide enough that the natural breaks satisfied KP
without leaning on the LS budget. Narrow it so Q-20 calibration
actually surfaces metric movement on the self-diff harness.

### 4a. Tighten the fixture column

Edit `crates/idml-gen/src/samples/text_letterspacing.rs`:
- Reduce `FRAME_W_PT` from 200 to ~80pt
- Verify the new breaks still produce a reasonable line count
- Re-pin `corpus/generated/text-letterspacing.breaks.jsonl`

**Files:** `crates/idml-gen/src/samples/text_letterspacing.rs`,
`corpus/generated/text-letterspacing.breaks.jsonl`.
**Effort:** S (1-2 hours).

### 4b. Verify Q-20 sensitivity

Tweak `LS_BUDGET_PT_FOR_FULL_STRETCH` (cycle-6's 12.0 constant)
and verify the self-diff harness *now* shows metric movement on
the narrower fixture. Revert the tweak after verification (don't
ship a behaviour change in Track 4; just prove the harness has
the signal-detection capability cycle 6 promised).

**Effort:** S (1 hour).

### Expected impact

Metric-neutral on landing (the tighter fixture's baseline is just
re-pinned). Strategically valuable: unblocks productive Q-20
calibration rounds in cycle 9+.

---

## Closeout

- `corpus/envato/comparison-report-cycle8-final.md`.
- If Track 3 surfaces a clearly-quantifiable corpus-wide ΔE move,
  call out the cumulative number — first material ΔE delivery
  since cycle 3.

## Risk + estimate

- **Track 1** is contained diagnostic work. Risk: the routing
  bug may have a more invasive root cause than the hypothesis
  space suggests.
- **Track 2** is the cycle's load-bearing track. Mitigated by
  the 12/12 + 12/12 gate set — any fix that breaks them rolls
  back.
- **Track 3** is exploratory at the corpus scale. Each pack's
  spot-check is bounded.
- **Track 4** is independent + safe.

Total: ~1-2 weeks for one focused engineer.

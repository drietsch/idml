# Cycle 5 plan — parser / renderer

Companion to `corpus/envato/comparison-report-cycle4-final.md`.
Cycle 4 shipped the A/B harness end-to-end (Track 2a/2b/2c) but
deferred Q-20 calibration because the harness needed signal from
packs that customise composer spacing. Cycle 5 closes that loop.

Applies cycle 4's pre-audit lesson: spacing-customisation greps over
all 61 unpacked packs already done, calibration sub-corpus chosen
from the result.

## Sequencing

```
Week 1   [foundation]
  ├─ Track 1: Source-text plumbing for harness     ── tightens compare metric
  └─ Track 2: Body-text pack wiring                ── unblocks Q-20 signal

Week 2   [calibration]
  ├─ Track 4: Threshold expansion                  ── post-Track-2 baselines
  └─ Track 3: Q-20 calibration rounds              ── needs Track 2 signal

Week 2-3 [closeout]
  └─ Cycle-5 comparison report
```

Track 1 and Track 2 are independent and can run as parallel sub-agents.
Tracks 3 and 4 gate on Track 2 because they consume the body-text
baselines.

## Pre-audit findings (already done)

A spacing-customisation grep across all 61 unpacked packs identifies
the Q-20 calibration sub-corpus:

| Customisation | Packs | Notes |
|---|---:|---|
| Non-zero `Min/MaxLetterSpacing` | 8 | Q-20 calibration targets |
| Non-default `GlyphScaling` (≠100) | 0 | branch dead on this corpus — defer |
| `Min/MaxWordSpacing` customised | 61 | universal; Q-15 already covers |

The 8 LetterSpacing packs:

- `annual-report-template-8b5d40` (4 LS attrs)
- `business-magazine-template` (6)
- `company-profile-template` (4)
- `food-cooking-magazine-template` (14)
- `newspaper` (12) — has `corpus/envato/overrides/newspaper/fonts.sh`
- `newspaper-newsletter-layout` (14)
- `newspaper-template` (16)
- `square-catalog-brochure-template` (4)
- `wedding-newspaper` (20)

`newspaper` is the natural starting point because per-pack font subs
already exist; the other newspaper variants likely share font
families and can borrow the same overrides.

---

## Track 1 — Source-text plumbing for the A/B harness

**Goal:** the cycle-4 `word_match_rate_mean` metric is a loose
byte-span heuristic because `BreakRecord` only carries the
candidate's `(first_byte, last_byte)` paragraph-local offsets — no
actual text. `breaks-compare.py` can't do real first-word /
last-word matching against `pdftotext`'s output, so the metric is
mostly noise. Plumb the line's source text through so the metric
becomes meaningful.

### 1a. Add `source_text` to `BreakRecord`

- Extend the `BreakRecord` struct in
  `crates/idml-renderer/src/pipeline.rs` with `pub source_text:
  String`. Populate from each laid-out line's byte_range against
  the paragraph's resolved text. The text lives on `StyledRun`s
  threaded through `layout_runs`; the breaker already keeps the
  paragraph's concatenated text accessible.
- Gate the allocation on `collect_breaks` — production renders
  pay zero cost.

**Files:** `crates/idml-renderer/src/pipeline.rs`.
**Effort:** S (2-3 hours).

### 1b. Update `breaks-compare.py` to do real word matching

- Per matched line, compare candidate's `source_text` against
  the reference's `[first_word, …, last_word]` joined string.
  Score on first-word + last-word equality (lowercased,
  punctuation-stripped) instead of the byte-span heuristic.
- Hyphenation tolerance: if the candidate's last word ends in
  `-` and the reference's first word on the following line
  starts with the rest, count as match.

**Files:** `corpus/envato/breaks-compare.py`.
**Effort:** S (1-2 hours).

### Expected impact

`word_match_rate_mean` becomes a reliable signal (0..1 actual
first/last-word agreement) instead of the current heuristic. Lets
the Q-20 calibration in Track 3 actually use it.

---

## Track 2 — Body-text pack wiring through breaks-gate

**Goal:** make `breaks-gate.sh` consume the per-pack font-sub
convention from `corpus/envato/overrides/<pack>/fonts.sh` so the
calibration sub-corpus (the 8 LetterSpacing packs identified
above) can be pinned in `break-thresholds.json`.

### 2a. Manifest schema extension

- Extend `corpus/envato/break-thresholds.json` so a fixture can
  point at an Envato pack (`pack: "newspaper"`) instead of a
  generated IDML (`candidate_idml: "..."`). When the `pack` field
  is set, `breaks-gate.sh` derives `idml` / `pdf` / `font_flags`
  from `corpus/envato/packs/<pack>/template.idml` +
  `reference.pdf` + the override sidecar.

**Files:** `corpus/envato/break-thresholds.json`,
`corpus/envato/breaks-gate.sh`.
**Effort:** S (1-2 hours).

### 2b. Override-sidecar consumption

- `breaks-gate.sh` sources `corpus/envato/overrides/<pack>/fonts.sh`
  (falling back to `_default`) to populate `FONT_FLAGS` and
  `DEFAULT_FONT`, then invokes `idml-inspect` with those flags +
  `--emit-breaks`. Mirrors `corpus/envato/test.sh`'s existing
  font-sub flow.

**Files:** `corpus/envato/breaks-gate.sh`.
**Effort:** S (1-2 hours).

### 2c. Pin baselines for the 8 LetterSpacing packs

- Run the harness against each pack; record observed metrics in
  `break-thresholds.json` with ~25-30% headroom over the observed
  values.
- Skip any pack whose `pdftotext -bbox-layout` output is broken
  (cycle-4 plan flagged this as the multi-day risk). Document
  the skips.

**Files:** `corpus/envato/break-thresholds.json`,
`corpus/envato/findings-cycle5/track-2-baselines.md`.
**Effort:** S (2-3 hours after 2a/2b land — mostly mechanical).

### Expected impact

Harness gate covers the 8 packs that customise composer spacing.
Cycle-5 Track 3 calibration rounds compare candidate-vs-reference
break decisions on packs that have real signal.

---

## Track 3 — Q-20 calibration rounds

**Goal:** cycle 3 deferred this. Cycle 4 built the harness. Cycle 5
finally tunes `apply_paragraph_compose_options`'s knobs.

Calibration knobs (from `crates/idml-renderer/src/pipeline.rs:10316`):

- **`stretch_ratio.max(0.1)`** floor (line 10348). Q-15 introduced
  this to prevent zero-stretch deadlock. Larger floor → more
  willingness to stretch lines; smaller → tighter wrap.
- **`AVG_CHARS_PER_WORD = 5.0`** (line 10367). English average is
  ~4.7; bumping affects how aggressively letter-spacing budget
  feeds into the stretch ratio.
- **`stretch_ratio + stretch_add).min(2.0)`** ceiling (line 10371).
  Currently 2.0; widening lets KP cope with very-narrow-column
  body text.

### 3a. Round 1 — `AVG_CHARS_PER_WORD` correction

Bump from 5.0 to 4.7 (matches English-language average).

**Files:** `crates/idml-renderer/src/pipeline.rs::apply_paragraph_compose_options`.
**Effort:** S (1-2 hours including gate verification).

### 3b. Round 2 — stretch-floor tightening (conditional)

If Round 1 shows wrap improvements on the newspaper packs, try
loosening the stretch floor (`max(0.1)` → `max(0.05)` or removing)
on paragraphs that explicitly set wider Max/MinWordSpacing — the
floor was a safety net for Q-15's zero-budget case but may be
over-broad now.

**Effort:** S-M (2-3 hours including potential revert).

### 3c. Round 3 — letter-spacing → glyph-budget refinement (conditional)

If Rounds 1 & 2 show progress, the current `stretch_add /
shrink_add` formula treats letter-spacing budget as a per-line
stretch shift. A more accurate model would distribute it per
inter-glyph gap. Sketch the change but only land if measurements
warrant.

**Effort:** M (1 day).

### Expected impact

Plan target: −1 to −2 ΔE on the 8 LetterSpacing packs. The
absolute corpus delta will be modest because these packs are 8/61;
the foundational win is *predictable* composer behaviour under
known break-decision regressions.

---

## Track 4 — Threshold expansion

**Goal:** broaden break-decision regression coverage so cycle-5
composer changes are guarded across a representative sub-corpus.

- Pin the generated `text-wrap.idml` + `tables.idml` fixtures
  (currently only `text` and `text-advanced` are gated).
- Pin the 8 Envato packs once Track 2 wires them in.

**Files:** `corpus/envato/break-thresholds.json`.
**Effort:** S (half-day).

---

## Closeout

- `corpus/envato/comparison-report-cycle5-final.md`.
- Document the Track 3 calibration findings (whether
  per-pack ΔE moved; whether the harness caught any unexpected
  composer regressions).

## Risk + estimate

- **Track 1** is contained scope. Low risk.
- **Track 2** is mechanical once `breaks-gate.sh` learns the
  override-sidecar convention. The risk is per-pack
  `pdftotext -bbox-layout` quality; the cycle-4 plan flagged
  this and identified `pdfminer.six` as the fallback.
- **Track 3** is the only exploratory track. Mitigate via "tweak →
  gate → revert" loop — calibration changes that breach
  `corpus/generated/diff.sh` or any pinned break threshold roll
  back automatically.
- **Track 4** is a follow-up; trivial.

Total: ~1-2 weeks for a single focused engineer.

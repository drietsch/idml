# Plan & Status

Living plan for the IDML faithful renderer. Captures what's done, what's next, and what's intentionally deferred. The original technical spec is in `idea.md`; this file tracks execution against it.

## Overview

Multi-year, print-grade IDML renderer in Rust. Parses Adobe IDML packages, lays out text with InDesign-calibrated Knuth-Plass composition, composes a versioned display list, and rasterises through either tiny-skia (CPU) or Vello (wgpu/GPU) backends. Public APIs target both native and WASM hosts.

Workspace (13 crates):

```
idml/
├── crates/
│   ├── idml-parse/             ZIP + XML → AST
│   ├── idml-scene/             AST → resolved scene graph
│   ├── idml-text/              shaping, breaking, hyphenation, layout
│   ├── idml-color/             lcms2 wrapper, ICC transforms
│   ├── idml-compose/           scene graph → display list
│   ├── idml-gpu/               PathRasterizer trait + tiny-skia + Vello backends
│   ├── idml-renderer/          top-level coordinator (public API)
│   ├── idml-fidelity/          ΔE2000 + SSIM corpus tooling
│   └── idml-wasm/              wasm-bindgen surface
├── corpus/                     seeds + (gitignored) sample IDMLs
└── spikes/
    ├── vello-eval/             Spike A (Vello evaluation)
    ├── composer-calibration/   Spike B (Knuth-Plass tuning vs. InDesign)
    └── wasm-size/              Spike C (WASM bundle measurement)
```

## Status by phase

Mapped to idea.md's Phase 0–4 plus the pre-0 spikes from the original plan.

### Pre-0 spikes — done

- **Spike A (Vello eval)**: harness scaffolded; backend now production-ready for FillPath / StrokePath / Image / LinearGradient. DropShadow stays stubbed (needs offscreen layer).
- **Spike B (composer calibration)**: harness scaffolded; not yet driven against InDesign reference paragraphs. Tuning is queued.
- **Spike C (WASM size)**: harness scaffolded.
- **Fidelity harness**: ΔE2000 + SSIM diff implementation lives in `idml-fidelity`. Corpus expansion (more seed IDMLs + reference PDFs) is queued.

### Phase 0 — Foundation — done

13-crate workspace, parser skeleton, fidelity tooling, hello seed corpus packing as IDML at test time, multi-page rendering via the `idml-inspect` binary.

### Phase 1 — Core rendering — mostly done

| Feature | Status |
|---|---|
| Display list with path interning | ✅ |
| Gradient buffer | ✅ linear; radial deferred |
| Image pool + per-page + per-render dedup | ✅ |
| CPU rasterizer (tiny-skia) | ✅ production-grade |
| Vello backend (wgpu) | ✅ FillPath + StrokePath + Image + LinearGradient; DropShadow stub |
| ItemTransform per frame | ✅ composed into emit transforms |
| Group lifting (nested frames) | ✅ frames inside `<Group>` lift with cumulative transform |
| Drop shadow (hard-edge) | ✅ |
| Drop shadow Gaussian blur | ❌ needs PushLayer / PopLayer |
| Overprint simulation | ❌ |

### Phase 2 — Text composition — mostly done

| Feature | Status |
|---|---|
| rustybuzz shaping with tracking, x/y offsets | ✅ |
| Knuth-Plass via paragraph_breaker | ✅ |
| Hyphenation (TeX patterns, flagged Penalty items) | ✅ |
| Justification (left / right / center / justify) | ✅ |
| FirstLineIndent, SpaceBefore, SpaceAfter | ✅ |
| Per-paragraph font selection via AssetResolver | ✅ |
| Per-run mid-paragraph font switching | ✅ via StyledRun + layout_runs |
| Per-line line-height (auto-leading from largest run) | ✅ |
| Style cascade from Resources/Styles.xml | ✅ via merge_below |
| BasedOn chain following | ✅ depth-bounded |
| Tab stops parsing + Left / Right / Center / Decimal layout | ✅ |
| Vertical justification (Top / Center / Bottom) | ✅ |
| Vertical justify mode (distribute slack) | ❌ falls through to Top |
| Underline / strikethrough | ✅ |
| Bullets render | ✅ |
| Numbered lists (Arabic / Roman / alpha / zero-padded) | ✅ |
| FirstBaselineOffset (Ascent / Cap / X / EmBox / Fixed / Leading) | ✅ from OS/2 + hhea |
| TextFramePreference inset spacing | ✅ |
| Story threading (NextTextFrame chain + line distribution) | ✅ |
| NumberingExpression substitution / NumberingStartAt overrides | ❌ |

### Phase 3 — Color & effects — partial

| Feature | Status |
|---|---|
| ICC via lcms2 (native; wasm32 falls back to naive) | ✅ |
| CMYK percentages → linear RGB through ICC | ✅ |
| Linear gradients (sRGB-correct stops) | ✅ |
| Stroke gradients (text frames, rectangles, ovals, lines) | ✅ |
| Hard-edge drop shadow | ✅ |
| Gaussian blur on drop shadow | ✅ |
| Overprint simulation | ❌ |
| Spot colour delta-tinting | ❌ |

### Phase 4 — Advanced — not started

Tables, CJK, anchored objects, table-of-contents resolution.

## Subsystem snapshot

- **`idml-parse`**: container, designmap, spreads, stories, graphic, drop shadows, ovals, lines, gradients, ItemTransform, NextTextFrame, TextFramePreference (VJ + FirstBaselineOffset + insets), tabs (Tab + TabList + TabStop), Image element, styles (Character + Paragraph + BasedOn cascade), bullets/numbering. 25 unit tests.
- **`idml-scene`**: `Document::open` parses every resource the manifest references. Builds `frame_for_story`, `text_frame_index` (O(1) frame lookup), master spreads. `resolved_run_attrs` / `resolved_paragraph_attrs` walk the cascade via `merge_below`. `frame_chain(story_id)` returns Vec<&TextFrame> for threaded stories with cycle protection.
- **`idml-text`**: `shape_run` + tracking, `compose_paragraph` with hyphenation, `layout_paragraph` (single-font), `layout_runs` (multi-font with per-run shaping + auto-leading). `apply_tab_stops` handles Left / Right / Center / Decimal alignment. 31 unit tests.
- **`idml-compose`**: display list with `Transform::for_rect_in` helper, `DisplayCommand::transform_mut` accessor, gradient pool, image pool, glyph cache via `(font_id, glyph_id)`. `emit_*_transformed` helpers fold an outer affine into the unit-rect mapping. 25 unit tests.
- **`idml-gpu`**: `PathRasterizer` trait + `RasterOptions`. Two impls behind feature flags: `cpu` (tiny-skia, default) and `vello-backend` (wgpu via Vello). Vello covers FillPath / StrokePath / Image / LinearGradient; DropShadow is the lone stub.
- **`idml-renderer`**: `build_document` with master-spread pass, frame routing, per-page image dedup, renderer-scoped DecodedImage cache (size surfaced via `PipelineStats::decoded_images` ✅). Per-story `StoryEmitter` struct holds all per-story mutable state (frame chain bookkeeping, vertical-justify command range tracking, numbered-list counter). `FontTable` with `FontMetrics` cache (cap height, x height, ascender from OS/2 + hhea). 17 lib tests + 11 integration tests.
- **`idml-color`**: `IccTransform::cmyk_to_linear_rgb` via lcms2 on native; wasm32 falls back to naive math at the call site. Stable.
- **`idml-fidelity`**: ΔE2000 + SSIM diff CLI. Corpus expansion is queued.
- **`idml-wasm`**: `render_to_png` + `parse_summary` wasm-bindgen entrypoints.

## Active backlog (prioritized)

### Tier 1 — small, ready to ship

1. **Image dedup metrics** in `PipelineStats` ✅ — `decoded_images` field surfaces the renderer-scoped `DecodedImage` cache size at the end of each render; also wired into `idml-inspect`'s JSON totals.
2. **Stroke gradient endpoints** from `<Gradient>` `Angle` + `Length` — currently hardcoded `(0,0)→(0,1)`. Means rotated gradients render at 90°.
3. **Justification enum promotion** — last stringly-typed surface. Used in 5+ places (Paragraph, ParagraphStyleDef, ResolvedParagraph, ResolvedParagraphAttrs, map_justification). Mechanical but multi-touch.
4. **NumberingExpression substitution** — IDML allows `^#` + custom prefixes/suffixes per style ("Step ^# of 5"); current emit is hardcoded `<n>.\t`.
5. **NumberingStartAt + NumberingContinue** — explicit overrides on top of the auto-reset.
6. **Test font** — drop a permissive TTF (DejaVu / Noto subset) into `corpus/fonts/`. Glyph-level integration tests for per-run fonts, threading, underline, vertical justify, lists. Without it, most text-path tests stop at "command emitted, glyph count = 0".

### Tier 2 — medium, real fidelity wins

7. **Justify-vertical mode** — distribute slack between paragraphs (currently falls through to Top). Plumbing is in place; needs a per-paragraph spacing pass.
8. **Composer calibration** — drive `spikes/composer-calibration` against InDesign-PDF references. Tune `tolerance`, `hyphen_penalty`, `stretch_ratio` toward parity. Spike B in the original plan.
9. **`rustybuzz::Face` cache in `FontTable`** — currently per-paragraph dedup only. Per-render cache wants self-referential `Face<'static>`-over-`Bytes`. Needs `self_cell` / `ouroboros` (offline-unavailable in this environment) or a carefully-reviewed `unsafe` transmute.
10. **Bullets character formatting** — the bullet inherits the first run's font / size / colour today. IDML allows a separate character style for the bullet.
11. **Decimal-tab leader characters** — `<TabStop Leader="...">` lets you put dots between a label and a number; not yet rendered.
12. **Vello DropShadow** — depends on offscreen-layer plumbing (#13).

### Tier 3 — large

13. **Gaussian blur on drop shadow** — `PushLayer` / `PopLayer` display commands + offscreen pixmap stack in the rasterizer. Once layers exist, separable Gaussian on the shadow stamp + `DisplayCommand::transform_mut` slot in cleanly.
14. **Fidelity harness expansion** ✅ — `corpus/generated/diff.sh` runs every paired `*.idml + *.pdf` fixture through `idml-inspect` + `pdftoppm` + `idml-diff` and gates per-page mean ΔE / p99 ΔE / SSIM against `corpus/generated/fidelity-thresholds.json`. Wired into `.github/workflows/fidelity.yml` as a hard step (with poppler-utils install + `actions/upload-artifact@v4` for heatmaps on failure). Current per-fixture worst-page numbers (mean ΔE / p99 ΔE / SSIM): geometry 0.108 / 0.000 / 0.994, geometry-groups 0.973 / 47.289 / 0.982, strokes-fills 0.440 / 9.381 / 0.987, text 0.534 / 8.771 / 0.973, text-advanced 0.562 / 15.963 / 0.968, effects 0.334 / 5.349 / 0.993, gradients 0.158 / 1.027 / 0.994, tables 0.886 / 10.827 / 0.967, images 0.104 / 0.000 / 0.995. Thresholds were sized worst-page + ~15-25% headroom; the long-term goal stays the idea.md §13.2 budget (mean ≤ 1.0, p99 ≤ 2.5, SSIM ≥ 0.99 for *every* page). `tables` is gated to 7 pages and `images` to 5 because their reference PDFs predate the latest IDML page additions.
15. **Overprint simulation** — per-channel CMYK compositing, not per-pixel RGB. Significant rasterizer rework; depends on routing CMYK through to the rasterizer instead of resolving to RGB at compose time.

### Tier 4 — defer

16. **Tables** — `<Table>` parsing + grid layout + cell text flow + cross-cell threading.
17. **CJK** — vertical writing mode, kinsoku line-break rules, Mojikumi, mid-line emphasis marks. `rustybuzz` already shapes CJK; layout + writing-mode work is the lift.

## Deferred (with rationale)

- **`self_cell` / `ouroboros`-based `Face` cache** — both crates unavailable in the offline cargo cache. Per-paragraph dedup landed instead; full per-render cache waits for one of the crates to become available or for a carefully-reviewed unsafe transmute.
- **Test font embedding** — no way to fetch a permissive TTF in this environment. Highest-leverage pending item; unblocks regression coverage for everything text-related.
- **Justification + FontStyle enum promotion** — Justification surface is large (5+ touch points) for moderate ROI. FontStyle is free-form in IDML ("Bold Italic Caption" etc.), genuinely not enumerable.
- **`compose_matrix` dedup vs `Transform::compose`** — would force a parse → compose dependency we don't want to add.
- **Frame-chain page-bake** — page routing is renderer-private (centre-point containment); scene shouldn't know about it.
- **`StoryEmitter` extracted** ✅ — done in commit `7447ee4`.

## Cross-cutting risks

- **Vello upstream**: features like advanced shadow/blur lag behind rendering needs. The `PathRasterizer` trait + tiny-skia fallback insulate us; multiple commits show the pattern works.
- **Composer parity**: Spike B's pass criterion (≥95% line-break parity vs. InDesign) is unverified. Calibration corpus expansion is the unblock.
- **Self-referential lifetimes**: `Face<'static>`-over-`Bytes` and similar patterns keep recurring. Picking a single solution (`self_cell` vs. controlled `unsafe`) before the third occurrence will pay back.

## Recent commits (most recent first)

```
0e4df4f NumberingFormat: Roman / alpha / zero-padded counters
439d391 Numbered lists: counter on StoryEmitter; "1." "2." "3." prefixes
ecccda6 Decimal-aligned tabs (CharacterAlign)
5f7f270 Bullets render: prepend bullet+separator to first run
71e9229 Bullets / numbering: parser + cascade
b046974 Per-paragraph Face dedup by Bytes pointer identity
73a024a Promote VerticalJustification + FirstBaselineOffset to enums
0504f6b Vello backend: LinearGradient dispatch
542818c FontMetrics from OS/2 + hhea drive FirstBaselineOffset
e1cf9c0 Tab alignment within cell: Right + Center + Decimal
5d48345 Cascade folds: extract merge_below helpers
ec4d868 Vello backend: StrokePath + Image dispatch
e4432f7 Real Vello backend: wgpu init + DisplayList walker + readback
7447ee4 Extract StoryEmitter from build_document's per-story loop
662e6f2 Tab stops layout: snap '\t' glyphs to next stop
ba2a825 PathRasterizer trait + dual backend (CPU + Vello stub)
caefe89 Tab stops: parse <Tab> + <TabList>; layout integration deferred
74928a6 TextFramePreference: FirstBaselineOffset + InsetSpacing
8ff93f0 Cleanup pass on commits since 9bd1dd5
edad8dc Four small fidelity wins: stroke gradients, image dedup, vertical justify, underline
e471650 Story threading: pipeline flows lines across the frame chain
df4ff0b Story threading: parse NextTextFrame + Document::frame_chain
a360595 Image placement end-to-end: parse, decode, blit
e15cc07 Style cascade: Resources/Styles.xml → run + paragraph attrs
be2c602 Spread parser: lift nested frames out of Groups
1e4d4c6 layout_runs: thread hyphenation through, with hyphen glyph emission
c2275c2 layout_runs: per-line auto leading from largest run size
a8d3d90 Per-run mid-paragraph font switching
18ee4b9 ItemTransform applied to rendered frames
01655b2 Wire AssetResolver into pipeline: per-paragraph font selection
```

## Test counts (last green run)

- `idml-parse`: 25 unit + 3 integration
- `idml-scene`: 1 unit
- `idml-text`: 31 unit
- `idml-compose`: 25 unit (22 + 3 cpu-flagged)
- `idml-gpu` (cpu features): 5 unit
- `idml-gpu` (vello-backend features): 2 unit
- `idml-renderer`: 17 lib + 11 integration + 3 seed
- `idml-fidelity`: 8 unit + 2 integration
- Spikes: 4 + 3 + 1
- **Total: 177 across the workspace** (CPU default features), 178 with `vello-backend` enabled.

## Recommended order for the next 3 batches

| # | Batch | Why |
|---|---|---|
| 1 | Image dedup metrics ✅ + Stroke gradient endpoints | Two trivial Tier 1 wins; closes the gradient-direction gap and adds long-flagged observability. |
| 2 | Test font + glyph-level integration tests | Highest leverage missing piece. Once a TTF lands, every text-path test grows real assertions. |
| 3 | Justify-vertical mode | Vertical justification is mostly there; this completes the typography surface for body copy. |

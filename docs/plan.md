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
- **Spike B (composer calibration)**: ✅ done. Calibrated to Adobe-aligned WordSpacing defaults; verified at 100% line-break parity on the 6-entry corpus (28/28 lines). Commits `0242e32` + `863d397`.
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
| Vertical justify mode (distribute slack) | ✅ per-paragraph distribution; per-frame for threaded stories |
| Underline / strikethrough | ✅ |
| Bullets render | ✅ |
| Numbered lists (Arabic / Roman / alpha / zero-padded) | ✅ |
| FirstBaselineOffset (Ascent / Cap / X / EmBox / Fixed / Leading) | ✅ from OS/2 + hhea |
| TextFramePreference inset spacing | ✅ |
| Story threading (NextTextFrame chain + line distribution) | ✅ |
| NumberingExpression substitution / NumberingStartAt overrides | ✅ tokens `^#` / `^.` / `^t` + `^^` escape; StartAt + Continue plumbed through `StoryEmitter` |

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
3. **Justification enum promotion** ✅ — `idml_parse::Justification` enum (9 variants: LeftAlign / CenterAlign / RightAlign / LeftJustified / CenterJustified / RightJustified / FullyJustified / ToBindingSide / AwayFromBindingSide) replaces `Option<String>` on `Paragraph`, `ParagraphStyleDef`, `ResolvedParagraph`, `ResolvedParagraphAttrs`, the rope's `ParagraphAttrs`, and `ParagraphAttrPatch`. `from_idml` parses at XML-read time (unknown values → `None` → renderer falls back to Left, matching the prior stringly-typed wildcard). `map_justification` now takes `Option<Justification>`. Custom `Serialize`/`Deserialize` keeps the wasm bridge's JSON wire format byte-identical to the pre-enum world (still serialises as `"LeftAlign"` etc.).
4. **NumberingExpression substitution** ✅ — `^#` / `^.` / `^t` tokens (plus `^^` literal-caret escape) substitute into the marker; default expression `^#.^t` matches IDML. Cascade-aware via `ResolvedParagraph` / `ResolvedParagraphAttrs`.
5. **NumberingStartAt + NumberingContinue** ✅ — `NumberingStartAt` jumps the counter on paragraph entry; `NumberingContinue` suppresses the auto-reset that otherwise fires when the prior paragraph wasn't a NumberedList. Counter now persists across BulletList / NoList intermissions on the `StoryEmitter`.
6. **Test font** ✅ — license-clear TTFs landed in `corpus/fonts/` (Open Sans, Inter, Lora, Roboto, Cormorant Garamond, Source Serif 4, Roboto Slab). Pixel-level coverage lives in `real_ttf.rs` + `real_ttf_features.rs`. Glyph-level (`DisplayList`-inspecting) coverage for per-run fonts / threading / underline / strikethrough / vertical justify / bulleted lists / numbered lists lives in `text_glyph_level.rs`.

### Tier 2 — medium, real fidelity wins

7. **Composer calibration** — drive `spikes/composer-calibration` against InDesign-PDF references. Tune `tolerance`, `hyphen_penalty`, `stretch_ratio` toward parity. Spike B in the original plan.
8. **`rustybuzz::Face` cache in `FontTable`** — currently per-paragraph dedup only. Per-render cache wants self-referential `Face<'static>`-over-`Bytes`. Needs `self_cell` / `ouroboros` (offline-unavailable in this environment) or a carefully-reviewed `unsafe` transmute.
9. **Bullets character formatting** ✅ — parser captures `BulletsCharacterStyle` + `BulletsAndNumberingDigitsCharacterStyle` on `ParagraphStyleDef` / `ResolvedParagraph` (cascade via BasedOn); `ResolvedParagraphAttrs` carries them through to the renderer. Pipeline resolves the marker style via the standard `CharacterStyle` cascade and threads the resolved `FillColor` into `build_run_paint_picker_resolved` as a leading bullet paint band so the bullet glyph emits with a distinct `FillPath` paint from the content runs. Bullet-vs-numbered-list lookup follows IDML's two-field convention — `NumberedList` reads the digits-style ref; `BulletList` reads `BulletsCharacterStyle` and falls back to the digits-style ref (InDesign's UI exposes a single "Character Style" picker per paragraph style regardless of list kind). Glyph-level coverage: `text_glyph_level::bullet_character_style_paints_bullet_differently_from_content`. Font/size override through the same character style is queued (parser fields already land; pipeline keeps inheriting run 0's face/size today).
10. **Decimal-tab leader characters** ✅ — `<TabStop Leader="...">` strings (e.g. `"."`, `". "`, `"…"`) round-trip through the parser as `Option<String>` (preserving trailing whitespace — `". "` is meaningfully different from `"."`). `idml-text::layout::apply_tab_stops_with_leaders` takes an optional `LeaderContext` that wraps the paragraph's `&[StyledRun]`; each snapped `\t` whose stop has a non-empty leader gets the leader shaped with the run that owns the tab's cluster and tiled across the widened gap. Tiling strategy: whole copies only (`floor(gap / leader_width)`) — a leader strictly wider than the gap emits zero copies (matches InDesign's "drop the leader rather than overflow into the snapped text" behaviour), and any partial trailing space is left empty so the dots stay visually uniform. The synthesised leader glyphs sit at absolute x inside the already-widened tab span, so they don't contribute further advance and they share the tab's `font_id` (which means the `glyph_id`-bucketed emit loop and the `(font_id, glyph_id)` outline interner pick them up cleanly — every `.` glyph reuses one `PathId`). Leaders inherit the surrounding run's `FillColor` / `point_size`; no separate style. Coverage: `idml_parse::story::tests::tab_stop_leader_preserves_multichar_and_whitespace` (parser) + `text_glyph_level::tab_stop_leader_dots_tile_across_the_gap` (renderer, asserts >5 dots tile a TOC-style line with `Leader="."` and zero dots without).
11. **Vello DropShadow** — depends on offscreen-layer plumbing (#12).

### Tier 3 — large

12. **Gaussian blur on drop shadow** — `PushLayer` / `PopLayer` display commands + offscreen pixmap stack in the rasterizer. Once layers exist, separable Gaussian on the shadow stamp + `DisplayCommand::transform_mut` slot in cleanly.
13. **Fidelity harness expansion** ✅ — `corpus/generated/diff.sh` runs every paired `*.idml + *.pdf` fixture through `idml-inspect` + `pdftoppm` + `idml-diff` and gates per-page mean ΔE / p99 ΔE / SSIM against `corpus/generated/fidelity-thresholds.json`. Wired into `.github/workflows/fidelity.yml` as a hard step (with poppler-utils install + `actions/upload-artifact@v4` for heatmaps on failure). Current per-fixture worst-page numbers (mean ΔE / p99 ΔE / SSIM): geometry 0.108 / 0.000 / 0.994, geometry-groups 0.973 / 47.289 / 0.982, strokes-fills 0.440 / 9.381 / 0.987, text 0.534 / 8.771 / 0.973, text-advanced 0.562 / 15.963 / 0.968, effects 0.334 / 5.349 / 0.993, gradients 0.158 / 1.027 / 0.994, tables 0.886 / 10.827 / 0.967, images 0.104 / 0.000 / 0.995. Thresholds were sized worst-page + ~15-25% headroom; the long-term goal stays the idea.md §13.2 budget (mean ≤ 1.0, p99 ≤ 2.5, SSIM ≥ 0.99 for *every* page). `tables` is gated to 7 pages and `images` to 5 because their reference PDFs predate the latest IDML page additions.
14. **Overprint simulation** — per-channel CMYK compositing, not per-pixel RGB. Significant rasterizer rework; depends on routing CMYK through to the rasterizer instead of resolving to RGB at compose time.

### Tier 4 — defer

15. **Tables** — `<Table>` parsing + grid layout + cell text flow + cross-cell threading.
16. **CJK** — vertical writing mode, kinsoku line-break rules, Mojikumi, mid-line emphasis marks. `rustybuzz` already shapes CJK; layout + writing-mode work is the lift.

## Deferred (with rationale)

- **`self_cell` / `ouroboros`-based `Face` cache** — both crates unavailable in the offline cargo cache. Per-paragraph dedup landed instead; full per-render cache waits for one of the crates to become available or for a carefully-reviewed unsafe transmute.
- **Test font embedding** ✅ — license-clear TTFs (Open Sans, Inter, Lora, Roboto family, Cormorant Garamond, Source Serif 4, Roboto Slab) now live under `corpus/fonts/`. Pixel-level coverage in `real_ttf*.rs`; glyph-level (DisplayList) coverage in `text_glyph_level.rs`.
- **Justification enum promotion** ✅ — done. `idml_parse::Justification` enum lands in `crates/idml-parse/src/story.rs` (next to `Paragraph`); touch points: `Paragraph`, `ParagraphStyleDef`, `ResolvedParagraph`, `ResolvedParagraphAttrs`, the rope's `ParagraphAttrs`, `ParagraphAttrPatch`, `map_justification`. Custom serde keeps the JSON wire format ("LeftAlign" strings) unchanged.
- **FontStyle enum promotion** — free-form in IDML ("Bold Italic Caption" etc.), genuinely not enumerable. Staying as `String` is correct.
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

- `idml-parse`: 67 unit + 3 integration (`roundtrip`)
- `idml-scene`: 1 unit
- `idml-text`: 44 unit
- `idml-compose`: 22 unit
- `idml-edit`: 25 unit + 18 integration (`seed_hello`)
- `idml-gpu`: 17 unit (CPU default; +vello-backend adds 0 today)
- `idml-renderer`: 36 lib + 3 inspect bin + 11 `pipeline_lib` + 4 `inspect_e2e` + 3 `real_ttf` + 8 `real_ttf_features` + 12 `text_glyph_level` + 4 `seed_hello`
- `idml-fidelity`: 8 unit + 3 integration (`cli_smoke`)
- `idml-gen`: 9 unit + 25 integration (`snapshot`)
- Spikes: 0 (composer-calibration / vello-eval / wasm-size)
- **Total: 327 across the workspace** (CPU default features). Tier-1 #3 (justification enum) added 2 parse unit tests; Tier-1 #4 + #5 (numbering-polish) added 3 parse + 7 renderer + 3 `text_glyph_level` tests; Tier-2 #9 (bullet character style) added 1 `text_glyph_level` test; Tier-2 #10 (decimal-tab leader characters) added 1 parse unit test + 1 `text_glyph_level` test.

## Recommended order for the next 3 batches

| # | Batch | Why |
|---|---|---|
| 1 | Image dedup metrics ✅ + Stroke gradient endpoints ✅ | Two trivial Tier 1 wins; closes the gradient-direction gap and adds long-flagged observability. |
| 2 | Test font + glyph-level integration tests ✅ | Done — fonts in `corpus/fonts/`, glyph-level coverage in `text_glyph_level.rs` (per-run fonts, threading, underline + strikethrough, vertical justify, bullets, numbered list). |
| 3 | Justify-vertical mode ✅ | Distribute pass lives in `pipeline.rs`; threaded-frame coverage in `real_ttf_features.rs::vertical_justify_distribute_threaded_per_frame`. Next up: Composer calibration (Spike B). |

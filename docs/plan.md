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
| Vello backend (wgpu) | ✅ FillPath + StrokePath + Image + LinearGradient; `PushLayer { effect: GaussianBlur }` via multi-tap convolution replay |
| ItemTransform per frame | ✅ composed into emit transforms |
| Group lifting (nested frames) | ✅ frames inside `<Group>` lift with cumulative transform |
| Drop shadow (hard-edge) | ✅ |
| Drop shadow Gaussian blur | ✅ separable Gaussian over premultiplied RGBA on the CPU rasterizer; `PushLayer { effect: LayerEffect::GaussianBlur }` / `PopLayer` provide the generic offscreen-pixmap stack callers can compose with |
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
| Overprint simulation | ✅ parser + display list + CPU darken approximation; per-channel CMYK deferred (see Tier 3 #14) |
| Spot colour delta-tinting | ✅ `Color Model="Spot"` parses `AlternateSpace` / `AlternateColorValue` / `TintValue`; `ColorEntry::effective_cmyk` folds spot→CMYK fallback + swatch-level tint (`base * tint / 100`) before ICC. Spot ink names aren't rendered — we always preview via the CMYK alternate. |

### Phase 4 — Advanced — partial

| Feature | Status |
|---|---|
| Tables — parser + AST | ✅ `Table` / `TableRow` / `TableColumn` / `TableCell` + `CellStyleDef` / `TableStyleDef` + `ResolvedCell` / `ResolvedTable` with BasedOn cascade. Cells host their own nested `<ParagraphStyleRange>` children; `TableCell::coords()` returns `(column, row)` (matching IDML's `Name="col:row"` serialisation). |
| Tables — scene-graph + grid layout | ✅ row heights × column widths laid out from frame top-left; cells with `RowSpan` / `ColumnSpan` widen their rect. |
| Tables — cell text flow | ✅ per-cell paragraph composition with cell insets + per-cell vertical justification. |
| Tables — cell strokes / fills | ✅ per-edge stroke overrides, alternating-row fills via TableStyle, diagonal cell strokes, outer table border. |
| Tables — fidelity | ✅ generated `tables` fixture gated in CI at meanΔE ≤ 1.10 / p99 ≤ 13.0 / SSIM ≥ 0.96; worst measured meanΔE 0.886 / p99 10.827 / SSIM 0.967 (p3). |
| Tables — header/footer duplication across frame splits | ✅ `RepeatingHeader` / `RepeatingFooter` parsed on `<Table>` (default true when absent). `emit_table_into_chain` now builds a per-frame physical-row sequence: when the body overflows the head frame, footer rows replay at the bottom of the prior frame (when `repeating_footer`) and header rows prepend at the top of the new frame (when `repeating_header`). Per-row cells / alternating fills / dividers iterate that physical-row list keyed off the original template index, so the visual cycle stays coherent across continuation frames. Glyph-level coverage: `text_glyph_level::threaded_table_replays_header_row_at_top_of_each_frame`. |
| Tables — content-driven row growth (`MinimumHeight`) | ✅ `MaximumHeight` lands on `TableRow` (None = unbounded). `emit_table_into_chain` runs a top-down pre-measure pass via `measure_cell_paragraph` (a side-effect-free counterpart to `emit_cell_paragraph` that shapes + lays out but skips outline emission), summing cell content heights and clamping `max(SingleRowHeight, MinimumHeight, content_height)` to `MaximumHeight`. RowSpan > 1 cells distribute via the LAST-row heuristic: prior rows of the span keep their declared height; the trailing row grows to absorb the shortfall. Coverage: `text_glyph_level::table_row_grows_to_fit_content_when_single_row_height_too_small`. |
| Anchored objects | ✅ inline-anchored TextFrame / Rectangle / Group with image-link + per-edge attribute capture. |
| CJK (vertical writing, kinsoku, Mojikumi) | ❌ |
| TOC — parser + AST | ✅ `<TOCStyle>` + `<TOCStyleEntry>` parse into `TOCStyleDef` / `TOCStyleEntryDef` under `Resources/Styles.xml`. Captures title / title_style / include_book_documents / include_hidden / run_in on the style and name / include_style / format_style / level / page_number / separator per entry. Both the self-closing default-empty form (common in real-world IDMLs) and the element-form with `<TOCStyleEntry>` children parse cleanly. Coverage: `idml_parse::styles::tests::parses_toc_style_with_entries` + `parses_self_closing_empty_toc_style`. |
| TOC — resolver | ✅ `Document::resolve_toc(&TOCStyleDef) -> Vec<TOCEntry>` walks every story's paragraphs in document order, picks the ones whose `AppliedParagraphStyle` matches a `TOCStyleEntry::IncludeStyle`, and emits `TOCEntry { level, text, page_number, separator, format_style, include_style, page_number_visible }`. Page-number resolution uses the head frame's host page (centroid-in-page-bounds test) — matches InDesign's output for the common one-frame-per-story-per-page case. Coverage: `idml_scene::tests::resolve_toc_picks_paragraphs_in_document_order` (multi-story, mixed-style ordering, body paragraphs excluded), `resolve_toc_respects_page_number_off_flag`, `resolve_toc_uses_default_separator_when_absent`. |
| TOC — renderer integration | ✅ trigger is `AppliedTOCStyle="TOCStyle/<id>"` on the host `<TextFrame>` (parser surfaces it as `TextFrame::applied_toc_style`). At the top of the body-story loop, `pipeline::build_document` peeks the chain head's `applied_toc_style`, looks it up in `document.styles.toc_styles`, and calls `build_toc_paragraphs` — which walks `Document::resolve_toc(...)` and turns every `TOCEntry` into a single synthetic `idml_parse::Paragraph`: `paragraph_style` ← entry `format_style`, one run carrying `text` + `separator` (with `^t` expanded to a literal tab) + the page label from `page_labels[entry.page_number]`. Entries with `PageNumber="Off"` / `"NoPageNumber"` drop the separator + page tail. The synthetic paragraphs flow through the standard paragraph-emission path so they pick up shaping, tab snapping, applied-paragraph-style cascade, and per-frame vertical justification. Coverage: `text_glyph_level::toc_story_swaps_in_resolved_entries_with_heading_text_and_page_numbers` (4-page fixture; 3 chapter stories + 1 TOC frame, asserts 3 entries land on 3 distinct baselines in document order, ≥ 12 distinct glyph outlines reuse, each line spreads ≥ 50 pt from heading start to page-number digit). The original story's placeholder paragraphs never emit. |

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
2. **Stroke gradient endpoints** from `<Gradient>` `Angle` + `Length` ✅ — landed in commit `2ab98b2` (`merge stroke-gradient-endpoints`). Parser reads `GradientFillAngle` / `GradientFillLength` / `GradientStrokeAngle` / `GradientStrokeLength` on Rectangle / Oval / Polygon / TextFrame; `ResolvedFrame` carries all four; `fill_paint_module`, `stroke_paint_module`, the rect dispatch in `emit_rectangle_into`, and (follow-up in `stroke-gradient-status`) GraphicLine's `emit_line_into` route through `color_id_to_paint_with_list_dir` which projects angle/length onto the path's unit-rect endpoints (centred on `(0.5, 0.5)`, scaled by `(cos θ · L / 2w, sin θ · L / 2h)` when bbox known). Unit tests cover 0° / 90° / 45° / negative angle / explicit length / missing bbox in `pipeline::tests::gradient_endpoints_*`; integration coverage in `pipeline_lib::linear_gradient_rotated_90_degrees_runs_vertically` pins rendered-pixel orientation against a regression to the old hardcoded `(0,0)→(0,1)`.
3. **Justification enum promotion** ✅ — `idml_parse::Justification` enum (9 variants: LeftAlign / CenterAlign / RightAlign / LeftJustified / CenterJustified / RightJustified / FullyJustified / ToBindingSide / AwayFromBindingSide) replaces `Option<String>` on `Paragraph`, `ParagraphStyleDef`, `ResolvedParagraph`, `ResolvedParagraphAttrs`, the rope's `ParagraphAttrs`, and `ParagraphAttrPatch`. `from_idml` parses at XML-read time (unknown values → `None` → renderer falls back to Left, matching the prior stringly-typed wildcard). `map_justification` now takes `Option<Justification>`. Custom `Serialize`/`Deserialize` keeps the wasm bridge's JSON wire format byte-identical to the pre-enum world (still serialises as `"LeftAlign"` etc.).
4. **NumberingExpression substitution** ✅ — `^#` / `^.` / `^t` tokens (plus `^^` literal-caret escape) substitute into the marker; default expression `^#.^t` matches IDML. Cascade-aware via `ResolvedParagraph` / `ResolvedParagraphAttrs`.
5. **NumberingStartAt + NumberingContinue** ✅ — `NumberingStartAt` jumps the counter on paragraph entry; `NumberingContinue` suppresses the auto-reset that otherwise fires when the prior paragraph wasn't a NumberedList. Counter now persists across BulletList / NoList intermissions on the `StoryEmitter`.
6. **Test font** ✅ — license-clear TTFs landed in `corpus/fonts/` (Open Sans, Inter, Lora, Roboto, Cormorant Garamond, Source Serif 4, Roboto Slab). Pixel-level coverage lives in `real_ttf.rs` + `real_ttf_features.rs`. Glyph-level (`DisplayList`-inspecting) coverage for per-run fonts / threading / underline / strikethrough / vertical justify / bulleted lists / numbered lists lives in `text_glyph_level.rs`.

### Tier 2 — medium, real fidelity wins

7. **Composer calibration** — drive `spikes/composer-calibration` against InDesign-PDF references. Tune `tolerance`, `hyphen_penalty`, `stretch_ratio` toward parity. Spike B in the original plan.
8. **`rustybuzz::Face` cache in `FontTable`** ✅ — per-render `Face<'static>`-over-`Bytes` cache landed via a carefully-reviewed `unsafe` lifetime transmute. `FontTable` now holds `faces: HashMap<(font_id, wght_bits), rustybuzz::Face<'static>>` plus a `face_bytes: HashMap<font_id, Bytes>` whose owned `Bytes` keep the borrowed slices alive; `faces` is declared FIRST in the struct so it's dropped FIRST (Rust drops struct fields in declaration order — first declared = first dropped), guaranteeing the Faces never see a freed buffer. Safety contract: `bytes::Bytes` is refcounted with a stable interior pointer so the buffer cannot move; `face_bytes` is never mutated post-`build`; the public accessor `FontTable::face(font_id, wght_bits) -> Option<&rustybuzz::Face<'_>>` narrows the lifetime back to `&self` so the `'static` lie never escapes; the cached Face is never mutated post-insert (no `&mut` exposed) — variations are baked in at insert time. `FontTable::build` harvests every distinct `(font_id, wght_bits)` from every paragraph (table cells included via a recursive `walk`), parses the Face once, applies `set_variations(wght)`, and stores it. All three shaping call sites (`emit_paragraph_into_chain`, `emit_cell_paragraph`, `measure_cell_paragraph`) and the `emit_text_path_into` site now pull from the cache, falling back to per-paragraph on-demand construction only when the cache misses (defensive — covers fallback-font runs the harvest pass didn't see). Coverage: `text_glyph_level::face_cache_multi_paragraph_render_is_deterministic_and_reuses_glyphs` renders a 20-paragraph fixture twice and asserts identical glyph signatures + deduplicated path_ids.
9. **Bullets character formatting** ✅ — parser captures `BulletsCharacterStyle` + `BulletsAndNumberingDigitsCharacterStyle` on `ParagraphStyleDef` / `ResolvedParagraph` (cascade via BasedOn); `ResolvedParagraphAttrs` carries them through to the renderer. Pipeline resolves the marker style via the standard `CharacterStyle` cascade and threads the resolved `FillColor` into `build_run_paint_picker_resolved` as a leading bullet paint band so the bullet glyph emits with a distinct `FillPath` paint from the content runs. Bullet-vs-numbered-list lookup follows IDML's two-field convention — `NumberedList` reads the digits-style ref; `BulletList` reads `BulletsCharacterStyle` and falls back to the digits-style ref (InDesign's UI exposes a single "Character Style" picker per paragraph style regardless of list kind). Glyph-level coverage: `text_glyph_level::bullet_character_style_paints_bullet_differently_from_content`. Font/size override through the same character style is queued (parser fields already land; pipeline keeps inheriting run 0's face/size today).
10. **Decimal-tab leader characters** ✅ — `<TabStop Leader="...">` strings (e.g. `"."`, `". "`, `"…"`) round-trip through the parser as `Option<String>` (preserving trailing whitespace — `". "` is meaningfully different from `"."`). `idml-text::layout::apply_tab_stops_with_leaders` takes an optional `LeaderContext` that wraps the paragraph's `&[StyledRun]`; each snapped `\t` whose stop has a non-empty leader gets the leader shaped with the run that owns the tab's cluster and tiled across the widened gap. Tiling strategy: whole copies only (`floor(gap / leader_width)`) — a leader strictly wider than the gap emits zero copies (matches InDesign's "drop the leader rather than overflow into the snapped text" behaviour), and any partial trailing space is left empty so the dots stay visually uniform. The synthesised leader glyphs sit at absolute x inside the already-widened tab span, so they don't contribute further advance and they share the tab's `font_id` (which means the `glyph_id`-bucketed emit loop and the `(font_id, glyph_id)` outline interner pick them up cleanly — every `.` glyph reuses one `PathId`). Leaders inherit the surrounding run's `FillColor` / `point_size`; no separate style. Coverage: `idml_parse::story::tests::tab_stop_leader_preserves_multichar_and_whitespace` (parser) + `text_glyph_level::tab_stop_leader_dots_tile_across_the_gap` (renderer, asserts >5 dots tile a TOC-style line with `Leader="."` and zero dots without).
11. **Vello DropShadow** ✅ — offscreen-layer plumbing (#12) plus a multi-tap Gaussian-convolution replay land the Vello side. `PushLayer { effect: GaussianBlur { sigma_pt } }` captures inner commands into a sub-scene; the matching `PopLayer` replays the sub-scene across a 7×7 Gaussian sample grid via `Scene::append`, each tap wrapped in a `(Normal, Plus)`-composed `push_layer` whose alpha is the Gaussian weight at that grid point. The accumulation is mathematically a true 2D convolution — only the grid discretisation approximates the kernel; visual softness matches the CPU separable Gaussian for any σ ≥ 1 pt. The Vello version we link against still has no image-space Gaussian over an arbitrary layer buffer (`draw_blurred_rounded_rect` only blurs a *brush*, and `vello_filters_cpu` is still a reference CPU implementation), so this scene-replay strategy is the only path that stays inside the public Vello API; a true shader-side convolution is on the upstream roadmap but not landed. Implementation in `crates/idml-gpu/src/vello_rs.rs` (`emit_blurred_layer`, `gaussian_sample_grid_1d`, `LayerKind`); coverage in `vello_rs::tests::build_scene_handles_push_layer_gaussian_blur` (encoder smoke) + `push_layer_gaussian_blur_softens_edges_on_gpu` (pixel-level halo assertion, guarded by GPU availability — early-returns when Vello's GPU init fails). The `DropShadow` arm itself remains stubbed; rect-stamp drop shadows now flow through `PathShadow` (multi-stamp falloff) or through the new `PushLayer { GaussianBlur }` + `FillPath` + `PopLayer` plumbing in current emitters.

### Tier 3 — large

12. **Gaussian blur on drop shadow** ✅ — `PushLayer { bounds, effect: LayerEffect, blend_mode, opacity }` / `PopLayer` variants land in `idml-compose::DisplayCommand`. CPU rasterizer extends the existing `GroupFrame` stack with an optional `LayerEffect` field; `PushLayer` pushes a padded offscreen pixmap onto the same stack as `BeginBlendGroup`, `PopLayer` runs a separable Gaussian over the buffer's premultiplied RGBA (when `effect = GaussianBlur { sigma_pt }`) before compositing back with the requested blend mode + opacity. Bounds padding = `3σ + 1px` so the kernel tail doesn't clip. σ_px = `sigma_pt * (dpi / 72)`, matching the existing `DropShadow::blur_radius` semantic. `transform_mut` returns the stub transform field on both variants so post-emit passes (vertical justify etc.) still handle them uniformly. Drop shadow continues to flow through the existing `DropShadow` / `PathShadow` arms (which already produce Gaussian-blurred stamps via inline scratch pixmaps); `PushLayer` is the right primitive for new effect-driven layers and for the future `DropShadow` refactor that wants to compose the shadow stamp with other commands inside the same isolated layer. Vello backend (see #11) now captures the inner commands into a sub-scene and replays them across a 7×7 Gaussian sample grid under a `Compose::Plus` accumulator — mathematically equivalent to a 2D convolution, only the grid discretisation approximates the kernel; the CPU separable Gaussian remains the path of record for the fidelity harness.
13. **Fidelity harness expansion** ✅ — `corpus/generated/diff.sh` runs every paired `*.idml + *.pdf` fixture through `idml-inspect` + `pdftoppm` + `idml-diff` and gates per-page mean ΔE / p99 ΔE / SSIM against `corpus/generated/fidelity-thresholds.json`. Wired into `.github/workflows/fidelity.yml` as a hard step (with poppler-utils install + `actions/upload-artifact@v4` for heatmaps on failure). Current per-fixture worst-page numbers vs. tightened thresholds (mean ΔE / p99 ΔE / SSIM | threshold mean / p99 / ssim): geometry 0.108 / 0.000 / 0.994 | 0.13 / 0.5 / 0.99, geometry-groups 0.160 / 0.000 / 0.989 | 0.20 / 1.0 / 0.984, strokes-fills 0.440 / 9.381 / 0.987 | 0.55 / 11.0 / 0.98, text 0.527 / 7.396 / 0.973 | 0.65 / 8.6 / 0.97, text-advanced 0.562 / 15.963 / 0.968 | 0.70 / 19.0 / 0.96, effects 0.334 / 5.349 / 0.993 | 0.42 / 6.5 / 0.99, gradients 0.158 / 1.027 / 0.994 | 0.20 / 1.3 / 0.99, tables 0.886 / 10.827 / 0.967 | 1.10 / 13.0 / 0.96, images 0.105 / 0.000 / 0.995 | 0.13 / 0.5 / 0.99. Thresholds are now periodically *tightened* (never loosened to mask a regression): rule of thumb is to drop the budget to `worst × 1.15` when current measurement is 50–75% of threshold and `worst × 1.20` when ≤50%, while leaving close-to-edge budgets (>75%) alone; SSIM gets raised toward `worst_min − 0.005` when there is ≥0.010 headroom. Long-term goal stays the idea.md §13.2 budget (mean ≤ 1.0, p99 ≤ 2.5, SSIM ≥ 0.99 for *every* page). `tables` is gated to 7 pages and `images` to 5 because their reference PDFs predate the latest IDML page additions.
14. **Overprint simulation** — Stages 1–3 ✅, Stage 4 deferred. *Parser*: `OverprintFill` / `OverprintStroke` lift off `<Rectangle>` / `<Oval>` / `<Polygon>` / `<TextFrame>` / `<GraphicLine>` (GraphicLine carries stroke only) and off `<CharacterStyleRange>` / `<ParagraphStyleRange>` / `<CharacterStyle>` / `<ParagraphStyle>`; the cascade merges them via `ResolvedCharacter::merge_below` / `ResolvedParagraph::merge_below`. *Display list*: distinct `FillPathOverprint` / `StrokePathOverprint` variants — chosen over a flag on `FillPath` so the knockout fast path stays a single match arm and existing construction sites need no churn. `ResolvedFrame` carries `overprint_fill` / `overprint_stroke` flags; `module::geometry::rewrite_tail_for_overprint` upgrades the emitter's tail of `FillPath` / `StrokePath` commands to the `*Overprint` variant after fill/stroke modules emit. *CPU rasterizer (Stage 3)*: each `*Overprint` command renders into a scratch pixmap sized to the path's pixel bbox (+ stroke pad), then `draw_pixmap`s onto the target with `tiny_skia::BlendMode::Darken` — per-channel `min(top, bottom)`. This is a CMYK-overprint *RGB* approximation: visibly correct for "dark ink on lighter background" / "black-on-tints" (e.g. cyan on magenta → blue; rich black over a yellow tint stays black) but not a true per-channel CMYK composite. *Vello (GPU)*: falls back to a knockout fill (the `Darken` blend mode is available via peniko but doesn't model CMYK overprint either; deferred to Stage 4). *Stage 4 (deferred)*: route CMYK separations end to end through the rasterizer — separate planes, ICC at the end — so overprint becomes per-channel `max(top_cmyk, bottom_cmyk)` where the top's coverage > 0, exact instead of approximate. Multi-batch work; not started. *Gaps documented*: (a) the "K=100 is auto-overprint regardless of attribute" Adobe default isn't honoured — we honour only what the IDML attribute says; (b) text runs don't yet route overprint through the glyph emitter (run-level cascade lands in `ResolvedRunAttrs` but the glyph paint module doesn't consume it yet — frame-level overprint is wired). Coverage: `idml_parse::spread::tests::overprint_attributes_round_trip_through_every_shape`, `idml_parse::story::tests::overprint_round_trips_on_paragraph_and_run`, `idml-renderer/tests/overprint.rs::overprint_fill_darkens_top_color_against_bottom_color` (cyan-on-magenta darken assertion + black-on-yellow knockout check).

### Tier 4 — defer

15. **Tables — header/footer duplication across frame splits** (`T3.1`) ✅ — `RepeatingHeader` / `RepeatingFooter` plumbed through the parser, `emit_table_into_chain` builds an explicit physical-row sequence interleaving body rows with replayed headers / footers at frame splits, all downstream emission (alternating fills, cell content, row dividers, borders) iterates that sequence. Coverage in `text_glyph_level::threaded_table_replays_header_row_at_top_of_each_frame`.
16. **Tables — content-driven row growth** (`MinimumHeight` / `MaximumHeight`) ✅ — top-down pre-measure pass via `measure_cell_paragraph` (factored alongside `emit_cell_paragraph`); per-row growth = `max(SingleRowHeight, MinimumHeight, content)` clamped to `MaximumHeight`. RowSpan > 1: LAST-row absorbs the shortfall, earlier spanned rows keep their declared height (simpler heuristic; smarter proportional distribution is queued). Coverage in `text_glyph_level::table_row_grows_to_fit_content_when_single_row_height_too_small`.
17. **CJK** — vertical writing mode, kinsoku line-break rules, Mojikumi, mid-line emphasis marks. `rustybuzz` already shapes CJK; layout + writing-mode work is the lift. Split into substages so the easy parts can ship while the heavy ones queue:
    - **Stage 1 — Parser surface** ✅ — `StoryDirection` enum (`HorizontalWritingDirection` / `VerticalWritingDirection`) on `<Story>`, `KinsokuSet` / `KinsokuType` / `MojikumiTable` / `MojikumiSet` on `<ParagraphStyleRange>` and `<ParagraphStyle>` (cascading via `BasedOn`), and `RubyFlag` / `RubyType` / `RubyString` / `KentenKind` / `KentenCharacter` / `KentenFontSize` on `<CharacterStyleRange>` and `<CharacterStyle>` all parse into the AST and round-trip through `ResolvedRunAttrs` / `ResolvedParagraphAttrs`. Coverage: `idml_parse::story::tests::parses_story_direction_vertical` + `paragraph_style_range_parses_kinsoku_and_mojikumi` + `character_style_range_parses_ruby_and_kenten` + `idml_parse::styles::tests::resolve_paragraph_propagates_kinsoku_through_based_on` (and 4 more).
    - **Stage 2 — Kinsoku enforcement in the composer** ✅ — `ComposeOptions::kinsoku_enforce: bool` flag; when on, `compose_paragraph` emits per-character `Box` + zero-width stretchable `Glue` items inside each whitespace-segmented "word" wherever both ends of an adjacent-character pair are CJK-relevant. Forbidden break points (no-start char following the gap or no-end char preceding) emit *no* break item, so paragraph-breaker cannot land a break there and shifts elsewhere. Hard-Kinsoku character set: JIS X 4051 §6.1 derivative — ~30 chars including `）」』、。`+ closing brackets + small kana for no-start, `（「『〔` + opening brackets for no-end (full list in `idml_text::compose::kinsoku`). Demonstrable behaviour change: `compose::tests::kinsoku_behavior_change_off_vs_on_is_demonstrable` flips line count from 1 → ≥2 when the same text + narrower column is composed with `kinsoku_enforce = true`, and `compose::tests::kinsoku_forbids_breaking_before_no_start_char` proves no line in the kinsoku-enforced output begins with `）`. Renderer wire-up (driving the flag from `ResolvedParagraphAttrs::kinsoku_type`) is queued but mechanical — `kinsoku_type.is_some()` ⇒ enforce.
    - **Stage 3 — Vertical writing mode** ❌ deferred. A full impl is large: line stacks rotate (lines run top-to-bottom, columns right-to-left), frame insets swap axes, non-CJK glyphs need 90° rotation inside the line (`vert` OT feature for CJK glyphs; raw glyph rotation matrix for Latin), baseline alignment swaps to "right edge of the em-box". Concrete entry points: `idml_text::layout::layout_runs` would need a writing-mode parameter switching x/y axis semantics throughout; `idml_text::layout::apply_tab_stops` would need to treat tab positions as Y-coordinates; `idml_renderer::StoryEmitter` would need a per-frame writing-mode field and rotated frame-chain bookkeeping. None of this exists today.
    - **Stage 4 — Mojikumi + emphasis marks** ❌ deferred. `MojikumiTable` and `KentenKind` parse into the AST today; rendering needs a new per-character-class spacing adjustment pass (Mojikumi) and a glyph-stamping pass that draws emphasis marks above/beside each base character of a run (Kenten). Both are mechanical once the writing-mode pipeline (Stage 3) is in place; for horizontal-only documents the emphasis-mark pass is independently shippable but the visual fidelity gain is small relative to the implementation cost.

## Deferred (with rationale)

- **`self_cell` / `ouroboros`-based `Face` cache** ✅ — full per-render cache shipped via a hand-rolled `unsafe` lifetime transmute (no external crate). See Tier 2 #8 for the safety contract. The transmute is contained to a single `// SAFETY: …` block in `FontTable::build`; `face_bytes` (the buffer owner) and `faces` (the `Face<'static>` cache) are declared in drop-safe order, and the public accessor narrows the lifetime back to `&self` so the lie can't escape the module.
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
- **`text-advanced` font-vs-PDF mismatch**: the fixture's reference PDF was exported on a host without Open Sans installed — InDesign baked its bundled serif (Minion Pro) into the PDF. Per CLAUDE.md's "reference PDFs are baked" convention, `corpus/generated/text-advanced.fonts.sh` substitutes Open Sans → CormorantGaramond in the renderer so the gate compares apples to apples (without that mapping, page 1's drop-cap variant trips both `mean_de` 0.71 > 0.70 and `p99_de` 28.5 > 19.0 because the carved drop-cap width and per-line wrap diverge from the baked serif's). The substitute path is the temporary measure; re-exporting the PDF on a host that has Open Sans installed would let us flip the mapping back to the real face, drop the multi-paragraph comment in `text-advanced.fonts.sh`, and recalibrate thresholds.

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

- `idml-parse`: 93 unit + 3 integration (`roundtrip`) — Tables coverage extended (+3) with `parses_table_with_header_body_footer_and_corner_cells` (3×3 grid, all four corners, header/body/footer counts), `parses_multi_paragraph_cell_content` (multiple `<ParagraphStyleRange>` per cell), and `parses_table_repeating_header_footer_and_row_max_min_height` (`RepeatingHeader` / `RepeatingFooter` booleans + `MaximumHeight` on rows); plus `tab_stop_leader_preserves_multichar_and_whitespace`. TOC parser landed (+2) with `parses_toc_style_with_entries` (Title / TitleStyle round-trip + per-entry Level / IncludeStyle / FormatStyle / PageNumber / Separator) and `parses_self_closing_empty_toc_style` (the default `<TOCStyle ... />` real-world IDMLs always ship). TOC renderer plumbing (+1): `parses_applied_toc_style_on_text_frame` (round-trips `AppliedTOCStyle="TOCStyle/Main"` as `TextFrame::applied_toc_style`). CJK parser surface landed (+8) — `parses_story_direction_vertical` / `parses_story_direction_horizontal_explicit` / `story_direction_absent_defaults_to_none` / `paragraph_style_range_parses_kinsoku_and_mojikumi` / `kinsoku_and_mojikumi_default_to_none_when_absent` / `character_style_range_parses_ruby_and_kenten` / `ruby_and_kenten_default_to_none_when_absent` in `story.rs::tests`, plus `paragraph_style_captures_kinsoku_and_mojikumi_attributes` / `character_style_captures_ruby_and_kenten_attributes` / `resolve_paragraph_propagates_kinsoku_through_based_on` in `styles.rs::tests`.
- `idml-scene`: 4 unit — `story_id_strips_dir_and_prefix` + `resolve_toc_*` family (3 tests covering document-order pick, `PageNumber="Off"` suppression, default-tab separator fallback)
- `idml-text`: 51 unit — Kinsoku Stage 2 added +7 in `compose::tests`: `kinsoku_set_membership_matches_hard_set`, `kinsoku_disabled_baseline_keeps_cjk_text_on_one_line`, `kinsoku_enabled_breaks_per_character_in_cjk_text`, `kinsoku_forbids_breaking_before_no_start_char`, `kinsoku_behavior_change_off_vs_on_is_demonstrable`, `kinsoku_forbids_no_end_char_at_line_end`, `kinsoku_leaves_latin_text_unchanged`.
- `idml-compose`: 22 unit
- `idml-edit`: 25 unit + 18 integration (`seed_hello`)
- `idml-gpu`: 20 unit (CPU default; +vello-backend adds 7 — 3 encoder smoke tests + 3 push-layer/blur-specific tests + the GPU-availability-guarded blur halo assertion)
- `idml-renderer`: 36 lib + 3 inspect bin + 11 `pipeline_lib` + 4 `inspect_e2e` + 3 `real_ttf` + 8 `real_ttf_features` + 16 `text_glyph_level` + 4 `seed_hello`
- `idml-fidelity`: 8 unit + 3 integration (`cli_smoke`)
- `idml-gen`: 9 unit + 25 integration (`snapshot`)
- Spikes: 0 (composer-calibration / vello-eval / wasm-size)
- **Total: 354 across the workspace** (CPU default features). Accumulated additions: justification enum (+2 parse), numbering-polish (+3 parse, +7 renderer unit, +3 `text_glyph_level`), bullet character style (+1 `text_glyph_level`), decimal-tab leaders (+1 parse, +1 `text_glyph_level`), drop-shadow-blur (+3 `idml-gpu`), tables-parser (+2 parse), tables-flow-polish (+1 parse, +2 `text_glyph_level`), CJK parser surface (+7 in `story::tests`, +3 in `styles::tests`), CJK Stage 2 kinsoku (+7 in `compose::tests`).

## Recommended order for the next 3 batches

| # | Batch | Why |
|---|---|---|
| 1 | Image dedup metrics ✅ + Stroke gradient endpoints ✅ | Two trivial Tier 1 wins; closes the gradient-direction gap and adds long-flagged observability. |
| 2 | Test font + glyph-level integration tests ✅ | Done — fonts in `corpus/fonts/`, glyph-level coverage in `text_glyph_level.rs` (per-run fonts, threading, underline + strikethrough, vertical justify, bullets, numbered list). |
| 3 | Justify-vertical mode ✅ | Distribute pass lives in `pipeline.rs`; threaded-frame coverage in `real_ttf_features.rs::vertical_justify_distribute_threaded_per_frame`. Next up: Composer calibration (Spike B). |

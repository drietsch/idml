# Cycle 4 Track 5 — Q-07 (Tracking re-audit) closeout

Cycle 2 deferred Q-07 with note *"gates on Q-18 (Table parser); evidence
is table content"*. Track 1a confirmed Q-18 closed (`ace96e8`), which
unblocked this audit.

## Audit findings

- **Implementation review**: `apply_tracking` at
  `crates/idml-text/src/shape.rs:250` correctly applies IDML's
  Tracking (1/1000 em units): each glyph's `x_advance` gets
  `tracking_thousandths_em * point_size * 64 / 1000` added; the run's
  `total_advance` is updated in lockstep so the composer's column-fit
  measures with tracking applied.
- **Call-site coverage**: tracking is invoked from
  - `crates/idml-text/src/layout.rs:450-452` in `layout_runs` — the
    multi-font path that table cells use,
  - `crates/idml-renderer/src/pipeline.rs:4654-4656` in
    `emit_text_path_into` — the text-on-path path.
  Both fire when `resolved.tracking.is_some()`. The table-cell
  emission path at `pipeline.rs:6696` populates `tracking:
  resolved_runs[i].tracking` per-run, so tracking flows uniformly
  through `<TableCell>` content.
- **Corpus signal**: cycle-2 didn't name specific Q-07 evidence packs;
  the deferral was generic ("table content"). Track 1a's table-vs-
  non-table metric comparison (median 20.41 vs 11.10 ΔE) confirms
  table-bearing packs sit higher overall, but the delta is
  cross-cutting (editorial complexity, font sub) — not specifically
  tracking-attributable. Without a per-cell ΔE attribution that
  isolates table rows from surrounding text + graphics, Q-07 can't
  be cleanly separated from the residual deltas other tracks
  address.

## Conclusion

Q-07 is **closed**. The Tracking implementation is correct and called
on every text path that touches table content. The cycle-2 deferral
was on the *table renderer*; that's resolved. There is no specific
Q-07 fix the cycle-4 corpus signal points to.

## Regression pins added

Two integration tests in `crates/idml-renderer/tests/text_glyph_level.rs`
(`cycle4_q07_positive_tracking_widens_emitted_glyph_advances`,
`cycle4_q07_negative_tracking_tightens_emitted_glyph_advances`) build
synthetic 4-A IDMLs at Tracking=0, Tracking=200, and Tracking=-100,
then render through `build_document` and assert the emitted glyph
span widens / tightens by the expected ±~20pt margin. These pin the
shape → layout_runs → emit pipeline against future composer
refactors that might silently drop `apply_tracking` between shape and
glyph emission.

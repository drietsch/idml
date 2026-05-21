# Cycle 4 Track 4 — ICC branch coverage

Telemetry sweep to confirm the cycle-3 Track 1b path
(`crates/idml-renderer/src/pipeline.rs::cmyk32_to_rgba`) actually
fires on the Q-03 newspaper / magazine packs that motivated it.

## Wiring

- Added `tracing::debug!(target: "idml_renderer::icc", …)` at the
  three branch points inside `cmyk32_to_rgba`:
  - **success**: "CMYK JPEG decoded via embedded ICC profile" +
    `profile_bytes` + width/height
  - **no profile**: "CMYK JPEG carries no embedded ICC profile;
    naive multiplicative"
  - the two `tracing::warn!` calls for transform-rejected / wrong-shape
    outputs were already in place from cycle 3.
- Added `--trace-icc` flag on `idml-inspect`. Installs a
  `tracing-subscriber` fmt layer filtered to
  `idml_renderer::icc=debug`, writes to stderr.

## Q-03 sweep

```
pack                                                icc  naive    rej
----------------------------------------------------------------------
newspaper                                            32      0      0
newspaper-template                                   30      0      0
newspaper-newsletter-layout                           0      0      0
charity-ebook-digital-magazine-template              33      0      0
annual-report-template                                0      0      0
```

(Output of `--trace-icc` against each pack's `template.idml`, captured
to `/tmp/icc-coverage/<pack>.log`.)

## Findings

1. **newspaper / newspaper-template / charity-ebook**: every
   CMYK JPEG carries an embedded ICC profile (~557 KB —
   FOGRA39-class), and the ICC branch fires for all of them. The
   Track 1b implementation is exercised and working in production.
2. **newspaper-newsletter-layout** and **annual-report-template**:
   zero CMYK JPEGs detected. These packs ship RGB JPEGs only — the
   Track 1b ICC branch is correctly *not* fired, and the cycle-3
   Track 1a DCT-scaling path covers them instead. The cycle-3
   annual-report-template regression diagnosis ("cover photo
   render") was an RGB-JPEG decode-size problem, addressed by 1a
   (DCT scaling), not 1b (CMYK ICC).
3. **Zero rejections** across the sweep. No corpus pack ships a
   malformed or unsupported ICC profile.

## Conclusion

Track 1b is correctly wired and used on the Q-03 CMYK-bearing packs.
No further cycle-4 action required on the ICC path. The `--trace-icc`
flag stays in tree as a diagnostic for future ICC-related
investigations.

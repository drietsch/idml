# Per-sample font registrations for manual-sample.idml.
#
# The IDML uses Arial almost everywhere (~229 character-style ranges)
# plus a handful of references to Roboto, Open Sans, Limon Script,
# Times, and Gilroy. We don't ship Arial (Microsoft license), but the
# user noted that Roboto — visually a near-twin of Arial in InDesign's
# Arial substitution chain and licensed under Apache 2.0 — is what
# the reference PDF was actually rendered with. Route Arial through
# Roboto and pin the four real style variants explicitly so bold /
# italic / bold-italic cascades resolve without falling through to
# the variable-axis approximation.
#
# Limon Script (decorative script used for the "dog" word in the
# sample's last colored line) doesn't have a permissive look-alike
# in the bundle today; let it cascade to the default sans for now.
DEFAULT_FONT="$FONTS/Roboto-Regular.ttf"
FONT_FLAGS=(
    --font-family "Arial=$FONTS/Roboto-Regular.ttf"
    --font-family "Arial/Italic=$FONTS/Roboto-Italic.ttf"
    --font-family "Arial/Bold=$FONTS/Roboto-Bold.ttf"
    --font-family "Arial/Bold Italic=$FONTS/Roboto-BoldItalic.ttf"
    --font-family "Roboto=$FONTS/Roboto-Regular.ttf"
    --font-family "Roboto/Italic=$FONTS/Roboto-Italic.ttf"
    --font-family "Roboto/Bold=$FONTS/Roboto-Bold.ttf"
    --font-family "Roboto/Bold Italic=$FONTS/Roboto-BoldItalic.ttf"
    --font-family "Open Sans=$FONTS/OpenSans.ttf"
    --font-family "Open Sans/Italic=$FONTS/OpenSans-Italic.ttf"
    # Limon Script (decorative script the IDML uses for the standalone
    # word "dog" in the last colored line) isn't bundled. The closest
    # we have is OpenSans-Italic — distinctly different from the body
    # face but at least visually marks the word as a stylistic insert.
    --font-family "Limon Script=$FONTS/OpenSans-Italic.ttf"
    # Gilroy (used for the 72pt "PHOTO" overlay on page 6) — also
    # absent. Roboto-Bold matches the geometric-sans flavour more
    # closely than the Roboto-Regular default would.
    --font-family "Gilroy=$FONTS/Roboto-Bold.ttf"
    --font-family "Gilroy/Black=$FONTS/Roboto-Bold.ttf"
    --font-family "Gilroy/Black Italic=$FONTS/Roboto-BoldItalic.ttf"
    # Pin Arial's typographic ascender (0.728 em from OS/2.sTypoAscender)
    # for first-baseline math. The reference PDF was rendered with real
    # Arial (confirmed via `pdffonts manual-sample.pdf` — ArialMT is
    # subsetted in), so InDesign's "Ascent" first-baseline-offset uses
    # Arial's sTypoAscender = 1491/2048 = 0.728. Without this override
    # the renderer's per-family metrics map has no entry for "Arial"
    # and falls back to the `0.8 × pt` heuristic in
    # `LayoutOptions::new` — close, but ~1 pt low at 12pt (and worse
    # at larger sizes), which left a systemic baseline drift across
    # pages 1 + 2. Cap- and x-height (0.716 / 0.518) are included so
    # CapHeight / XHeight first-baseline modes also resolve against
    # Arial's geometry rather than the substitute's, even though this
    # sample doesn't exercise those modes today.
    --font-metrics "Arial=0.728,0.716,0.518"
)
# Manual sample's placed images live in `corpus/samples/media/`,
# referenced by absolute file URIs in the IDML. The resolver looks
# them up by basename in any registered link-dir, so registering the
# media directory makes the photos resolve without rewriting URIs.
LINKS_FLAG="--links-dir $SAMPLE_DIR/media"

# corpus/envato/overrides/_default/fonts.sh
#
# Fallback font registrations for any envato pack without a per-pack
# `corpus/envato/overrides/<pack>/fonts.sh` sidecar. Sourced by
# corpus/envato/test.sh after computing $FONTS.
#
# The mapping is intentionally crude: route every common Adobe-licensed
# face plus a handful of frequent OFL designs to one of the seven OFL
# faces we ship in corpus/fonts/. Most packs need overrides to get
# their typography right (e.g. Playfair → Cormorant), but this gets
# unconfigured packs to a "renders without crashing" baseline so the
# smoke harness can still catch parser regressions.

DEFAULT_FONT="$FONTS/Inter.ttf"
FONT_FLAGS=(
    # Generic sans-serif: most templates use a sans-serif body so
    # Inter is the safer default than Roboto or Open Sans. Bold slots
    # all route to Roboto-Bold (the only bundled single-face Bold TTF)
    # because most of our generic-sans Regular fallbacks have no `wght`
    # axis and `set_variations` was silently no-op'ing them (P-06).
    --font-family "Helvetica=$FONTS/Inter.ttf"
    --font-family "Helvetica/Bold=$FONTS/Roboto-Bold.ttf"
    --font-family "Helvetica Neue=$FONTS/Inter.ttf"
    --font-family "Helvetica Neue/Bold=$FONTS/Roboto-Bold.ttf"
    --font-family "Arial=$FONTS/Inter.ttf"
    --font-family "Arial/Bold=$FONTS/Roboto-Bold.ttf"
    --font-family "Arial/Italic=$FONTS/OpenSans-Italic.ttf"
    --font-family "Myriad Pro=$FONTS/Inter.ttf"
    --font-family "Myriad Pro/Bold=$FONTS/Roboto-Bold.ttf"
    --font-family "Open Sans=$FONTS/OpenSans.ttf"
    --font-family "Open Sans/Bold=$FONTS/Roboto-Bold.ttf"
    --font-family "Open Sans/Italic=$FONTS/OpenSans-Italic.ttf"
    --font-family "Inter=$FONTS/Inter.ttf"
    --font-family "Inter/Bold=$FONTS/Roboto-Bold.ttf"
    --font-family "Roboto=$FONTS/Roboto-Regular.ttf"
    --font-family "Roboto/Italic=$FONTS/Roboto-Italic.ttf"
    --font-family "Roboto/Bold=$FONTS/Roboto-Bold.ttf"
    --font-family "Roboto/Bold Italic=$FONTS/Roboto-BoldItalic.ttf"
    --font-family "Lato=$FONTS/Inter.ttf"
    --font-family "Lato/Bold=$FONTS/Roboto-Bold.ttf"
    --font-family "Montserrat=$FONTS/Inter.ttf"
    --font-family "Montserrat/Bold=$FONTS/Roboto-Bold.ttf"
    --font-family "Poppins=$FONTS/Inter.ttf"
    --font-family "Poppins/Bold=$FONTS/Roboto-Bold.ttf"
    --font-family "DM Sans=$FONTS/Inter.ttf"
    --font-family "DM Sans/Bold=$FONTS/Roboto-Bold.ttf"
    --font-family "Nunito=$FONTS/Inter.ttf"
    --font-family "Nunito/Bold=$FONTS/Roboto-Bold.ttf"
    --font-family "Raleway=$FONTS/Inter.ttf"
    --font-family "Raleway/Bold=$FONTS/Roboto-Bold.ttf"
    --font-family "Barlow=$FONTS/Inter.ttf"
    --font-family "Barlow/Bold=$FONTS/Roboto-Bold.ttf"
    --font-family "Source Sans 3=$FONTS/OpenSans.ttf"
    --font-family "Source Sans 3/Bold=$FONTS/Roboto-Bold.ttf"

    # Generic serif: SourceSerif4 is closest to Adobe's classic
    # bookish faces (Minion, Garamond, etc.). Bold slots route to
    # Roboto-Bold for the same reason as the sans block (P-06): the
    # bundled serif Regulars have no `wght` axis to bake.
    --font-family "Times New Roman=$FONTS/SourceSerif4.ttf"
    --font-family "Times New Roman/Bold=$FONTS/Roboto-Bold.ttf"
    --font-family "Times=$FONTS/SourceSerif4.ttf"
    --font-family "Times/Bold=$FONTS/Roboto-Bold.ttf"
    --font-family "Minion Pro=$FONTS/SourceSerif4.ttf"
    --font-family "Minion Pro/Bold=$FONTS/Roboto-Bold.ttf"
    --font-family "Source Serif 4=$FONTS/SourceSerif4.ttf"
    --font-family "Source Serif 4/Bold=$FONTS/Roboto-Bold.ttf"
    --font-family "Playfair Display=$FONTS/CormorantGaramond.ttf"
    --font-family "Playfair Display/Bold=$FONTS/Roboto-Bold.ttf"
    --font-family "Cormorant Garamond=$FONTS/CormorantGaramond.ttf"
    --font-family "Cormorant Garamond/Bold=$FONTS/Roboto-Bold.ttf"
    --font-family "Instrument Serif=$FONTS/SourceSerif4.ttf"
    --font-family "Instrument Serif/Bold=$FONTS/Roboto-Bold.ttf"
    --font-family "Merriweather=$FONTS/Lora.ttf"
    --font-family "Merriweather/Bold=$FONTS/Roboto-Bold.ttf"
    --font-family "Lora=$FONTS/Lora.ttf"
    --font-family "Lora/Bold=$FONTS/Roboto-Bold.ttf"
    --font-family "Abril Fatface=$FONTS/RobotoSlab.ttf"
    --font-family "Abril Fatface/Bold=$FONTS/Roboto-Bold.ttf"
    --font-family "Vollkorn SC=$FONTS/SourceSerif4.ttf"
    --font-family "Vollkorn SC/Bold=$FONTS/Roboto-Bold.ttf"
    --font-family "Yantramanav=$FONTS/Roboto-Regular.ttf"
    --font-family "Yantramanav/Bold=$FONTS/Roboto-Bold.ttf"

    # Slab + display:
    --font-family "Roboto Slab=$FONTS/RobotoSlab.ttf"
    --font-family "Roboto Slab/Bold=$FONTS/Roboto-Bold.ttf"
    --font-family "Alfa Slab One=$FONTS/RobotoSlab.ttf"
    --font-family "Alfa Slab One/Bold=$FONTS/Roboto-Bold.ttf"
    --font-family "Marcellus SC=$FONTS/SourceSerif4.ttf"
    --font-family "Marcellus SC/Bold=$FONTS/Roboto-Bold.ttf"

    # Script-ish — no convincing OFL look-alike in the bundle today;
    # route to italic so reviewers see something stylistically
    # marked rather than a body fallback.
    --font-family "Sail=$FONTS/OpenSans-Italic.ttf"
    --font-family "Allison=$FONTS/OpenSans-Italic.ttf"
    --font-family "Corinthia=$FONTS/OpenSans-Italic.ttf"
    --font-family "Abuget=$FONTS/OpenSans-Italic.ttf"

    # Symbol fonts: Entypo is a pictograph face; SourceSerif4 produces
    # readable lorem-ipsum-ish output where Entypo would draw icons.
    # Substitution is intentionally lossy.
    --font-family "Entypo=$FONTS/SourceSerif4.ttf"
)

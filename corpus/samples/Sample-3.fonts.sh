# Per-sample font registration for Sample-3.idml. The doc references
# Adobe-licensed Minion Pro + Myriad Pro; InDesign substitutes both
# with Myriad-like sans-serif glyphs in the exported PDF, so the
# fidelity diff matches best when both families resolve to a modern
# sans-serif. Inter is the closest permissively-licensed shape we
# ship in corpus/fonts/.
DEFAULT_FONT="$FONTS/Inter.ttf"
FONT_FLAGS=(
    --font-family "Minion Pro=$FONTS/Inter.ttf"
    --font-family "Minion Pro/Bold=$FONTS/Inter.ttf"
    --font-family "Minion Pro/Italic=$FONTS/Inter.ttf"
    --font-family "Myriad Pro=$FONTS/Inter.ttf"
    --font-family "Myriad Pro/Bold=$FONTS/Inter.ttf"
    --font-family "Myriad Pro/Italic=$FONTS/Inter.ttf"
    --font-family "Open Sans=$FONTS/OpenSans.ttf"
    --font-family "Open Sans/Italic=$FONTS/OpenSans-Italic.ttf"
)

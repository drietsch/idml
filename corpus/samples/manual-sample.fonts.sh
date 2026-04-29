# Per-sample font registrations for manual-sample.idml.
#
# The IDML uses Arial across the board; we don't ship Arial (Microsoft
# license), so substitute permissively-licensed fallbacks. Inter is a
# variable font with a wght axis the renderer maps onto the IDML
# `FontStyle="Bold"` cascade automatically — one file covers Regular
# *and* Bold. Italic/Bold-Italic share OpenSans-Italic since that's
# the only italic face we bundle today.
#
# The `--font-family NAME[/STYLE]=PATH` form pins each style variant
# explicitly; the renderer falls back to the bare-family entry when a
# requested style isn't registered, then to the document-wide
# `--default-font`.
DEFAULT_FONT="$FONTS/Inter.ttf"
FONT_FLAGS=(
    --font-family "Arial=$FONTS/Inter.ttf"
    --font-family "Arial/Italic=$FONTS/OpenSans-Italic.ttf"
    --font-family "Arial/Bold=$FONTS/Inter.ttf"
    --font-family "Arial/Bold Italic=$FONTS/OpenSans-Italic.ttf"
)

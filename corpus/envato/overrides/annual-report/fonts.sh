# Envato pack: annual-report
# Declared fonts: Yantramanav (humanist sans), Entypo (pictograph).
# Yantramanav has Roboto-ish proportions so we route it through
# Roboto's four explicit weights. Entypo is a symbol font with no
# permissive look-alike in the bundle; substitute with SourceSerif4
# to keep the diff focused on text-block fidelity rather than icon
# fidelity (icons will draw as readable serif glyphs, intentionally
# mismatched).

DEFAULT_FONT="$FONTS/Roboto-Regular.ttf"
FONT_FLAGS=(
    --font-family "Yantramanav=$FONTS/Roboto-Regular.ttf"
    --font-family "Yantramanav/Italic=$FONTS/Roboto-Italic.ttf"
    --font-family "Yantramanav/Bold=$FONTS/Roboto-Bold.ttf"
    --font-family "Yantramanav/Bold Italic=$FONTS/Roboto-BoldItalic.ttf"
    --font-family "Entypo=$FONTS/SourceSerif4.ttf"
)

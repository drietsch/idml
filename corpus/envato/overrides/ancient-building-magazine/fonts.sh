# Envato pack: ancient-building-magazine
# Declared (Read Me.txt): Poppins, DM Sans, Instrument Serif.
# All three are OFL on Google Fonts, but we don't ship them; route
# the two sans-serif families through Inter and the serif through
# SourceSerif4. Both fonts are visually close enough that headlines
# stay readable; expect notable shape drift on display weights.

DEFAULT_FONT="$FONTS/Inter.ttf"
FONT_FLAGS=(
    --font-family "Poppins=$FONTS/Inter.ttf"
    --font-family "Poppins/Bold=$FONTS/Roboto-Bold.ttf"
    --font-family "Poppins/Italic=$FONTS/OpenSans-Italic.ttf"
    --font-family "DM Sans=$FONTS/Inter.ttf"
    --font-family "DM Sans/Bold=$FONTS/Roboto-Bold.ttf"
    --font-family "Instrument Serif=$FONTS/SourceSerif4.ttf"
)

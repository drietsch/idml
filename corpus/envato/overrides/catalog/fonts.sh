# Envato pack: catalog
# Declared (Fonts.txt): Playfair Display (display serif), Montserrat
# (geometric sans). Playfair routes to Cormorant Garamond — closest
# bookish-display face in our bundle. Montserrat → Inter.

DEFAULT_FONT="$FONTS/Inter.ttf"
FONT_FLAGS=(
    --font-family "Playfair Display=$FONTS/CormorantGaramond.ttf"
    --font-family "Playfair Display/Italic=$FONTS/CormorantGaramond.ttf"
    --font-family "Playfair Display/Bold=$FONTS/CormorantGaramond.ttf"
    --font-family "Montserrat=$FONTS/Inter.ttf"
    --font-family "Montserrat/Bold=$FONTS/Roboto-Bold.ttf"
    --font-family "Montserrat/Italic=$FONTS/OpenSans-Italic.ttf"
)

# Envato pack: newspaper
# 28 MB tabloid IDML — the heaviest typography sample in the envato
# corpus. The readme is a Canva pitch with no font listing; the IDML
# itself references a mix of common sans + serif faces InDesign's
# automatic substitution handles tolerably. Default mapping covers
# everything we've seen, but we pin the explicit families InDesign
# reports as "applied" so future changes to the defaults don't
# silently move this pack's metrics.

DEFAULT_FONT="$FONTS/Inter.ttf"
FONT_FLAGS=(
    --font-family "Roboto=$FONTS/Roboto-Regular.ttf"
    --font-family "Roboto/Italic=$FONTS/Roboto-Italic.ttf"
    --font-family "Roboto/Bold=$FONTS/Roboto-Bold.ttf"
    --font-family "Roboto/Bold Italic=$FONTS/Roboto-BoldItalic.ttf"
    --font-family "Roboto Slab=$FONTS/RobotoSlab.ttf"
    --font-family "Lora=$FONTS/Lora.ttf"
)

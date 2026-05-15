# annual-report

A4 annual report layout with infographic accents. Declared fonts
(per "Fonts download link.txt"):

- Yantramanav (Erin McLaughlin, OFL via Google Fonts)
- Entypo (Daniel Bruce, CC-BY)

We substitute Yantramanav with Roboto (close geometric humanist
sans) and Entypo with SourceSerif4. The Entypo substitution is
intentionally lossy — every icon glyph will render as a letter
glyph. Pages dominated by icons (e.g. social-media bar) will diff
badly; pages dominated by body text should be close.

Stage: `smoke`. Promote to `gated` only after splitting metrics by
page and accepting the icon pages permanently fail.

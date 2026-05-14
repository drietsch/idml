// corpus/envato/overrides/_default/fonts.jsx
//
// Default InDesign font-substitution map for envato packs without a
// per-pack overrides/<pack>/fonts.jsx sidecar. Mirrors the renderer
// substitutions in overrides/_default/fonts.sh so the InDesign-exported
// reference PDF uses the same fonts the renderer substitutes with;
// otherwise the diff measures font-choice differences instead of
// renderer fidelity.
//
// Keys are the IDML-declared family names (case-sensitive — match the
// "applied font" string InDesign would set on a character style).
// Values are postscript names of fonts that the pack's
// "Document fonts/" directory (symlinked to corpus/fonts/) makes
// available to InDesign when it opens the doc.

var SUBS = {
    // Sans:
    "Helvetica":         "Inter Regular",
    "Helvetica Bold":    "Roboto Bold",
    "Helvetica Neue":    "Inter Regular",
    "Helvetica Neue Bold": "Roboto Bold",
    "Arial":             "Inter Regular",
    "Arial Bold":        "Roboto Bold",
    "Arial Italic":      "Open Sans Italic",
    "Myriad Pro":        "Inter Regular",
    "Myriad Pro Bold":   "Roboto Bold",
    "Open Sans":         "Open Sans Regular",
    "Open Sans Bold":    "Roboto Bold",
    "Open Sans Italic":  "Open Sans Italic",
    "Inter":             "Inter Regular",
    "Inter Bold":        "Roboto Bold",
    "Roboto":            "Roboto Regular",
    "Roboto Italic":     "Roboto Italic",
    "Roboto Bold":       "Roboto Bold",
    "Roboto Bold Italic": "Roboto Bold Italic",
    "Lato":              "Inter Regular",
    "Lato Bold":         "Roboto Bold",
    "Montserrat":        "Inter Regular",
    "Montserrat Bold":   "Roboto Bold",
    "Poppins":           "Inter Regular",
    "Poppins Bold":      "Roboto Bold",
    "DM Sans":           "Inter Regular",
    "DM Sans Bold":      "Roboto Bold",
    "Nunito":            "Inter Regular",
    "Nunito Bold":       "Roboto Bold",
    "Raleway":           "Inter Regular",
    "Raleway Bold":      "Roboto Bold",
    "Barlow":            "Inter Regular",
    "Barlow Bold":       "Roboto Bold",
    "Source Sans 3":     "Open Sans Regular",
    "Source Sans 3 Bold": "Roboto Bold",

    // Serif:
    "Times New Roman":   "Source Serif 4 Regular",
    "Times New Roman Bold": "Roboto Bold",
    "Times":             "Source Serif 4 Regular",
    "Times Bold":        "Roboto Bold",
    "Minion Pro":        "Source Serif 4 Regular",
    "Minion Pro Bold":   "Roboto Bold",
    "Source Serif 4":    "Source Serif 4 Regular",
    "Source Serif 4 Bold": "Roboto Bold",
    "Playfair Display":  "Cormorant Garamond Light",
    "Playfair Display Bold": "Roboto Bold",
    "Cormorant Garamond": "Cormorant Garamond Light",
    "Cormorant Garamond Bold": "Roboto Bold",
    "Instrument Serif":  "Source Serif 4 Regular",
    "Instrument Serif Bold": "Roboto Bold",
    "Merriweather":      "Lora Regular",
    "Merriweather Bold": "Roboto Bold",
    "Lora":              "Lora Regular",
    "Lora Bold":         "Roboto Bold",
    "Abril Fatface":     "Roboto Slab Regular",
    "Abril Fatface Bold": "Roboto Bold",
    "Vollkorn SC":       "Source Serif 4 Regular",
    "Vollkorn SC Bold":  "Roboto Bold",
    "Yantramanav":       "Roboto Regular",
    "Yantramanav Bold":  "Roboto Bold",

    // Slab + display:
    "Roboto Slab":       "Roboto Slab Regular",
    "Roboto Slab Bold":  "Roboto Bold",
    "Alfa Slab One":     "Roboto Slab Regular",
    "Alfa Slab One Bold": "Roboto Bold",
    "Marcellus SC":      "Source Serif 4 Regular",
    "Marcellus SC Bold": "Roboto Bold",

    // Script / symbol — lossy on purpose, see fonts.sh notes:
    "Sail":              "Open Sans Italic",
    "Allison":           "Open Sans Italic",
    "Corinthia":         "Open Sans Italic",
    "Abuget":            "Open Sans Italic",
    "Entypo":            "Source Serif 4 Regular"
};

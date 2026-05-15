// corpus/envato/export-pdf.jsx
//
// Open the IDML at IN_PATH, optionally rewrite missing fonts using the
// substitution map at FONTS_JSX, and export a single PDF to OUT_PATH.
// Globals (IN_PATH, OUT_PATH, FONTS_JSX, PRESET) come from a tmp
// wrapper jsx written by export-pdf.sh.
//
// FONTS_JSX, when set, is a file path. The file must `#include`-style
// just define a SUBS object:
//     var SUBS = { "Poppins": "Inter Regular", ... };
// Each key is the IDML-declared family name; the value is the InDesign
// postscript font name to substitute with (e.g. "Inter Regular",
// "Source Serif 4 Regular"). The font must be system-installed OR
// present in the pack's "Document fonts" directory (unpack.sh wires
// this up to point at corpus/fonts/).

#target indesign

(function () {
    if (typeof IN_PATH === "undefined" || typeof OUT_PATH === "undefined") {
        throw new Error("export-pdf.jsx: IN_PATH/OUT_PATH not set by wrapper");
    }
    var inFile = new File(IN_PATH);
    var outFile = new File(OUT_PATH);
    if (!inFile.exists) {
        throw new Error("export-pdf.jsx: input IDML not found: " + IN_PATH);
    }

    // INTERACT_WITH_ALERTS makes InDesign auto-take the default action
    // for missing-font / linked-image / older-version dialogs instead
    // of raising 30486. Without this, third-party IDMLs fail to open.
    var prevUI = app.scriptPreferences.userInteractionLevel;
    app.scriptPreferences.userInteractionLevel =
        UserInteractionLevels.INTERACT_WITH_ALERTS;

    try {
        var doc = app.open(inFile, false /* showingWindow */);
        try {
            if (typeof FONTS_JSX !== "undefined" && FONTS_JSX) {
                applySubstitutions(doc, FONTS_JSX);
            }
            configureExportPrefs();
            doc.exportFile(ExportFormat.PDF_TYPE, outFile, false);
        } finally {
            doc.close(SaveOptions.NO);
        }
    } finally {
        app.scriptPreferences.userInteractionLevel = prevUI;
    }

    // ----------------------------------------------------------------

    function applySubstitutions(doc, fontsJsxPath) {
        var f = new File(fontsJsxPath);
        if (!f.exists) return;
        f.encoding = "UTF-8";
        f.open("r");
        var body = f.read();
        f.close();
        // SUBS comes into scope via eval; the file just sets `var SUBS = {...}`.
        var SUBS;  // eslint-disable-line no-unused-vars
        eval(body);
        if (typeof SUBS !== "object" || SUBS === null) return;

        // Reset find/change once before the loop.
        app.findTextPreferences = NothingEnum.NOTHING;
        app.changeTextPreferences = NothingEnum.NOTHING;

        for (var src in SUBS) {
            if (!SUBS.hasOwnProperty(src)) continue;
            var dst = SUBS[src];
            try {
                app.findTextPreferences = NothingEnum.NOTHING;
                app.changeTextPreferences = NothingEnum.NOTHING;
                app.findTextPreferences.appliedFont = src;
                app.changeTextPreferences.appliedFont = dst;
                doc.changeText();
            } catch (e) {
                // Skip subs that don't resolve (unrecognised source family
                // name, or dst font not loaded). Logged but non-fatal.
                $.writeln(
                    "[export-pdf.jsx] skip sub " + src + " → " + dst +
                    ": " + e.message
                );
            }
        }
        app.findTextPreferences = NothingEnum.NOTHING;
        app.changeTextPreferences = NothingEnum.NOTHING;
    }

    function configureExportPrefs() {
        // Press-quality-ish: include all printable pages, single-page
        // (no spreads), embed everything, RGB-aware. Matches how
        // corpus/samples/diff.sh expects to rasterise PDFs.
        var prefs = app.pdfExportPreferences;
        prefs.pageRange = PageRange.ALL_PAGES;
        prefs.exportReaderSpreads = false;
        // Embed full fonts (no subsetting) so the rasterised PDF lines
        // up with the renderer's full-font output. Setting the subset
        // threshold to 0% means "always embed full font, never subset".
        prefs.subsetFontsBelow = 0;
        prefs.includeBookmarks = false;
        prefs.includeHyperlinks = false;
        prefs.viewPDF = false;
        prefs.useDocumentBleedWithPDF = false;
        prefs.cropMarks = false;
        prefs.pageInformationMarks = false;
        prefs.bleedMarks = false;
        prefs.registrationMarks = false;
    }
})();

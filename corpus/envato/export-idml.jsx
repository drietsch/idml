// corpus/envato/export-idml.jsx
//
// Open the INDD at IN_PATH and export it as IDML to OUT_PATH, then
// close without saving. Globals (IN_PATH, OUT_PATH) are written by the
// caller into a temp wrapper jsx that #include's this file. Used when a
// pack ships only INDD; the harness needs IDML to drive the renderer.
//
// Errors abort the script and propagate via the AppleScript "do script"
// channel; corpus/envato/export-idml.sh checks for the output file's
// existence post-run.

#target indesign

(function () {
    if (typeof IN_PATH === "undefined" || typeof OUT_PATH === "undefined") {
        throw new Error("export-idml.jsx: IN_PATH/OUT_PATH not set by wrapper");
    }
    var inFile = new File(IN_PATH);
    var outFile = new File(OUT_PATH);
    if (!inFile.exists) {
        throw new Error("export-idml.jsx: input INDD not found: " + IN_PATH);
    }

    // We want a quiet round-trip from INDD to IDML, but we cannot use
    // NEVER_INTERACT: that level causes InDesign to *error* (30486)
    // rather than show missing-font / format-conversion dialogs, which
    // it absolutely will encounter on third-party packs. INTERACT_WITH_ALERTS
    // suppresses the alerts and accepts their default action, which for
    // missing fonts is "open with substitutions" — exactly what we want.
    var prevUI = app.scriptPreferences.userInteractionLevel;
    app.scriptPreferences.userInteractionLevel =
        UserInteractionLevels.INTERACT_WITH_ALERTS;
    try {
        var doc = app.open(inFile, false /* showingWindow */);
        try {
            doc.exportFile(ExportFormat.INDESIGN_MARKUP, outFile, false);
        } finally {
            doc.close(SaveOptions.NO);
        }
    } finally {
        app.scriptPreferences.userInteractionLevel = prevUI;
    }
})();

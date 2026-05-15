#!/usr/bin/env bash
# corpus/envato/export-pdf.sh
#
# Drive InDesign 2025 to open one pack's IDML and export a PDF
# reference into packs/<name>/reference.pdf. Substitutions in
# overrides/<name>/fonts.jsx replace declared font names with
# postscript names of fonts InDesign can resolve — pointing the
# substitute at the same family our renderer uses keeps the diff
# focused on the renderer rather than font mismatch.
#
# Caches: skip if reference.pdf is newer than both template.idml and
# the fonts.jsx (or _default's fonts.jsx, if no per-pack file exists).
# Pass --force to re-export, or set IDML_ENVATO_FORCE_EXPORT=1.
#
# Usage:
#   corpus/envato/export-pdf.sh <pack-name>
#   corpus/envato/export-pdf.sh --force <pack-name>

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
ENVATO_DIR="$ROOT/corpus/envato"
PACKS_DIR="$ENVATO_DIR/packs"
OVERRIDES_DIR="$ENVATO_DIR/overrides"
GENERIC_JSX="$ENVATO_DIR/export-pdf.jsx"

FORCE="${IDML_ENVATO_FORCE_EXPORT:-0}"
ARGS=()
for arg in "$@"; do
    case "$arg" in
        --force) FORCE=1 ;;
        *) ARGS+=("$arg") ;;
    esac
done
[ "${#ARGS[@]}" -eq 1 ] || { echo "usage: $0 [--force] <pack-name>" >&2; exit 2; }
NAME="${ARGS[0]}"

[ -f "$GENERIC_JSX" ] || { echo "missing $GENERIC_JSX"; exit 2; }
command -v osascript >/dev/null || { echo "osascript missing (mac-only)"; exit 2; }

idml_path="$PACKS_DIR/$NAME/template.idml"
pdf_path="$PACKS_DIR/$NAME/reference.pdf"
fonts_jsx="$OVERRIDES_DIR/$NAME/fonts.jsx"
[ -f "$fonts_jsx" ] || fonts_jsx="$OVERRIDES_DIR/_default/fonts.jsx"
[ -f "$idml_path" ] || { echo "[$NAME] missing $idml_path — run unpack.sh first"; exit 1; }

# Cache: skip if reference.pdf is newer than every input.
if [ "$FORCE" -eq 0 ] && [ -f "$pdf_path" ]; then
    cache_valid=1
    if [ "$idml_path" -nt "$pdf_path" ]; then cache_valid=0; fi
    if [ -f "$fonts_jsx" ] && [ "$fonts_jsx" -nt "$pdf_path" ]; then cache_valid=0; fi
    if [ "$cache_valid" -eq 1 ]; then
        echo "[$NAME] reference.pdf is up to date"
        exit 0
    fi
fi

tmp_dir=$(mktemp -d -t envato-export-pdf)
tmp_jsx="$tmp_dir/wrapper.jsx"
if [ -z "${ENVATO_KEEP_TMP_JSX:-}" ]; then
    trap 'rm -rf "$tmp_dir"' EXIT
fi

# Escape backslashes and double-quotes for ExtendScript string literals.
escape() { printf '%s' "$1" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g'; }

{
    printf 'var IN_PATH = "%s";\n' "$(escape "$idml_path")"
    printf 'var OUT_PATH = "%s";\n' "$(escape "$pdf_path")"
    if [ -f "$fonts_jsx" ]; then
        printf 'var FONTS_JSX = "%s";\n' "$(escape "$fonts_jsx")"
    fi
    printf '#include "%s"\n' "$(escape "$GENERIC_JSX")"
} > "$tmp_jsx"

echo "[$NAME] InDesign export → $pdf_path"
osascript <<EOF
tell application id "com.adobe.InDesign"
    activate
    do script POSIX file "$tmp_jsx" language javascript
end tell
EOF

if [ ! -s "$pdf_path" ]; then
    echo "[$NAME] InDesign produced no PDF at $pdf_path"
    exit 1
fi
echo "[$NAME] exported PDF → $pdf_path"

#!/usr/bin/env bash
# corpus/envato/export-idml.sh
#
# Drive InDesign 2025 to open one pack's INDD and export it to IDML at
# packs/<name>/template.idml. Called by unpack.sh as a fallback when
# the manifest entry has no idml_in_zip (i.e. the pack ships only INDD).
#
# Caches the result: re-runs are no-ops if template.idml already exists
# and is newer than the source INDD inside the zip. Pass --force to
# override.
#
# Usage:
#   corpus/envato/export-idml.sh <pack-name>
#   corpus/envato/export-idml.sh --force <pack-name>

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
ENVATO_DIR="$ROOT/corpus/envato"
PACKS_DIR="$ENVATO_DIR/packs"
MANIFEST="$ENVATO_DIR/manifest.json"
GENERIC_JSX="$ENVATO_DIR/export-idml.jsx"

FORCE=0
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

entry=$(python3 -c "
import json, sys
m = json.load(open('$MANIFEST'))
for p in m['packs']:
    if p['name'] == '$NAME':
        print(p['zip'])
        print(p.get('indd_in_zip') or '')
        sys.exit(0)
sys.exit(f'[$NAME] not in manifest')
")
zip_name=$(printf '%s\n' "$entry" | sed -n 1p)
indd_in=$(printf '%s\n' "$entry" | sed -n 2p)
[ -n "$indd_in" ] || { echo "[$NAME] manifest has no indd_in_zip — nothing to export"; exit 1; }

zip_path="$ENVATO_DIR/$zip_name"
dest="$PACKS_DIR/$NAME"
indd_path="$dest/source.indd"
idml_path="$dest/template.idml"

if [ "$FORCE" -eq 0 ] && [ -f "$idml_path" ] && [ "$idml_path" -nt "$zip_path" ]; then
    return 0 2>/dev/null || exit 0
fi

mkdir -p "$dest"
echo "[$NAME] extracting INDD from $zip_name"
unzip -p "$zip_path" "$indd_in" > "$indd_path"

# macOS mktemp -t doesn't honour a .jsx suffix — it appends garbage
# after the suffix and InDesign refuses to run a non-".jsx" file with
# error 30485 ("incompatible script language"). Build a temp dir and
# put our wrapper inside it instead.
tmp_dir=$(mktemp -d -t envato-export-idml)
tmp_jsx="$tmp_dir/wrapper.jsx"
if [ -z "${ENVATO_KEEP_TMP_JSX:-}" ]; then
    trap 'rm -rf "$tmp_dir"' EXIT
fi

# Escape POSIX paths for safe ExtendScript inclusion. The values are
# repo-controlled, but escaping backslashes / quotes keeps the loader
# robust against unusual filenames inside the unpack tree.
escape() { printf '%s' "$1" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g'; }

{
    printf 'var IN_PATH = "%s";\n' "$(escape "$indd_path")"
    printf 'var OUT_PATH = "%s";\n' "$(escape "$idml_path")"
    printf '#include "%s"\n' "$(escape "$GENERIC_JSX")"
} > "$tmp_jsx"

echo "[$NAME] InDesign export: $indd_path → $idml_path (this can take ~30s)"
# Push InDesign into a non-interactive mode at the AppleScript layer
# (and not only inside the jsx) so any dialog InDesign might want to
# pop on doc-open (older format, missing fonts, missing links, etc.)
# is suppressed before doc.open() is even called.
osascript <<EOF
tell application id "com.adobe.InDesign"
    activate
    do script POSIX file "$tmp_jsx" language javascript
end tell
EOF

# Discard the INDD copy — we only needed it during the InDesign open.
rm -f "$indd_path"

if [ ! -s "$idml_path" ]; then
    echo "[$NAME] InDesign produced no IDML at $idml_path"
    exit 1
fi
echo "[$NAME] exported IDML → $idml_path"

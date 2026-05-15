#!/usr/bin/env bash
# corpus/envato/unpack.sh
#
# Extract one Envato pack from its zip into corpus/envato/packs/<name>/
# with a canonical filename layout:
#
#   packs/<name>/template.idml       (always)
#   packs/<name>/original-readme.txt  (if the manifest pointed at a readme)
#   packs/<name>/.unpacked            (sentinel; presence skips re-extract)
#
# Idempotent: if the sentinel exists and the IDML is present, do
# nothing. Pass --force to wipe and re-extract.
#
# Usage:
#   corpus/envato/unpack.sh <pack-name>          # extract one pack
#   corpus/envato/unpack.sh --force <pack-name>  # wipe + extract
#   corpus/envato/unpack.sh                      # extract every pack in manifest

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
ENVATO_DIR="$ROOT/corpus/envato"
PACKS_DIR="$ENVATO_DIR/packs"
MANIFEST="$ENVATO_DIR/manifest.json"

FORCE=0
ARGS=()
for arg in "$@"; do
    case "$arg" in
        --force) FORCE=1 ;;
        *) ARGS+=("$arg") ;;
    esac
done

[ -f "$MANIFEST" ] || { echo "missing $MANIFEST — run gen-manifest.py first"; exit 2; }
command -v unzip >/dev/null || { echo "install unzip"; exit 2; }
command -v python3 >/dev/null || { echo "install python3"; exit 2; }

unpack_one() {
    local name="$1"
    local entry
    entry=$(python3 -c "
import json, sys
m = json.load(open('$MANIFEST'))
for p in m['packs']:
    if p['name'] == '$name':
        print(p['zip'])
        print(p.get('idml_in_zip') or '')
        print(p.get('readme_in_zip') or '')
        print(p.get('indd_in_zip') or '')
        sys.exit(0)
sys.exit(f\"[$name] not in manifest\")
")
    local zip_name idml_in readme_in indd_in
    zip_name=$(printf '%s\n' "$entry" | sed -n 1p)
    idml_in=$(printf '%s\n' "$entry" | sed -n 2p)
    readme_in=$(printf '%s\n' "$entry" | sed -n 3p)
    indd_in=$(printf '%s\n' "$entry" | sed -n 4p)

    local zip_path="$ENVATO_DIR/$zip_name"
    local dest="$PACKS_DIR/$name"
    [ -f "$zip_path" ] || { echo "[$name] missing zip $zip_path"; return 1; }

    if [ "$FORCE" -eq 1 ]; then
        rm -rf "$dest"
    fi
    if [ -f "$dest/.unpacked" ] && [ -f "$dest/template.idml" ]; then
        return 0
    fi

    mkdir -p "$dest"
    if [ -n "$idml_in" ]; then
        # Extract via stdin → file write to avoid creating a deep mirror
        # of the zip's internal layout under packs/<name>/.
        unzip -p "$zip_path" "$idml_in" > "$dest/template.idml"
    elif [ -n "$indd_in" ]; then
        # No IDML shipped — drive InDesign to export one from the INDD.
        # export-idml.sh handles the zip-extract + InDesign roundtrip
        # and drops template.idml into $dest.
        "$ENVATO_DIR/export-idml.sh" "$name"
    else
        echo "[$name] manifest has neither idml_in_zip nor indd_in_zip"
        return 1
    fi
    if [ -n "$readme_in" ]; then
        # Strip NULs + macOS resource-fork trailer so the readme is
        # human-readable in $EDITOR. Best-effort: a binary readme
        # (e.g. RTF) just falls through unchanged.
        unzip -p "$zip_path" "$readme_in" \
            | python3 -c "
import sys
raw = sys.stdin.buffer.read()
raw = raw.split(b'\x00\x00Mac OS X')[0].replace(b'\x00', b'')
try:
    text = raw.decode('utf-8')
except UnicodeDecodeError:
    text = raw.decode('latin-1', errors='replace')
sys.stdout.write(text)
" > "$dest/original-readme.txt" || true
    fi
    # InDesign auto-loads any TTF/OTF placed in a "Document fonts"
    # directory next to the IDML when the doc is opened. Pointing the
    # name at our OFL bundle in corpus/fonts/ lets the export-pdf step
    # substitute missing Adobe-licensed fonts with the *same* fonts the
    # renderer uses, so diffs are font-matched.
    if [ ! -e "$dest/Document fonts" ]; then
        ln -s "$ROOT/corpus/fonts" "$dest/Document fonts"
    fi

    : > "$dest/.unpacked"
    echo "[$name] extracted → $dest"
}

if [ "${#ARGS[@]}" -eq 0 ]; then
    # All packs whose stage != skip.
    while IFS= read -r pack; do
        unpack_one "$pack"
    done < <(python3 -c "
import json
m = json.load(open('$MANIFEST'))
for p in m['packs']:
    if p.get('stage') != 'skip':
        print(p['name'])
")
else
    for pack in "${ARGS[@]}"; do
        unpack_one "$pack"
    done
fi

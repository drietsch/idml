#!/usr/bin/env bash
# Fetch Customer's Canvas IDML gallery samples into
# corpus/samples/customerscanvas/. Run from the repo root, or from this
# directory. Outputs are git-ignored and for local development only.
#
# Source: https://customerscanvas.com/help/designers-manual/adobe/indesign/gallery.html
#
# The gallery links below are a best-effort snapshot; if a URL 404s, open
# the source page and update this list. The script also scrapes the
# gallery page for any additional .idml links it finds there.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUT_DIR="$SCRIPT_DIR/customerscanvas"
GALLERY_URL="https://customerscanvas.com/help/designers-manual/adobe/indesign/gallery.html"
UA="Mozilla/5.0 (compatible; idml-renderer-fetcher/0.1)"

mkdir -p "$OUT_DIR"

if ! command -v curl >/dev/null 2>&1; then
    echo "curl is required" >&2
    exit 1
fi

# Known direct links. The file names below have been observed at the
# gallery page; keep in sync when the page changes.
#
# The gallery lives on a CDN whose exact URL shape Customer's Canvas has
# not committed to; if a direct URL 404s, the scrape step below is the
# authoritative fallback.
KNOWN=(
  "bounded-text.idml"
  "hyperlinks.idml"
  "nested-styles.idml"
  "bullets-numbering.idml"
  "table-of-contents.idml"
  "anchored-objects.idml"
  "drop-caps.idml"
  "tables.idml"
  "text-on-path.idml"
  "footnotes.idml"
)

# Try a handful of URL patterns for each known file. The first pattern
# is the one the publisher currently uses; the others are historical
# fallbacks that occasionally still work.
PATTERNS=(
  "https://customerscanvas.com/help/designers-manual/adobe/indesign/files/%s"
  "https://customerscanvas.com/help/designers-manual/adobe/indesign/samples/%s"
  "https://customerscanvas.com/docs/cc/samples/%s"
  "https://customerscanvas.com/download/idml-samples/%s"
)

fetch_one() {
    local name="$1"
    for pat in "${PATTERNS[@]}"; do
        # shellcheck disable=SC2059
        local url
        url=$(printf "$pat" "$name")
        if curl -sSfL -A "$UA" --max-time 30 -o "$OUT_DIR/$name.part" "$url"; then
            mv "$OUT_DIR/$name.part" "$OUT_DIR/$name"
            echo "  ok  $name  <-  $url"
            return 0
        fi
    done
    rm -f "$OUT_DIR/$name.part"
    echo "  ??  $name  (not found at any known URL; check the gallery page)"
    return 1
}

echo "==> fetching ${#KNOWN[@]} known samples"
ok=0
for f in "${KNOWN[@]}"; do
    if fetch_one "$f"; then
        ok=$((ok + 1))
    fi
done
echo

echo "==> scraping gallery page for additional .idml links"
if gallery_html=$(curl -sSfL -A "$UA" --max-time 30 "$GALLERY_URL"); then
    # Extract any *.idml URL mentioned in the gallery HTML.
    mapfile -t extra < <(
        echo "$gallery_html" \
            | grep -oE 'https?://[^"'"'"' ]+\.idml' \
            | sort -u
    )
    for url in "${extra[@]}"; do
        name=$(basename "$url")
        if [[ ! -f "$OUT_DIR/$name" ]]; then
            if curl -sSfL -A "$UA" --max-time 30 -o "$OUT_DIR/$name" "$url"; then
                echo "  ok  $name  <-  $url"
                ok=$((ok + 1))
            fi
        fi
    done
else
    echo "  (could not fetch gallery page; scrape skipped)"
fi

echo
echo "==> done. fetched $ok file(s) into $OUT_DIR"
ls -la "$OUT_DIR" 2>/dev/null | tail -n +2 || true

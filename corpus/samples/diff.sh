#!/usr/bin/env bash
# corpus/samples/diff.sh
#
# Render a third-party IDML through our pipeline and ΔE-diff every
# page against the InDesign-exported reference PDF. Outputs:
#
#   /tmp/idml-diff/cand-NNN.png    candidate (our render)
#   /tmp/idml-diff/ref-NNN.png     reference (rasterised PDF)
#   /tmp/idml-diff/heat-NNN.png    per-page heatmap (only on misses)
#   /tmp/idml-diff/report.json     machine-readable per-page summary
#
# Usage: ./corpus/samples/diff.sh [<idml-name>]
# Defaults to "sample" → corpus/samples/sample.{idml,pdf}.

set -euo pipefail

NAME="${1:-sample}"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SAMPLE_DIR="$ROOT/corpus/samples"
IDML="$SAMPLE_DIR/$NAME.idml"
PDF="$SAMPLE_DIR/$NAME.pdf"
OUT="${IDML_DIFF_OUT:-/tmp/idml-diff}"
DPI="${IDML_DIFF_DPI:-144}"
FONTS="$ROOT/corpus/fonts"

[ -f "$IDML" ] || { echo "missing $IDML"; exit 1; }
[ -f "$PDF"  ] || { echo "missing $PDF"; exit 1; }
command -v pdftoppm >/dev/null || { echo "install poppler (pdftoppm)"; exit 1; }

rm -rf "$OUT" && mkdir -p "$OUT"

echo "==> render IDML through idml-inspect → $OUT"
# Per-sample optional Links/ folder (e.g. corpus/samples/<name>-Links/)
# resolved into the renderer; harmless if it doesn't exist.
LINKS_FLAG=""
if [ -d "$SAMPLE_DIR/$NAME-Links" ]; then
    LINKS_FLAG="--links-dir $SAMPLE_DIR/$NAME-Links"
fi
(cd "$ROOT" && cargo run -q --release -p idml-renderer --bin idml-inspect -- \
    "$IDML" \
    --render "$OUT/cand.png" \
    --default-font "$FONTS/SourceSerif4.ttf" \
    --font-family "Open Sans=$FONTS/OpenSans.ttf" \
    --font-family "Open Sans/Italic=$FONTS/OpenSans-Italic.ttf" \
    --font-family "Minion Pro=$FONTS/CormorantGaramond.ttf" \
    $LINKS_FLAG \
    --dpi "$DPI" >/dev/null)

echo "==> rasterise $PDF via pdftoppm at $DPI dpi"
pdftoppm -r "$DPI" -png "$PDF" "$OUT/ref" >/dev/null
# pdftoppm uses the smallest sufficient zero-padding (2 digits for
# 48 pages). idml-inspect always pads to 3. Normalise both to 3 so
# the per-page loop below can pair them by integer page number.
for f in "$OUT"/ref-*.png; do
    base=${f##*/}
    raw=${base#ref-}; raw=${raw%.png}
    # Strip leading zeros without breaking the value.
    n=$((10#$raw))
    new=$(printf "$OUT/ref-%03d.png" "$n")
    [ "$f" = "$new" ] || mv "$f" "$new"
done

echo "==> per-page ΔE diff"
DIFF="$ROOT/target/release/idml-diff"
[ -x "$DIFF" ] || (cd "$ROOT" && cargo build -q --release -p idml-fidelity --bin idml-diff)

REPORT="$OUT/report.json"
echo "[" > "$REPORT"
first=1
total_pages=0
pass_pages=0

shopt -s nullglob
for cand in "$OUT"/cand-*.png; do
    page="${cand##*-}"; page="${page%.png}"
    ref="$OUT/ref-$page.png"
    if [ ! -f "$ref" ]; then
        echo "  page $page: no reference PNG (PDF page count mismatch?)"
        continue
    fi
    total_pages=$((total_pages + 1))
    line=$("$DIFF" "$ref" "$cand" --json --heatmap "$OUT/heat-$page.png" || true)
    pass=$(echo "$line" | grep -oE '"passes":(true|false)' | sed 's/.*://')
    mean=$(echo "$line" | grep -oE '"mean_de":[0-9.]+' | sed 's/.*://')
    p99=$(echo "$line" | grep -oE '"p99_de":[0-9.]+' | sed 's/.*://')
    ssim=$(echo "$line" | grep -oE '"ssim":[0-9.]+' | sed 's/.*://')
    [ "$pass" = "true" ] && pass_pages=$((pass_pages + 1))
    printf "  page %s  meanΔE=%6.3f  p99ΔE=%6.3f  ssim=%5.3f  %s\n" \
        "$page" "$mean" "$p99" "$ssim" "$pass"
    if [ $first -eq 0 ]; then echo "," >> "$REPORT"; fi
    first=0
    printf '  {"page":%s,%s}' "$((10#$page))" "${line:1:${#line}-2}" >> "$REPORT"
done
echo "" >> "$REPORT"
echo "]" >> "$REPORT"

echo
echo "summary: $pass_pages/$total_pages pages pass §13.2 thresholds"
echo "report: $REPORT"

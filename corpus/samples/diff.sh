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
GENERATED_DIR="$ROOT/corpus/generated"
# Resolve the IDML/PDF pair against either the curated samples
# directory or the generated mega-files directory. Generated samples
# (emitted by `cargo run -p idml-gen -- emit`) take precedence so a
# generator-produced fixture can shadow a hand-curated one with the
# same name during development.
if [ -f "$GENERATED_DIR/$NAME.idml" ]; then
    SAMPLE_DIR="$GENERATED_DIR"
fi
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

# Per-sample font mapping. The default registrations below cover
# sample.idml's chairman + body content (serif Minion Pro mapped to
# Cormorant Garamond, sans-serif Open Sans for headers). Other samples
# (Sample-3 uses sans-serif Myriad Pro everywhere; InDesign substitutes
# Minion Pro with Myriad-like glyphs at PDF export) can override the
# defaults by dropping a `$NAME.fonts.sh` next to the IDML — that file
# sets the FONT_FLAGS array verbatim before we hand it to inspect.
DEFAULT_FONT="$FONTS/SourceSerif4.ttf"
FONT_FLAGS=(
    --font-family "Open Sans=$FONTS/OpenSans.ttf"
    --font-family "Open Sans/Italic=$FONTS/OpenSans-Italic.ttf"
    --font-family "Minion Pro=$FONTS/CormorantGaramond.ttf"
)
if [ -f "$SAMPLE_DIR/$NAME.fonts.sh" ]; then
    # shellcheck disable=SC1090
    . "$SAMPLE_DIR/$NAME.fonts.sh"
fi

(cd "$ROOT" && cargo run -q --release -p idml-renderer --bin idml-inspect -- \
    "$IDML" \
    --render "$OUT/cand.png" \
    --default-font "$DEFAULT_FONT" \
    "${FONT_FLAGS[@]}" \
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

# Manifest sidecar — the web viewer reads this to populate the sample
# picker. Upserts an entry for $NAME without disturbing entries for
# other samples that have been diffed. Pure jq would be cleaner but
# we don't want to require jq; awk + python3 fallback covers macOS
# and most Linux dev boxes.
MANIFEST="$SAMPLE_DIR/manifest.json"
python3 - "$MANIFEST" "$NAME" "$IDML" "$PDF" "$total_pages" "$pass_pages" "$OUT" "$REPORT" <<'PY'
import json
import os
import sys
from pathlib import Path

(_, manifest, name, idml, pdf, total, passed, out, report) = sys.argv
data = {"samples": []}
mp = Path(manifest)
if mp.exists():
    try:
        data = json.loads(mp.read_text())
    except json.JSONDecodeError:
        data = {"samples": []}
data.setdefault("samples", [])
data["samples"] = [s for s in data["samples"] if s.get("name") != name]
data["samples"].append(
    {
        "name": name,
        "idml": os.path.basename(idml),
        "pdf": os.path.basename(pdf),
        "pages": int(total),
        "passing": int(passed),
        "diff_dir": out,
        "report": report,
    }
)
data["samples"].sort(key=lambda s: s["name"])
mp.write_text(json.dumps(data, indent=2) + "\n")
print(f"manifest: {manifest}")
PY

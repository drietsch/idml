#!/usr/bin/env bash
# corpus/samples/diff.sh
#
# Render a third-party IDML through our pipeline and ΔE-diff every
# page against the InDesign-exported reference PDF. Outputs:
#
#   /tmp/paged-diff/cand-NNN.png    candidate (our render)
#   /tmp/paged-diff/ref-NNN.png     reference (rasterised PDF)
#   /tmp/paged-diff/heat-NNN.png    per-page heatmap (only on misses)
#   /tmp/paged-diff/report.json     machine-readable per-page summary
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
# (emitted by `cargo run -p paged-gen -- emit`) take precedence so a
# generator-produced fixture can shadow a hand-curated one with the
# same name during development.
if [ -f "$GENERATED_DIR/$NAME.idml" ]; then
    SAMPLE_DIR="$GENERATED_DIR"
fi
IDML="$SAMPLE_DIR/$NAME.idml"
PDF="$SAMPLE_DIR/$NAME.pdf"
OUT="${IDML_DIFF_OUT:-/tmp/paged-diff}"
DPI="${IDML_DIFF_DPI:-144}"
FONTS="$ROOT/corpus/fonts"

[ -f "$IDML" ] || { echo "missing $IDML"; exit 1; }
# A reference PDF is optional — generated samples emitted by
# `cargo run -p paged-gen` have no InDesign-exported reference yet, so
# we still render the IDML and skip the per-page ΔE diff downstream.
HAVE_PDF=1
if [ ! -f "$PDF" ]; then
    echo "==> no reference PDF at $PDF — rendering IDML only, skipping ref rasterisation"
    HAVE_PDF=0
fi
if [ "$HAVE_PDF" -eq 1 ]; then
    command -v pdftoppm >/dev/null || { echo "install poppler (pdftoppm)"; exit 1; }
fi

rm -rf "$OUT" && mkdir -p "$OUT"

echo "==> render IDML through paged-inspect → $OUT"
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

# Synthetic generator fixtures under corpus/generated/ were exported
# without InDesign's missing-image placeholder visible (the fixtures
# test geometry/effects, not broken-link visuals). Suppress the
# renderer's placeholder for those; real-world packs keep it on so
# template scaffolding (broken-link "Your Image Here" frames) match
# their reference PDFs.
PLACEHOLDER_FLAG=""
if [ "$SAMPLE_DIR" = "$GENERATED_DIR" ]; then
    PLACEHOLDER_FLAG="--no-missing-image-placeholder"
fi

(cd "$ROOT" && cargo run -q --release -p paged-renderer --bin paged-inspect -- \
    "$IDML" \
    --render "$OUT/cand.png" \
    --default-font "$DEFAULT_FONT" \
    "${FONT_FLAGS[@]}" \
    $LINKS_FLAG \
    $PLACEHOLDER_FLAG \
    --dpi "$DPI" >/dev/null)

if [ "$HAVE_PDF" -eq 1 ]; then
    # Match pdftoppm's CMYK profile to whatever our renderer uses
    # (FOGRA39 by default — see crates/paged-renderer/src/bin/inspect.rs's
    # resolve_cmyk_profile_by_name + crates/paged-color/src/lib.rs).
    # Without this, pdftoppm's poppler-baked default is U.S. Web
    # Coated SWOP, which produces ~(35,31,32) sRGB for K=100; our
    # renderer with Adobe FOGRA39 produces ~(29,29,27); the
    # ~4 ΔE delta is entirely the CMYK profile mismatch and adds
    # to every solid-CMYK fill across the corpus. Forcing both
    # paths to FOGRA39 makes them apples-to-apples.
    PDFTOPPM_CMYK_FLAGS=()
    FOGRA39="/Library/Application Support/Adobe/Color/Profiles/Recommended/CoatedFOGRA39.icc"
    if [ -f "$FOGRA39" ]; then
        PDFTOPPM_CMYK_FLAGS=(-defaultcmykprofile "$FOGRA39")
    fi
    echo "==> rasterise $PDF via pdftoppm at $DPI dpi"
    pdftoppm "${PDFTOPPM_CMYK_FLAGS[@]}" -r "$DPI" -png "$PDF" "$OUT/ref" >/dev/null
    # pdftoppm uses the smallest sufficient zero-padding (2 digits for
    # 48 pages). paged-inspect always pads to 3. Normalise both to 3 so
    # the per-page loop below can pair them by integer page number.
    for f in "$OUT"/ref-*.png; do
        base=${f##*/}
        raw=${base#ref-}; raw=${raw%.png}
        # Strip leading zeros without breaking the value.
        n=$((10#$raw))
        new=$(printf "$OUT/ref-%03d.png" "$n")
        [ "$f" = "$new" ] || mv "$f" "$new"
    done
else
    echo "==> skipping reference rasterisation (no PDF)"
fi

REPORT="$OUT/report.json"
total_pages=0
pass_pages=0
shopt -s nullglob

if [ "$HAVE_PDF" -eq 1 ]; then
    echo "==> per-page ΔE diff"
    DIFF="$ROOT/target/release/paged-diff"
    [ -x "$DIFF" ] || (cd "$ROOT" && cargo build -q --release -p paged-fidelity --bin paged-diff)

    echo "[" > "$REPORT"
    first=1

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
else
    # No reference PDF — emit an empty report and just count
    # candidate renders so the harness output stays uniform.
    echo "[]" > "$REPORT"
    for cand in "$OUT"/cand-*.png; do
        total_pages=$((total_pages + 1))
        page="${cand##*-}"; page="${page%.png}"
        printf "  page %s  (no reference, skipped diff)\n" "$page"
    done
    echo
    echo "summary: $total_pages candidate page(s) rendered, no PDF reference"
    echo "report: $REPORT"
fi

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

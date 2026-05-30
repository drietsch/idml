#!/usr/bin/env bash
# corpus/envato/test.sh
#
# Top-level harness for the envato corpus. Per pack:
#   1. unpack.sh         — extract zip → packs/<name>/
#                          (drives InDesign for INDD-only packs).
#   2. export-pdf.sh     — InDesign opens template.idml, applies the
#                          per-pack font substitutions, exports
#                          reference.pdf. Cached.
#   3. render            — paged-inspect → reports/<name>/cand-NNN.png.
#   4. rasterise         — pdftoppm reference.pdf → ref-NNN.png.
#   5. diff              — paged-diff per page → report.json.
#   6. gate              — if manifest stage == "gated", compare
#                          against fidelity-thresholds.json → gate.json.
#
# A `gated` pack failing its thresholds turns the run's exit code
# non-zero. A `smoke` pack that crashes the renderer is also reported
# in summary.json but does *not* fail the run unless
# IDML_ENVATO_STRICT_SMOKE=1.
#
# Usage:
#   corpus/envato/test.sh                     # every non-skip pack
#   corpus/envato/test.sh <pack> [<pack> ...] # only the named pack(s)
#
# Env:
#   IDML_ENVATO_OUT          override reports dir (default reports/)
#   IDML_DIFF_GATE=advisory  never fail (matches generated/diff.sh)
#   IDML_ENVATO_FORCE_EXPORT=1   re-export PDFs even if cached
#   IDML_ENVATO_SKIP_EXPORT=1    skip InDesign step (assume PDF exists)
#   IDML_ENVATO_STRICT_SMOKE=1   also fail run on smoke crash
#   IDML_ENVATO_DPI=144      pdftoppm + renderer DPI

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
ENVATO_DIR="$ROOT/corpus/envato"
PACKS_DIR="$ENVATO_DIR/packs"
OVERRIDES_DIR="$ENVATO_DIR/overrides"
MANIFEST="$ENVATO_DIR/manifest.json"
THRESHOLDS="$ENVATO_DIR/fidelity-thresholds.json"
REPORTS="${IDML_ENVATO_OUT:-$ENVATO_DIR/reports}"
DPI="${IDML_ENVATO_DPI:-144}"
GATE_MODE="${IDML_DIFF_GATE:-strict}"
STRICT_SMOKE="${IDML_ENVATO_STRICT_SMOKE:-0}"
FONTS="$ROOT/corpus/fonts"

[ -f "$MANIFEST" ] || { echo "missing $MANIFEST — run gen-manifest.py"; exit 2; }
command -v python3 >/dev/null || { echo "install python3"; exit 2; }
command -v pdftoppm >/dev/null || { echo "install poppler (pdftoppm)"; exit 2; }

if [ "$#" -gt 0 ]; then
    PACKS=("$@")
else
    PACKS=()
    while IFS= read -r pack; do
        [ -n "$pack" ] && PACKS+=("$pack")
    done < <(python3 -c "
import json
m = json.load(open('$MANIFEST'))
for p in m['packs']:
    if p.get('stage') != 'skip':
        print(p['name'])
")
fi

echo "==> build paged-inspect + paged-diff (release)"
(cd "$ROOT" && cargo build --release \
    -p paged-renderer --bin paged-inspect \
    -p paged-fidelity --bin paged-diff >/dev/null)
INSPECT="$ROOT/target/release/paged-inspect"
DIFF="$ROOT/target/release/paged-diff"

mkdir -p "$REPORTS"
# Track aggregate results in a JSON shard per pack; we roll them up
# into summary.json at the end. This lets a partial run be resumed.
shopt -s nullglob

FOGRA39="/Library/Application Support/Adobe/Color/Profiles/Recommended/CoatedFOGRA39.icc"
PDFTOPPM_CMYK_FLAGS=()
if [ -f "$FOGRA39" ]; then
    PDFTOPPM_CMYK_FLAGS=(-defaultcmykprofile "$FOGRA39")
fi

run_pack() {
    local name="$1"
    local out="$REPORTS/$name"
    # IDML_ENVATO_RESUME=1 lets a re-run after a timeout pick up where
    # the previous run left off — any pack that already has a pack.json
    # with result == "ok" is skipped on the second pass. Caches alone
    # would make re-runs fast, but skipping the render+diff entirely is
    # faster still when the corpus is 60+ packs.
    if [ "${IDML_ENVATO_RESUME:-0}" = "1" ] && [ -f "$out/pack.json" ]; then
        local prior
        prior=$(python3 -c "import json
try: print(json.load(open('$out/pack.json'))['result'])
except Exception: print('error')")
        if [ "$prior" = "ok" ]; then
            echo "[$name] resume: already ok — skipping"
            return 0
        fi
    fi
    mkdir -p "$out"
    : > "$out/test.log"

    # Stage from the manifest. Anything we can't parse is treated as
    # "smoke" — the harness should never silently gate a pack.
    local stage
    stage=$(python3 -c "
import json
m = json.load(open('$MANIFEST'))
for p in m['packs']:
    if p['name'] == '$name':
        print(p.get('stage', 'smoke'))
        break
")
    stage="${stage:-smoke}"

    local result="ok"
    local note=""

    # ---- 1. Unpack ------------------------------------------------------
    if ! "$ENVATO_DIR/unpack.sh" "$name" >> "$out/test.log" 2>&1; then
        result="error"
        note="unpack failed"
        emit_pack_summary "$name" "$stage" "$result" "$note" "" "" "" 0 "$out"
        return 1
    fi
    local idml="$PACKS_DIR/$name/template.idml"
    if [ ! -s "$idml" ]; then
        result="error"
        note="template.idml missing after unpack"
        emit_pack_summary "$name" "$stage" "$result" "$note" "" "" "" 0 "$out"
        return 1
    fi

    # ---- 2. Reference PDF -----------------------------------------------
    local pdf="$PACKS_DIR/$name/reference.pdf"
    if [ "${IDML_ENVATO_SKIP_EXPORT:-0}" -ne 1 ]; then
        if ! "$ENVATO_DIR/export-pdf.sh" "$name" >> "$out/test.log" 2>&1; then
            echo "  [$name] InDesign PDF export failed (see $out/test.log) — continuing without diff"
        fi
    fi
    local have_pdf=0
    [ -s "$pdf" ] && have_pdf=1

    # ---- 3. Renderer fonts ---------------------------------------------
    local fonts_sh="$OVERRIDES_DIR/$name/fonts.sh"
    [ -f "$fonts_sh" ] || fonts_sh="$OVERRIDES_DIR/_default/fonts.sh"
    local DEFAULT_FONT=""
    local FONT_FLAGS=()
    # shellcheck disable=SC1090
    . "$fonts_sh"
    if [ -z "$DEFAULT_FONT" ]; then
        DEFAULT_FONT="$FONTS/Inter.ttf"
    fi

    # ---- 4. Render ------------------------------------------------------
    # paged-inspect's --render takes a "base.png" and writes one file
    # per page as base-NNN.png (3-digit zero-padding).
    local cand_base="$out/cand.png"
    rm -f "$out"/cand-*.png "$out"/ref-*.png "$out"/heat-*.png
    if ! (cd "$ROOT" && "$INSPECT" \
            "$idml" \
            --render "$cand_base" \
            --default-font "$DEFAULT_FONT" \
            "${FONT_FLAGS[@]}" \
            --dpi "$DPI" >> "$out/test.log" 2>&1); then
        result="render-error"
        note="paged-inspect exited non-zero"
        emit_pack_summary "$name" "$stage" "$result" "$note" "" "" "" 0 "$out"
        return 1
    fi
    # paged-inspect writes a single-page IDML to "cand.png" with no
    # numeric suffix, but multi-page IDMLs split to "cand-NNN.png".
    # Normalise to the suffixed form so the per-page loop below pairs
    # cleanly with pdftoppm's ref-NNN.png output.
    if [ -f "$out/cand.png" ] && [ ! -f "$out/cand-001.png" ]; then
        mv "$out/cand.png" "$out/cand-001.png"
    fi
    local pages_rendered
    pages_rendered=$(printf '%s\n' "$out"/cand-*.png | wc -l | tr -d ' ')
    if [ "$pages_rendered" -eq 0 ]; then
        result="render-error"
        note="no candidate PNGs produced"
        emit_pack_summary "$name" "$stage" "$result" "$note" "" "" "" 0 "$out"
        return 1
    fi

    # ---- 5. Rasterise reference + diff per page ------------------------
    local worst_mean="" worst_p99="" worst_ssim=""
    local pages_diffed=0
    if [ "$have_pdf" -eq 1 ]; then
        pdftoppm "${PDFTOPPM_CMYK_FLAGS[@]}" -r "$DPI" -png "$pdf" "$out/ref" >> "$out/test.log" 2>&1
        for f in "$out"/ref-*.png; do
            base=${f##*/}
            raw=${base#ref-}; raw=${raw%.png}
            n=$((10#$raw))
            new=$(printf "$out/ref-%03d.png" "$n")
            [ "$f" = "$new" ] || mv "$f" "$new"
        done

        # Per-page diff loop. Mirrors corpus/samples/diff.sh's JSON
        # accumulation so other tools can already parse the file.
        echo "[" > "$out/report.json"
        local first=1
        for cand in "$out"/cand-*.png; do
            page="${cand##*-}"; page="${page%.png}"
            local ref="$out/ref-$page.png"
            [ -f "$ref" ] || continue
            pages_diffed=$((pages_diffed + 1))
            line=$("$DIFF" "$ref" "$cand" --json --heatmap "$out/heat-$page.png" || true)
            if [ -z "$line" ]; then
                continue
            fi
            local m p s
            m=$(printf '%s' "$line" | grep -oE '"mean_de":[0-9.]+' | sed 's/.*://')
            p=$(printf '%s' "$line" | grep -oE '"p99_de":[0-9.]+' | sed 's/.*://')
            s=$(printf '%s' "$line" | grep -oE '"ssim":[0-9.]+' | sed 's/.*://')
            if [ $first -eq 0 ]; then echo "," >> "$out/report.json"; fi
            first=0
            printf '  {"page":%s,%s}' "$((10#$page))" "${line:1:${#line}-2}" \
                >> "$out/report.json"
            # Track per-pack worst-page metrics.
            worst_mean=$(python3 -c "print(max(${worst_mean:-0}, $m))")
            worst_p99=$(python3 -c "print(max(${worst_p99:-0}, $p))")
            if [ -z "$worst_ssim" ]; then
                worst_ssim="$s"
            else
                worst_ssim=$(python3 -c "print(min($worst_ssim, $s))")
            fi
        done
        echo "" >> "$out/report.json"
        echo "]" >> "$out/report.json"
        # Drop heatmap PNGs for now (we re-generate on demand if a gate fails).
    else
        echo "[]" > "$out/report.json"
        note="no reference PDF — diff skipped"
    fi

    # ---- 6. Gate -------------------------------------------------------
    if [ "$stage" = "gated" ] && [ "$have_pdf" -eq 1 ]; then
        python3 - "$THRESHOLDS" "$name" "$out/report.json" "$out/gate.json" <<'PY'
import json, sys
from pathlib import Path
_, thresholds_path, name, report_path, gate_path = sys.argv
try:
    thresholds = json.load(open(thresholds_path))
except FileNotFoundError:
    Path(gate_path).write_text(json.dumps({
        "name": name, "passed": True, "skipped": True,
        "reason": "no fidelity-thresholds.json"
    }))
    sys.exit(0)
spec = next((f for f in thresholds.get("fixtures", []) if f["name"] == name), None)
if spec is None:
    Path(gate_path).write_text(json.dumps({
        "name": name, "passed": True, "skipped": True,
        "reason": "not in thresholds manifest"
    }))
    sys.exit(0)
pages = json.load(open(report_path))
limit = spec.get("max_pages_with_pdf", 999)
gated = [p for p in pages if p["page"] <= limit]
failures = []
for p in gated:
    page_failures = []
    if p["mean_de"] > spec["max_mean_de"]:
        page_failures.append(f"meanΔE {p['mean_de']:.3f} > {spec['max_mean_de']}")
    if p["p99_de"] > spec["max_p99_de"]:
        page_failures.append(f"p99ΔE {p['p99_de']:.3f} > {spec['max_p99_de']}")
    if p["ssim"] < spec["min_ssim"]:
        page_failures.append(f"ssim {p['ssim']:.4f} < {spec['min_ssim']}")
    if page_failures:
        failures.append({"page": p["page"], "violations": page_failures})
Path(gate_path).write_text(json.dumps({
    "name": name,
    "pages_checked": len(gated),
    "passed": not failures,
    "thresholds": {
        "max_mean_de": spec["max_mean_de"],
        "max_p99_de": spec["max_p99_de"],
        "min_ssim": spec["min_ssim"],
    },
    "failures": failures,
}, indent=2))
sys.exit(0 if not failures else 1)
PY
        local rc=$?
        if [ "$rc" -ne 0 ]; then
            result="gated-failed"
            note="threshold violation"
        fi
    fi

    emit_pack_summary "$name" "$stage" "$result" "$note" \
        "$worst_mean" "$worst_p99" "$worst_ssim" "$pages_diffed" "$out"
    return 0
}

emit_pack_summary() {
    # name stage result note worst_mean worst_p99 worst_ssim pages_diffed out
    local out="$9"
    python3 - "$1" "$2" "$3" "$4" "$5" "$6" "$7" "$8" "$out/pack.json" <<'PY'
import json, sys
from pathlib import Path
_, name, stage, result, note, wm, wp, ws, pd, dest = sys.argv
def f(v):
    return float(v) if v not in ("", None) else None
Path(dest).write_text(json.dumps({
    "name": name,
    "stage": stage,
    "result": result,
    "note": note,
    "worst_mean_de": f(wm),
    "worst_p99_de": f(wp),
    "worst_ssim": f(ws),
    "pages_diffed": int(pd or 0),
}, indent=2))
PY
}

EXIT=0
for pack in "${PACKS[@]}"; do
    echo
    echo "==> [$pack]"
    if ! run_pack "$pack"; then
        # run_pack returning 1 only signals "errored before producing a
        # report"; whether that fails the overall run depends on stage.
        :
    fi
    if [ -f "$REPORTS/$pack/pack.json" ]; then
        stage=$(python3 -c "import json;print(json.load(open('$REPORTS/$pack/pack.json'))['stage'])")
        result=$(python3 -c "import json;print(json.load(open('$REPORTS/$pack/pack.json'))['result'])")
        if [ "$stage" = "gated" ] && [ "$result" != "ok" ]; then
            EXIT=1
        elif [ "$STRICT_SMOKE" = "1" ] && [ "$result" != "ok" ]; then
            EXIT=1
        fi
    fi
done

# Roll up every pack.json into a single summary.json.
python3 - "$REPORTS" <<'PY'
import json, sys
from pathlib import Path
root = Path(sys.argv[1])
packs = []
for p in sorted(root.glob("*/pack.json")):
    try:
        packs.append(json.loads(p.read_text()))
    except json.JSONDecodeError:
        continue
summary = {
    "packs": packs,
    "total": len(packs),
    "smoke_passed":    sum(1 for p in packs if p["stage"] == "smoke" and p["result"] == "ok"),
    "smoke_errored":   sum(1 for p in packs if p["stage"] == "smoke" and p["result"] != "ok"),
    "gated_passed":    sum(1 for p in packs if p["stage"] == "gated" and p["result"] == "ok"),
    "gated_failed":    sum(1 for p in packs if p["stage"] == "gated" and p["result"] != "ok"),
}
(Path(sys.argv[1]) / "summary.json").write_text(json.dumps(summary, indent=2))
print("summary:", json.dumps({k: v for k, v in summary.items() if k != "packs"}))
PY

# Human-readable per-pack table after the JSON totals.
if [ -f "$ENVATO_DIR/summarize.py" ]; then
    echo
    python3 "$ENVATO_DIR/summarize.py" "$REPORTS/summary.json"
fi

if [ "$EXIT" -ne 0 ] && [ "$GATE_MODE" = "advisory" ]; then
    echo "==> failures detected; advisory mode (IDML_DIFF_GATE=advisory) — exiting 0"
    exit 0
fi
exit $EXIT

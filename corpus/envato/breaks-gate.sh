#!/usr/bin/env bash
# Cycle-4 Track 2c gate: runs the A/B break harness across the
# fixtures pinned in corpus/envato/break-thresholds.json and reports
# per-fixture pass/fail against the recorded thresholds.
#
# Fixture entry shape (one or the other):
#
#   1. Generated fixture (cycle 4):
#        { "name": ..., "candidate_idml": "corpus/generated/<n>.idml",
#          "reference_pdf": "corpus/generated/<n>.pdf",
#          "font": "corpus/fonts/<n>.ttf",
#          "thresholds": { ... } }
#
#   2. Envato pack (cycle 5+):
#        { "name": ..., "pack": "<envato-pack-name>",
#          "thresholds": { ... } }
#      The IDML / PDF / font flags are derived from
#        corpus/envato/packs/<pack>/{template.idml, reference.pdf}
#      and the per-pack font sidecar at
#        corpus/envato/overrides/<pack>/fonts.sh
#      (falling back to overrides/_default/fonts.sh).
#
# Pipeline per fixture:
#   1. paged-inspect --emit-breaks → candidate JSONL
#      Uses --default-font + --font-family flags from the per-pack
#      sidecar when the fixture is an Envato pack.
#   2. breaks-extract.py over the reference PDF → reference JSONL
#   3. breaks-compare.py → diff JSON
#   4. compare summary against `thresholds` block in the manifest
#
# Outputs (under $IDML_BREAKS_OUT, default /tmp/idml-breaks-gate):
#   <fixture>.cand.jsonl  candidate-side per-line records
#   <fixture>.ref.jsonl   reference-side per-line records
#   <fixture>.json        breaks-compare's diff JSON
#   <fixture>.gate.json   { fixture, pass, observed, thresholds }
#
# Exit status:
#   0  every fixture under threshold (or no fixtures pinned)
#   1  one or more thresholds breached
#
# Usage:
#   corpus/envato/breaks-gate.sh                 # gate every fixture
#   corpus/envato/breaks-gate.sh text newspaper
#   IDML_BREAKS_GATE=advisory corpus/envato/breaks-gate.sh   # never fail

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
ENVATO_DIR="$ROOT/corpus/envato"
PACKS_DIR="$ENVATO_DIR/packs"
OVERRIDES_DIR="$ENVATO_DIR/overrides"
MANIFEST="$ENVATO_DIR/break-thresholds.json"
INSPECT="$ROOT/target/release/paged-inspect"
EXTRACT="$ENVATO_DIR/breaks-extract.py"
COMPARE="$ENVATO_DIR/breaks-compare.py"
FONTS="$ROOT/corpus/fonts"
OUT="${IDML_BREAKS_OUT:-/tmp/idml-breaks-gate}"
MODE="${IDML_BREAKS_GATE:-strict}"  # strict | advisory

[ -f "$MANIFEST" ] || { echo "missing $MANIFEST"; exit 2; }
[ -x "$EXTRACT" ] || { echo "missing $EXTRACT"; exit 2; }
[ -x "$COMPARE" ] || { echo "missing $COMPARE"; exit 2; }
command -v pdftotext >/dev/null || { echo "install poppler-utils (pdftotext)"; exit 2; }

if [ ! -x "$INSPECT" ]; then
    echo "==> build paged-inspect (release)"
    (cd "$ROOT" && cargo build --release --bin paged-inspect >/dev/null 2>&1)
fi

if [ "$#" -gt 0 ]; then
    SELECTED=("$@")
else
    SELECTED=()
    while IFS= read -r line; do
        [ -n "$line" ] && SELECTED+=("$line")
    done < <(python3 -c "
import json
print('\n'.join(f['name'] for f in json.load(open('$MANIFEST'))['fixtures']))
")
fi

rm -rf "$OUT"
mkdir -p "$OUT"

OVERALL_PASS=1

# Resolve a fixture's idml / pdf / font-flag context. Writes shell
# assignments to stdout that the caller eval's. Three vars come out:
#   FX_IDML  FX_PDF  and the named-array FONT_FLAGS / DEFAULT_FONT
# (the last two via the sidecar source).
resolve_fixture_paths() {
    local name=$1
    python3 - "$MANIFEST" "$name" <<'PY'
import json, sys
manifest, name = sys.argv[1:3]
data = json.load(open(manifest))
entry = next((f for f in data["fixtures"] if f["name"] == name), None)
if entry is None:
    print(f"echo MISSING; return 2", end="")
    sys.exit(0)
if "pack" in entry:
    print(f'FX_KIND=pack')
    print(f'FX_PACK={json.dumps(entry["pack"])}')
else:
    print(f'FX_KIND=generated')
    print(f'FX_IDML={json.dumps(entry["candidate_idml"])}')
    print(f'FX_PDF={json.dumps(entry["reference_pdf"])}')
    print(f'FX_FONT={json.dumps(entry["font"])}')
# Cycle-6 Track 1: optional candidate-side filters. Both default to
# empty strings so callers can `[ -n ]`-check them. Story filter
# applies via --break-story-id; page-range via --break-page-range.
print(f'FX_BREAK_STORY={json.dumps(entry.get("break_story_id", ""))}')
print(f'FX_BREAK_PAGE_RANGE={json.dumps(entry.get("break_page_range", ""))}')
# Cycle-6 Track 2: when true, pass --strict-pairs to the compare
# step so un-aligned pair noise stays out of the drift metric.
print(f'FX_STRICT_PAIRS={"1" if entry.get("strict_pairs", False) else ""}')
PY
}

for name in "${SELECTED[@]}"; do
    echo "==> [$name] render + extract + compare"

    FX_KIND="" FX_PACK="" FX_IDML="" FX_PDF="" FX_FONT=""
    eval "$(resolve_fixture_paths "$name")"

    DEFAULT_FONT=""
    FONT_FLAGS=()
    case "$FX_KIND" in
        generated)
            FX_IDML="$ROOT/$FX_IDML"
            FX_PDF="$ROOT/$FX_PDF"
            DEFAULT_FONT="$ROOT/$FX_FONT"
            FONT_FLAGS=(--font "$DEFAULT_FONT")
            ;;
        pack)
            FX_IDML="$PACKS_DIR/$FX_PACK/template.idml"
            FX_PDF="$PACKS_DIR/$FX_PACK/reference.pdf"
            local_fonts="$OVERRIDES_DIR/$FX_PACK/fonts.sh"
            [ -f "$local_fonts" ] || local_fonts="$OVERRIDES_DIR/_default/fonts.sh"
            # shellcheck disable=SC1090
            . "$local_fonts"
            [ -n "$DEFAULT_FONT" ] || DEFAULT_FONT="$FONTS/Inter.ttf"
            ;;
        *)
            echo "[$name] FAIL: not in manifest" >&2
            OVERALL_PASS=0
            continue
            ;;
    esac

    if [ ! -f "$FX_IDML" ]; then
        echo "[$name] FAIL: idml missing at $FX_IDML" >&2
        OVERALL_PASS=0
        continue
    fi
    if [ ! -f "$FX_PDF" ]; then
        echo "[$name] FAIL: reference PDF missing at $FX_PDF" >&2
        OVERALL_PASS=0
        continue
    fi

    cand="$OUT/$name.cand.jsonl"
    ref="$OUT/$name.ref.jsonl"
    report="$OUT/$name.json"

    # Cycle-6 Track 1: thread the candidate-side filters through
    # paged-inspect when the manifest set them.
    FILTER_FLAGS=()
    [ -n "$FX_BREAK_STORY" ] && FILTER_FLAGS+=(--break-story-id "$FX_BREAK_STORY")
    [ -n "$FX_BREAK_PAGE_RANGE" ] && FILTER_FLAGS+=(--break-page-range "$FX_BREAK_PAGE_RANGE")

    if [ "$FX_KIND" = "pack" ]; then
        "$INSPECT" \
            --default-font "$DEFAULT_FONT" \
            "${FONT_FLAGS[@]}" \
            ${FILTER_FLAGS[@]+"${FILTER_FLAGS[@]}"} \
            --emit-breaks "$cand" \
            "$FX_IDML" >/dev/null 2>"$OUT/$name.inspect.log" || {
                echo "[$name] FAIL: paged-inspect exited non-zero (see $OUT/$name.inspect.log)" >&2
                OVERALL_PASS=0
                continue
            }
    else
        "$INSPECT" \
            "${FONT_FLAGS[@]}" \
            ${FILTER_FLAGS[@]+"${FILTER_FLAGS[@]}"} \
            --emit-breaks "$cand" \
            "$FX_IDML" >/dev/null 2>"$OUT/$name.inspect.log" || {
                echo "[$name] FAIL: paged-inspect exited non-zero (see $OUT/$name.inspect.log)" >&2
                OVERALL_PASS=0
                continue
            }
    fi

    python3 "$EXTRACT" "$FX_PDF" "$ref" 2>/dev/null || {
        echo "[$name] FAIL: breaks-extract.py exited non-zero" >&2
        OVERALL_PASS=0
        continue
    }
    COMPARE_FLAGS=()
    [ -n "$FX_STRICT_PAIRS" ] && COMPARE_FLAGS+=(--strict-pairs)
    python3 "$COMPARE" ${COMPARE_FLAGS[@]+"${COMPARE_FLAGS[@]}"} "$cand" "$ref" "$report" 2>/dev/null || {
        echo "[$name] FAIL: breaks-compare.py exited non-zero" >&2
        OVERALL_PASS=0
        continue
    }

    # Threshold check stays in Python so JSON parsing is robust.
    result=$(python3 - "$MANIFEST" "$name" "$report" "$OUT" <<'PY'
import json, sys
manifest, name, report, out_dir = sys.argv[1:5]
data = json.load(open(manifest))
entry = next(f for f in data["fixtures"] if f["name"] == name)
thr = entry["thresholds"]
summary = json.load(open(report))["summary"]
fails = []
if summary["line_count_delta_sum"] > thr["max_line_count_delta_sum"]:
    fails.append(
        f"line_count_delta_sum {summary['line_count_delta_sum']} > {thr['max_line_count_delta_sum']}"
    )
if summary["word_match_rate_mean"] < thr["min_word_match_rate_mean"]:
    fails.append(
        f"word_match_rate_mean {summary['word_match_rate_mean']:.3f} < {thr['min_word_match_rate_mean']}"
    )
if summary["baseline_drift_pt_p99"] > thr["max_baseline_drift_pt_p99"]:
    fails.append(
        f"baseline_drift_pt_p99 {summary['baseline_drift_pt_p99']:.3f}pt > {thr['max_baseline_drift_pt_p99']}pt"
    )
gate = {
    "fixture": name,
    "pass": not fails,
    "observed": summary,
    "thresholds": thr,
    "failures": fails,
}
open(f"{out_dir}/{name}.gate.json", "w").write(json.dumps(gate, indent=2) + "\n")
if fails:
    print("FAIL " + "; ".join(fails))
else:
    print(
        f"PASS  |Δlines|={summary['line_count_delta_sum']}  "
        f"wrate={summary['word_match_rate_mean']:.3f}  "
        f"drift_p99={summary['baseline_drift_pt_p99']:.3f}pt"
    )
PY
)
    case "$result" in
        PASS*)
            echo "[$name] $result"
            ;;
        FAIL*)
            echo "[$name] $result" >&2
            OVERALL_PASS=0
            ;;
    esac
done

if [ $OVERALL_PASS -eq 1 ]; then
    echo
    echo "==> all break-gated fixtures within thresholds"
    exit 0
fi
echo
echo "==> one or more break thresholds breached"
[ "$MODE" = "advisory" ] && { echo "==> advisory mode: not failing run"; exit 0; }
exit 1

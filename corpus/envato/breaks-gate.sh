#!/usr/bin/env bash
# Cycle-4 Track 2c gate: runs the A/B break harness across the
# fixtures pinned in corpus/envato/break-thresholds.json and reports
# per-fixture pass/fail against the recorded thresholds.
#
# Pipeline per fixture:
#   1. idml-inspect --emit-breaks → candidate JSONL
#   2. breaks-extract.py over the reference PDF → reference JSONL
#   3. breaks-compare.py → diff JSON
#   4. compare summary against `thresholds` block in the manifest
#
# Outputs (under $IDML_BREAKS_OUT, default /tmp/idml-breaks-gate):
#   <fixture>.cand.jsonl  candidate-side per-line records
#   <fixture>.ref.jsonl   reference-side per-line records
#   <fixture>.json        breaks-compare's diff JSON
#   gate.json             { fixture, pass, observed, thresholds }
#
# Exit status:
#   0  every fixture under threshold (or no fixtures pinned)
#   1  one or more thresholds breached
#
# Usage:
#   corpus/envato/breaks-gate.sh                 # gate every fixture
#   corpus/envato/breaks-gate.sh text text-advanced
#   IDML_BREAKS_GATE=advisory corpus/envato/breaks-gate.sh   # never fail

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
ENVATO_DIR="$ROOT/corpus/envato"
MANIFEST="$ENVATO_DIR/break-thresholds.json"
INSPECT="$ROOT/target/release/idml-inspect"
EXTRACT="$ENVATO_DIR/breaks-extract.py"
COMPARE="$ENVATO_DIR/breaks-compare.py"
OUT="${IDML_BREAKS_OUT:-/tmp/idml-breaks-gate}"
MODE="${IDML_BREAKS_GATE:-strict}"  # strict | advisory

[ -f "$MANIFEST" ] || { echo "missing $MANIFEST"; exit 2; }
[ -x "$EXTRACT" ] || { echo "missing $EXTRACT"; exit 2; }
[ -x "$COMPARE" ] || { echo "missing $COMPARE"; exit 2; }
command -v pdftotext >/dev/null || { echo "install poppler-utils (pdftotext)"; exit 2; }

if [ ! -x "$INSPECT" ]; then
    echo "==> build idml-inspect (release)"
    (cd "$ROOT" && cargo build --release --bin idml-inspect >/dev/null 2>&1)
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
for name in "${SELECTED[@]}"; do
    pass=$(python3 - "$MANIFEST" "$name" "$OUT" "$ROOT" "$INSPECT" "$EXTRACT" "$COMPARE" <<'PY'
import json
import subprocess
import sys
from pathlib import Path

manifest, name, out_dir, root, inspect, extract, compare = sys.argv[1:8]
data = json.load(open(manifest))
entry = next((f for f in data["fixtures"] if f["name"] == name), None)
if entry is None:
    print(f"==> [{name}] not in manifest — skipping", file=sys.stderr)
    print("SKIP")
    sys.exit(0)

idml = Path(root) / entry["candidate_idml"]
pdf = Path(root) / entry["reference_pdf"]
font = Path(root) / entry["font"]
cand = Path(out_dir) / f"{name}.cand.jsonl"
ref = Path(out_dir) / f"{name}.ref.jsonl"
report = Path(out_dir) / f"{name}.json"

print(f"==> [{name}] render + extract + compare", file=sys.stderr)
subprocess.run(
    [inspect, "--font", str(font), "--emit-breaks", str(cand), str(idml)],
    check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
)
subprocess.run(
    ["python3", extract, str(pdf), str(ref)],
    check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
)
subprocess.run(
    ["python3", compare, str(cand), str(ref), str(report)],
    check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
)
result = json.load(report.open())
summary = result["summary"]
thr = entry["thresholds"]
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
gate_out = Path(out_dir) / f"{name}.gate.json"
gate_out.write_text(json.dumps(gate, indent=2) + "\n")

if fails:
    print(
        f"[{name}] FAIL: " + "; ".join(fails),
        file=sys.stderr,
    )
    print("FAIL")
else:
    print(
        f"[{name}] PASS  "
        f"|Δlines|={summary['line_count_delta_sum']}  "
        f"wrate={summary['word_match_rate_mean']:.3f}  "
        f"drift_p99={summary['baseline_drift_pt_p99']:.3f}pt",
        file=sys.stderr,
    )
    print("PASS")
PY
)
    case "$pass" in
        FAIL) OVERALL_PASS=0 ;;
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

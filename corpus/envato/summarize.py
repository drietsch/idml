#!/usr/bin/env python3
"""Render reports/summary.json as a sortable table.

Reads `corpus/envato/reports/summary.json` and prints one row per
pack — stage, result, pages_diffed, worst_mean / worst_p99 / worst_ssim,
short note. Sorted by worst_mean descending so the most-broken packs
surface to the top.

Usage:
    python3 corpus/envato/summarize.py
    python3 corpus/envato/summarize.py path/to/summary.json
"""

import json
import sys
from pathlib import Path


def fmt(v, spec):
    return spec % v if isinstance(v, (int, float)) else "-"


def main() -> int:
    summary_path = Path(sys.argv[1]) if len(sys.argv) > 1 else \
        Path(__file__).resolve().parent / "reports/summary.json"
    if not summary_path.exists():
        print(f"missing {summary_path}", file=sys.stderr)
        return 2
    summary = json.loads(summary_path.read_text())

    packs = list(summary.get("packs", []))

    def sort_key(p):
        # Failed/errored packs sort to the top; then by worst meanΔE.
        result_rank = 0 if p["result"] != "ok" else 1
        worst = p.get("worst_mean_de") or 0
        return (result_rank, -worst)

    packs.sort(key=sort_key)

    width = max((len(p["name"]) for p in packs), default=4)
    width = max(width, 12)

    header = (
        f"{'pack'.ljust(width)}  stage   result          pages  "
        f"meanΔE   p99ΔE   ssim    note"
    )
    print(header)
    print("-" * len(header))
    for p in packs:
        print(
            f"{p['name'].ljust(width)}  "
            f"{p['stage']:6s}  {p['result']:15s} "
            f"{(str(p['pages_diffed'])).rjust(5)}  "
            f"{fmt(p.get('worst_mean_de'), '%6.2f')}  "
            f"{fmt(p.get('worst_p99_de'), '%6.2f')}  "
            f"{fmt(p.get('worst_ssim'), '%5.3f')}   "
            f"{p.get('note') or ''}"
        )

    print()
    totals = {k: v for k, v in summary.items() if k != "packs"}
    print("totals:", json.dumps(totals))
    return 0


if __name__ == "__main__":
    sys.exit(main())

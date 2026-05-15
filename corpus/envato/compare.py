#!/usr/bin/env python3
"""Compare two snapshots of `corpus/envato/reports/<pack>/pack.json` files
and emit a Markdown report at `corpus/envato/comparison-report.md`.

The audit captured the pre-fix metrics in a tar (default
`/tmp/envato-pre-fix-packs.tar`). The post-fix metrics live on disk
under `corpus/envato/reports/<pack>/pack.json` after the harness
re-runs. This script reads both, joins on pack name, and writes a
sorted table.

Usage:
    python3 corpus/envato/compare.py [--pre TAR] [--out PATH]
"""

import argparse
import json
import sys
import tarfile
from pathlib import Path


def load_pre(tar_path: Path) -> dict[str, dict]:
    metrics: dict[str, dict] = {}
    with tarfile.open(tar_path) as tf:
        for member in tf.getmembers():
            if not member.isfile() or not member.name.endswith("/pack.json"):
                continue
            # member.name is "corpus/envato/reports/<pack>/pack.json"
            parts = Path(member.name).parts
            try:
                pack = parts[parts.index("reports") + 1]
            except (ValueError, IndexError):
                continue
            data = tf.extractfile(member)
            if data is None:
                continue
            try:
                metrics[pack] = json.loads(data.read())
            except json.JSONDecodeError:
                continue
    return metrics


def load_post(reports_dir: Path) -> dict[str, dict]:
    metrics: dict[str, dict] = {}
    for pj in sorted(reports_dir.glob("*/pack.json")):
        try:
            metrics[pj.parent.name] = json.loads(pj.read_text())
        except json.JSONDecodeError:
            continue
    return metrics


def safe(v):
    try:
        return float(v) if v is not None else None
    except (TypeError, ValueError):
        return None


def fmt(v, spec="%.2f"):
    return spec % v if isinstance(v, (int, float)) else "—"


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--pre",
        type=Path,
        default=Path("/tmp/envato-pre-fix-packs.tar"),
        help="Tar of pre-fix pack.json files",
    )
    parser.add_argument(
        "--reports",
        type=Path,
        default=Path(__file__).resolve().parent / "reports",
        help="Post-fix reports dir",
    )
    parser.add_argument(
        "--out",
        type=Path,
        default=Path(__file__).resolve().parent / "comparison-report.md",
    )
    args = parser.parse_args()

    if not args.pre.exists():
        print(f"missing pre-fix snapshot {args.pre}", file=sys.stderr)
        return 2

    pre = load_pre(args.pre)
    post = load_post(args.reports)

    rows = []
    for name in sorted(set(pre) | set(post)):
        a = pre.get(name) or {}
        b = post.get(name) or {}
        pre_mean = safe(a.get("worst_mean_de"))
        post_mean = safe(b.get("worst_mean_de"))
        pre_p99 = safe(a.get("worst_p99_de"))
        post_p99 = safe(b.get("worst_p99_de"))
        pre_ssim = safe(a.get("worst_ssim"))
        post_ssim = safe(b.get("worst_ssim"))
        delta_mean = (
            None if pre_mean is None or post_mean is None else post_mean - pre_mean
        )
        delta_ssim = (
            None if pre_ssim is None or post_ssim is None else post_ssim - pre_ssim
        )
        # Percent improvement on meanΔE: negative delta is good.
        pct = (
            None
            if pre_mean is None or post_mean is None or pre_mean == 0
            else (post_mean - pre_mean) / pre_mean * 100.0
        )
        rows.append(
            {
                "name": name,
                "pre_mean": pre_mean,
                "post_mean": post_mean,
                "delta_mean": delta_mean,
                "pct": pct,
                "pre_p99": pre_p99,
                "post_p99": post_p99,
                "pre_ssim": pre_ssim,
                "post_ssim": post_ssim,
                "delta_ssim": delta_ssim,
            }
        )

    # Sort by absolute meanΔE improvement (largest wins on top).
    rows.sort(
        key=lambda r: (r["delta_mean"] if r["delta_mean"] is not None else 0),
        reverse=False,
    )

    improved = [r for r in rows if r["delta_mean"] is not None and r["delta_mean"] < -0.05]
    regressed = [r for r in rows if r["delta_mean"] is not None and r["delta_mean"] > 0.05]
    flat = [
        r
        for r in rows
        if r["delta_mean"] is not None and abs(r["delta_mean"]) <= 0.05
    ]
    missing_either = [
        r for r in rows if r["pre_mean"] is None or r["post_mean"] is None
    ]

    avg_delta = (
        sum(r["delta_mean"] for r in rows if r["delta_mean"] is not None)
        / max(len([r for r in rows if r["delta_mean"] is not None]), 1)
    )

    # idea.md §13.2 budgets: mean ≤ 1.0, p99 ≤ 2.5, SSIM ≥ 0.99.
    in_budget = [
        r
        for r in rows
        if r["post_mean"] is not None
        and r["post_mean"] <= 1.0
        and (r["post_p99"] is None or r["post_p99"] <= 2.5)
        and (r["post_ssim"] is None or r["post_ssim"] >= 0.99)
    ]
    pre_in_budget = [
        r
        for r in rows
        if r["pre_mean"] is not None
        and r["pre_mean"] <= 1.0
        and (r["pre_p99"] is None or r["pre_p99"] <= 2.5)
        and (r["pre_ssim"] is None or r["pre_ssim"] >= 0.99)
    ]

    lines: list[str] = []
    lines.append("# Envato corpus: pre-fix vs post-fix comparison")
    lines.append("")
    lines.append(
        "Snapshot diff between the audit-time `pack.json` files (captured at "
        "`/tmp/envato-pre-fix-packs.tar` before any P-* fixes landed) and the "
        "current on-disk `pack.json` files after Waves 1+2+3 of the improvement "
        "protocol."
    )
    lines.append("")
    lines.append("## Headline")
    lines.append("")
    lines.append(f"- Packs compared: **{len(rows)}** (pre={len(pre)}, post={len(post)})")
    lines.append(f"- Improved (Δ mean_de < −0.05): **{len(improved)}**")
    lines.append(f"- Regressed (Δ mean_de > +0.05): **{len(regressed)}**")
    lines.append(f"- Flat (|Δ| ≤ 0.05): **{len(flat)}**")
    lines.append(
        f"- Missing in one snapshot or the other: **{len(missing_either)}**"
    )
    lines.append(f"- Average Δ mean_de across compared packs: **{avg_delta:+.3f}**")
    lines.append("")
    lines.append(
        f"- Packs inside idea.md §13.2 budget (mean ≤ 1.0, p99 ≤ 2.5, SSIM ≥ 0.99): "
        f"pre **{len(pre_in_budget)}**, post **{len(in_budget)}**"
    )
    lines.append("")

    if regressed:
        lines.append("## Regressions — investigate")
        lines.append("")
        lines.append(
            "| Pack | pre mean | post mean | Δ | % | pre SSIM | post SSIM |"
        )
        lines.append("| --- | ---: | ---: | ---: | ---: | ---: | ---: |")
        regressed_sorted = sorted(
            regressed, key=lambda r: r["delta_mean"], reverse=True
        )
        for r in regressed_sorted:
            lines.append(
                "| {name} | {pre_mean} | {post_mean} | {delta_mean:+.2f} | "
                "{pct:+.1f}% | {pre_ssim} | {post_ssim} |".format(
                    name=r["name"],
                    pre_mean=fmt(r["pre_mean"]),
                    post_mean=fmt(r["post_mean"]),
                    delta_mean=r["delta_mean"],
                    pct=r["pct"] or 0,
                    pre_ssim=fmt(r["pre_ssim"], "%.3f"),
                    post_ssim=fmt(r["post_ssim"], "%.3f"),
                )
            )
        lines.append("")

    lines.append("## Per-pack table (sorted by mean_de improvement, biggest wins on top)")
    lines.append("")
    lines.append(
        "| Pack | pre mean | post mean | Δ mean | % | pre SSIM | post SSIM | Δ SSIM |"
    )
    lines.append(
        "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |"
    )
    for r in rows:
        lines.append(
            "| {name} | {pre_mean} | {post_mean} | {delta_mean} | {pct} | "
            "{pre_ssim} | {post_ssim} | {delta_ssim} |".format(
                name=r["name"],
                pre_mean=fmt(r["pre_mean"]),
                post_mean=fmt(r["post_mean"]),
                delta_mean=fmt(r["delta_mean"], "%+.2f"),
                pct=(
                    f"{r['pct']:+.1f}%"
                    if r["pct"] is not None
                    else "—"
                ),
                pre_ssim=fmt(r["pre_ssim"], "%.3f"),
                post_ssim=fmt(r["post_ssim"], "%.3f"),
                delta_ssim=fmt(r["delta_ssim"], "%+.3f"),
            )
        )

    lines.append("")
    lines.append("## What landed")
    lines.append("")
    lines.append(
        "See `corpus/envato/improvement-protocol.md` for the per-finding status. "
        "Summary of the three implementation waves:"
    )
    lines.append("")
    lines.append("- **Wave 1 (Blockers)** — 5/5 fixed: P-01..P-05.")
    lines.append(
        "- **Wave 2 (Majors)** — 13/15 fixed, 2 deferred (P-09 effect-bag plumbing "
        "for non-Rect shapes, P-10 paragraph-shading decorations)."
    )
    lines.append(
        "- **Wave 3 (Minors + INF-2)** — 4/10 fixed (P-22, P-25), 2 verified (P-26 "
        "no-op needed, P-27 closed by P-01), 4 deferred (P-21 not present in "
        "corpus, P-23/P-24 root cause outside cited scope, P-29 needs "
        "StoryOrientation plumbing, P-30 ItemLayer stacking), 1 fixed (P-28 closed "
        "by Wave 2). INF-2 manifest annotation landed."
    )
    lines.append("")
    lines.append("## Caveats")
    lines.append("")
    lines.append(
        "- `p99_de` numbers tend to stay pinned at high values where the heatmap "
        "edge happens to land on an unrelated font-substitution-driven pixel. "
        "Use `mean_de` and SSIM as the primary signals."
    )
    lines.append(
        "- INF-1 (font-substitution drift) is still open per the protocol. The "
        "fixes here do not address per-pack font calibration; some packs will "
        "show small residual drift driven by Inter / Roboto / Open Sans not "
        "exactly matching Poppins / Montserrat / DM Sans advance widths."
    )
    lines.append(
        "- INF-2's 5 packs (resume-template-teacher, employment-application, "
        "cultured-business-newsletter, brown-fashion-brochure, "
        "modern-resume-reference-job-application-template) carry reference PDFs "
        "rendered with theme swatches the IDML doesn't declare. Their numbers "
        "reflect corpus-curation gaps, not renderer fidelity."
    )

    args.out.write_text("\n".join(lines) + "\n")
    print(f"wrote {args.out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())

#!/usr/bin/env python3
"""Track 2c: A/B-harness break-decision diff metric.

Loads a candidate-side break JSONL (produced by `idml-inspect
--emit-breaks`) and a reference-side break JSONL (produced by
`breaks-extract.py`), then scores per-page divergence on three axes:

    1. line_count_delta_per_page : |cand_lines − ref_lines| per page.
       Detects composer-level break-decision changes (a tightened
       letter-spacing budget that re-flows a paragraph from 4 lines
       to 3 shows up here).
    2. word_match_rate            : per matched line, do the
       candidate's first/last words (extracted from its
       `source_text`, populated since cycle-5 Track 1) equal the
       reference's first/last words? Reports the rate of pairs
       where both endpoints match (1.0 = perfect). Hyphenation
       tolerance: if the candidate's last "word" ends in `-`, the
       reference's next-line first word is allowed to be the
       continuation. Pre-cycle-5 candidate JSONLs that lack
       `source_text` fall back to the legacy byte-span heuristic.
    3. baseline_drift_pt          : per matched line, the |Δ| between
       candidate baseline (frame-local) and reference baseline (page-
       local). Anchored to a per-page offset (the first matched
       line's drift is treated as the page's baseline-zero shift) so
       the residual reflects intra-page line-spacing differences, not
       just the page-margin offset.

The per-line first/last-word matching is the heuristic the cycle-3
plan flagged. Hyphenation + mid-word breaks mean a tight word-equality
test is too strict; this implementation matches on a Jaccard-like
test (first OR last word equal) and reports the rate.

Output JSON shape:

    {
      "candidate": "path/to/cand.jsonl",
      "reference": "path/to/ref.jsonl",
      "per_page": [
        {"page": 0, "cand_lines": 2, "ref_lines": 2,
         "line_count_delta": 0, "word_match_rate": 1.0,
         "baseline_drift_pt_p50": 0.0, "baseline_drift_pt_p99": 0.1},
        ...
      ],
      "summary": {
        "total_cand_lines": int,
        "total_ref_lines": int,
        "line_count_delta_sum": int,
        "word_match_rate_mean": float,
        "baseline_drift_pt_p99": float
      }
    }

Usage:
    python3 breaks-compare.py [--strict-pairs] CANDIDATE.jsonl REFERENCE.jsonl OUT.json

`--strict-pairs` (cycle 6 Track 2): exclude un-aligned cand-ref
pairs from `baseline_drift` (and still count their word_match=0
contributions). Useful when the candidate has been filtered via
`--break-story-id` against a reference that contains additional
unrelated lines on the same page — the structural-divergence noise
no longer dominates the drift metric.
"""

from __future__ import annotations

import json
import re
import statistics
import sys
from collections import defaultdict
from pathlib import Path


def normalise_word(s: str) -> str:
    """Lowercase + strip surrounding punctuation. Matches the most
    common between-pack rendering differences (curly vs straight
    quotes, trailing colons / periods)."""
    return re.sub(r"[^\w]", "", s.lower())


def word_endpoints_match(
    candidate_text: str,
    ref_first: str,
    ref_last: str,
    next_line_ref_first: str | None,
) -> int:
    """Return 1 when the candidate line's first and last words match
    the reference line's; 0 otherwise. Handles two flavours of
    hyphenation:

    - **Candidate hyphenated**: candidate's last token ends in `-`;
      the reference's *next* line's first word is the continuation.
      Treat as a last-word match.
    - **Reference soft-break**: rare; not handled here (would need
      symmetric look-ahead on the candidate side).

    Empty input on either side returns 0 (no match)."""
    cand_words = candidate_text.split()
    if not cand_words:
        return 0
    cf = normalise_word(cand_words[0])
    cl_raw = cand_words[-1]
    cl = normalise_word(cl_raw)
    rf = normalise_word(ref_first)
    rl = normalise_word(ref_last)
    first_ok = bool(cf) and cf == rf
    last_ok = bool(cl) and cl == rl
    # Hyphenated candidate continuation tolerance.
    if not last_ok and cl_raw.endswith("-") and next_line_ref_first:
        last_ok = bool(cl) and (
            cl == next_line_ref_first
            or next_line_ref_first.startswith(cl)
        )
    return 1 if (first_ok and last_ok) else 0


def load_jsonl(path: Path) -> list[dict]:
    with path.open("r", encoding="utf-8") as f:
        return [json.loads(line) for line in f if line.strip()]


def compare(cand_path: Path, ref_path: Path, strict_pairs: bool = False) -> dict:
    cand = load_jsonl(cand_path)
    ref = load_jsonl(ref_path)
    cand_by_page: dict[int, list[dict]] = defaultdict(list)
    ref_by_page: dict[int, list[dict]] = defaultdict(list)
    for r in cand:
        cand_by_page[int(r["page_idx"])].append(r)
    for r in ref:
        ref_by_page[int(r["page_idx"])].append(r)

    all_pages = sorted(set(cand_by_page) | set(ref_by_page))
    per_page = []
    all_drifts = []
    word_match_total = 0
    word_match_hits = 0

    for p in all_pages:
        cls = sorted(cand_by_page.get(p, []), key=lambda r: r["baseline_y_pt"])
        rls = sorted(ref_by_page.get(p, []), key=lambda r: r["baseline_y_pt"])
        line_count_delta = abs(len(cls) - len(rls))

        # Pair up by index (ordered top-to-bottom). For pages where
        # counts differ, the tail of the longer list is unmatched —
        # those lines contribute to line_count_delta but not to the
        # baseline-drift / word-match scores.
        pairs = list(zip(cls, rls))
        # Drift relative to the page's first matched pair so the
        # constant page-margin offset cancels.
        if pairs:
            base_offset = pairs[0][0]["baseline_y_pt"] - pairs[0][1]["baseline_y_pt"]
        else:
            base_offset = 0.0

        # Cycle-6 Track 2: pre-compute the per-pair word-endpoint
        # match. In strict-pairs mode this gates the baseline-drift
        # contribution as well — only pairs where the candidate's
        # first/last word actually align with the reference's
        # contribute to the metric, so structural-divergence noise
        # (pdftotext seeing all lines on a multi-story page while
        # candidate sees only the filtered story) stops dominating.
        next_ref_first: dict[int, str] = {}
        for i in range(len(rls) - 1):
            words = (rls[i + 1].get("first_word") or "").split()
            if words:
                next_ref_first[i] = normalise_word(words[0])
        pair_hits: list[int] = []
        for i, (c, r) in enumerate(pairs):
            if c.get("source_text") is not None:
                pair_hits.append(
                    word_endpoints_match(
                        c["source_text"],
                        r.get("first_word", ""),
                        r.get("last_word", ""),
                        next_ref_first.get(i),
                    )
                )
            else:
                # Legacy heuristic for pre-cycle-5 candidate JSONLs.
                cand_byte_span = c["last_byte"] - c["first_byte"]
                ref_char_span = r["x_max"] - r["x_min"]
                est_ref_byte_span = ref_char_span / 6.0
                pair_hits.append(
                    1 if (
                        cand_byte_span > 0
                        and est_ref_byte_span > 0
                        and 0.5 < cand_byte_span / est_ref_byte_span < 2.0
                    ) else 0
                )

        drifts = []
        page_word_total = 0
        page_word_hits = 0
        for i, (c, r) in enumerate(pairs):
            page_word_total += 1
            page_word_hits += pair_hits[i]
            if strict_pairs and pair_hits[i] == 0:
                # Skip baseline-drift contribution for un-aligned pairs.
                continue
            adj = (c["baseline_y_pt"] - r["baseline_y_pt"]) - base_offset
            drifts.append(abs(adj))

        word_match_total += page_word_total
        word_match_hits += page_word_hits
        all_drifts.extend(drifts)

        per_page.append({
            "page": p,
            "cand_lines": len(cls),
            "ref_lines": len(rls),
            "line_count_delta": line_count_delta,
            "word_match_rate": (page_word_hits / page_word_total) if page_word_total else 1.0,
            "baseline_drift_pt_p50": pct(drifts, 50),
            "baseline_drift_pt_p99": pct(drifts, 99),
        })

    return {
        "candidate": str(cand_path),
        "reference": str(ref_path),
        "per_page": per_page,
        "summary": {
            "total_cand_lines": len(cand),
            "total_ref_lines": len(ref),
            "line_count_delta_sum": sum(pp["line_count_delta"] for pp in per_page),
            "word_match_rate_mean": (word_match_hits / word_match_total)
            if word_match_total
            else 1.0,
            "baseline_drift_pt_p99": pct(all_drifts, 99),
        },
    }


def pct(xs: list[float], q: int) -> float:
    if not xs:
        return 0.0
    if len(xs) == 1:
        return round(xs[0], 4)
    return round(statistics.quantiles(xs, n=100)[q - 1], 4)


def main(argv: list[str]) -> int:
    # Trivial argv parser keeps the script free of an argparse dep;
    # cycle-6 adds --strict-pairs.
    strict_pairs = False
    args = []
    for a in argv[1:]:
        if a == "--strict-pairs":
            strict_pairs = True
        else:
            args.append(a)
    if len(args) != 3:
        print(
            f"usage: {argv[0]} [--strict-pairs] CANDIDATE.jsonl REFERENCE.jsonl OUT.json",
            file=sys.stderr,
        )
        return 2
    cand_path = Path(args[0])
    ref_path = Path(args[1])
    out_path = Path(args[2])
    result = compare(cand_path, ref_path, strict_pairs=strict_pairs)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    s = result["summary"]
    print(
        f"breaks-compare: cand={s['total_cand_lines']} ref={s['total_ref_lines']} "
        f"|Δlines|={s['line_count_delta_sum']} "
        f"word_match={s['word_match_rate_mean']:.3f} "
        f"baseline_drift_p99={s['baseline_drift_pt_p99']:.3f}pt → {out_path}",
        file=sys.stderr,
    )
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))

#!/usr/bin/env python3
"""Track 2b: reference-side line-geometry extractor for the A/B harness.

Runs `pdftotext -bbox-layout` against the reference PDF for a pack,
parses the resulting XHTML, and emits one JSONL record per detected
line. Records intentionally mirror the candidate-side
[`BreakRecord`] schema produced by `idml-inspect --emit-breaks` so
`compare.py` can match candidate lines to reference lines by
`(page_idx, baseline_y_pt ± tol)` and score divergence per line.

Output schema (JSONL):

    {"page_idx": int,
     "line_idx": int,           # per-page, in document order
     "block_idx": int,          # which <block> the line belongs to
     "first_word": str,
     "last_word": str,
     "word_count": int,
     "x_min": float,            # leftmost word x_min, pt
     "x_max": float,            # rightmost word x_max, pt
     "y_min": float,            # line y_min (top), pt
     "y_max": float,            # line y_max (bottom), pt
     "baseline_y_pt": float,    # estimated baseline = y_max - 0.2*(y_max-y_min)
     "width_pt": float}         # x_max - x_min

The baseline estimate intentionally treats a line's bottom edge as
descender_bottom and pulls back by 20% of line-height to approximate
the baseline. It is a coarse heuristic but consistent across packs;
absolute offsets cancel out when comparing within a single document
because the candidate-side records use a different (frame-local)
origin anyway. `compare.py` does the offset alignment itself.

Known limitations (documented per cycle-3 plan):
- Hyphenation splits: a hyphenated word is two PDF "words". The
  script doesn't attempt to rejoin; downstream matching tolerates
  this via word-count fuzziness.
- Multi-column flow: pdftotext orders <block> elements left-to-right
  top-to-bottom across columns. The block_idx field surfaces the
  grouping so callers can re-segment if needed.
- Embedded fonts that decode glyphs to ASCII look-alikes: out of
  scope; affects only specialised packs (icon fonts).

If `pdftotext -bbox-layout` proves too lossy on a given pack, fall
back to `pdfminer.six` (separately installed) — the cycle-4 plan
flagged this as the alternate path.

Usage:
    python3 breaks-extract.py REFERENCE.pdf OUT.jsonl
"""

from __future__ import annotations

import json
import subprocess
import sys
import xml.etree.ElementTree as ET
from pathlib import Path


XHTML_NS = "{http://www.w3.org/1999/xhtml}"


def extract(pdf: Path, out: Path) -> int:
    """Run pdftotext and emit one JSONL record per line. Returns the
    number of lines written."""
    if not pdf.exists():
        raise FileNotFoundError(pdf)
    proc = subprocess.run(
        ["pdftotext", "-bbox-layout", str(pdf), "-"],
        capture_output=True,
        check=True,
    )
    # pdftotext emits XHTML 1.0 with an xmlns; strip the DOCTYPE so
    # ET's parser doesn't try to fetch the DTD. We slice from the first
    # `<html` tag onwards.
    text = proc.stdout.decode("utf-8", errors="replace")
    start = text.find("<html")
    if start < 0:
        raise RuntimeError(f"pdftotext output for {pdf} has no <html>")
    root = ET.fromstring(text[start:])

    out.parent.mkdir(parents=True, exist_ok=True)
    records = 0
    with out.open("w", encoding="utf-8") as f:
        for page_idx, page in enumerate(root.iter(f"{XHTML_NS}page")):
            line_idx = 0
            for block_idx, block in enumerate(page.iter(f"{XHTML_NS}block")):
                for line in block.iter(f"{XHTML_NS}line"):
                    rec = line_record(page_idx, line_idx, block_idx, line)
                    if rec is None:
                        continue
                    json.dump(rec, f, separators=(",", ":"))
                    f.write("\n")
                    records += 1
                    line_idx += 1
    return records


def line_record(
    page_idx: int, line_idx: int, block_idx: int, line: ET.Element
) -> dict | None:
    words = list(line.iter(f"{XHTML_NS}word"))
    if not words:
        return None
    first = words[0].text or ""
    last = words[-1].text or ""
    x_min = float(line.attrib["xMin"])
    x_max = float(line.attrib["xMax"])
    y_min = float(line.attrib["yMin"])
    y_max = float(line.attrib["yMax"])
    height = y_max - y_min
    return {
        "page_idx": page_idx,
        "line_idx": line_idx,
        "block_idx": block_idx,
        "first_word": first,
        "last_word": last,
        "word_count": len(words),
        "x_min": round(x_min, 4),
        "x_max": round(x_max, 4),
        "y_min": round(y_min, 4),
        "y_max": round(y_max, 4),
        # Baseline ≈ y_max − 0.2·height (descender ≈ 20% of line height).
        "baseline_y_pt": round(y_max - 0.2 * height, 4),
        "width_pt": round(x_max - x_min, 4),
    }


def main(argv: list[str]) -> int:
    if len(argv) != 3:
        print(f"usage: {argv[0]} REFERENCE.pdf OUT.jsonl", file=sys.stderr)
        return 2
    pdf = Path(argv[1])
    out = Path(argv[2])
    n = extract(pdf, out)
    print(f"breaks-extract: {n} line record(s) → {out}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))

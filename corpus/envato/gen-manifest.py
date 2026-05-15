#!/usr/bin/env python3
"""Generate corpus/envato/manifest.json from the zips next to this file.

Discovers, per zip:
  - one IDML to use (smallest non-__MACOSX *.idml — generator-friendly,
    avoids the 180-IDML "gridtastic" balloon by picking the smallest
    sample only).
  - the readme (.txt/.rtf) most likely to list fonts.
  - declared font names parsed out of the readme via the heuristics
    summarised in parse_fonts(): explicit Google-Fonts URLs, "Font: X"
    leaders, FontSquirrel URLs.

The output is a starting point for hand-curation — `stage` defaults to
"smoke" (no gating yet) and existing entries' `stage` / `skip_reason`
are preserved when re-running. Re-run after dropping new zips in:

    python3 corpus/envato/gen-manifest.py

Round-trips (idempotent unless a new zip appears or the readme parse
yields a different declared_fonts list).
"""

import json
import re
import sys
import zipfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
MANIFEST = HERE / "manifest.json"

# Files inside the readme that look like (a) Google Fonts URL pulls,
# (b) FontSquirrel pulls, or (c) "Font: X" or "FONT : X" leaders.
GOOGLE_RE = re.compile(r"fonts\.google\.com/specimen/([A-Za-z0-9+_.\-]+)", re.I)
SQUIRREL_RE = re.compile(r"fontsquirrel\.com/fonts/([A-Za-z0-9_.\-]+)", re.I)
LEADER_RE = re.compile(
    r"^\s*(?:font|fonts?\s+used|font\s+name|typography)\s*[:\-]\s*(.+)$",
    re.I | re.M,
)


def read_zip_entry(zf: zipfile.ZipFile, name: str, max_bytes: int = 100_000) -> str:
    """Decode a zip entry as text, best-effort. Strips macOS resource
    fork garbage that decoders often choke on."""
    try:
        raw = zf.read(name)[:max_bytes]
    except KeyError:
        return ""
    # Drop NULs and the macOS finder-ATTR header trailer.
    raw = raw.split(b"\x00\x00Mac OS X")[0]
    raw = raw.replace(b"\x00", b"")
    for enc in ("utf-8", "latin-1"):
        try:
            return raw.decode(enc)
        except UnicodeDecodeError:
            continue
    return raw.decode("utf-8", errors="replace")


def parse_fonts(text: str) -> list[str]:
    """Best-effort parse of declared fonts from a readme."""
    seen: list[str] = []

    def add(name: str) -> None:
        name = re.sub(r"\s+", " ", name).strip(" \t.,;:")
        if not name or len(name) > 64:
            return
        if any(name.lower() == s.lower() for s in seen):
            return
        seen.append(name)

    for m in GOOGLE_RE.finditer(text):
        add(m.group(1).replace("+", " "))
    for m in SQUIRREL_RE.finditer(text):
        # FontSquirrel slugs are lowercased-and-hyphenated; e.g. "open-sans" → "Open Sans".
        add(" ".join(p.capitalize() for p in m.group(1).split("-")))
    for m in LEADER_RE.finditer(text):
        line = m.group(1)
        # Drop everything from the first URL or " - " separator onward —
        # readmes typically write "Poppins - https://fonts.google.com/...".
        line = re.split(r"https?://|\s-\s|\s—\s", line, maxsplit=1)[0]
        for part in re.split(r"[,;]| and ", line):
            part = re.sub(r"\(.*?\)", "", part)  # strip parenthetical
            # Skip anything that still looks URL-ish or has slashes.
            if "/" in part or "?" in part:
                continue
            add(part)
    return seen


def pick_readme(names: list[str]) -> str | None:
    """Pick the most informative readme inside a pack."""
    candidates = [
        n
        for n in names
        if not n.startswith("__MACOSX/")
        and not n.endswith("/")
        and re.search(r"\.(txt|rtf|md)$", n, re.I)
    ]
    if not candidates:
        return None
    # Prefer filenames mentioning fonts > read me > help/info > anything.
    keywords = [
        ("font", 3),
        ("read me", 2),
        ("readme", 2),
        ("info", 1),
        ("help", 1),
    ]

    def score(name: str) -> int:
        low = name.lower()
        return max((w for kw, w in keywords if kw in low), default=0)

    candidates.sort(key=lambda n: (-score(n), len(n)))
    return candidates[0]


def pick_idml(names: list[str]) -> str | None:
    """Pick one IDML per pack. Smallest path-depth wins; for the
    180-IDML grid kit we don't want to gate every sub-grid so we
    further pick the alphabetically-first name."""
    return _pick_by_ext(names, ".idml")


def pick_indd(names: list[str]) -> str | None:
    """Pick one INDD per pack as a fallback when no IDML is shipped.
    The harness will export it to IDML via InDesign on unpack."""
    return _pick_by_ext(names, ".indd")


def _pick_by_ext(names: list[str], ext: str) -> str | None:
    matches = [
        n
        for n in names
        if not n.startswith("__MACOSX/") and n.lower().endswith(ext)
    ]
    if not matches:
        return None
    matches.sort(key=lambda n: (n.count("/"), n.lower()))
    return matches[0]


def slugify(zip_path: Path) -> str:
    name = zip_path.stem
    # Strip the trailing envato date stamp "-YYYY-MM-DD-HH-MM-SS-utc".
    return re.sub(r"-\d{4}-\d{2}-\d{2}-\d{2}-\d{2}-\d{2}-utc$", "", name)


def discover_pack(zip_path: Path) -> dict | None:
    try:
        with zipfile.ZipFile(zip_path) as zf:
            names = zf.namelist()
            idml = pick_idml(names)
            indd = pick_indd(names) if idml is None else None
            if idml is None and indd is None:
                return None
            readme = pick_readme(names)
            declared: list[str] = []
            if readme is not None:
                declared = parse_fonts(read_zip_entry(zf, readme))
    except zipfile.BadZipFile:
        return None
    return {
        "name": slugify(zip_path),
        "zip": zip_path.name,
        "idml_in_zip": idml,
        # Set only when no idml is present — unpack.sh will drive
        # InDesign to export the INDD into packs/<name>/template.idml.
        "indd_in_zip": indd,
        "readme_in_zip": readme,
        "declared_fonts": declared,
        "stage": "smoke",
        "skip_reason": None,
    }


def main() -> int:
    existing: dict[str, dict] = {}
    if MANIFEST.exists():
        try:
            for entry in json.loads(MANIFEST.read_text())["packs"]:
                existing[entry["name"]] = entry
        except (json.JSONDecodeError, KeyError):
            pass

    packs: list[dict] = []
    used_names: set[str] = set()
    for zip_path in sorted(HERE.glob("*.zip")):
        new = discover_pack(zip_path)
        if new is None:
            print(f"[skip] {zip_path.name}: no IDML found", file=sys.stderr)
            continue
        # Disambiguate slug collisions: two zips can produce the same
        # date-stripped slug (e.g. annual-report-template uploaded twice
        # on the same day with different revision timestamps). Suffix
        # the slug with a short hash of the zip filename so each pack
        # has its own packs/<name>/ and reports/<name>/ directories.
        if new["name"] in used_names:
            import hashlib
            suffix = hashlib.sha1(zip_path.name.encode()).hexdigest()[:6]
            new["name"] = f"{new['name']}-{suffix}"
        used_names.add(new["name"])
        # Preserve hand-curated fields (stage / skip_reason) from a
        # previous run if the pack already exists.
        prior = existing.get(new["name"])
        if prior is not None:
            for field in ("stage", "skip_reason"):
                new[field] = prior.get(field, new[field])
        packs.append(new)

    output = {
        "_comment": [
            "One entry per Envato pack zip in corpus/envato/.",
            "Regenerate with: python3 corpus/envato/gen-manifest.py",
            "",
            "Fields:",
            "  name             — pack identifier (kebab-case slug from zip filename)",
            "  zip              — basename inside corpus/envato/",
            "  idml_in_zip      — path inside the zip to the IDML to render, or null",
            "  indd_in_zip      — set only when no IDML ships; unpack.sh exports it via InDesign",
            "  readme_in_zip    — path inside the zip to the font-listing readme, or null",
            "  declared_fonts   — parsed from readme; advisory, see overrides/<pack>/fonts.* for canonical",
            "  stage            — 'smoke' (render only), 'gated' (fidelity-thresholds.json applies), 'skip'",
            "  skip_reason      — required when stage == 'skip' so future humans know why",
        ],
        "packs": packs,
    }
    MANIFEST.write_text(json.dumps(output, indent=2) + "\n")
    print(f"wrote {len(packs)} packs → {MANIFEST}")
    return 0


if __name__ == "__main__":
    sys.exit(main())

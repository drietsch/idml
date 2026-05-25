// Parse a per-pack `corpus/envato/overrides/<pack>/fonts.sh` and
// resolve every declared `--font-family "Family=path"` entry to an
// absolute TTF on disk plus its IDML family / style key.
//
// This is the substitution path: it mirrors what `corpus/envato/test.sh`
// hands to `idml-inspect --font-family ...`. The Playwright suite
// loads these bytes via the wasm `registerFont` method so the canvas
// renders against the exact same fonts the reference PDF was exported
// with. Without this step the renderer's default-font fallback would
// dominate ΔE for every pack whose declared fonts differ from Inter.

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { OVERRIDES_DIR, corpusFontsDir } from "./fixtures";

export interface FontMapping {
  /** IDML `AppliedFont` family name (e.g. "Poppins"). */
  family: string;
  /** Optional style string (e.g. "Bold", "Italic"). Null = bare family. */
  style: string | null;
  /** Absolute path to the TTF/OTF on disk. */
  ttfPath: string;
}

export interface PackFonts {
  /** Absolute path to the default-font TTF (used as the fallback). */
  defaultFontPath: string;
  /** Per-(family, style) substitutions, in fonts.sh declaration order. */
  mappings: FontMapping[];
}

/**
 * Read the per-pack fonts.sh; fall back to overrides/_default/fonts.sh
 * when the pack has no sidecar. Mirrors the dispatch in test.sh.
 */
export function loadPackFonts(packName: string): PackFonts {
  const candidate = resolve(OVERRIDES_DIR, packName, "fonts.sh");
  const fallback = resolve(OVERRIDES_DIR, "_default", "fonts.sh");
  const path = existsSync(candidate) ? candidate : fallback;
  return parseFontsSh(readFileSync(path, "utf8"));
}

/**
 * Parse fonts.sh source. The format is constrained by hand-edit
 * conventions: one `--font-family "Family[/Style]=...path"` argument
 * per line inside `FONT_FLAGS=(…)`, plus a leading `DEFAULT_FONT="…"`
 * assignment. We use line-by-line regex; full bash semantics would be
 * massive overkill (no variable expansion, no quotes-in-quotes
 * survival).
 */
export function parseFontsSh(src: string): PackFonts {
  const fontsDir = corpusFontsDir();
  // $FONTS expands to corpus/fonts/. $ROOT/corpus/fonts/... is also
  // valid in test.sh; expand it the same way here.
  const expandPath = (p: string): string => {
    let s = p;
    s = s.replace(/^\$FONTS/, fontsDir);
    s = s.replace(/^\$\{FONTS\}/, fontsDir);
    s = s.replace(/^\$ROOT\/corpus\/fonts/, fontsDir);
    return s;
  };

  let defaultFontPath = "";
  const mappings: FontMapping[] = [];

  for (const rawLine of src.split("\n")) {
    const line = rawLine.replace(/#.*$/, "").trim();
    if (!line) continue;
    const def = /^DEFAULT_FONT=(?:"([^"]+)"|'([^']+)'|(\S+))$/.exec(line);
    if (def) {
      defaultFontPath = expandPath(def[1] ?? def[2] ?? def[3]);
      continue;
    }
    // Match: --font-family "Family[/Style]=PATH"
    const ff = /--font-family\s+"([^"=]+)=([^"]+)"/.exec(line);
    if (ff) {
      const lhs = ff[1].trim();
      const ttf = expandPath(ff[2].trim());
      let family = lhs;
      let style: string | null = null;
      const slash = lhs.indexOf("/");
      if (slash >= 0) {
        family = lhs.slice(0, slash).trim();
        style = lhs.slice(slash + 1).trim();
      }
      mappings.push({ family, style, ttfPath: ttf });
    }
  }

  if (!defaultFontPath) {
    defaultFontPath = resolve(fontsDir, "Inter.ttf");
  }
  return { defaultFontPath, mappings };
}

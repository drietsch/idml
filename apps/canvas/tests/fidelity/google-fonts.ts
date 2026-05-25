// Google Fonts CSS API client.
//
// Google Fonts now only returns WOFF2 even to old UAs (their old-UA →
// TTF trick was retired). We accept WOFF2, save it to the cache, and
// decompress to SFNT/TTF on the fly via `woff2_decompress` (poppler-
// style: shell-out, optional). When the binary is missing we keep the
// WOFF2 around for a later decode pass.
//
// Failure modes:
//   - Family is unknown to Google Fonts → CSS body is empty, we
//     drop a `<family>.missing` marker and return [].
//   - Network down → throw, caller falls back to the manual override.
//   - `woff2_decompress` missing → cached WOFF2 is downloaded but
//     unconvertible; consumers fall back to the per-pack override.

import { execFileSync, spawnSync } from "node:child_process";
import {
  createWriteStream,
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { resolve } from "node:path";

import { corpusFontsDir } from "./fixtures";

/** Family/style → on-disk TTF, plus a status hint for the resolver. */
export interface ResolvedFontDownload {
  family: string;
  /** Best-effort matching style. May be a normalised form ("400italic"). */
  style: string;
  /** Absolute path of the TTF in `corpus/fonts/.cache/`. */
  ttfPath: string;
}

// Modern UA so Google Fonts actually returns a CSS body (the old
// IE6 trick used to coax TTFs out of them but was retired). We pull
// WOFF2 and decompress locally.
const UA_MODERN =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) " +
  "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36";

const CACHE_DIR = resolve(corpusFontsDir(), ".cache");
mkdirSync(CACHE_DIR, { recursive: true });

/**
 * Resolve a Google Fonts family. Returns one entry per available
 * style. Cache hits skip the network. Misses are also cached (as a
 * negative marker file) so a 60-pack run doesn't pound the CSS API
 * with the same misses every iteration.
 */
export async function resolveGoogleFontFamily(
  family: string,
): Promise<ResolvedFontDownload[]> {
  const slug = family.replace(/\s+/g, "_");
  const missMarker = resolve(CACHE_DIR, `${slug}.missing`);
  if (existsSync(missMarker)) {
    return [];
  }
  // Each family directory holds its TTFs + a `meta.json` indicating
  // which styles we successfully fetched.
  const dir = resolve(CACHE_DIR, slug);
  const meta = resolve(dir, "meta.json");
  if (existsSync(meta)) {
    return readCachedMeta(meta);
  }
  const cssUrl =
    `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}` +
    `:ital,wght@0,400;0,700;1,400;1,700&display=swap`;
  const cssResp = await fetch(cssUrl, { headers: { "User-Agent": UA_MODERN } });
  if (cssResp.status === 400 || cssResp.status === 404) {
    // Not on Google Fonts. Drop a negative marker; the resolver falls
    // back to the per-pack override.
    mkdirSync(CACHE_DIR, { recursive: true });
    createWriteStream(missMarker).end();
    return [];
  }
  if (!cssResp.ok) {
    throw new Error(`Google Fonts CSS ${cssUrl}: ${cssResp.status}`);
  }
  const css = await cssResp.text();
  const items = parseGoogleFontsCss(css);
  if (items.length === 0) {
    createWriteStream(missMarker).end();
    return [];
  }
  mkdirSync(dir, { recursive: true });
  // The CSS body is sliced by unicode subset (latin / latin-ext /
  // cyrillic / …) — for each (style, subset) we get a separate
  // WOFF2. We want one TTF per style for the renderer, so keep only
  // the first WOFF2 we see per styleKey. That's almost always the
  // latin subset (Google emits subsets in declaration order, latin
  // comes first for non-CJK families) — good enough for fidelity
  // testing on English-language envato packs.
  const seen = new Set<string>();
  const downloads: ResolvedFontDownload[] = [];
  for (const item of items) {
    if (seen.has(item.styleKey)) continue;
    const woff2Dst = resolve(dir, `${item.styleKey}.woff2`);
    const ttfDst = resolve(dir, `${item.styleKey}.ttf`);
    if (!existsSync(woff2Dst) || statSync(woff2Dst).size === 0) {
      const w2Resp = await fetch(item.url);
      if (!w2Resp.ok) continue;
      const buf = Buffer.from(await w2Resp.arrayBuffer());
      writeFileSync(woff2Dst, buf);
    }
    if (!existsSync(ttfDst) || statSync(ttfDst).size === 0) {
      if (!decompressWoff2(woff2Dst, ttfDst)) {
        // Decode failed (binary missing or invalid). Skip this style;
        // mark the family as missing if NO styles decode.
        continue;
      }
    }
    seen.add(item.styleKey);
    downloads.push({ family, style: item.styleKey, ttfPath: ttfDst });
  }
  if (downloads.length === 0) {
    createWriteStream(missMarker).end();
    return [];
  }
  // Pin the meta so future runs don't re-query.
  writeMeta(meta, downloads);
  return downloads;
}

/**
 * Decompress a WOFF2 file to SFNT/TTF. Returns true on success.
 *
 * Strategy: shell out to `woff2_decompress` from the `woff2` package
 * (`brew install woff2` on macOS; available on most Linux distros).
 * No suitable pure-JS WOFF2 decoder is small + fast enough to ship
 * here; we accept the host dependency. When the binary is absent we
 * return false and the caller leaves the .woff2 in place so a later
 * run with the binary installed completes the cache.
 */
function decompressWoff2(woff2Path: string, ttfPath: string): boolean {
  if (!hasWoff2Decompress()) return false;
  const res = spawnSync("woff2_decompress", [woff2Path], {
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (res.status !== 0) return false;
  // woff2_decompress writes `<name>.ttf` next to the input. Rename
  // when our target path differs (it does for our subdir convention).
  const expected = woff2Path.replace(/\.woff2$/, ".ttf");
  if (expected !== ttfPath && existsSync(expected)) {
    try {
      execFileSync("mv", [expected, ttfPath]);
    } catch {
      return false;
    }
  }
  return existsSync(ttfPath) && statSync(ttfPath).size > 0;
}

let woff2DecompressProbed: boolean | null = null;
function hasWoff2Decompress(): boolean {
  if (woff2DecompressProbed !== null) return woff2DecompressProbed;
  try {
    const r = spawnSync("woff2_decompress", ["--version"], { stdio: "ignore" });
    woff2DecompressProbed = r.error == null;
  } catch {
    woff2DecompressProbed = false;
  }
  return woff2DecompressProbed!;
}

interface ParsedSrc {
  /** `400`, `700italic`, etc. — keys the on-disk filename + meta entries. */
  styleKey: string;
  /** Direct URL to the TTF or WOFF2 returned by the CSS API. */
  url: string;
}

/**
 * Parse a Google Fonts CSS2 response. Each `@font-face` block carries
 * `font-style: italic|normal`, `font-weight: <wght>`, and a `src:
 * url(...) format("ttf"|"woff2")`. Pull the URL and synthesise a
 * styleKey for the cache filename.
 */
export function parseGoogleFontsCss(css: string): ParsedSrc[] {
  const out: ParsedSrc[] = [];
  const faceRe = /@font-face\s*{([^}]+)}/g;
  for (const faceMatch of css.matchAll(faceRe)) {
    const body = faceMatch[1];
    const weight = /font-weight:\s*([0-9]+)/.exec(body)?.[1] ?? "400";
    const style = /font-style:\s*(\w+)/.exec(body)?.[1] ?? "normal";
    const url = /src:\s*url\(([^)]+)\)/.exec(body)?.[1]?.replace(/^['"]|['"]$/g, "");
    if (!url) continue;
    // Skip non-TTF/non-WOFF2 (e.g. local() fallbacks).
    if (!/\.(ttf|woff2)(\?|$)/i.test(url)) continue;
    const italic = style === "italic" ? "italic" : "";
    out.push({ styleKey: `${weight}${italic}`, url });
  }
  return out;
}

interface CacheMeta {
  family: string;
  styles: { styleKey: string; ttfPath: string }[];
}

function writeMeta(path: string, downloads: ResolvedFontDownload[]): void {
  const meta: CacheMeta = {
    family: downloads[0]?.family ?? "?",
    styles: downloads.map((d) => ({ styleKey: d.style, ttfPath: d.ttfPath })),
  };
  writeFileSync(path, JSON.stringify(meta, null, 2));
}

function readCachedMeta(path: string): ResolvedFontDownload[] {
  const meta = JSON.parse(readFileSync(path, "utf8")) as CacheMeta;
  return meta.styles.map((s) => ({
    family: meta.family,
    style: s.styleKey,
    ttfPath: s.ttfPath,
  }));
}

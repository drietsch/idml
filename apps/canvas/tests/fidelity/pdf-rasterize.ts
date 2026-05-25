// Rasterise a reference PDF to one PNG per page via `pdftoppm`.
// Mirrors the invocation in corpus/envato/test.sh — same DPI, same
// optional CMYK ICC profile — so the resulting reference PNGs are
// bit-identical to the existing native harness.
//
// Output cache: per-pack output directory keyed by (pdf mtime, DPI).
// A `.cache-key` file in the pack's output dir records the last
// rasterisation's key; if it matches we skip pdftoppm entirely.

import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { resolve } from "node:path";

import {
  FIDELITY_DPI,
  PackFixture,
  packOutDir,
  pdfRasterizeCacheKey,
} from "./fixtures";

const FOGRA39 =
  "/Library/Application Support/Adobe/Color/Profiles/Recommended/CoatedFOGRA39.icc";

export interface RasterizedReference {
  pageCount: number;
  pages: string[];
}

/**
 * Returns the absolute paths of `ref-NNN.png` files in page order.
 * Re-runs pdftoppm unless the cached pages are still fresh.
 */
export function rasterizeReferencePdf(
  pack: PackFixture,
): RasterizedReference {
  if (!pack.hasReferencePdf) {
    return { pageCount: 0, pages: [] };
  }
  const outDir = packOutDir(pack.name);
  mkdirSync(outDir, { recursive: true });
  const cacheKeyPath = resolve(outDir, ".ref-cache-key");
  const wantKey = pdfRasterizeCacheKey(pack.name);
  let cacheHit = false;
  if (existsSync(cacheKeyPath)) {
    try {
      const cur = readFileSync(cacheKeyPath, "utf8").trim();
      cacheHit = cur === wantKey;
    } catch {
      cacheHit = false;
    }
  }
  if (!cacheHit) {
    // Wipe stale ref-*.png so leftover pages from a higher-page-count
    // run don't poison this one.
    for (const f of readdirSync(outDir)) {
      if (/^ref-\d+\.png$/.test(f)) {
        try {
          execFileSync("rm", ["-f", resolve(outDir, f)]);
        } catch {
          // ignore
        }
      }
    }
    const args: string[] = [];
    if (existsSync(FOGRA39)) {
      args.push("-defaultcmykprofile", FOGRA39);
    }
    args.push("-r", String(FIDELITY_DPI), "-png", pack.referencePdfPath, resolve(outDir, "ref"));
    execFileSync("pdftoppm", args, { stdio: "pipe" });
    // `pdftoppm` writes ref-1.png … ref-12.png with no zero-padding
    // for small page counts; normalise to ref-001.png so the per-page
    // diff loop can name them deterministically.
    for (const f of readdirSync(outDir)) {
      const m = /^ref-(\d+)\.png$/.exec(f);
      if (!m) continue;
      const n = Number(m[1]);
      const padded = `ref-${String(n).padStart(3, "0")}.png`;
      if (padded === f) continue;
      renameSync(resolve(outDir, f), resolve(outDir, padded));
    }
    writeFileSync(cacheKeyPath, wantKey);
  }
  const pages = readdirSync(outDir)
    .filter((n) => /^ref-\d{3}\.png$/.test(n))
    .sort()
    .map((n) => resolve(outDir, n));
  return { pageCount: pages.length, pages };
}

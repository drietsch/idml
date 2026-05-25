// Per-pack ΔE/SSIM thresholds for the canvas fidelity gate.
//
// Schema mirrors `corpus/generated/fidelity-thresholds.json` so the
// existing tooling (and human understanding) carries over directly.
// We store these alongside the manifest in `corpus/envato/`.
//
// `FIDELITY_MODE=capture` writes a fresh thresholds JSON from the
// most-recent run's worst-page metric per pack, rounded up to give
// some headroom (~25 %). Default (`gate`) mode reads the JSON and
// fails any `stage: gated` pack whose metrics exceed it.

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { ENVATO_DIR } from "./fixtures";

export const THRESHOLDS_PATH = resolve(
  ENVATO_DIR,
  "canvas-fidelity-thresholds.json",
);

export interface PackThreshold {
  name: string;
  /** Cap the pages we gate against — packs with > N pages clip here. */
  max_pages_with_pdf?: number;
  max_mean_de: number;
  max_p99_de: number;
  min_ssim: number;
  rationale?: string;
}

export interface ThresholdsFile {
  fixtures: PackThreshold[];
}

export function loadThresholds(): ThresholdsFile {
  if (!existsSync(THRESHOLDS_PATH)) return { fixtures: [] };
  try {
    return JSON.parse(readFileSync(THRESHOLDS_PATH, "utf8")) as ThresholdsFile;
  } catch (err) {
    process.stderr.write(
      `[thresholds] failed to parse ${THRESHOLDS_PATH}: ${String(err)}\n`,
    );
    return { fixtures: [] };
  }
}

/**
 * Per-pack baseline collected by a `FIDELITY_MODE=capture` run. The
 * caller passes the worst-page metric across the pack; we apply a
 * 25 % headroom on the ΔE values and round SSIM down to two decimal
 * places (matches the `corpus/generated/fidelity-thresholds.json`
 * convention).
 */
export interface CapturedBaseline {
  name: string;
  pagesWithPdf: number;
  worstMeanDe: number;
  worstP99De: number;
  worstSsim: number;
}

/**
 * Merge `baselines` into the existing thresholds file, then write
 * the file back. Existing entries with a manually-set rationale are
 * preserved unless `overwrite` is true. Returns the count of entries
 * (re)written.
 */
export function writeThresholds(
  baselines: CapturedBaseline[],
  opts: { overwrite?: boolean } = {},
): number {
  const overwrite = opts.overwrite ?? false;
  const cur = loadThresholds();
  const byName = new Map(cur.fixtures.map((f) => [f.name, f]));
  let written = 0;
  for (const b of baselines) {
    const existing = byName.get(b.name);
    if (existing && existing.rationale && !overwrite) continue;
    const thr: PackThreshold = {
      name: b.name,
      max_pages_with_pdf: b.pagesWithPdf,
      max_mean_de: roundUp2(b.worstMeanDe * 1.25),
      max_p99_de: roundUp2(b.worstP99De * 1.25),
      min_ssim: floorDown2(b.worstSsim * 0.98),
      rationale:
        `auto-captured by FIDELITY_MODE=capture; baseline worst page ` +
        `meanΔE=${b.worstMeanDe.toFixed(3)} p99ΔE=${b.worstP99De.toFixed(3)} ` +
        `ssim=${b.worstSsim.toFixed(4)}, +25% headroom`,
    };
    byName.set(b.name, thr);
    written += 1;
  }
  const next: ThresholdsFile = {
    fixtures: [...byName.values()].sort((a, b) => a.name.localeCompare(b.name)),
  };
  writeFileSync(THRESHOLDS_PATH, JSON.stringify(next, null, 2) + "\n");
  return written;
}

function roundUp2(n: number): number {
  return Math.ceil(n * 100) / 100;
}

function floorDown2(n: number): number {
  return Math.max(0, Math.floor(n * 100) / 100);
}

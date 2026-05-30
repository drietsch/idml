// Shell-out wrapper around `paged-diff` (crates/paged-fidelity).
//
// We re-use the existing Rust diff implementation rather than
// porting ΔE2000 + SSIM to TypeScript: one diff engine across both
// the native gate (corpus/envato/test.sh) and the new canvas gate
// keeps results comparable.
//
// The binary is built once via `cargo build --release --bin
// paged-diff` and then re-used per call.

import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

import { REPO_ROOT } from "./fixtures";
import { alignPngPair } from "./png-align";

export interface DiffMetrics {
  meanDe: number;
  p99De: number;
  maxDe: number;
  ssim: number;
  passes: boolean;
}

const DIFF_BIN = resolve(REPO_ROOT, "target", "release", "paged-diff");

let built = false;
function ensureBuilt(): void {
  if (built && existsSync(DIFF_BIN)) return;
  if (existsSync(DIFF_BIN)) {
    built = true;
    return;
  }
  execFileSync(
    "cargo",
    ["build", "--release", "-p", "paged-fidelity", "--bin", "paged-diff"],
    { cwd: REPO_ROOT, stdio: "inherit" },
  );
  built = true;
}

/**
 * Compare candidate against reference. Returns null if either file
 * is missing (e.g. the candidate's page count differs from the
 * PDF's). Includes the heatmap PNG path when written.
 */
export function diffPng(
  referencePng: string,
  candidatePng: string,
  heatmapPng?: string,
): DiffMetrics | null {
  if (!existsSync(referencePng) || !existsSync(candidatePng)) {
    return null;
  }
  ensureBuilt();
  // pdftoppm vs canvas snapshot can disagree by ≤1 px in either
  // dimension when the PDF MediaBox is rounded to whole points.
  // Pad with white before diffing so paged-diff's strict equal-size
  // check is satisfied.
  const aligned = alignPngPair(referencePng, candidatePng);
  const args: string[] = ["--json", aligned.refPath, aligned.candPath];
  if (heatmapPng) {
    mkdirSync(resolve(heatmapPng, ".."), { recursive: true });
    args.push("--heatmap", heatmapPng);
  }
  const res = spawnSync(DIFF_BIN, args, { encoding: "utf8" });
  // Exit code 0 = pass, 1 = fail per CLI contract. Either way JSON
  // lands on stdout when --json is set.
  if (res.status === null) {
    throw new Error(`paged-diff did not exit cleanly: ${res.error ?? "?"}`);
  }
  if (res.status !== 0 && res.status !== 1) {
    throw new Error(
      `paged-diff exit ${res.status}: stderr=${res.stderr ?? ""}`,
    );
  }
  const line = res.stdout.trim();
  if (!line) {
    throw new Error(`paged-diff produced no stdout (stderr=${res.stderr ?? ""})`);
  }
  const parsed = JSON.parse(line) as {
    mean_de: number;
    p99_de: number;
    max_de: number;
    ssim: number;
    passes: boolean;
  };
  return {
    meanDe: parsed.mean_de,
    p99De: parsed.p99_de,
    maxDe: parsed.max_de,
    ssim: parsed.ssim,
    passes: parsed.passes,
  };
}

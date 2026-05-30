// Canvas fidelity suite.
//
// Per envato pack:
//   1. Open the canvas app, drop the pack's template.idml.
//   2. Snapshot every page at PDF-matching width.
//   3. pdftoppm-rasterise the pack's reference.pdf at the same DPI.
//   4. paged-diff each (cand, ref) pair → mean ΔE / p99 ΔE / SSIM.
//   5. Compare against per-pack thresholds (gated) or just log
//      (smoke / capture mode).
//
// Output lives under FIDELITY_OUT (default /tmp/paged-canvas-fidelity).

import { test, expect } from "@playwright/test";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

import {
  FIDELITY_DPI,
  FIDELITY_OUT_ROOT,
  PackFixture,
  packOutDir,
  packPagePath,
  selectPacks,
} from "./fidelity/fixtures";
import {
  loadIdml,
  openCanvas,
  snapshotPagePng,
  snapshotWidthPx,
} from "./fidelity/canvas-driver";
import { rasterizeReferencePdf } from "./fidelity/pdf-rasterize";
import { diffPng, DiffMetrics } from "./fidelity/diff";
import {
  CapturedBaseline,
  loadThresholds,
  PackThreshold,
  THRESHOLDS_PATH,
  writeThresholds,
} from "./fidelity/thresholds";
import {
  DashboardPack,
  DashboardState,
  dashboardPath,
  writeDashboard,
} from "./fidelity/dashboard";

const FIDELITY_MODE = (process.env.FIDELITY_MODE ?? "gate") as
  | "gate"
  | "capture"
  | "advisory";

function thresholdFor(name: string): PackThreshold | null {
  return loadThresholds().fixtures.find((f) => f.name === name) ?? null;
}

interface PageRecord {
  page: number;
  diff: DiffMetrics | null;
  candPath: string;
  refPath: string | null;
  reason?: string;
}

interface PackRecord {
  name: string;
  stage: PackFixture["stage"];
  pagesRendered: number;
  pagesDiffed: number;
  pages: PageRecord[];
  worstMeanDe: number | null;
  worstP99De: number | null;
  worstSsim: number | null;
  dpi: number;
  mode: typeof FIDELITY_MODE;
}

const aggregate: PackRecord[] = [];
const dashboardPacks: DashboardPack[] = [];
const dashboardStartedAt = new Date().toISOString();

mkdirSync(FIDELITY_OUT_ROOT, { recursive: true });

const packs = selectPacks();

function refreshDashboard(): void {
  const state: DashboardState = {
    mode: FIDELITY_MODE,
    backend: (process.env.BACKEND ?? "cpu").toLowerCase(),
    dpi: FIDELITY_DPI,
    startedAt: dashboardStartedAt,
    updatedAt: new Date().toISOString(),
    packs: dashboardPacks,
    totalExpected: packs.length,
  };
  writeDashboard(state);
}

// Seed an empty dashboard before any pack runs so the file exists
// and is openable from the moment the suite starts.
refreshDashboard();

for (const pack of packs) {
  test.describe(pack.name, () => {
    test(`render + diff ${pack.name}`, async ({ page }, testInfo) => {
      testInfo.setTimeout(5 * 60_000);
      const outDir = packOutDir(pack.name);
      mkdirSync(outDir, { recursive: true });

      await openCanvas(page);
      const doc = await loadIdml(page, pack.idmlPath, pack.name);
      testInfo.annotations.push({
        type: "pack",
        description: `${pack.name} • stage=${pack.stage} • ${doc.pageCount} pages`,
      });

      const candPaths: string[] = [];
      for (let i = 0; i < doc.pages.length; i++) {
        const p = doc.pages[i];
        const widthPx = snapshotWidthPx(p.widthPt);
        const pngBytes = await snapshotPagePng(page, p.pageId, widthPx);
        const dst = packPagePath(pack.name, "cand", i + 1);
        writeFileSync(dst, Buffer.from(pngBytes));
        candPaths.push(dst);
      }

      const refRaster = pack.hasReferencePdf ? rasterizeReferencePdf(pack) : null;

      const pageRecords: PageRecord[] = [];
      let worstMean: number | null = null;
      let worstP99: number | null = null;
      let worstSsim: number | null = null;
      let pagesDiffed = 0;

      for (let i = 0; i < candPaths.length; i++) {
        const pageNum = i + 1;
        const cand = candPaths[i];
        const ref = refRaster && refRaster.pages[i] ? refRaster.pages[i] : null;
        if (!ref) {
          pageRecords.push({
            page: pageNum,
            diff: null,
            candPath: cand,
            refPath: null,
            reason: "no matching reference page",
          });
          continue;
        }
        const heat = packPagePath(pack.name, "heat", pageNum);
        const metrics = diffPng(ref, cand, heat);
        if (!metrics) {
          pageRecords.push({
            page: pageNum,
            diff: null,
            candPath: cand,
            refPath: ref,
            reason: "diff returned null",
          });
          continue;
        }
        pagesDiffed += 1;
        worstMean = worstMean === null ? metrics.meanDe : Math.max(worstMean, metrics.meanDe);
        worstP99 = worstP99 === null ? metrics.p99De : Math.max(worstP99, metrics.p99De);
        worstSsim = worstSsim === null ? metrics.ssim : Math.min(worstSsim, metrics.ssim);
        pageRecords.push({
          page: pageNum,
          diff: metrics,
          candPath: cand,
          refPath: ref,
        });
      }

      const record: PackRecord = {
        name: pack.name,
        stage: pack.stage,
        pagesRendered: candPaths.length,
        pagesDiffed,
        pages: pageRecords,
        worstMeanDe: worstMean,
        worstP99De: worstP99,
        worstSsim: worstSsim,
        dpi: FIDELITY_DPI,
        mode: FIDELITY_MODE,
      };
      aggregate.push(record);
      writeFileSync(
        resolve(outDir, "pack.json"),
        JSON.stringify(record, null, 2),
      );

      // Resolve gate violations (used by both the Playwright assertion
      // below and the dashboard's status column).
      const gateViolations: string[] = [];
      const thr = thresholdFor(pack.name);
      if (FIDELITY_MODE === "gate" && pack.stage === "gated" && thr) {
        const limit = thr.max_pages_with_pdf ?? Infinity;
        for (const r of pageRecords) {
          if (r.page > limit) break;
          if (!r.diff) continue;
          if (r.diff.meanDe > thr.max_mean_de) {
            gateViolations.push(
              `p${r.page}: meanΔE ${r.diff.meanDe.toFixed(3)} > ${thr.max_mean_de}`,
            );
          }
          if (r.diff.p99De > thr.max_p99_de) {
            gateViolations.push(
              `p${r.page}: p99ΔE ${r.diff.p99De.toFixed(3)} > ${thr.max_p99_de}`,
            );
          }
          if (r.diff.ssim < thr.min_ssim) {
            gateViolations.push(
              `p${r.page}: ssim ${r.diff.ssim.toFixed(4)} < ${thr.min_ssim}`,
            );
          }
        }
      }

      // Push a dashboard entry + refresh the HTML.
      dashboardPacks.push({
        name: pack.name,
        stage: pack.stage,
        pagesRendered: candPaths.length,
        pagesDiffed,
        worstMeanDe: worstMean,
        worstP99De: worstP99,
        worstSsim: worstSsim,
        pages: pageRecords.map((r) => ({
          page: r.page,
          meanDe: r.diff?.meanDe ?? null,
          p99De: r.diff?.p99De ?? null,
          ssim: r.diff?.ssim ?? null,
          candPath: r.candPath,
          refPath: r.refPath,
          heatPath: r.diff ? packPagePath(pack.name, "heat", r.page) : null,
          reason: r.reason,
        })),
        threshold: thr,
        gateViolations,
        finishedAt: new Date().toISOString(),
      });
      refreshDashboard();

      // Attach the worst page's reference / candidate / heatmap to
      // the Playwright report so `npx playwright show-report` opens
      // straight onto the regression. Picks the page with the
      // highest meanΔE.
      const worstPage = pageRecords
        .filter((p) => p.diff != null)
        .sort((a, b) => (b.diff!.meanDe ?? 0) - (a.diff!.meanDe ?? 0))[0];
      if (worstPage) {
        try {
          if (worstPage.refPath && existsSync(worstPage.refPath)) {
            await testInfo.attach(`ref-p${worstPage.page}`, {
              path: worstPage.refPath,
              contentType: "image/png",
            });
          }
          if (existsSync(worstPage.candPath)) {
            await testInfo.attach(`cand-p${worstPage.page}`, {
              path: worstPage.candPath,
              contentType: "image/png",
            });
          }
          const heat = packPagePath(pack.name, "heat", worstPage.page);
          if (existsSync(heat)) {
            await testInfo.attach(`heat-p${worstPage.page}`, {
              path: heat,
              contentType: "image/png",
            });
          }
        } catch {
          // Attachment is best-effort; surface nothing if the
          // reporter trips over a non-existent file.
        }
      }

      // Gate assertion: capture / advisory log only; gate mode fails
      // when a `stage: gated` pack carries violations (computed above).
      if (FIDELITY_MODE === "gate" && pack.stage === "gated") {
        if (!thr) {
          testInfo.annotations.push({
            type: "missing-threshold",
            description: `pack ${pack.name} stage=gated but no entry in ${THRESHOLDS_PATH}`,
          });
        } else {
          expect(gateViolations, gateViolations.join("; ")).toEqual([]);
        }
      }
    });
  });
}

test.afterAll(async () => {
  const path = resolve(FIDELITY_OUT_ROOT, "results.json");
  writeFileSync(
    path,
    JSON.stringify({ runs: aggregate, dpi: FIDELITY_DPI, mode: FIDELITY_MODE }, null, 2),
  );
  refreshDashboard();
  process.stdout.write(
    `\n[fidelity] dashboard: file://${dashboardPath()}\n`,
  );
  if (FIDELITY_MODE === "capture") {
    const baselines: CapturedBaseline[] = [];
    for (const r of aggregate) {
      if (r.pagesDiffed === 0) continue;
      if (r.worstMeanDe == null || r.worstP99De == null || r.worstSsim == null) continue;
      baselines.push({
        name: r.name,
        pagesWithPdf: r.pagesDiffed,
        worstMeanDe: r.worstMeanDe,
        worstP99De: r.worstP99De,
        worstSsim: r.worstSsim,
      });
    }
    if (baselines.length > 0) {
      const n = writeThresholds(baselines, { overwrite: true });
      process.stdout.write(
        `\n[fidelity] capture mode: wrote ${n} pack thresholds to ${THRESHOLDS_PATH}\n`,
      );
    }
  }
});

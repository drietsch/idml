// Live dashboard for the fidelity suite.
//
// Generated after each pack completes so the file is fresh while the
// run is in flight. Pointed at file:// works (the embedded `<meta
// http-equiv="refresh">` reloads the page every few seconds). Per-
// pack thumbnails are loaded via relative paths from
// `/tmp/paged-canvas-fidelity/<pack>/`.

import { writeFileSync, existsSync } from "node:fs";
import { resolve, relative, basename } from "node:path";

import { FIDELITY_OUT_ROOT, FIDELITY_DPI } from "./fixtures";
import type { PackThreshold } from "./thresholds";

export interface DashboardPage {
  page: number;
  meanDe: number | null;
  p99De: number | null;
  ssim: number | null;
  candPath: string;
  refPath: string | null;
  heatPath: string | null;
  reason?: string;
}

export interface DashboardPack {
  name: string;
  stage: "smoke" | "gated" | "skip";
  pagesRendered: number;
  pagesDiffed: number;
  worstMeanDe: number | null;
  worstP99De: number | null;
  worstSsim: number | null;
  pages: DashboardPage[];
  threshold?: PackThreshold | null;
  gateViolations?: string[];
  /** ISO timestamp when this pack finished. */
  finishedAt: string;
}

export interface DashboardState {
  mode: string;
  backend: string;
  dpi: number;
  startedAt: string;
  updatedAt: string;
  packs: DashboardPack[];
  /** Total packs expected (for the progress bar). */
  totalExpected: number;
}

const DASHBOARD_PATH = resolve(FIDELITY_OUT_ROOT, "dashboard.html");

export function writeDashboard(state: DashboardState): void {
  writeFileSync(DASHBOARD_PATH, renderHtml(state));
}

export function dashboardPath(): string {
  return DASHBOARD_PATH;
}

function renderHtml(state: DashboardState): string {
  const done = state.packs.length;
  const total = state.totalExpected;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  const summary = computeSummary(state.packs);

  const rows = state.packs
    .slice()
    .sort((a, b) => (b.worstMeanDe ?? -1) - (a.worstMeanDe ?? -1))
    .map(packRow)
    .join("\n");

  // Auto-refresh meta tag is omitted on a finalised run (`done ===
  // total`) so the report doesn't keep pulling assets after every
  // test has reported.
  const refresh = done < total
    ? `<meta http-equiv="refresh" content="3">`
    : "";

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
${refresh}
<title>Canvas fidelity — ${escapeHtml(state.mode)} · ${escapeHtml(state.backend)}</title>
<style>
  :root { color-scheme: light dark; }
  body { font: 13px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
         margin: 0; padding: 0; background: #f8fafc; color: #0f172a; }
  @media (prefers-color-scheme: dark) {
    body { background: #0f172a; color: #e2e8f0; }
    .card { background: #1e293b !important; border-color: #334155 !important; }
    .meta { color: #94a3b8 !important; }
    th, td { border-color: #334155 !important; }
    tr:hover td { background: #1e293b !important; }
    pre { background: #0b1220 !important; }
  }
  header { position: sticky; top: 0; background: linear-gradient(#fafbfc, #f1f5f9);
           border-bottom: 1px solid #e2e8f0; padding: 16px 24px; z-index: 10; }
  h1 { margin: 0; font-size: 18px; font-weight: 600; }
  .meta { font-size: 12px; color: #64748b; margin-top: 4px; }
  .progress { position: relative; height: 6px; background: #e2e8f0; border-radius: 3px;
              margin-top: 10px; overflow: hidden; }
  .progress-fill { position: absolute; left: 0; top: 0; bottom: 0; background: #2563eb;
                   transition: width 0.4s; }
  .summary { display: flex; gap: 24px; margin-top: 8px; flex-wrap: wrap; }
  .summary div { min-width: 80px; }
  .summary .label { font-size: 11px; color: #64748b; text-transform: uppercase;
                    letter-spacing: 0.05em; }
  .summary .value { font-size: 18px; font-weight: 600; }
  main { padding: 16px 24px 64px; max-width: 1600px; margin: 0 auto; }
  table { width: 100%; border-collapse: collapse; background: white;
          border: 1px solid #e2e8f0; border-radius: 6px; overflow: hidden; }
  th { text-align: left; font-weight: 600; font-size: 11px;
       color: #64748b; text-transform: uppercase; letter-spacing: 0.05em;
       padding: 10px 12px; border-bottom: 1px solid #e2e8f0; }
  td { padding: 8px 12px; border-bottom: 1px solid #f1f5f9;
       vertical-align: top; font-variant-numeric: tabular-nums; }
  tr:last-child td { border-bottom: none; }
  tr:hover td { background: #f8fafc; }
  .pack-name { font-weight: 500; }
  .pack-name a { color: inherit; text-decoration: none; }
  .stage { display: inline-block; padding: 1px 8px; font-size: 11px;
           border-radius: 10px; }
  .stage-smoke { background: #fef3c7; color: #92400e; }
  .stage-gated { background: #dbeafe; color: #1e3a8a; }
  .status { font-weight: 600; font-size: 11px; }
  .status-pass { color: #16a34a; }
  .status-fail { color: #dc2626; }
  .status-skip { color: #64748b; }
  .status-pending { color: #ca8a04; }
  details { margin: 8px 0 0; padding: 0; }
  details > summary { cursor: pointer; color: #2563eb; font-size: 11px;
                       list-style: none; padding: 0; }
  details > summary::-webkit-details-marker { display: none; }
  .pages-grid { display: grid; gap: 16px;
                grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
                margin-top: 12px; }
  .page-tile { background: white; border: 1px solid #e2e8f0; border-radius: 6px;
               padding: 10px; }
  .page-tile h4 { margin: 0 0 6px; font-size: 12px; font-weight: 600; }
  .page-tile-metrics { font-size: 11px; color: #64748b;
                        font-variant-numeric: tabular-nums; margin-bottom: 8px; }
  .triplet { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 4px; }
  .triplet figure { margin: 0; }
  .triplet figcaption { font-size: 9px; text-transform: uppercase;
                        color: #64748b; letter-spacing: 0.05em; text-align: center; }
  .triplet img { display: block; width: 100%; height: auto;
                  background: #f8fafc; border: 1px solid #e2e8f0;
                  border-radius: 2px; }
  .violations { background: #fef2f2; color: #991b1b; padding: 8px 10px;
                border-radius: 4px; font-size: 12px; margin-top: 6px; }
  pre { background: #f1f5f9; padding: 8px; border-radius: 4px; overflow: auto;
        font-size: 11px; line-height: 1.4; }
  .card { background: white; border: 1px solid #e2e8f0; border-radius: 6px;
          padding: 14px; margin-bottom: 14px; }
</style>
</head>
<body>
<header>
  <h1>Canvas fidelity dashboard</h1>
  <div class="meta">
    mode <strong>${escapeHtml(state.mode)}</strong>
    · backend <strong>${escapeHtml(state.backend)}</strong>
    · DPI <strong>${state.dpi}</strong>
    · started <strong>${state.startedAt}</strong>
    · updated <strong>${state.updatedAt}</strong>
    ${refresh ? "· <em>auto-refreshing every 3s</em>" : ""}
  </div>
  <div class="progress" title="${done} / ${total}">
    <div class="progress-fill" style="width: ${pct}%"></div>
  </div>
  <div class="summary">
    <div><div class="label">Done</div><div class="value">${done}/${total}</div></div>
    <div><div class="label">Pass</div><div class="value status-pass">${summary.pass}</div></div>
    <div><div class="label">Fail</div><div class="value status-fail">${summary.fail}</div></div>
    <div><div class="label">Smoke</div><div class="value status-pending">${summary.smoke}</div></div>
    <div><div class="label">Avg meanΔE</div><div class="value">${formatNum(summary.avgMean, 2)}</div></div>
    <div><div class="label">Worst meanΔE</div><div class="value">${formatNum(summary.worstMean, 2)}</div></div>
  </div>
</header>
<main>
${state.packs.length === 0
  ? `<div class="card">Waiting for first pack to complete…</div>`
  : `<table>
  <thead>
    <tr>
      <th>Pack</th>
      <th>Stage</th>
      <th>Pages</th>
      <th>worst meanΔE</th>
      <th>worst p99ΔE</th>
      <th>worst SSIM</th>
      <th>Status</th>
    </tr>
  </thead>
  <tbody>${rows}</tbody>
</table>`}
</main>
</body>
</html>`;
}

function computeSummary(packs: DashboardPack[]): {
  pass: number;
  fail: number;
  smoke: number;
  avgMean: number | null;
  worstMean: number | null;
} {
  let pass = 0, fail = 0, smoke = 0;
  let sum = 0, count = 0, worst = -Infinity;
  for (const p of packs) {
    if (p.stage === "smoke") smoke += 1;
    else if (p.gateViolations && p.gateViolations.length > 0) fail += 1;
    else pass += 1;
    if (p.worstMeanDe != null) {
      sum += p.worstMeanDe;
      count += 1;
      worst = Math.max(worst, p.worstMeanDe);
    }
  }
  return {
    pass, fail, smoke,
    avgMean: count > 0 ? sum / count : null,
    worstMean: count > 0 ? worst : null,
  };
}

function packRow(p: DashboardPack): string {
  const status = packStatus(p);
  const stageBadge = p.stage === "skip"
    ? `<span class="stage" style="background:#f1f5f9;color:#64748b">skip</span>`
    : `<span class="stage stage-${p.stage}">${p.stage}</span>`;
  const violations = p.gateViolations && p.gateViolations.length > 0
    ? `<div class="violations">${p.gateViolations.map(escapeHtml).join("<br>")}</div>`
    : "";
  const detail = p.pages.length > 0
    ? `<details><summary>▸ ${p.pagesDiffed} pages diffed · click to inspect</summary>
        <div class="pages-grid">${p.pages.map((pg) => pageTile(p.name, pg)).join("")}</div>
       </details>`
    : "";
  return `<tr>
    <td colspan="7" style="padding: 0;">
      <table style="width: 100%; border: none;">
        <tr style="border-bottom: 1px solid #f1f5f9;">
          <td class="pack-name" style="width: 240px;">${escapeHtml(p.name)}</td>
          <td style="width: 70px;">${stageBadge}</td>
          <td style="width: 80px;">${p.pagesDiffed}/${p.pagesRendered}</td>
          <td style="width: 110px;">${formatNum(p.worstMeanDe, 3)}</td>
          <td style="width: 110px;">${formatNum(p.worstP99De, 3)}</td>
          <td style="width: 90px;">${formatNum(p.worstSsim, 4)}</td>
          <td><span class="status status-${status.cls}">${status.text}</span></td>
        </tr>
        ${violations || detail ? `<tr><td colspan="7" style="padding: 0 12px 10px;">${violations}${detail}</td></tr>` : ""}
      </table>
    </td>
  </tr>`;
}

function pageTile(packName: string, pg: DashboardPage): string {
  const dir = relative(FIDELITY_OUT_ROOT, resolve(FIDELITY_OUT_ROOT, packName));
  const refRel = pg.refPath ? `${dir}/${basename(pg.refPath)}` : null;
  const candRel = `${dir}/${basename(pg.candPath)}`;
  const heatRel = pg.heatPath && existsSync(pg.heatPath)
    ? `${dir}/${basename(pg.heatPath)}`
    : null;
  return `<div class="page-tile">
    <h4>page ${pg.page}</h4>
    <div class="page-tile-metrics">
      meanΔE ${formatNum(pg.meanDe, 3)}
      · p99ΔE ${formatNum(pg.p99De, 3)}
      · ssim ${formatNum(pg.ssim, 4)}
    </div>
    <div class="triplet">
      ${refRel ? `<figure><img loading="lazy" src="${escapeHtml(refRel)}"><figcaption>reference</figcaption></figure>` : `<figure><figcaption>no ref</figcaption></figure>`}
      <figure><img loading="lazy" src="${escapeHtml(candRel)}"><figcaption>candidate</figcaption></figure>
      ${heatRel ? `<figure><img loading="lazy" src="${escapeHtml(heatRel)}"><figcaption>heatmap</figcaption></figure>` : `<figure><figcaption>no diff</figcaption></figure>`}
    </div>
    ${pg.reason ? `<div class="page-tile-metrics" style="margin-top:6px">${escapeHtml(pg.reason)}</div>` : ""}
  </div>`;
}

interface PackStatus {
  cls: "pass" | "fail" | "skip" | "pending";
  text: string;
}

function packStatus(p: DashboardPack): PackStatus {
  if (p.stage === "skip") return { cls: "skip", text: "skip" };
  if (p.pagesDiffed === 0) return { cls: "pending", text: "no PDF" };
  if (p.gateViolations && p.gateViolations.length > 0) {
    return { cls: "fail", text: `${p.gateViolations.length} fail` };
  }
  if (p.stage === "gated") return { cls: "pass", text: "pass" };
  return { cls: "pending", text: "smoke" };
}

function formatNum(n: number | null, decimals: number): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return n.toFixed(decimals);
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Helper used by the spec to construct the FIDELITY_DPI default
// without re-importing the fixtures module.
export const DEFAULT_DPI = FIDELITY_DPI;

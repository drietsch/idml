// Standalone perf probe — bypasses the 5min per-test timeout and
// measures end-to-end loadDocument + per-page snapshot timing for
// one pack with detailed phase breakdown from the wasm-side
// `[paged-canvas perf]` console messages.
//
// Usage: node perf-probe.mjs <pack-name>
//   or: PROBE_PACK=<name> node perf-probe.mjs

import { chromium } from "@playwright/test";

const PACK = process.argv[2] ?? process.env.PROBE_PACK ?? "digital-bridesmaid-planner-template";
const IDML = `/Users/drietsch/idml/corpus/envato/packs/${PACK}/template.idml`;
const FONT = "/Users/drietsch/idml/corpus/fonts/Inter.ttf";
const ICC  = "/Library/Application Support/Adobe/Color/Profiles/Recommended/CoatedFOGRA39.icc";

console.log(`\n=== perf probe: ${PACK} ===`);
const browser = await chromium.launch({
  headless: false,
  args: ["--enable-unsafe-webgpu", "--use-vulkan", "--enable-features=Vulkan"],
});
const page = await browser.newPage();
page.on("console", (m) => {
  const t = m.text();
  if (t.includes("[paged-canvas perf]") || t.includes("[err]") || m.type() === "error" || m.type() === "warning") {
    console.log(`  browser[${m.type()}]: ${t}`);
  }
});
page.on("pageerror", (e) => console.log(`  browser err: ${e.message}\n${e.stack ?? ''}`));
page.on("crash", () => console.log(`  browser CRASHED`));

await page.goto("http://127.0.0.1:5180/");
await page.waitForFunction(() => globalThis.__canvas?.client, null, { timeout: 30000 });

const result = await page.evaluate(
  async ({ idmlUrl, fontUrl, iccUrl }) => {
    const fetchBytes = async (u) => new Uint8Array(await (await fetch(u)).arrayBuffer());
    const t0 = performance.now();
    const [idml, font, icc] = await Promise.all([
      fetchBytes(idmlUrl),
      fetchBytes(fontUrl),
      fetchBytes(iccUrl).catch(() => null),
    ]);
    const tFetch = performance.now() - t0;
    const tLoad0 = performance.now();
    const handle = await globalThis.__canvas.client.loadDocument(idml, font, icc ?? undefined);
    const tLoad = performance.now() - tLoad0;

    // Snapshot each page at the same DPI the fidelity test uses.
    const perPage = [];
    for (let i = 0; i < handle.pageIds.length; i++) {
      const id = handle.pageIds[i];
      const sn0 = performance.now();
      try {
        const snap = await globalThis.__canvas.client.requestSnapshot(id, 0, 144);
        perPage.push({ idx: i + 1, ok: true, ms: Math.round(performance.now() - sn0), bytes: snap.pngBytes.length });
      } catch (e) {
        perPage.push({ idx: i + 1, ok: false, ms: Math.round(performance.now() - sn0), err: String(e) });
      }
    }

    return {
      idml_bytes: idml.length,
      font_bytes: font.length,
      icc_bytes: icc ? icc.length : null,
      fetch_ms: Math.round(tFetch),
      load_ms: Math.round(tLoad),
      pages: handle.pageCount,
      perPage,
    };
  },
  { idmlUrl: "/@fs" + IDML, fontUrl: "/@fs" + FONT, iccUrl: "/@fs" + ICC },
);

console.log("\n  totals:");
console.log(`    idml bytes:  ${result.idml_bytes.toLocaleString()}`);
console.log(`    fetch:       ${result.fetch_ms} ms`);
console.log(`    loadDocument:${result.load_ms} ms (${(result.load_ms/1000).toFixed(1)}s)`);
console.log(`    pages:       ${result.pages}`);
console.log("\n  per-page snapshot timing:");
for (const p of result.perPage) {
  if (p.ok) {
    console.log(`    p${String(p.idx).padStart(2)}  ${String(p.ms).padStart(6)} ms   ${p.bytes.toLocaleString()} bytes`);
  } else {
    console.log(`    p${String(p.idx).padStart(2)}  FAILED after ${p.ms} ms: ${p.err}`);
  }
}
const total = result.perPage.reduce((a, p) => a + p.ms, 0);
console.log(`    total:       ${total} ms (${(total/1000).toFixed(1)}s) across ${result.perPage.length} pages`);
await browser.close();

// Standalone perf probe — bypasses the 5min per-test timeout and
// just measures end-to-end loadDocument timing for one pack with
// detailed phase breakdown from the wasm-side `[idml-canvas perf]`
// console messages.
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
  if (t.includes("[idml-canvas perf]") || t.includes("[err]")) {
    console.log(`  browser: ${t}`);
  }
});
page.on("pageerror", (e) => console.log(`  browser err: ${e.message}`));

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
    return {
      idml_bytes: idml.length,
      font_bytes: font.length,
      icc_bytes: icc ? icc.length : null,
      fetch_ms: Math.round(tFetch),
      load_ms: Math.round(tLoad),
      pages: handle.pageCount,
    };
  },
  { idmlUrl: "/@fs" + IDML, fontUrl: "/@fs" + FONT, iccUrl: "/@fs" + ICC },
);

console.log("\n  totals:");
console.log(`    idml bytes:  ${result.idml_bytes.toLocaleString()}`);
console.log(`    fetch:       ${result.fetch_ms} ms`);
console.log(`    loadDocument:${result.load_ms} ms (${(result.load_ms/1000).toFixed(1)}s)`);
console.log(`    pages:       ${result.pages}`);
await browser.close();

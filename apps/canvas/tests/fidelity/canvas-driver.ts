// Playwright driver for the canvas app.
//
// Encapsulates the file-input → loadDocument → requestSnapshot dance
// so the spec file stays focused on diff orchestration.
//
// The dev-mode global `window.__canvas` (set in CanvasApp.tsx)
// exposes the live CanvasClient and DocumentHandle; the driver calls
// real client methods through `page.evaluate(...)` so we exercise
// the same code path the React UI uses.

import { existsSync, readFileSync } from "node:fs";
import { basename } from "node:path";
import type { Page } from "@playwright/test";

import { FIDELITY_DPI } from "./fixtures";
import { loadPackFonts } from "./fonts";

// FOGRA39 ICC profile — same one `corpus/envato/test.sh` hands to
// `pdftoppm -defaultcmykprofile`. Without this the canvas's naive
// CMYK→RGB conversion lands ~10 ΔE off the reference PDF on every
// page (uniform-coloured backgrounds dominate the metric).
const FOGRA39_PATH =
  "/Library/Application Support/Adobe/Color/Profiles/Recommended/CoatedFOGRA39.icc";
function fogra39Path(): string | null {
  return existsSync(FOGRA39_PATH) ? FOGRA39_PATH : null;
}

/**
 * Convert an absolute filesystem path to a `/@fs/<absolute>` URL the
 * Vite dev server can stream. Vite is configured (vite.config.ts
 * `server.fs.allow`) to expose the repo root + `/tmp` + the system
 * font profile directory, so this works for IDMLs, TTFs, and the
 * Coated FOGRA39 profile alike.
 */
function vitePathFor(absPath: string): string {
  return "/@fs" + absPath;
}

export interface CanvasPageMeta {
  pageId: string;
  widthPt: number;
  heightPt: number;
}

export interface LoadedDocument {
  pageCount: number;
  pages: CanvasPageMeta[];
}

/**
 * Compute the snapshot width in pixels that matches `pdftoppm -r DPI`
 * output: width_px = round(width_pt × DPI / 72).
 */
export function snapshotWidthPx(widthPt: number, dpi = FIDELITY_DPI): number {
  return Math.round((widthPt * dpi) / 72);
}

/**
 * Navigate the page to the canvas app root, wait until the worker is
 * up and `window.__canvas` is populated.
 */
export async function openCanvas(page: Page): Promise<void> {
  await page.goto("/");
  // Pull console output into the Playwright test log so render
  // panics surface in the test report instead of vanishing.
  page.on("console", (msg) => {
    const t = msg.type();
    if (t === "error" || t === "warning") {
      // eslint-disable-next-line no-console
      console.log(`[browser:${t}] ${msg.text()}`);
    }
  });
  page.on("pageerror", (err) => {
    // eslint-disable-next-line no-console
    console.log(`[browser:pageerror] ${err.message}`);
  });
  await page.waitForFunction(
    () => Boolean((globalThis as unknown as { __canvas?: { client: unknown } }).__canvas?.client),
    null,
    { timeout: 30_000 },
  );
  if ((process.env.BACKEND ?? "").toLowerCase() === "gpu") {
    // The Vello readback path lives on the worker's SurfacePresenter,
    // which only exists after `attachCanvas`. The fidelity driver
    // bypasses the React UI (so ViewportCanvas never mounts), so we
    // attach a synthetic 1×1 OffscreenCanvas directly. The render
    // target for the PNG readback is a separate texture; the
    // attached canvas is only needed to seed the wgpu device+queue.
    await page.evaluate(async () => {
      const c = (globalThis as unknown as {
        __canvas: {
          client: {
            attachCanvas: (
              canvas: OffscreenCanvas,
              dpr: number,
              cssW: number,
              cssH: number,
            ) => void;
          };
        };
      }).__canvas;
      const offscreen = new OffscreenCanvas(1, 1);
      c.client.attachCanvas(offscreen, 1, 1, 1);
      // Give the worker a tick to receive the transfer + run initGpu.
      await new Promise<void>((r) => setTimeout(r, 500));
    });
  }
}

/**
 * Drop an IDML file into the canvas's file input. Resolves once the
 * worker has parsed + built the document and `__canvas.handle` is
 * populated. Returns the DocumentHandle data we care about.
 *
 * Pre-populates the worker's font registry with the per-pack
 * substitution map (see `loadPackFonts`) so the renderer paints with
 * the same fonts the reference PDF was exported with — without this,
 * ΔE is dominated by font-shape drift on every pack whose declared
 * fonts aren't Inter.
 */
export async function loadIdml(
  page: Page,
  idmlPath: string,
  packName?: string,
): Promise<LoadedDocument> {
  if (packName) {
    await preloadPackFonts(page, packName);
  }
  // Fetch bytes via Vite's `/@fs/` route inside the browser context
  // instead of pushing them across the page.evaluate boundary. Some
  // envato packs reach 100–218 MB; serialising those as base64
  // strings exceeds the browser tab's RPC payload budget and the
  // context closes mid-evaluate. Direct fetch keeps the bytes
  // streaming + decoded inside the browser, never touching the
  // Playwright RPC.
  const idmlUrl = vitePathFor(idmlPath);
  const fontUrl = vitePathFor(defaultFontPathFor(packName));
  const fogra39 = fogra39Path();
  const cmykUrl = fogra39 ? vitePathFor(fogra39) : null;

  // Bypass the React `onChange` path: invoking
  // `__canvas.client.loadDocument` directly lets us hand in the CMYK
  // ICC profile (the React flow doesn't accept one). The React UI
  // won't update visually for this load — fine, the test only needs
  // snapshots. After load resolves the worker's wasm side is idle,
  // so subsequent `requestSnapshot` calls run cleanly without the
  // navigator pre-fetch loop in flight.
  const data = await page.evaluate(
    async ({ idmlUrl, fontUrl, cmykUrl }) => {
      const fetchBytes = async (url: string): Promise<Uint8Array> =>
        new Uint8Array(await (await fetch(url)).arrayBuffer());
      const c = (globalThis as unknown as {
        __canvas: {
          client: {
            loadDocument: (
              bytes: Uint8Array,
              font?: Uint8Array,
              cmykIccProfile?: Uint8Array,
            ) => Promise<{
              pageCount: number;
              pageIds: string[];
              pageSizesPt: [number, number][];
            }>;
          };
        };
      }).__canvas;
      const [idml, font, icc] = await Promise.all([
        fetchBytes(idmlUrl),
        fetchBytes(fontUrl),
        cmykUrl ? fetchBytes(cmykUrl) : Promise.resolve(undefined),
      ]);
      return await c.client.loadDocument(idml, font, icc);
    },
    { idmlUrl, fontUrl, cmykUrl },
  );
  // Tag the path used (file name) so the trace report references the
  // pack — the file input would otherwise carry this for us.
  void basename(idmlPath);
  return {
    pageCount: data.pageCount,
    pages: data.pageIds.map((id, i) => ({
      pageId: id,
      widthPt: data.pageSizesPt[i][0],
      heightPt: data.pageSizesPt[i][1],
    })),
  };
}

/**
 * Resolve the per-pack default font path. Falls back to the
 * `_default/fonts.sh` default font when the pack has no sidecar.
 */
function defaultFontPathFor(packName: string | undefined): string {
  if (!packName) return loadPackFonts("_default").defaultFontPath;
  return loadPackFonts(packName).defaultFontPath;
}

/**
 * Read the pack's fonts.sh sidecar, fetch each declared font, and
 * register it with the worker. Also seeds Inter.ttf as the worker's
 * default font (mirroring the dev-shell behaviour). Idempotent across
 * packs because we `clearFontRegistry` first.
 */
async function preloadPackFonts(page: Page, packName: string): Promise<void> {
  const pack = loadPackFonts(packName);
  // Fetch each TTF via /@fs/ — same rationale as loadIdml above.
  const entries = pack.mappings.map((m) => ({
    family: m.family,
    style: m.style,
    url: vitePathFor(m.ttfPath),
  }));
  await page.evaluate(async ({ entries }) => {
    const fetchBytes = async (url: string): Promise<Uint8Array> =>
      new Uint8Array(await (await fetch(url)).arrayBuffer());
    const c = (globalThis as unknown as {
      __canvas: {
        client: {
          clearFontRegistry: () => Promise<void>;
          registerFont: (
            family: string,
            bytes: Uint8Array,
            style?: string | null,
          ) => Promise<void>;
        };
      };
    }).__canvas;
    await c.client.clearFontRegistry();
    for (const e of entries) {
      const bytes = await fetchBytes(e.url);
      await c.client.registerFont(e.family, bytes, e.style);
    }
  }, { entries });
}

/**
 * Request a CPU-snapshot PNG of a single page. `dpi` is passed
 * directly to the worker (winning over `target_width_px`) so the
 * resulting PNG matches `pdftoppm -r <dpi>` output dimension-for-
 * dimension — sub-pixel drift in the back-computed DPI was otherwise
 * shifting every glyph one pixel and dominating ΔE.
 *
 * When `BACKEND=gpu` is set in the env, routes through the Vello GPU
 * readback path (sub-phase D) instead. Requires a headed Chromium
 * with `--enable-unsafe-webgpu` — the GPU init returns null in
 * headless mode and we fall back to the snapshot tier.
 */
export async function snapshotPagePng(
  page: Page,
  pageId: string,
  targetWidthPx: number,
  dpi: number = FIDELITY_DPI,
): Promise<Uint8Array> {
  // PNGs come back as base64 strings, not `number[]`. A 200 KB PNG
  // as a JS number array is ~200K boxed Number objects (~6–8 MB
  // heap) and the page.evaluate serialisation cost scales with that.
  // Base64 keeps the encoded size at ~1.33× the binary — small
  // enough that 61 packs × 10–15 pages no longer saturate the
  // worker's default Node heap.
  const backend = (process.env.BACKEND ?? "cpu").toLowerCase();
  if (backend === "gpu") {
    const b64 = await page.evaluate(
      async ({ pageId, dpi }) => {
        const c = (globalThis as unknown as {
          __canvas: {
            client: {
              requestVelloPng: (
                pageId: string,
                dpi: number,
              ) => Promise<Uint8Array | null>;
            };
          };
        }).__canvas;
        const bytes = await c.client.requestVelloPng(pageId, dpi);
        if (!bytes) return null;
        // btoa needs a binary string; do it in 32 KB chunks so the
        // String.fromCharCode call stays under the argument-count cap.
        let bin = "";
        const CHUNK = 0x8000;
        for (let i = 0; i < bytes.length; i += CHUNK) {
          bin += String.fromCharCode.apply(
            null,
            bytes.subarray(i, i + CHUNK) as unknown as number[],
          );
        }
        return btoa(bin);
      },
      { pageId, dpi },
    );
    if (b64) return Buffer.from(b64, "base64");
    // Fall through to CPU path when GPU returns null (e.g. headless).
  }
  const b64 = await page.evaluate(
    async ({ pageId, targetWidthPx, dpi }) => {
      const c = (globalThis as unknown as {
        __canvas: {
          client: {
            requestSnapshot: (
              pageId: string,
              targetWidthPx: number,
              dpi?: number,
            ) => Promise<{ pngBytes: number[] }>;
          };
        };
      }).__canvas;
      const snap = await c.client.requestSnapshot(pageId, targetWidthPx, dpi);
      // `pngBytes` is still a `number[]` on the wire (the wasm/JSON
      // channel hasn't been changed); convert to base64 in the
      // browser context before crossing the page.evaluate boundary.
      const arr = snap.pngBytes;
      let bin = "";
      const CHUNK = 0x8000;
      for (let i = 0; i < arr.length; i += CHUNK) {
        bin += String.fromCharCode.apply(null, arr.slice(i, i + CHUNK));
      }
      return btoa(bin);
    },
    { pageId, targetWidthPx, dpi },
  );
  return Buffer.from(b64, "base64");
}

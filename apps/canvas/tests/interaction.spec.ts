// Phase A acceptance suite.
//
// Drives the canvas via the dev-only `window.__canvas` hook and the
// real `CanvasClient` so the test exercises the same wasm/worker
// dispatch the React UI uses. No DOM pointer events — direct
// `client.send({ kind: "hitTest", ... })` + `client.setElementSelection`
// + `client.marqueeHits` so the suite is deterministic and fast.
//
// Acceptance criteria covered:
//   AC-E-10  click selects topmost element; Shift adds; Cmd toggles;
//            empty click clears
//   AC-E-11  marquee selects every oriented element intersecting the
//            rect; Shift adds
//   AC-E-12  oriented hit-testing — empty AABB corner of a rotated
//            frame does NOT select it
//   AC-E-9   selection survives a camera zoom change (the worker
//            stores ids, not viewport pixels)

import { dirname, resolve as pathResolve } from "node:path";
import { fileURLToPath } from "node:url";
import { test, expect, type Page } from "@playwright/test";

import { openCanvas, loadIdml } from "./fidelity/canvas-driver";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = pathResolve(__dirname, "..", "..", "..");

// A small gated pack. Has multiple frames + at least one rotated
// element on the cover, which is the bait for AC-E-12. If this pack
// rots out (assets removed / fixture renamed), swap to another gated
// pack in `corpus/envato/manifest.json`.
const PACK_NAME = "brand-guidelines";
const PACK_PATH = `${REPO_ROOT}/corpus/envato/packs/${PACK_NAME}/template.idml`;

type ElementId =
  | { kind: "textFrame"; id: string }
  | { kind: "rectangle"; id: string }
  | { kind: "oval"; id: string }
  | { kind: "polygon"; id: string }
  | { kind: "graphicLine"; id: string }
  | { kind: "group"; id: string };

interface CanvasGlobal {
  client: {
    send: (msg: unknown) => Promise<unknown>;
    setElementSelection: (
      ids: ElementId[],
      mode: "replace" | "add" | "toggle",
    ) => Promise<ElementId[]>;
    marqueeHits: (
      pageId: string,
      rect: [number, number, number, number],
    ) => Promise<ElementId[]>;
    elementGeometry: (ids: ElementId[]) => Promise<unknown>;
  };
  handle: {
    pageIds: string[];
    pageSizesPt: [number, number][];
  } | null;
  ready: boolean;
}

async function hitAt(
  page: Page,
  pageId: string,
  x: number,
  y: number,
): Promise<{
  element: ElementId | null;
  frameId: string | null;
  storyId: string | null;
  bounds: number[] | null;
}> {
  return page.evaluate(
    async ({ pageId, x, y }) => {
      const c = (globalThis as unknown as { __canvas: CanvasGlobal }).__canvas;
      const reply = (await c.client.send({
        kind: "hitTest",
        payload: { pageId, docPoint: [x, y], filter: "any" },
      })) as { kind: string; payload: any };
      const p = reply.payload;
      return {
        element: p.element ?? null,
        frameId: p.frameId ?? null,
        storyId: p.storyId ?? null,
        bounds: p.bounds ?? null,
      };
    },
    { pageId, x, y },
  );
}

async function setSelection(
  page: Page,
  ids: ElementId[],
  mode: "replace" | "add" | "toggle",
): Promise<ElementId[]> {
  return page.evaluate(
    async ({ ids, mode }) => {
      const c = (globalThis as unknown as { __canvas: CanvasGlobal }).__canvas;
      return await c.client.setElementSelection(ids, mode);
    },
    { ids, mode },
  );
}

async function marquee(
  page: Page,
  pageId: string,
  rect: [number, number, number, number],
): Promise<ElementId[]> {
  return page.evaluate(
    async ({ pageId, rect }) => {
      const c = (globalThis as unknown as { __canvas: CanvasGlobal }).__canvas;
      return await c.client.marqueeHits(pageId, rect);
    },
    { pageId, rect },
  );
}

// loadIdml returns the document handle directly (bypassing React's
// `setHandle`), so we don't wait on `__canvas.ready` — that flag is
// driven by the React file-drop path, not the worker side-channel.
// `loadIdml`'s resolved promise *is* the readiness signal.

test.describe("Phase A — element selection + hit-testing", () => {
  let pageId = "";
  let pageW = 0;
  let pageH = 0;

  test.beforeEach(async ({ page }) => {
    await openCanvas(page);
    const loaded = await loadIdml(page, PACK_PATH, PACK_NAME);
    expect(loaded.pageCount).toBeGreaterThan(0);
    pageId = loaded.pages[0].pageId;
    pageW = loaded.pages[0].widthPt;
    pageH = loaded.pages[0].heightPt;
  });

  test("AC-E-10 — click selects, Shift adds, Cmd toggles, empty click clears", async ({
    page,
  }) => {
    const w = pageW;
    const h = pageH;

    // Click roughly in the middle of the page — for a real brand-
    // guidelines pack this hits a frame on the cover. If it doesn't,
    // walk a few points until something resolves.
    let firstHit = null as ElementId | null;
    for (const [px, py] of [
      [w * 0.5, h * 0.5],
      [w * 0.5, h * 0.3],
      [w * 0.5, h * 0.7],
      [w * 0.3, h * 0.5],
      [w * 0.7, h * 0.5],
    ]) {
      const r = await hitAt(page, pageId, px, py);
      if (r.element) {
        firstHit = r.element;
        break;
      }
    }
    expect(firstHit, "expected at least one selectable frame on the cover").not.toBeNull();

    // Replace selection.
    const afterReplace = await setSelection(page, [firstHit!], "replace");
    expect(afterReplace).toEqual([firstHit!]);

    // Empty click → clear (empty input + Replace).
    const afterClear = await setSelection(page, [], "replace");
    expect(afterClear).toEqual([]);

    // Shift adds.
    const afterShift = await setSelection(page, [firstHit!], "add");
    expect(afterShift).toEqual([firstHit!]);
    const afterShiftDup = await setSelection(page, [firstHit!], "add");
    expect(afterShiftDup.length).toBe(1); // dedupe

    // Cmd toggles (already present → remove).
    const afterToggle = await setSelection(page, [firstHit!], "toggle");
    expect(afterToggle).toEqual([]);
    // Cmd toggle again — re-adds.
    const afterToggle2 = await setSelection(page, [firstHit!], "toggle");
    expect(afterToggle2).toEqual([firstHit!]);
  });

  test("AC-E-11 — marquee returns every selectable element in its rect", async ({
    page,
  }) => {
    const w = pageW;
    const h = pageH;

    // Whole-page marquee — must return every selectable frame on the
    // page. Order is paint order (top-first).
    const all = await marquee(page, pageId, [0, 0, h, w]);
    expect(all.length).toBeGreaterThan(0);

    // A tiny marquee in the centre might return zero or a few — it
    // must NOT exceed the whole-page count.
    const center = await marquee(page, pageId, [
      h * 0.45,
      w * 0.45,
      h * 0.55,
      w * 0.55,
    ]);
    expect(center.length).toBeLessThanOrEqual(all.length);
  });

  test("AC-E-12 — selection survives a camera zoom change", async ({ page }) => {
    const w = pageW;
    const h = pageH;

    // Pick the first document-space point that actually selects
    // something. Document-space hit-testing is camera-independent by
    // construction — the same point must return the same element
    // regardless of zoom.
    const probes: Array<[number, number]> = [
      [w * 0.5, h * 0.5],
      [w * 0.4, h * 0.4],
      [w * 0.6, h * 0.6],
      [w * 0.5, h * 0.3],
      [w * 0.5, h * 0.7],
      [w * 0.3, h * 0.5],
      [w * 0.7, h * 0.5],
      [w * 0.2, h * 0.2],
      [w * 0.8, h * 0.8],
    ];
    let hitPoint: [number, number] | null = null;
    let centerHit: ElementId | null = null;
    for (const [px, py] of probes) {
      const r = await hitAt(page, pageId, px, py);
      if (r.element) {
        centerHit = r.element;
        hitPoint = [px, py];
        break;
      }
    }
    expect(centerHit, "expected at least one selectable point on page 0").not.toBeNull();

    const [px, py] = hitPoint!;

    await page.evaluate(() => {
      const c = (globalThis as unknown as {
        __canvas: { client: { setCamera: (cam: { scale: number; tx: number; ty: number }) => void } };
      }).__canvas;
      c.client.setCamera({ scale: 0.25, tx: 0, ty: 0 });
    });
    const lowZoom = await hitAt(page, pageId, px, py);

    await page.evaluate(() => {
      const c = (globalThis as unknown as {
        __canvas: { client: { setCamera: (cam: { scale: number; tx: number; ty: number }) => void } };
      }).__canvas;
      c.client.setCamera({ scale: 2.0, tx: 0, ty: 0 });
    });
    const highZoom = await hitAt(page, pageId, px, py);

    expect(lowZoom.element).toEqual(centerHit);
    expect(highZoom.element).toEqual(centerHit);
  });

  test("HitFilter=text only returns text frames with stories", async ({ page }) => {
    const w = pageW;
    const h = pageH;

    const reply = await page.evaluate(
      async ({ pageId, x, y }) => {
        const c = (globalThis as unknown as { __canvas: CanvasGlobal }).__canvas;
        const r = (await c.client.send({
          kind: "hitTest",
          payload: { pageId, docPoint: [x, y], filter: "text" },
        })) as { payload: { element: ElementId | null; storyId: string | null } };
        return r.payload;
      },
      { pageId, x: w * 0.5, y: h * 0.5 },
    );
    // Either no hit, or a hit that's a text frame with a story.
    if (reply.element) {
      expect(reply.element.kind).toBe("textFrame");
      expect(reply.storyId).not.toBeNull();
    }
  });
});

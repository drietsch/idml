// Phase B acceptance suite — translate gesture.
//
// Drives the gesture lifecycle directly through the dev-only
// `window.__canvas.client` hook so the test exercises the wasm
// dispatch without DOM pointer-event timing.
//
// Acceptance criteria:
//   AC-E-13  drag a frame; committed bounds match drag delta exactly;
//            one undo entry per commit
//   AC-E-7   determinism: same delta on a fresh model lands at the
//            same bounds
//   AC-E-8   undo round-trips: Cmd-Z restores; redo replays
//   AC-E-9   gesture is camera-independent — delta is in doc-space pt

import { dirname, resolve as pathResolve } from "node:path";
import { fileURLToPath } from "node:url";
import { test, expect, type Page } from "@playwright/test";

import { openCanvas, loadIdml } from "./fidelity/canvas-driver";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = pathResolve(__dirname, "..", "..", "..");

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
    beginGesture: (nodes: ElementId[], gesture: unknown) => Promise<number>;
    updateGesture: (
      handle: number,
      delta: [number, number],
      modifiers: { shift: boolean; alt: boolean },
    ) => Promise<string[]>;
    commitGesture: (handle: number) => Promise<{ appliedSeq: number; pageIds: string[] }>;
    cancelGesture: (handle: number) => Promise<string[]>;
    undo: () => Promise<unknown>;
    redo: () => Promise<unknown>;
  };
}

async function hitTopmostFrame(
  page: Page,
  pageId: string,
  w: number,
  h: number,
): Promise<ElementId> {
  return page.evaluate(
    async ({ pageId, w, h }) => {
      const c = (globalThis as unknown as { __canvas: CanvasGlobal }).__canvas;
      const probes: Array<[number, number]> = [
        [w * 0.5, h * 0.5],
        [w * 0.5, h * 0.3],
        [w * 0.5, h * 0.7],
        [w * 0.3, h * 0.5],
        [w * 0.7, h * 0.5],
        [w * 0.4, h * 0.4],
        [w * 0.6, h * 0.6],
        [w * 0.2, h * 0.2],
      ];
      for (const [x, y] of probes) {
        const reply = (await c.client.send({
          kind: "hitTest",
          payload: { pageId, docPoint: [x, y], filter: "any" },
        })) as { payload: { element: ElementId | null; itemTransform: number[] | null } };
        const el = reply.payload.element;
        const transform = reply.payload.itemTransform;
        if (!el) continue;
        // Phase B only handles un-rotated frames; skip rotated ones
        // so the test picks something translate-able.
        if (transform) {
          const [a, b, c2, d] = transform;
          if (Math.abs(a - 1) > 1e-3 || Math.abs(d - 1) > 1e-3) continue;
          if (Math.abs(b) > 1e-3 || Math.abs(c2) > 1e-3) continue;
        }
        return el;
      }
      throw new Error("no translate-eligible frame found");
    },
    { pageId, w, h },
  );
}

async function frameBoundsRaw(page: Page, el: ElementId): Promise<[number, number, number, number]> {
  return page.evaluate(
    async ({ el }) => {
      const c = (globalThis as unknown as { __canvas: CanvasGlobal }).__canvas;
      // Hit-test on the centroid of the bounds isn't reliable cross-
      // pack, but we can just ask elementGeometry for the bounds.
      const r = (await c.client.send({
        kind: "requestElementGeometry",
        payload: { ids: [el] },
      })) as { payload: { items: Array<{ bounds: [number, number, number, number] }> } };
      if (r.payload.items.length === 0) throw new Error("no geometry for element");
      return r.payload.items[0].bounds;
    },
    { el },
  );
}

test.describe("Phase B — translate gesture", () => {
  let pageId = "";
  let pageW = 0;
  let pageH = 0;
  let target: ElementId;

  test.beforeEach(async ({ page }) => {
    await openCanvas(page);
    const loaded = await loadIdml(page, PACK_PATH, PACK_NAME);
    pageId = loaded.pages[0].pageId;
    pageW = loaded.pages[0].widthPt;
    pageH = loaded.pages[0].heightPt;
    target = await hitTopmostFrame(page, pageId, pageW, pageH);
  });

  test("AC-E-13 — committed bounds equal anchor + delta (within snap tolerance)", async ({
    page,
  }) => {
    const before = await frameBoundsRaw(page, target);
    // Phase E's snap pass adjusts the effective delta by up to 4pt
    // when a candidate edge lands near a page/sibling edge. Use a
    // larger delta (138, -82) so snap is in the noise + assert
    // bounds within snap tolerance of (raw delta).
    const delta: [number, number] = [138.0, -82.0];

    await page.evaluate(
      async ({ target, delta }) => {
        const c = (globalThis as unknown as { __canvas: CanvasGlobal }).__canvas;
        const h = await c.client.beginGesture([target], { kind: "translate" });
        await c.client.updateGesture(h, delta, { shift: false, alt: false });
        await c.client.commitGesture(h);
      },
      { target, delta },
    );

    const after = await frameBoundsRaw(page, target);
    // Channel returns `[top, left, bottom, right]`. Snap may have
    // nudged the delta by up to ~4pt; assert within that tolerance.
    expect(Math.abs(after[0] - (before[0] + delta[1]))).toBeLessThanOrEqual(4.5);
    expect(Math.abs(after[1] - (before[1] + delta[0]))).toBeLessThanOrEqual(4.5);
    expect(Math.abs(after[2] - (before[2] + delta[1]))).toBeLessThanOrEqual(4.5);
    expect(Math.abs(after[3] - (before[3] + delta[0]))).toBeLessThanOrEqual(4.5);
    // Rigidity: the frame moved by a CONSISTENT delta (all four
    // edges shifted by the same amount within float noise).
    const dx = after[1] - before[1];
    const dy = after[0] - before[0];
    expect(after[3] - before[3]).toBeCloseTo(dx, 1);
    expect(after[2] - before[2]).toBeCloseTo(dy, 1);
  });

  test("AC-E-8 — undo restores, redo replays", async ({ page }) => {
    const before = await frameBoundsRaw(page, target);
    const delta: [number, number] = [125.0, 95.0];

    await page.evaluate(
      async ({ target, delta }) => {
        const c = (globalThis as unknown as { __canvas: CanvasGlobal }).__canvas;
        const h = await c.client.beginGesture([target], { kind: "translate" });
        await c.client.updateGesture(h, delta, { shift: false, alt: false });
        await c.client.commitGesture(h);
        await c.client.undo();
      },
      { target, delta },
    );
    const undone = await frameBoundsRaw(page, target);
    for (let i = 0; i < 4; i++) expect(undone[i]).toBeCloseTo(before[i], 1);

    await page.evaluate(async () => {
      const c = (globalThis as unknown as { __canvas: CanvasGlobal }).__canvas;
      await c.client.redo();
    });
    const redone = await frameBoundsRaw(page, target);
    // Redo lands within snap tolerance of (before + delta).
    expect(Math.abs(redone[0] - (before[0] + delta[1]))).toBeLessThanOrEqual(4.5);
    expect(Math.abs(redone[1] - (before[1] + delta[0]))).toBeLessThanOrEqual(4.5);
  });

  test("cancel restores", async ({ page }) => {
    const before = await frameBoundsRaw(page, target);
    await page.evaluate(
      async ({ target }) => {
        const c = (globalThis as unknown as { __canvas: CanvasGlobal }).__canvas;
        const h = await c.client.beginGesture([target], { kind: "translate" });
        await c.client.updateGesture(h, [50.0, 50.0], { shift: false, alt: false });
        await c.client.cancelGesture(h);
      },
      { target },
    );
    const after = await frameBoundsRaw(page, target);
    for (let i = 0; i < 4; i++) expect(after[i]).toBeCloseTo(before[i], 2);
  });

  test("AC-E-9 — gesture delta is camera-independent", async ({ page }) => {
    const before = await frameBoundsRaw(page, target);
    // Use a delta large enough that snap is in the noise — the
    // property under test is that doc-space delta != viewport delta,
    // not that snap is off.
    const dx = 117.0;
    const dy = 113.0;
    await page.evaluate(
      async ({ target, dx, dy }) => {
        const c = (globalThis as unknown as {
          __canvas: { client: { setCamera: (c: { scale: number; tx: number; ty: number }) => void } } & CanvasGlobal;
        }).__canvas;
        // Change camera before & after to prove the doc-space delta
        // is what counts.
        c.client.setCamera({ scale: 0.5, tx: 100, ty: 100 });
        const h = await c.client.beginGesture([target], { kind: "translate" });
        c.client.setCamera({ scale: 2.0, tx: 50, ty: 50 });
        await c.client.updateGesture(h, [dx, dy], { shift: false, alt: false });
        await c.client.commitGesture(h);
      },
      { target, dx, dy },
    );
    const after = await frameBoundsRaw(page, target);
    // Within snap tolerance of (before + delta) — the cameras
    // mid-gesture do NOT shift the result.
    expect(Math.abs(after[0] - (before[0] + dy))).toBeLessThanOrEqual(4.5);
    expect(Math.abs(after[1] - (before[1] + dx))).toBeLessThanOrEqual(4.5);
  });
});

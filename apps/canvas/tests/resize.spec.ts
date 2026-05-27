// Phase C acceptance suite — resize gesture (AC-E-14).
//
// Each test exercises one handle + modifier combination through the
// worker channel so the spec is deterministic and fast — no DOM
// pointer-event timing involved. The interaction-driven UI path
// (Overlay handles + ViewportCanvas wiring) is covered by manual
// smoke-testing; this suite locks down the model semantics.

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

type ResizeHandle =
  | "north"
  | "south"
  | "east"
  | "west"
  | "northEast"
  | "northWest"
  | "southEast"
  | "southWest";

interface CanvasGlobal {
  client: {
    send: (msg: unknown) => Promise<unknown>;
    beginGesture: (nodes: ElementId[], gesture: unknown) => Promise<number>;
    updateGesture: (
      h: number,
      d: [number, number],
      mods: { shift: boolean; alt: boolean },
    ) => Promise<string[]>;
    commitGesture: (h: number) => Promise<{ appliedSeq: number; pageIds: string[] }>;
    cancelGesture: (h: number) => Promise<string[]>;
    undo: () => Promise<unknown>;
  };
}

async function hitTopmostUnrotatedFrame(
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
        [w * 0.3, h * 0.5],
        [w * 0.7, h * 0.5],
        [w * 0.5, h * 0.7],
        [w * 0.4, h * 0.4],
        [w * 0.6, h * 0.6],
      ];
      for (const [x, y] of probes) {
        const reply = (await c.client.send({
          kind: "hitTest",
          payload: { pageId, docPoint: [x, y], filter: "any" },
        })) as { payload: { element: ElementId | null; itemTransform: number[] | null } };
        const el = reply.payload.element;
        const tr = reply.payload.itemTransform;
        if (!el) continue;
        if (tr) {
          if (Math.abs(tr[0] - 1) > 1e-3 || Math.abs(tr[3] - 1) > 1e-3) continue;
          if (Math.abs(tr[1]) > 1e-3 || Math.abs(tr[2]) > 1e-3) continue;
        }
        return el;
      }
      throw new Error("no un-rotated frame found");
    },
    { pageId, w, h },
  );
}

async function getBounds(page: Page, el: ElementId): Promise<[number, number, number, number]> {
  return page.evaluate(
    async ({ el }) => {
      const c = (globalThis as unknown as { __canvas: CanvasGlobal }).__canvas;
      const r = (await c.client.send({
        kind: "requestElementGeometry",
        payload: { ids: [el] },
      })) as { payload: { items: Array<{ bounds: [number, number, number, number] }> } };
      if (r.payload.items.length === 0) throw new Error("no geometry");
      return r.payload.items[0].bounds;
    },
    { el },
  );
}

async function resize(
  page: Page,
  target: ElementId,
  handle: ResizeHandle,
  delta: [number, number],
  mods: { shift: boolean; alt: boolean } = { shift: false, alt: false },
): Promise<void> {
  await page.evaluate(
    async ({ target, handle, delta, mods }) => {
      const c = (globalThis as unknown as { __canvas: CanvasGlobal }).__canvas;
      const h = await c.client.beginGesture([target], { kind: "resize", handle });
      await c.client.updateGesture(h, delta, mods);
      await c.client.commitGesture(h);
    },
    { target, handle, delta, mods },
  );
}

test.describe("Phase C — resize gesture", () => {
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
    target = await hitTopmostUnrotatedFrame(page, pageId, pageW, pageH);
  });

  test("AC-E-14 — SE handle: opposite (top + left) edges fixed", async ({ page }) => {
    const before = await getBounds(page, target);
    await resize(page, target, "southEast", [15.0, 25.0]);
    const after = await getBounds(page, target);
    // Channel returns [top, left, bottom, right].
    expect(after[0]).toBeCloseTo(before[0], 2);
    expect(after[1]).toBeCloseTo(before[1], 2);
    expect(after[2]).toBeCloseTo(before[2] + 25.0, 2);
    expect(after[3]).toBeCloseTo(before[3] + 15.0, 2);
  });

  test("AC-E-14 — N handle: only top moves", async ({ page }) => {
    const before = await getBounds(page, target);
    await resize(page, target, "north", [0.0, -10.0]);
    const after = await getBounds(page, target);
    expect(after[0]).toBeCloseTo(before[0] - 10.0, 2);
    expect(after[1]).toBeCloseTo(before[1], 2);
    expect(after[2]).toBeCloseTo(before[2], 2);
    expect(after[3]).toBeCloseTo(before[3], 2);
  });

  test("AC-E-14 — Alt + SE: centre fixed, both opposite edges mirror", async ({ page }) => {
    const before = await getBounds(page, target);
    const cxBefore = (before[1] + before[3]) * 0.5;
    const cyBefore = (before[0] + before[2]) * 0.5;
    await resize(page, target, "southEast", [10.0, 6.0], { shift: false, alt: true });
    const after = await getBounds(page, target);
    const cxAfter = (after[1] + after[3]) * 0.5;
    const cyAfter = (after[0] + after[2]) * 0.5;
    expect(cxAfter).toBeCloseTo(cxBefore, 2);
    expect(cyAfter).toBeCloseTo(cyBefore, 2);
    // Width grew by 2*dx; height grew by 2*dy.
    const wBefore = before[3] - before[1];
    const hBefore = before[2] - before[0];
    const wAfter = after[3] - after[1];
    const hAfter = after[2] - after[0];
    expect(wAfter).toBeCloseTo(wBefore + 20.0, 2);
    expect(hAfter).toBeCloseTo(hBefore + 12.0, 2);
  });

  test("AC-E-14 — Shift + SE corner locks aspect ratio", async ({ page }) => {
    const before = await getBounds(page, target);
    const aspect = (before[3] - before[1]) / (before[2] - before[0]);
    await resize(page, target, "southEast", [40.0, 10.0], { shift: true, alt: false });
    const after = await getBounds(page, target);
    const newAspect = (after[3] - after[1]) / (after[2] - after[0]);
    expect(newAspect).toBeCloseTo(aspect, 3);
    // NW corner stays put.
    expect(after[0]).toBeCloseTo(before[0], 2);
    expect(after[1]).toBeCloseTo(before[1], 2);
  });

  test("cancel restores", async ({ page }) => {
    const before = await getBounds(page, target);
    await page.evaluate(
      async ({ target }) => {
        const c = (globalThis as unknown as { __canvas: CanvasGlobal }).__canvas;
        const h = await c.client.beginGesture([target], {
          kind: "resize",
          handle: "east",
        });
        await c.client.updateGesture(h, [50.0, 0.0], { shift: false, alt: false });
        await c.client.cancelGesture(h);
      },
      { target },
    );
    const after = await getBounds(page, target);
    for (let i = 0; i < 4; i++) expect(after[i]).toBeCloseTo(before[i], 2);
  });

  test("resize undo round-trips", async ({ page }) => {
    const before = await getBounds(page, target);
    await resize(page, target, "east", [25.0, 0.0]);
    const after = await getBounds(page, target);
    expect(after[3]).toBeCloseTo(before[3] + 25.0, 2);
    await page.evaluate(async () => {
      const c = (globalThis as unknown as { __canvas: CanvasGlobal }).__canvas;
      await c.client.undo();
    });
    const restored = await getBounds(page, target);
    for (let i = 0; i < 4; i++) expect(restored[i]).toBeCloseTo(before[i], 2);
  });
});

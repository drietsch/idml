// Phase D acceptance suite — rotate + scale gestures.
//
// AC-E-15: dragging the rotation handle rotates about the selection
// pivot; Shift snaps to 15° increments; committed `item_transform`
// matches the analytic rotation about the centroid.
//
// Scale: corner-drag with Cmd commits a matrix scale (FrameTransform)
// rather than the Phase C bounds resize.

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
    beginGesture: (
      nodes: ElementId[],
      gesture: unknown,
      anchor?: unknown,
    ) => Promise<number>;
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

async function hitUnrotatedFrame(
  page: Page,
  pageId: string,
  w: number,
  h: number,
): Promise<{
  element: ElementId;
  /** Page-local AABB `[top, left, bottom, right]`. */
  pageBounds: [number, number, number, number];
}> {
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
      ];
      for (const [x, y] of probes) {
        const reply = (await c.client.send({
          kind: "hitTest",
          payload: { pageId, docPoint: [x, y], filter: "any" },
        })) as {
          payload: {
            element: ElementId | null;
            frameBounds: {
              left: number;
              top: number;
              right: number;
              bottom: number;
            } | null;
            itemTransform: number[] | null;
          };
        };
        const el = reply.payload.element;
        const fb = reply.payload.frameBounds;
        const tr = reply.payload.itemTransform;
        if (!el || !fb) continue;
        if (tr) {
          if (Math.abs(tr[0] - 1) > 1e-3 || Math.abs(tr[3] - 1) > 1e-3) continue;
          if (Math.abs(tr[1]) > 1e-3 || Math.abs(tr[2]) > 1e-3) continue;
        }
        return {
          element: el,
          pageBounds: [fb.top, fb.left, fb.bottom, fb.right] as [
            number,
            number,
            number,
            number,
          ],
        };
      }
      throw new Error("no un-rotated frame found");
    },
    { pageId, w, h },
  );
}

async function getTransform(
  page: Page,
  el: ElementId,
): Promise<[number, number, number, number, number, number] | null> {
  return page.evaluate(
    async ({ el }) => {
      const c = (globalThis as unknown as { __canvas: CanvasGlobal }).__canvas;
      const r = (await c.client.send({
        kind: "requestElementGeometry",
        payload: { ids: [el] },
      })) as {
        payload: { items: Array<{ itemTransform: number[] | null }> };
      };
      const t = r.payload.items[0]?.itemTransform;
      if (!t) return null;
      return [t[0], t[1], t[2], t[3], t[4], t[5]] as [
        number,
        number,
        number,
        number,
        number,
        number,
      ];
    },
    { el },
  );
}

test.describe("Phase D — rotate + scale gestures", () => {
  let pageId = "";
  let pageW = 0;
  let pageH = 0;
  let target: ElementId;
  let pageBounds: [number, number, number, number];

  test.beforeEach(async ({ page }) => {
    await openCanvas(page);
    const loaded = await loadIdml(page, PACK_PATH, PACK_NAME);
    pageId = loaded.pages[0].pageId;
    pageW = loaded.pages[0].widthPt;
    pageH = loaded.pages[0].heightPt;
    const hit = await hitUnrotatedFrame(page, pageId, pageW, pageH);
    target = hit.element;
    pageBounds = hit.pageBounds;
  });

  test("AC-E-15 — rotate 90° about centroid; committed matrix matches", async ({
    page,
  }) => {
    // Bounds are [top, left, bottom, right]; centroid in page-local
    // coords is ((left+right)/2, (top+bottom)/2). We start the gesture
    // anchored 100 pt to the right of the centroid and move the
    // pointer to 100 pt above it — that's a +90° (counter-clockwise
    // in standard math axes, screen y grows downward) rotation.
    const cx = (pageBounds[1] + pageBounds[3]) / 2;
    const cy = (pageBounds[0] + pageBounds[2]) / 2;
    const anchorPt: [number, number] = [cx + 100, cy];
    const delta: [number, number] = [-100, 100]; // anchor + delta = (cx, cy + 100)

    await page.evaluate(
      async ({ target, pageId, anchorPt, delta }) => {
        const c = (globalThis as unknown as { __canvas: CanvasGlobal }).__canvas;
        const h = await c.client.beginGesture(
          [target],
          { kind: "rotate" },
          { pageId, pointInPage: anchorPt },
        );
        await c.client.updateGesture(h, delta, { shift: false, alt: false });
        await c.client.commitGesture(h);
      },
      { target, pageId, anchorPt, delta },
    );

    const t = await getTransform(page, target);
    expect(t).not.toBeNull();
    // For a 90° rotation: a=0, b=1, c=-1, d=0.
    expect(t![0]).toBeCloseTo(0, 2);
    expect(t![1]).toBeCloseTo(1, 2);
    expect(t![2]).toBeCloseTo(-1, 2);
    expect(t![3]).toBeCloseTo(0, 2);
  });

  test("AC-E-15 — Shift snaps rotation to 15° increments", async ({ page }) => {
    const cx = (pageBounds[1] + pageBounds[3]) / 2;
    const cy = (pageBounds[0] + pageBounds[2]) / 2;
    // Anchor to the right; nudge slightly up: raw angle ~ -16.7°,
    // snaps to -15°. cos(-15°) ≈ 0.9659; sin(-15°) ≈ -0.2588.
    const anchorPt: [number, number] = [cx + 100, cy];
    const delta: [number, number] = [0, -30];

    await page.evaluate(
      async ({ target, pageId, anchorPt, delta }) => {
        const c = (globalThis as unknown as { __canvas: CanvasGlobal }).__canvas;
        const h = await c.client.beginGesture(
          [target],
          { kind: "rotate" },
          { pageId, pointInPage: anchorPt },
        );
        await c.client.updateGesture(h, delta, { shift: true, alt: false });
        await c.client.commitGesture(h);
      },
      { target, pageId, anchorPt, delta },
    );

    const t = await getTransform(page, target);
    expect(t).not.toBeNull();
    const expectedA = Math.cos((-15 * Math.PI) / 180);
    const expectedB = Math.sin((-15 * Math.PI) / 180);
    expect(t![0]).toBeCloseTo(expectedA, 3);
    expect(t![1]).toBeCloseTo(expectedB, 3);
  });

  test("rotate cancel restores original transform", async ({ page }) => {
    const before = await getTransform(page, target);
    const cx = (pageBounds[1] + pageBounds[3]) / 2;
    const cy = (pageBounds[0] + pageBounds[2]) / 2;
    await page.evaluate(
      async ({ target, pageId, anchorPt }) => {
        const c = (globalThis as unknown as { __canvas: CanvasGlobal }).__canvas;
        const h = await c.client.beginGesture(
          [target],
          { kind: "rotate" },
          { pageId, pointInPage: anchorPt },
        );
        await c.client.updateGesture(h, [-50, 50], { shift: false, alt: false });
        await c.client.cancelGesture(h);
      },
      { target, pageId, anchorPt: [cx + 100, cy] },
    );
    const after = await getTransform(page, target);
    expect(after).toEqual(before);
  });

  test("rotate undo round-trips", async ({ page }) => {
    const before = await getTransform(page, target);
    const cx = (pageBounds[1] + pageBounds[3]) / 2;
    const cy = (pageBounds[0] + pageBounds[2]) / 2;
    await page.evaluate(
      async ({ target, pageId, anchorPt }) => {
        const c = (globalThis as unknown as { __canvas: CanvasGlobal }).__canvas;
        const h = await c.client.beginGesture(
          [target],
          { kind: "rotate" },
          { pageId, pointInPage: anchorPt },
        );
        await c.client.updateGesture(h, [-100, 100], { shift: false, alt: false });
        await c.client.commitGesture(h);
        await c.client.undo();
      },
      { target, pageId, anchorPt: [cx + 100, cy] },
    );
    const after = await getTransform(page, target);
    expect(after).toEqual(before);
  });

  test("scale doubles via FrameTransform when anchor is on a centroid axis", async ({
    page,
  }) => {
    // Anchor 100 pt right of centroid; drag +100 pt right ⇒ sx = 2.
    // anchor_dy = 0 means sy falls back to 1.
    const cx = (pageBounds[1] + pageBounds[3]) / 2;
    const cy = (pageBounds[0] + pageBounds[2]) / 2;
    const anchorPt: [number, number] = [cx + 100, cy];
    const delta: [number, number] = [100, 0];

    await page.evaluate(
      async ({ target, pageId, anchorPt, delta }) => {
        const c = (globalThis as unknown as { __canvas: CanvasGlobal }).__canvas;
        const h = await c.client.beginGesture(
          [target],
          { kind: "scale" },
          { pageId, pointInPage: anchorPt },
        );
        await c.client.updateGesture(h, delta, { shift: false, alt: false });
        await c.client.commitGesture(h);
      },
      { target, pageId, anchorPt, delta },
    );

    const t = await getTransform(page, target);
    expect(t).not.toBeNull();
    expect(t![0]).toBeCloseTo(2.0, 2);
    expect(t![3]).toBeCloseTo(1.0, 2);
  });

  test("scale with Shift locks aspect ratio", async ({ page }) => {
    const cx = (pageBounds[1] + pageBounds[3]) / 2;
    const cy = (pageBounds[0] + pageBounds[2]) / 2;
    // Diagonal anchor → both sx and sy populated; Shift forces them
    // to match (dominant axis wins).
    const anchorPt: [number, number] = [cx + 100, cy - 100];
    const delta: [number, number] = [50, 50];

    await page.evaluate(
      async ({ target, pageId, anchorPt, delta }) => {
        const c = (globalThis as unknown as { __canvas: CanvasGlobal }).__canvas;
        const h = await c.client.beginGesture(
          [target],
          { kind: "scale" },
          { pageId, pointInPage: anchorPt },
        );
        await c.client.updateGesture(h, delta, { shift: true, alt: false });
        await c.client.commitGesture(h);
      },
      { target, pageId, anchorPt, delta },
    );

    const t = await getTransform(page, target);
    expect(t).not.toBeNull();
    expect(Math.abs(t![0] - t![3])).toBeLessThan(1e-3);
  });
});

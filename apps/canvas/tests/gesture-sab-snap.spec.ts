// Step 5e acceptance — SAB-mode gesture surfaces snap lines via the
// out-of-band `gestureSnapLines` notification.
//
// 5d shipped the SAB hot path but kept snap-line surfacing on the
// JSON `gestureUpdated` reply. 5e closes the gap: the worker drains
// the SAB, runs the snap pass, and posts an unsolicited
// `gestureSnapLines` notification. ViewportCanvas subscribes and
// updates the overlay. This spec drives the gesture via SAB and
// asserts the notification fires with the expected guides.

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

type SnapLine = { axis: "x" | "y"; position: number; pageId: string };

interface CanvasGlobal {
  client: {
    send: (msg: unknown) => Promise<unknown>;
    gestureSab: { buffer: SharedArrayBuffer | ArrayBuffer };
    subscribe: (listener: (msg: unknown) => void) => () => void;
    beginGesture: (nodes: ElementId[], gesture: unknown) => Promise<number>;
    updateGesture: (
      handle: number,
      delta: [number, number],
      modifiers: { shift: boolean; alt: boolean },
      mode?: "json" | "sab",
    ) => Promise<{ pageIds: string[]; snapLines: SnapLine[] }>;
    commitGesture: (handle: number) => Promise<{ appliedSeq: number; pageIds: string[] }>;
    cancelGesture: (handle: number) => Promise<string[]>;
  };
}

async function findUnrotatedRectLike(
  page: Page,
  pageId: string,
  w: number,
  h: number,
): Promise<{ id: ElementId; pageBounds: [number, number, number, number] }> {
  return page.evaluate(
    async ({ pageId, w, h }) => {
      const c = (globalThis as unknown as { __canvas: CanvasGlobal }).__canvas;
      const probes: Array<[number, number]> = [];
      for (let r = 0.15; r < 1.0; r += 0.1) {
        for (let cc = 0.15; cc < 1.0; cc += 0.1) {
          probes.push([w * cc, h * r]);
        }
      }
      for (const [x, y] of probes) {
        const reply = (await c.client.send({
          kind: "hitTest",
          payload: { pageId, docPoint: [x, y], filter: "any" },
        })) as {
          payload: {
            element: ElementId | null;
            frameBounds: { top: number; left: number; bottom: number; right: number } | null;
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
          id: el,
          pageBounds: [fb.top, fb.left, fb.bottom, fb.right] as [
            number,
            number,
            number,
            number,
          ],
        };
      }
      throw new Error("no un-rotated frame found on page");
    },
    { pageId, w, h },
  );
}

test.describe("Step 5e — SAB-mode snap-line notifications", () => {
  let pageId = "";
  let pageW = 0;
  let pageH = 0;

  test.beforeEach(async ({ page }) => {
    await openCanvas(page);
    const loaded = await loadIdml(page, PACK_PATH, PACK_NAME);
    pageId = loaded.pages[0].pageId;
    pageW = loaded.pages[0].widthPt;
    pageH = loaded.pages[0].heightPt;
  });

  test("crossOriginIsolated holds + gestureSab is a SharedArrayBuffer", async ({
    page,
  }) => {
    // Sanity gate: if Vite isn't serving COOP/COEP, SAB mode silently
    // falls back to JSON and every other assertion in this file
    // becomes a tautology. Fail loud instead.
    const env = await page.evaluate(() => {
      const c = (globalThis as unknown as { __canvas: CanvasGlobal }).__canvas;
      return {
        isolated: (globalThis as { crossOriginIsolated?: boolean })
          .crossOriginIsolated === true,
        bufferKind: c.client.gestureSab.buffer.constructor.name,
      };
    });
    expect(env.isolated).toBe(true);
    expect(env.bufferKind).toBe("SharedArrayBuffer");
  });

  test("SAB-mode translate emits gestureSnapLines with an x-axis guide", async ({
    page,
  }) => {
    const item = await findUnrotatedRectLike(page, pageId, pageW, pageH);
    const before = item.pageBounds;
    // Drag left so the moving frame's left edge lands ~2pt short of
    // the page-left edge (within the 4pt snap tolerance). The Phase E
    // snap pass should fire an x-axis guide.
    const dx = -(before[1] - 2);

    const result = await page.evaluate(
      async ({ id, dx }) => {
        const c = (globalThis as unknown as { __canvas: CanvasGlobal }).__canvas;

        // Resolves on the first notification with a non-empty
        // snapLines vector or rejects after 5s. The 5s budget covers
        // the SAB drain interval (8ms) PLUS the worker's
        // updateGestureRaw call, which runs the snap pass + full
        // layout rebuild and can take ~1s on a heavy fixture.
        let resolveOnce: (v: SnapLine[]) => void;
        const firstSnap = new Promise<SnapLine[]>((res, rej) => {
          resolveOnce = res;
          setTimeout(() => rej(new Error("no gestureSnapLines after 5s")), 5000);
        });
        const observed: SnapLine[][] = [];
        const unsubscribe = c.client.subscribe((msg) => {
          const m = msg as { kind: string; payload: { snapLines: SnapLine[] } };
          if (m.kind !== "gestureSnapLines") return;
          observed.push(m.payload.snapLines);
          if (m.payload.snapLines.length > 0) resolveOnce(m.payload.snapLines);
        });

        const handle = await c.client.beginGesture([id], { kind: "translate" });
        // SAB push — fire-and-forget. The worker's 8ms drain runs the
        // snap pass and posts gestureSnapLines.
        await c.client.updateGesture(
          handle,
          [dx, 0],
          { shift: false, alt: false },
          "sab",
        );
        let snapLines: SnapLine[];
        try {
          snapLines = await firstSnap;
        } finally {
          unsubscribe();
          await c.client.cancelGesture(handle);
        }
        return { snapLines, observedCount: observed.length };
      },
      { id: item.id, dx },
    );

    expect(result.observedCount).toBeGreaterThan(0);
    expect(result.snapLines.length).toBeGreaterThan(0);
    const xSnap = result.snapLines.find((l) => l.axis === "x");
    expect(xSnap, "expected an x-axis snap line").toBeDefined();
    expect(xSnap!.position).toBeGreaterThanOrEqual(-0.01);
    expect(xSnap!.position).toBeLessThanOrEqual(pageW);
  });

  test("SAB-mode emits one notification per drain across a multi-push gesture", async ({
    page,
  }) => {
    // The hot path coalesces inside the SAB — only the latest push
    // between two drains is observed. But across drain ticks, every
    // distinct push that lands during a tick boundary should
    // surface a separate notification. This confirms the surface
    // doesn't latch a stale snap-lines snapshot after the first
    // post; without that, dragging into snap and then out would
    // leave the overlay stuck on the original guides.
    const item = await findUnrotatedRectLike(page, pageId, pageW, pageH);
    const before = item.pageBounds;
    // Push 1: aimed at the page-left snap target.
    const dxSnap = -(before[1] - 2);
    // Push 2: pure-y delta — different geometry; the worker re-runs
    // the snap pass and posts a fresh notification regardless of
    // whether the result differs.
    const dyClear = 13;

    const observed = await page.evaluate(
      async ({ id, dxSnap, dyClear }) => {
        const c = (globalThis as unknown as { __canvas: CanvasGlobal }).__canvas;
        const log: SnapLine[][] = [];
        const unsubscribe = c.client.subscribe((msg) => {
          const m = msg as { kind: string; payload: { snapLines: SnapLine[] } };
          if (m.kind === "gestureSnapLines") log.push(m.payload.snapLines);
        });

        const handle = await c.client.beginGesture([id], { kind: "translate" });
        await c.client.updateGesture(
          handle,
          [dxSnap, 0],
          { shift: false, alt: false },
          "sab",
        );
        // ~1s drain + snap pass on a heavy fixture; wait so the
        // second push doesn't coalesce into the first in the SAB.
        await new Promise((r) => setTimeout(r, 1500));
        await c.client.updateGesture(
          handle,
          [0, dyClear],
          { shift: false, alt: false },
          "sab",
        );
        await new Promise((r) => setTimeout(r, 1500));

        unsubscribe();
        await c.client.cancelGesture(handle);
        return log;
      },
      { id: item.id, dxSnap, dyClear },
    );

    // Each push that lands during a drain boundary should surface a
    // notification. With ~1.5s sleeps between pushes both drains
    // get their own tick — expect ≥2 notifications.
    expect(observed.length, "one notify per drained push").toBeGreaterThanOrEqual(2);
    // The first drain saw the page-left snap target.
    expect(
      observed[0].some((l) => l.axis === "x"),
      "first push: x-axis snap line",
    ).toBe(true);
  });
});

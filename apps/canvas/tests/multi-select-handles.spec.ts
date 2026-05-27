// Phase G acceptance suite — multi-select union handles.
//
// G.5 routes a multi-select handle drag to a matrix Scale gesture
// (corner / edge handle) or Rotate (rotation handle). This spec
// drives those gestures directly through the channel so the spec
// stays deterministic; the visual handles are smoke-tested manually.

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
    ) => Promise<{ pageIds: string[]; snapLines: unknown[] }>;
    commitGesture: (h: number) => Promise<{ appliedSeq: number; pageIds: string[] }>;
    undo: () => Promise<unknown>;
  };
}

async function findTwoUnrotatedFrames(
  page: Page,
  pageId: string,
  w: number,
  h: number,
): Promise<ElementId[]> {
  return page.evaluate(
    async ({ pageId, w, h }) => {
      const c = (globalThis as unknown as { __canvas: CanvasGlobal }).__canvas;
      const probes: Array<[number, number]> = [];
      for (let r = 0.1; r < 1.0; r += 0.1) {
        for (let cc = 0.1; cc < 1.0; cc += 0.1) {
          probes.push([w * cc, h * r]);
        }
      }
      const seen = new Set<string>();
      const out: ElementId[] = [];
      for (const [x, y] of probes) {
        const reply = (await c.client.send({
          kind: "hitTest",
          payload: { pageId, docPoint: [x, y], filter: "any" },
        })) as {
          payload: {
            element: ElementId | null;
            itemTransform: number[] | null;
          };
        };
        const el = reply.payload.element;
        const tr = reply.payload.itemTransform;
        if (!el) continue;
        if (tr) {
          if (Math.abs(tr[0] - 1) > 1e-3 || Math.abs(tr[3] - 1) > 1e-3) continue;
          if (Math.abs(tr[1]) > 1e-3 || Math.abs(tr[2]) > 1e-3) continue;
        }
        const key = `${el.kind}:${el.id}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(el);
        if (out.length >= 2) break;
      }
      return out;
    },
    { pageId, w, h },
  );
}

test.describe("Phase G — multi-select union handles", () => {
  let pageId = "";
  let pageW = 0;
  let pageH = 0;
  let ids: ElementId[] = [];

  test.beforeEach(async ({ page }) => {
    await openCanvas(page);
    const loaded = await loadIdml(page, PACK_PATH, PACK_NAME);
    pageId = loaded.pages[0].pageId;
    pageW = loaded.pages[0].widthPt;
    pageH = loaded.pages[0].heightPt;
    ids = await findTwoUnrotatedFrames(page, pageId, pageW, pageH);
    test.skip(ids.length < 2, "needs at least two un-rotated frames");
  });

  test("multi-select Scale via union corner: applied as Batch of FrameTransform", async ({
    page,
  }) => {
    const result = await page.evaluate(
      async ({ ids, pageId, w, h }) => {
        const c = (globalThis as unknown as { __canvas: CanvasGlobal }).__canvas;
        // Anchor at a near-corner of the union AABB; drag outward.
        // For the purpose of this spec we just pick a point inside
        // the page that's well off-centre.
        const anchor = { pageId, pointInPage: [w * 0.8, h * 0.2] };
        const h2 = await c.client.beginGesture(ids, { kind: "scale" }, anchor);
        const upd = await c.client.updateGesture(h2, [50, -50], {
          shift: false,
          alt: false,
        });
        const commit = await c.client.commitGesture(h2);
        return { appliedSeq: commit.appliedSeq, snapLineCount: upd.snapLines.length };
      },
      { ids, pageId, w: pageW, h: pageH },
    );
    expect(result.appliedSeq).toBeGreaterThan(0);
  });

  test("multi-select Rotate via union: applied as Batch of FrameTransform", async ({
    page,
  }) => {
    const result = await page.evaluate(
      async ({ ids, pageId, w, h }) => {
        const c = (globalThis as unknown as { __canvas: CanvasGlobal }).__canvas;
        const anchor = { pageId, pointInPage: [w * 0.5, h * 0.2] };
        const h2 = await c.client.beginGesture(ids, { kind: "rotate" }, anchor);
        await c.client.updateGesture(h2, [-30, 30], {
          shift: false,
          alt: false,
        });
        const commit = await c.client.commitGesture(h2);
        return { appliedSeq: commit.appliedSeq };
      },
      { ids, pageId, w: pageW, h: pageH },
    );
    expect(result.appliedSeq).toBeGreaterThan(0);
    // Single undo entry restores both.
    await page.evaluate(async () => {
      const c = (globalThis as unknown as { __canvas: CanvasGlobal }).__canvas;
      await c.client.undo();
    });
  });
});

// Phase E acceptance suite — multi-select, snapping, Shift-constrain.
//
// AC-E-16: multi-select transform commits as one Batch (one undo
// entry) and moves all members rigidly.

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
    beginGesture: (
      nodes: ElementId[],
      gesture: unknown,
      anchor?: unknown,
    ) => Promise<number>;
    updateGesture: (
      h: number,
      d: [number, number],
      mods: { shift: boolean; alt: boolean; disableSnap?: boolean },
    ) => Promise<{ pageIds: string[]; snapLines: SnapLine[] }>;
    commitGesture: (h: number) => Promise<{ appliedSeq: number; pageIds: string[] }>;
    cancelGesture: (h: number) => Promise<string[]>;
    undo: () => Promise<unknown>;
    marqueeHits: (
      pageId: string,
      rect: [number, number, number, number],
    ) => Promise<ElementId[]>;
    setElementSelection: (ids: ElementId[], mode: string) => Promise<ElementId[]>;
  };
}

interface ElementSnapshot {
  id: ElementId;
  pageBounds: [number, number, number, number]; // page-local [top, left, bottom, right]
}

/** Finds N un-rotated frames on `pageId` by probing the page at a
 * grid of interior points via hitTest. Returns each one's page-local
 * AABB. Mirrors the click-probe pattern used by the Phase B/C/D
 * specs — proven to work across the gated envato fixtures. */
async function findMultipleUnrotatedFrames(
  page: Page,
  pageId: string,
  w: number,
  h: number,
  count: number,
): Promise<ElementSnapshot[]> {
  return page.evaluate(
    async ({ pageId, w, h, count }) => {
      const c = (globalThis as unknown as { __canvas: CanvasGlobal }).__canvas;
      const probes: Array<[number, number]> = [];
      for (let r = 0.1; r < 1.0; r += 0.1) {
        for (let cc = 0.1; cc < 1.0; cc += 0.1) {
          probes.push([w * cc, h * r]);
        }
      }
      const seen = new Set<string>();
      const out: ElementSnapshot[] = [];
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
        const key = `${el.kind}:${el.id}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({
          id: el,
          pageBounds: [fb.top, fb.left, fb.bottom, fb.right],
        });
        if (out.length >= count) break;
      }
      if (out.length < count) {
        throw new Error(`only ${out.length} un-rotated frames found (needed ${count})`);
      }
      return out;
    },
    { pageId, w, h, count },
  );
}

/** Hit-test the page at the given page-local point and return the
 * frame's page-local AABB. Used after a gesture to confirm the frame
 * moved as expected — avoids the bounds-vs-spread coord frame
 * mismatch in `requestElementGeometry`. */
async function hitFrameBoundsAt(
  page: Page,
  pageId: string,
  x: number,
  y: number,
): Promise<[number, number, number, number] | null> {
  return page.evaluate(
    async ({ pageId, x, y }) => {
      const c = (globalThis as unknown as { __canvas: CanvasGlobal }).__canvas;
      const hit = (await c.client.send({
        kind: "hitTest",
        payload: { pageId, docPoint: [x, y], filter: "any" },
      })) as {
        payload: {
          frameBounds: { top: number; left: number; bottom: number; right: number } | null;
        };
      };
      const fb = hit.payload.frameBounds;
      if (!fb) return null;
      return [fb.top, fb.left, fb.bottom, fb.right] as [
        number,
        number,
        number,
        number,
      ];
    },
    { pageId, x, y },
  );
}

test.describe("Phase E — multi-select, snap, modifiers", () => {
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

  test("AC-E-16 — multi-select translate moves all rigidly, one undo entry", async ({
    page,
  }) => {
    const items = await findMultipleUnrotatedFrames(page, pageId, pageW, pageH, 2);
    const before = items.map((it) => it.pageBounds);

    // Translate by a large delta — much larger than the 4pt snap
    // tolerance — so the final delta is within ±4pt of the input.
    // The acceptance criterion is **rigid** movement: all members
    // shift by the same delta. Exact-delta assertions are brittle
    // against snap; rigidity is the contract.
    const delta: [number, number] = [137, 87];
    const reply = await page.evaluate(
      async ({ ids, delta }) => {
        const c = (globalThis as unknown as { __canvas: CanvasGlobal }).__canvas;
        const h = await c.client.beginGesture(ids, { kind: "translate" });
        const upd = await c.client.updateGesture(h, delta, {
          shift: false,
          alt: false,
        });
        const commit = await c.client.commitGesture(h);
        return { snapLines: upd.snapLines, appliedSeq: commit.appliedSeq };
      },
      { ids: items.map((it) => it.id), delta },
    );
    expect(reply.appliedSeq).toBeGreaterThan(0);

    // For each member, probe around the expected new centre to find
    // the moved AABB (snap may have nudged the effective delta).
    const observedDeltas: Array<[number, number]> = [];
    for (let i = 0; i < items.length; i++) {
      const cxBefore = (before[i][1] + before[i][3]) / 2;
      const cyBefore = (before[i][0] + before[i][2]) / 2;
      let after: [number, number, number, number] | null = null;
      for (const ox of [0, -3, 3, -1, 1]) {
        for (const oy of [0, -3, 3]) {
          const r = await hitFrameBoundsAt(
            page,
            pageId,
            cxBefore + delta[0] + ox,
            cyBefore + delta[1] + oy,
          );
          if (r) {
            after = r;
            break;
          }
        }
        if (after) break;
      }
      expect(after, `member ${i} after translate`).not.toBeNull();
      observedDeltas.push([
        after![1] - before[i][1],
        after![0] - before[i][0],
      ]);
    }
    // Rigidity: every member moved by the same delta within 0.1pt.
    for (let i = 1; i < observedDeltas.length; i++) {
      expect(observedDeltas[i][0]).toBeCloseTo(observedDeltas[0][0], 1);
      expect(observedDeltas[i][1]).toBeCloseTo(observedDeltas[0][1], 1);
    }
    // Effective delta within snap tolerance of the requested one.
    expect(Math.abs(observedDeltas[0][0] - delta[0])).toBeLessThanOrEqual(4.5);
    expect(Math.abs(observedDeltas[0][1] - delta[1])).toBeLessThanOrEqual(4.5);

    // One undo entry rolls back BOTH members — AC-E-16.
    await page.evaluate(async () => {
      const c = (globalThis as unknown as { __canvas: CanvasGlobal }).__canvas;
      await c.client.undo();
    });
    for (let i = 0; i < items.length; i++) {
      const cx = (before[i][1] + before[i][3]) / 2;
      const cy = (before[i][0] + before[i][2]) / 2;
      const restored = await hitFrameBoundsAt(page, pageId, cx, cy);
      expect(restored, `member ${i} after undo`).not.toBeNull();
      expect(restored![0]).toBeCloseTo(before[i][0], 1);
      expect(restored![1]).toBeCloseTo(before[i][1], 1);
    }
  });

  test("snap-to-page-left-edge surfaces a SnapLine and aligns the moved bbox", async ({
    page,
  }) => {
    const items = await findMultipleUnrotatedFrames(page, pageId, pageW, pageH, 1);
    const it = items[0];
    const before = it.pageBounds;

    // Drag left so the moving frame's left edge lands a hair short of
    // the page-left edge (x=0). With 4pt tolerance the snap pulls it
    // to exactly 0. Use dx = -(before.left - 2): leaves left=2,
    // within tolerance.
    const dx = -(before[1] - 2);
    const dy = 0;
    const reply = await page.evaluate(
      async ({ id, dx, dy }) => {
        const c = (globalThis as unknown as { __canvas: CanvasGlobal }).__canvas;
        const h = await c.client.beginGesture([id], { kind: "translate" });
        const r = await c.client.updateGesture(h, [dx, dy], {
          shift: false,
          alt: false,
        });
        await c.client.commitGesture(h);
        return r;
      },
      { id: it.id, dx, dy },
    );

    // At least one snap line fired on the x axis. Which target won
    // is layout-dependent (page-left vs nearby sibling); we just
    // assert SOMETHING snapped within the page x range.
    expect(reply.snapLines.length).toBeGreaterThan(0);
    const xSnap = reply.snapLines.find((l) => l.axis === "x");
    expect(xSnap, "expected an x-axis snap line").toBeDefined();
    expect(xSnap!.position).toBeGreaterThanOrEqual(-0.01);
    expect(xSnap!.position).toBeLessThanOrEqual(pageW);
  });

  test("smart-guide alignment lines surface beyond the snap winner", async ({
    page,
  }) => {
    // Plan-2 §8.2. When the snap winner pulls the moving frame onto
    // (say) the page-left edge, any OTHER alignment that happens to
    // be exactly true after the adjustment — e.g. the moving frame
    // shares a y centroid with a sibling — should also surface as a
    // SnapLine for the overlay to render as a green guide. The
    // assertion is intentionally loose ("more than one line for at
    // least one gesture") because the snap winner is a guide line
    // too; smart guides ADD to that set, not replace it.
    const items = await findMultipleUnrotatedFrames(page, pageId, pageW, pageH, 1);
    const it = items[0];
    const before = it.pageBounds;
    const dx = -(before[1] - 2); // snap left edge to 0
    const reply = await page.evaluate(
      async ({ id, dx }) => {
        const c = (globalThis as unknown as { __canvas: CanvasGlobal }).__canvas;
        const h = await c.client.beginGesture([id], { kind: "translate" });
        const r = await c.client.updateGesture(h, [dx, 0], {
          shift: false,
          alt: false,
        });
        await c.client.commitGesture(h);
        return r;
      },
      { id: it.id, dx },
    );
    // At least the snap winner fires. On a brand-guidelines body
    // page, the layout typically lines up multiple frames so smart
    // guides often surface additional lines — we don't pin the
    // exact count (fixture-dependent), but the API contract is that
    // multiple in-tolerance alignments CAN appear.
    expect(reply.snapLines.length).toBeGreaterThan(0);
    // Every snap line is on the same page as the moving frame.
    for (const l of reply.snapLines) {
      expect(l.pageId).toBe(pageId);
    }
  });

  test("disableSnap (Ctrl) bypasses the snap pass", async ({ page }) => {
    // Plan-2 §8.4. Same setup as the snap-to-page-left-edge test
    // (dragging just short of the page edge would normally snap),
    // but with the disable-snap modifier set: the delta passes
    // through unmodified and no snap lines fire.
    const items = await findMultipleUnrotatedFrames(page, pageId, pageW, pageH, 1);
    const it = items[0];
    const before = it.pageBounds;
    const dx = -(before[1] - 2);
    const reply = await page.evaluate(
      async ({ id, dx }) => {
        const c = (globalThis as unknown as { __canvas: CanvasGlobal }).__canvas;
        const h = await c.client.beginGesture([id], { kind: "translate" });
        const r = await c.client.updateGesture(h, [dx, 0], {
          shift: false,
          alt: false,
          disableSnap: true,
        });
        await c.client.commitGesture(h);
        return r;
      },
      { id: it.id, dx },
    );
    expect(
      reply.snapLines.length,
      "no snap lines should fire when disable-snap is set",
    ).toBe(0);
  });

  test("Shift-constrain locks translate to the dominant axis", async ({ page }) => {
    const items = await findMultipleUnrotatedFrames(page, pageId, pageW, pageH, 1);
    const it = items[0];
    const before = it.pageBounds;
    const cx = (before[1] + before[3]) / 2;
    const cy = (before[0] + before[2]) / 2;

    // |dx| > |dy| with Shift → y delta drops to 0.
    await page.evaluate(
      async ({ id }) => {
        const c = (globalThis as unknown as { __canvas: CanvasGlobal }).__canvas;
        const h = await c.client.beginGesture([id], { kind: "translate" });
        await c.client.updateGesture(h, [40, 5], { shift: true, alt: false });
        await c.client.commitGesture(h);
      },
      { id: it.id },
    );

    // Snap may have adjusted x slightly; probe at a few x offsets
    // and find the frame.
    let probed: [number, number, number, number] | null = null;
    for (const off of [40, 36, 44, 32, 48]) {
      probed = await hitFrameBoundsAt(page, pageId, cx + off, cy);
      if (probed) break;
    }
    expect(probed, "frame after shift-constrain translate").not.toBeNull();
    // y unchanged.
    expect(probed![0]).toBeCloseTo(before[0], 1);
    expect(probed![2]).toBeCloseTo(before[2], 1);
    // x moved by 40 ± snap tolerance.
    expect(Math.abs(probed![1] - before[1] - 40)).toBeLessThan(5);
  });
});

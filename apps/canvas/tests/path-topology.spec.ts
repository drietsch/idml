// Track J — path-topology acceptance suite (J.6).
//
// Coverage of the live ops (J.5a):
//   AC-J-2  delete shrinks the anchor count; remaining anchors stay put
//   AC-J-3  curve-type toggle: corner → smooth derives handles; smooth
//           → corner collapses them
//   AC-J-4  compound paths — subpath_starts stays correct after a
//           delete that doesn't collapse a subpath
//   AC-J-5  undo round-trips every op bytewise (anchors + subpath_starts)
//
// AC-J-1 (insert preserves visible shape) and the subpath-collapse arm
// of AC-J-4 wait on J.5b (segment hit zones + curve-preserving Batch).
//
// Fixture: corpus/generated/geometry-groups.idml carries Polygon
// `u0f396d` on the "compound-path · square-with-hole" page — 8
// anchors split across 2 subpaths (outer square 0..3, inner hole
// 4..7). Real compound geometry; matches AC-J-4.

import { dirname, resolve as pathResolve } from "node:path";
import { fileURLToPath } from "node:url";
import { test, expect, type Page } from "@playwright/test";

import { openCanvas, loadIdml } from "./fidelity/canvas-driver";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = pathResolve(__dirname, "..", "..", "..");

const FIXTURE = `${REPO_ROOT}/corpus/generated/geometry-groups.idml`;
const POLYGON_ID = "u0f396d"; // square-with-hole; 8 anchors, 2 subpaths

type ElementId =
  | { kind: "polygon"; id: string }
  | { kind: "textFrame"; id: string }
  | { kind: "rectangle"; id: string }
  | { kind: "oval"; id: string }
  | { kind: "graphicLine"; id: string }
  | { kind: "group"; id: string };

type PathAnchorTriple = {
  anchor: [number, number];
  left: [number, number];
  right: [number, number];
};

interface PathAnchorsResult {
  pageId: string;
  itemTransform: [number, number, number, number, number, number] | null;
  anchors: PathAnchorTriple[];
  subpathStarts: number[];
}

interface CanvasGlobal {
  client: {
    send: (msg: unknown) => Promise<unknown>;
    pathAnchors: (id: ElementId) => Promise<PathAnchorsResult | null>;
    mutate: (mutation: unknown) => Promise<unknown>;
    undo: () => Promise<unknown>;
  };
}

async function pathSnapshot(page: Page): Promise<PathAnchorsResult> {
  const snap = await page.evaluate(
    async ({ polygonId }) => {
      const c = (globalThis as unknown as { __canvas: CanvasGlobal }).__canvas;
      return c.client.pathAnchors({ kind: "polygon", id: polygonId });
    },
    { polygonId: POLYGON_ID },
  );
  if (!snap) throw new Error(`pathAnchors returned null for ${POLYGON_ID}`);
  return snap;
}

function anchorsClose(
  a: PathAnchorTriple,
  b: PathAnchorTriple,
  eps = 1e-3,
): boolean {
  const close = (x: number, y: number) => Math.abs(x - y) < eps;
  return (
    close(a.anchor[0], b.anchor[0]) &&
    close(a.anchor[1], b.anchor[1]) &&
    close(a.left[0], b.left[0]) &&
    close(a.left[1], b.left[1]) &&
    close(a.right[0], b.right[0]) &&
    close(a.right[1], b.right[1])
  );
}

test.describe("Track J — path topology acceptance", () => {
  test.beforeEach(async ({ page }) => {
    await openCanvas(page);
    await loadIdml(page, FIXTURE);
  });

  test("AC-J-2 — delete shrinks anchor count; remaining anchors unchanged", async ({
    page,
  }) => {
    const before = await pathSnapshot(page);
    expect(before.anchors.length).toBe(8);
    expect(before.subpathStarts).toEqual([0, 4]);

    // Remove index 1 (one of the outer-square corners).
    await page.evaluate(
      async ({ polygonId }) => {
        const c = (globalThis as unknown as { __canvas: CanvasGlobal }).__canvas;
        await c.client.mutate({
          op: "pathPointRemove",
          args: { polygonId, index: 1 },
        });
      },
      { polygonId: POLYGON_ID },
    );

    const after = await pathSnapshot(page);
    expect(after.anchors.length).toBe(7);
    // Anchors with original indices [0, 2, 3, 4, 5, 6, 7] now sit at
    // [0, 1, 2, 3, 4, 5, 6]. Verify the un-touched ones unchanged.
    for (let i = 0; i < 6; i++) {
      const original = before.anchors[i < 1 ? i : i + 1];
      expect(anchorsClose(after.anchors[i], original)).toBe(true);
    }
    // The removed corner is gone.
    expect(after.anchors.length).toBe(before.anchors.length - 1);
  });

  test("AC-J-3 — corner → smooth derives handles; smooth → corner collapses", async ({
    page,
  }) => {
    const before = await pathSnapshot(page);
    // All 8 fixture anchors start as corners (handles == anchor).
    for (const a of before.anchors) {
      expect(Math.hypot(a.left[0] - a.anchor[0], a.left[1] - a.anchor[1])).toBeLessThan(
        1e-3,
      );
      expect(Math.hypot(a.right[0] - a.anchor[0], a.right[1] - a.anchor[1])).toBeLessThan(
        1e-3,
      );
    }

    // Toggle index 1 to smooth — interior anchor of the outer
    // square, so it has both prev (0) and next (2) within the
    // same subpath. The derivation should produce non-trivial
    // (non-zero) handle offsets.
    await page.evaluate(
      async ({ polygonId }) => {
        const c = (globalThis as unknown as { __canvas: CanvasGlobal }).__canvas;
        await c.client.mutate({
          op: "pathPointCurveType",
          args: { polygonId, index: 1, smooth: true },
        });
      },
      { polygonId: POLYGON_ID },
    );

    const smooth = await pathSnapshot(page);
    const a1 = smooth.anchors[1];
    // Handles should no longer coincide with the anchor.
    expect(
      Math.hypot(a1.left[0] - a1.anchor[0], a1.left[1] - a1.anchor[1]),
    ).toBeGreaterThan(0.5);
    expect(
      Math.hypot(a1.right[0] - a1.anchor[0], a1.right[1] - a1.anchor[1]),
    ).toBeGreaterThan(0.5);

    // Toggle back to corner — handles collapse to the anchor.
    await page.evaluate(
      async ({ polygonId }) => {
        const c = (globalThis as unknown as { __canvas: CanvasGlobal }).__canvas;
        await c.client.mutate({
          op: "pathPointCurveType",
          args: { polygonId, index: 1, smooth: false },
        });
      },
      { polygonId: POLYGON_ID },
    );

    const corner = await pathSnapshot(page);
    const a1c = corner.anchors[1];
    expect(
      Math.hypot(a1c.left[0] - a1c.anchor[0], a1c.left[1] - a1c.anchor[1]),
    ).toBeLessThan(1e-3);
    expect(
      Math.hypot(a1c.right[0] - a1c.anchor[0], a1c.right[1] - a1c.anchor[1]),
    ).toBeLessThan(1e-3);
  });

  test("AC-J-4 — compound paths keep subpath_starts after non-collapsing delete", async ({
    page,
  }) => {
    const before = await pathSnapshot(page);
    expect(before.subpathStarts).toEqual([0, 4]);

    // Remove index 5 (one of the inner-hole corners; subpath 1 still
    // has 3 anchors after, so it doesn't collapse).
    await page.evaluate(
      async ({ polygonId }) => {
        const c = (globalThis as unknown as { __canvas: CanvasGlobal }).__canvas;
        await c.client.mutate({
          op: "pathPointRemove",
          args: { polygonId, index: 5 },
        });
      },
      { polygonId: POLYGON_ID },
    );

    const after = await pathSnapshot(page);
    expect(after.anchors.length).toBe(7);
    // Outer subpath start unchanged (entries below the remove
    // index don't shift); inner subpath start unchanged because
    // index 5 > start[1]=4 — only entries strictly greater than 5
    // would have decremented.
    expect(after.subpathStarts).toEqual([0, 4]);
  });

  test("AC-J-5 — undo round-trips delete bytewise", async ({ page }) => {
    const before = await pathSnapshot(page);

    await page.evaluate(
      async ({ polygonId }) => {
        const c = (globalThis as unknown as { __canvas: CanvasGlobal }).__canvas;
        await c.client.mutate({
          op: "pathPointRemove",
          args: { polygonId, index: 2 },
        });
      },
      { polygonId: POLYGON_ID },
    );
    expect((await pathSnapshot(page)).anchors.length).toBe(7);

    await page.evaluate(async () => {
      const c = (globalThis as unknown as { __canvas: CanvasGlobal }).__canvas;
      await c.client.undo();
    });

    const after = await pathSnapshot(page);
    expect(after.anchors.length).toBe(before.anchors.length);
    expect(after.subpathStarts).toEqual(before.subpathStarts);
    for (let i = 0; i < before.anchors.length; i++) {
      expect(anchorsClose(after.anchors[i], before.anchors[i])).toBe(true);
    }
  });

  test("AC-J-5 — undo round-trips curve-type toggle bytewise", async ({
    page,
  }) => {
    const before = await pathSnapshot(page);

    await page.evaluate(
      async ({ polygonId }) => {
        const c = (globalThis as unknown as { __canvas: CanvasGlobal }).__canvas;
        await c.client.mutate({
          op: "pathPointCurveType",
          args: { polygonId, index: 2, smooth: true },
        });
      },
      { polygonId: POLYGON_ID },
    );
    // Smooth must have changed at least one handle.
    const mid = await pathSnapshot(page);
    expect(anchorsClose(mid.anchors[2], before.anchors[2])).toBe(false);

    await page.evaluate(async () => {
      const c = (globalThis as unknown as { __canvas: CanvasGlobal }).__canvas;
      await c.client.undo();
    });

    const after = await pathSnapshot(page);
    expect(anchorsClose(after.anchors[2], before.anchors[2])).toBe(true);
  });
});

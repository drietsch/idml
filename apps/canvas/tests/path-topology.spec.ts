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
  subpathOpen?: boolean[];
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
          args: { elementId: { kind: "polygon", id: polygonId }, index: 1 },
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
          args: { elementId: { kind: "polygon", id: polygonId }, index: 1, smooth: true },
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
          args: { elementId: { kind: "polygon", id: polygonId }, index: 1, smooth: false },
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
          args: { elementId: { kind: "polygon", id: polygonId }, index: 5 },
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
          args: { elementId: { kind: "polygon", id: polygonId }, index: 2 },
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

  test("AC-J-1 — insert preserves visible shape via de Casteljau split", async ({
    page,
  }) => {
    // The fixture's outer square has corner anchors with zero-length
    // handles, so a split would produce identical handles (sharp
    // corner subdivides into sharp corner). To make AC-J-1
    // meaningful we first smooth one corner (so its outgoing handle
    // becomes non-trivial) and THEN split the segment that anchor
    // starts. Verifies that the new mid-anchor lands on the cubic
    // and that the inverse round-trips both the handle update + the
    // insert.
    await page.evaluate(
      async ({ polygonId }) => {
        const c = (globalThis as unknown as { __canvas: CanvasGlobal }).__canvas;
        await c.client.mutate({
          op: "pathPointCurveType",
          args: { elementId: { kind: "polygon", id: polygonId }, index: 0, smooth: true },
        });
      },
      { polygonId: POLYGON_ID },
    );
    const before = await pathSnapshot(page);
    expect(before.anchors.length).toBe(8);

    // Pick the segment between anchors[0] and anchors[1] (outer
    // square top edge after smoothing). Compute the cubic
    // evaluation at t=0.4 to know where the inserted anchor
    // should land.
    const a0 = before.anchors[0];
    const a1 = before.anchors[1];
    const tEval = 0.4;
    const u = 1 - tEval;
    const w = [u * u * u, 3 * u * u * tEval, 3 * u * tEval * tEval, tEval ** 3];
    const expectedMid: [number, number] = [
      w[0] * a0.anchor[0] +
        w[1] * a0.right[0] +
        w[2] * a1.left[0] +
        w[3] * a1.anchor[0],
      w[0] * a0.anchor[1] +
        w[1] * a0.right[1] +
        w[2] * a1.left[1] +
        w[3] * a1.anchor[1],
    ];

    // Dispatch a curve-preserving Batch matching what the overlay
    // would produce for a click at t=0.4 on this segment.
    // Compute the split's three results inline so the spec
    // exercises the same math the overlay does.
    const lerp = (a: [number, number], b: [number, number], t: number): [number, number] => [
      a[0] + t * (b[0] - a[0]),
      a[1] + t * (b[1] - a[1]),
    ];
    const q0 = lerp(a0.anchor, a0.right, tEval);
    const q1 = lerp(a0.right, a1.left, tEval);
    const q2 = lerp(a1.left, a1.anchor, tEval);
    const r0 = lerp(q0, q1, tEval);
    const r1 = lerp(q1, q2, tEval);
    const mid = lerp(r0, r1, tEval);

    await page.evaluate(
      async ({ polygonId, q0, q2, r0, mid, r1 }) => {
        const c = (globalThis as unknown as { __canvas: CanvasGlobal }).__canvas;
        await c.client.mutate({
          op: "batch",
          args: {
            ops: [
              {
                op: "pathPointSet",
                args: { elementId: { kind: "polygon", id: polygonId }, index: 0, role: "right", position: q0 },
              },
              {
                op: "pathPointSet",
                args: { elementId: { kind: "polygon", id: polygonId }, index: 1, role: "left", position: q2 },
              },
              {
                op: "pathPointInsert",
                args: {
                  elementId: { kind: "polygon", id: polygonId },
                  index: 1,
                  anchor: { anchor: mid, left: r0, right: r1 },
                },
              },
            ],
          },
        });
      },
      { polygonId: POLYGON_ID, q0, q2, r0, mid, r1 },
    );

    const after = await pathSnapshot(page);
    // Anchor count grew by 1 and the new anchor sits at index 1.
    expect(after.anchors.length).toBe(9);
    // New mid anchor matches the cubic evaluation at t=0.4 — the
    // strict shape-preservation invariant.
    expect(Math.abs(after.anchors[1].anchor[0] - expectedMid[0])).toBeLessThan(1e-3);
    expect(Math.abs(after.anchors[1].anchor[1] - expectedMid[1])).toBeLessThan(1e-3);
    // subpath_starts shifted: outer subpath grew, inner-hole start
    // bumped from 4 to 5.
    expect(after.subpathStarts).toEqual([0, 5]);
    // Segment-start's right handle is now q0; segment-end's left is q2.
    expect(Math.abs(after.anchors[0].right[0] - q0[0])).toBeLessThan(1e-3);
    expect(Math.abs(after.anchors[0].right[1] - q0[1])).toBeLessThan(1e-3);
    expect(Math.abs(after.anchors[2].left[0] - q2[0])).toBeLessThan(1e-3);
    expect(Math.abs(after.anchors[2].left[1] - q2[1])).toBeLessThan(1e-3);

    // AC-J-5: single Cmd-Z undoes the whole batch.
    await page.evaluate(async () => {
      const c = (globalThis as unknown as { __canvas: CanvasGlobal }).__canvas;
      await c.client.undo();
    });
    const restored = await pathSnapshot(page);
    expect(restored.anchors.length).toBe(8);
    expect(restored.subpathStarts).toEqual([0, 4]);
    for (let i = 0; i < before.anchors.length; i++) {
      expect(anchorsClose(restored.anchors[i], before.anchors[i])).toBe(true);
    }
  });

  test("AC-J-1 closing edge — insert on wraparound segment lands inside prior subpath", async ({
    page,
  }) => {
    // Closing-edge follow-up. The outer-square subpath [0..4) is
    // closed; its wraparound segment runs from anchors[3] back to
    // anchors[0]. A click on it should insert a new anchor at flat
    // index 4 (= subpath_starts[1]), staying inside subpath 0 — the
    // overlay's `prevSubpathStarts` override is what keeps the
    // boundary entry from claiming the new anchor for subpath 1.
    const before = await pathSnapshot(page);
    expect(before.anchors.length).toBe(8);
    expect(before.subpathStarts).toEqual([0, 4]);
    // Both subpaths of square-with-hole are closed.
    expect(before.subpathOpen).toEqual([false, false]);

    // Smooth anchors[0] and anchors[3] so the closing curve has
    // non-trivial control points — without this the corner→corner
    // closing edge is a straight line and the split is uninformative
    // (every t produces the same midpoint).
    for (const idx of [0, 3]) {
      await page.evaluate(
        async ({ polygonId, idx }) => {
          const c = (globalThis as unknown as { __canvas: CanvasGlobal }).__canvas;
          await c.client.mutate({
            op: "pathPointCurveType",
            args: { elementId: { kind: "polygon", id: polygonId }, index: idx, smooth: true },
          });
        },
        { polygonId: POLYGON_ID, idx },
      );
    }
    const smoothed = await pathSnapshot(page);
    // Recompute the split at t=0.5 against the *smoothed* anchors.
    const a3 = smoothed.anchors[3]; // segment start
    const a0 = smoothed.anchors[0]; // segment end (wraparound)
    const tEval = 0.5;
    const lerp = (
      a: [number, number],
      b: [number, number],
      t: number,
    ): [number, number] => [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])];
    const q0 = lerp(a3.anchor, a3.right, tEval);
    const q1 = lerp(a3.right, a0.left, tEval);
    const q2 = lerp(a0.left, a0.anchor, tEval);
    const r0 = lerp(q0, q1, tEval);
    const r1 = lerp(q1, q2, tEval);
    const mid = lerp(r0, r1, tEval);

    // Closing-edge dispatch: insertIdx = 4 (subEnd of subpath 0),
    // prevSubpathStarts = [0, 5] so the boundary entry shifts +1.
    await page.evaluate(
      async ({ polygonId, q0, q2, r0, mid, r1 }) => {
        const c = (globalThis as unknown as { __canvas: CanvasGlobal }).__canvas;
        await c.client.mutate({
          op: "batch",
          args: {
            ops: [
              {
                op: "pathPointSet",
                args: { elementId: { kind: "polygon", id: polygonId }, index: 3, role: "right", position: q0 },
              },
              {
                op: "pathPointSet",
                args: { elementId: { kind: "polygon", id: polygonId }, index: 0, role: "left", position: q2 },
              },
              {
                op: "pathPointInsert",
                args: {
                  elementId: { kind: "polygon", id: polygonId },
                  index: 4,
                  anchor: { anchor: mid, left: r0, right: r1 },
                  prevSubpathStarts: [0, 5],
                },
              },
            ],
          },
        });
      },
      { polygonId: POLYGON_ID, q0, q2, r0, mid, r1 },
    );

    const after = await pathSnapshot(page);
    expect(after.anchors.length).toBe(9);
    // The new anchor lives at flat index 4 — last anchor of subpath 0,
    // not first of subpath 1.
    expect(after.subpathStarts).toEqual([0, 5]);
    expect(Math.abs(after.anchors[4].anchor[0] - mid[0])).toBeLessThan(1e-3);
    expect(Math.abs(after.anchors[4].anchor[1] - mid[1])).toBeLessThan(1e-3);
    // Inner-hole subpath shifted by 1 but otherwise unchanged.
    for (let i = 0; i < 4; i++) {
      expect(anchorsClose(after.anchors[5 + i], smoothed.anchors[4 + i])).toBe(true);
    }

    // Single undo reverts the whole batch (insert + both handle sets).
    await page.evaluate(async () => {
      const c = (globalThis as unknown as { __canvas: CanvasGlobal }).__canvas;
      await c.client.undo();
    });
    const restored = await pathSnapshot(page);
    expect(restored.anchors.length).toBe(8);
    expect(restored.subpathStarts).toEqual([0, 4]);
    for (let i = 0; i < smoothed.anchors.length; i++) {
      expect(anchorsClose(restored.anchors[i], smoothed.anchors[i])).toBe(true);
    }
  });

  test("Track J fan-out — PathPointRemove + curve-type toggle accept a TextFrame", async ({
    page,
  }) => {
    // The page-0 label text frame in geometry-groups.idml is a
    // rectangular text frame with 4 anchors (its PathGeometry
    // outline). The fan-out apply layer accepts the same
    // PathPointRemove / PathPointCurveType mutations against a
    // TextFrame element id that it already accepted against a
    // Polygon, sharing the helper that locates the anchors vec.
    const TEXT_FRAME_ID = "ua365e1";
    const before = await page.evaluate(
      async ({ id }) => {
        const c = (globalThis as unknown as { __canvas: CanvasGlobal }).__canvas;
        return c.client.pathAnchors({ kind: "textFrame", id });
      },
      { id: TEXT_FRAME_ID },
    );
    if (!before) throw new Error("text frame has no path anchors");
    expect(before.anchors.length).toBe(4);

    // Remove anchor index 1 via the generic wire shape.
    await page.evaluate(
      async ({ id }) => {
        const c = (globalThis as unknown as { __canvas: CanvasGlobal }).__canvas;
        await c.client.mutate({
          op: "pathPointRemove",
          args: { elementId: { kind: "textFrame", id }, index: 1 },
        });
      },
      { id: TEXT_FRAME_ID },
    );

    const after = await page.evaluate(
      async ({ id }) => {
        const c = (globalThis as unknown as { __canvas: CanvasGlobal }).__canvas;
        return c.client.pathAnchors({ kind: "textFrame", id });
      },
      { id: TEXT_FRAME_ID },
    );
    if (!after) throw new Error("text frame anchors lost after remove");
    expect(after.anchors.length).toBe(3);

    // Curve-type toggle also works on the TextFrame — exercise the
    // second fan-out arm before undoing both.
    await page.evaluate(
      async ({ id }) => {
        const c = (globalThis as unknown as { __canvas: CanvasGlobal }).__canvas;
        await c.client.mutate({
          op: "pathPointCurveType",
          args: { elementId: { kind: "textFrame", id }, index: 1, smooth: true },
        });
      },
      { id: TEXT_FRAME_ID },
    );

    // Undo both ops; the remove inverse round-trips to 4 anchors.
    await page.evaluate(async () => {
      const c = (globalThis as unknown as { __canvas: CanvasGlobal }).__canvas;
      await c.client.undo();
      await c.client.undo();
    });
    const restored = await page.evaluate(
      async ({ id }) => {
        const c = (globalThis as unknown as { __canvas: CanvasGlobal }).__canvas;
        return c.client.pathAnchors({ kind: "textFrame", id });
      },
      { id: TEXT_FRAME_ID },
    );
    if (!restored) throw new Error("text frame anchors lost after undo");
    expect(restored.anchors.length).toBe(4);
    for (let i = 0; i < 4; i++) {
      expect(anchorsClose(restored.anchors[i], before.anchors[i])).toBe(true);
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
          args: { elementId: { kind: "polygon", id: polygonId }, index: 2, smooth: true },
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

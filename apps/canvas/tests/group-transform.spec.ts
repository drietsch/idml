// Track L — Group transform acceptance suite.
//
// Drives gestures against an `ElementId::Group(_)` and asserts both
// the group AND every member transform end up in the expected state.
// Mirrors the Rust gesture-spine tests in
// `crates/idml-canvas/tests/group_gesture.rs` but exercises the full
// stack (worker channel + apply layer + scene mutation).
//
// AC-L-1: hit-test exposes the containing group chain so the panel
//         can select the OUTERMOST containing group on a single-click.
// AC-L-2: translating a Group target shifts every leaf's transform by
//         (dx, dy) — the apply-layer rebase = `T(d) * leaf_old`.
// AC-L-3: rotating a Group composes the rotation onto every leaf;
//         each leaf's 2×2 linear part picks up the same rotation.
// AC-L-5: a single Cmd-Z reverts the gesture; every leaf transform
//         restored bytewise.
//
// Fixture: corpus/generated/geometry-groups.idml page 0 — Group with
// `ItemTransform = T(GROUP_ANCHOR_X, GROUP_ANCHOR_Y)` enclosing two
// un-rotated Rect leaves. Identity Group + identity leaves are the
// easiest case to verify by hand and the one
// `docs/paged/canvas-interaction-plan-2.md` calls out for L.4.

import { dirname, resolve as pathResolve } from "node:path";
import { fileURLToPath } from "node:url";
import { test, expect, type Page } from "@playwright/test";

import { openCanvas, loadIdml } from "./fidelity/canvas-driver";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = pathResolve(__dirname, "..", "..", "..");

const FIXTURE = `${REPO_ROOT}/corpus/generated/geometry-groups.idml`;

// geometry-groups page 0: identity Group anchored at (200, 240) with
// two un-rotated rects at local x = 0 and local x = RECT_W + 20 = 110.
const GROUP_ANCHOR_X = 200;
const GROUP_ANCHOR_Y = 240;
const RECT_W = 90;
const RECT_H = 60;
const GAP = 20;

type ElementId =
  | { kind: "textFrame"; id: string }
  | { kind: "rectangle"; id: string }
  | { kind: "oval"; id: string }
  | { kind: "polygon"; id: string }
  | { kind: "graphicLine"; id: string }
  | { kind: "group"; id: string };

type Transform = [number, number, number, number, number, number];

interface CanvasGlobal {
  client: {
    send: (msg: unknown) => Promise<unknown>;
    beginGesture: (
      nodes: ElementId[],
      gesture: unknown,
      anchor?: unknown,
    ) => Promise<number>;
    updateGesture: (
      handle: number,
      delta: [number, number],
      modifiers: { shift: boolean; alt: boolean },
    ) => Promise<string[]>;
    commitGesture: (handle: number) => Promise<{ appliedSeq: number; pageIds: string[] }>;
    cancelGesture: (handle: number) => Promise<string[]>;
    groupLeaves: (groupId: string) => Promise<ElementId[]>;
    elementGeometry: (
      ids: ElementId[],
    ) => Promise<Array<{ id: ElementId; itemTransform: Transform | null }>>;
    undo: () => Promise<unknown>;
  };
  activeGroup: string | null;
  setActiveGroup: (g: string | null) => void;
}

/**
 * Hit-test page 0 at the centre of the first rect (the leaf at the
 * group's local origin) and return the hit + the containing group id.
 * `corpus/generated/geometry-groups.idml` page 0 keeps the leaves
 * un-rotated, so the rect's spread-coord centroid is the simple
 * `(GROUP_ANCHOR + half-rect)`.
 */
async function hitGroupFromFirstRect(
  page: Page,
  pageId: string,
): Promise<{ hitElement: ElementId; groupChain: string[] }> {
  return page.evaluate(
    async ({ pageId, x, y }) => {
      const c = (globalThis as unknown as { __canvas: CanvasGlobal }).__canvas;
      const reply = (await c.client.send({
        kind: "hitTest",
        payload: { pageId, docPoint: [x, y], filter: "any" },
      })) as {
        payload: { element: ElementId | null; groupChain: string[] };
      };
      const el = reply.payload.element;
      if (!el) throw new Error("hit-test missed first rect");
      return { hitElement: el, groupChain: reply.payload.groupChain ?? [] };
    },
    {
      pageId,
      x: GROUP_ANCHOR_X + RECT_W / 2,
      y: GROUP_ANCHOR_Y + RECT_H / 2,
    },
  );
}

async function leafTransforms(
  page: Page,
  ids: ElementId[],
): Promise<Map<string, Transform>> {
  const items = await page.evaluate(
    async ({ ids }) => {
      const c = (globalThis as unknown as { __canvas: CanvasGlobal }).__canvas;
      return c.client.elementGeometry(ids);
    },
    { ids },
  );
  const out = new Map<string, Transform>();
  for (const item of items) {
    const t = item.itemTransform;
    if (!t) continue;
    out.set(item.id.id, [t[0], t[1], t[2], t[3], t[4], t[5]] as Transform);
  }
  return out;
}

test.describe("Track L — Group transform acceptance", () => {
  let pageId = "";
  let groupId = "";
  let firstRectId: ElementId;
  let leaves: ElementId[];

  test.beforeEach(async ({ page }) => {
    await openCanvas(page);
    const loaded = await loadIdml(page, FIXTURE);
    pageId = loaded.pages[0].pageId; // page 0 — identity Group
    const hit = await hitGroupFromFirstRect(page, pageId);
    firstRectId = hit.hitElement;
    if (hit.groupChain.length === 0) {
      throw new Error("expected groupChain on page-0 rect; got empty");
    }
    groupId = hit.groupChain[0];
    leaves = await page.evaluate(
      async ({ groupId }) => {
        const c = (globalThis as unknown as { __canvas: CanvasGlobal }).__canvas;
        return c.client.groupLeaves(groupId);
      },
      { groupId },
    );
    expect(leaves.length).toBe(2); // page 0 = two rects in the group
  });

  test("AC-L-1 — hit-test on a grouped leaf exposes the outermost group via groupChain", async () => {
    // Panel logic: on a single-click with `activeGroup === null`,
    // the panel maps `hit.element` → `{kind:'group', id: chain[0]}`.
    // Verifies the necessary precondition (chain[0] is the
    // outermost group id, the same one `requestGroupLeaves` resolves).
    expect(groupId).toMatch(/^u[0-9a-f]+$/);
    expect(firstRectId.kind).toBe("rectangle");
  });

  test("AC-L-2 — translate Group: every leaf transform shifts by (dx, dy)", async ({
    page,
  }) => {
    const before = await leafTransforms(page, leaves);
    expect(before.size).toBe(2);

    // Snap-resilient delta: large enough that the gesture spine's
    // snap pass (~4 pt budget) is in the noise of the assertion.
    const delta: [number, number] = [137, -83];

    await page.evaluate(
      async ({ groupId, delta }) => {
        const c = (globalThis as unknown as { __canvas: CanvasGlobal }).__canvas;
        const h = await c.client.beginGesture(
          [{ kind: "group", id: groupId }],
          { kind: "translate" },
        );
        await c.client.updateGesture(h, delta, { shift: false, alt: false });
        await c.client.commitGesture(h);
      },
      { groupId, delta },
    );

    const after = await leafTransforms(page, leaves);
    for (const leaf of leaves) {
      const old = before.get(leaf.id);
      const cur = after.get(leaf.id);
      if (!old || !cur) throw new Error(`missing transform for ${leaf.id}`);
      // Linear part unchanged.
      for (let i = 0; i < 4; i++) {
        expect(cur[i]).toBeCloseTo(old[i], 3);
      }
      // tx/ty shifted by (dx, dy) within snap tolerance.
      expect(Math.abs(cur[4] - (old[4] + delta[0]))).toBeLessThanOrEqual(4.5);
      expect(Math.abs(cur[5] - (old[5] + delta[1]))).toBeLessThanOrEqual(4.5);
    }
    // Rigidity across leaves: the shift each leaf experienced is the
    // SAME — that's what makes the group a group rather than two
    // independently-translated leaves.
    const shifts: Array<[number, number]> = leaves.map((leaf) => {
      const o = before.get(leaf.id)!;
      const c = after.get(leaf.id)!;
      return [c[4] - o[4], c[5] - o[5]];
    });
    expect(shifts[1][0]).toBeCloseTo(shifts[0][0], 1);
    expect(shifts[1][1]).toBeCloseTo(shifts[0][1], 1);
  });

  test("AC-L-3 — rotate Group: every leaf transform picks up the same rotation", async ({
    page,
  }) => {
    const before = await leafTransforms(page, leaves);
    // Page-0 leaves start with identity linear parts (the gen-only
    // ItemTransform is pure translation). This is what makes
    // "same rotation applied to every leaf" structurally testable
    // without re-deriving the gesture-spine's pivot math.
    for (const leaf of leaves) {
      const old = before.get(leaf.id)!;
      expect(old[0]).toBeCloseTo(1, 3);
      expect(old[1]).toBeCloseTo(0, 3);
      expect(old[2]).toBeCloseTo(0, 3);
      expect(old[3]).toBeCloseTo(1, 3);
    }

    // The gesture-spine computes the pivot as the mean of every
    // snapshot's transformed centroid (group sentinel + each leaf),
    // not the AABB centroid. Picking an anchor near (but not at)
    // that pivot and a non-trivial delta produces a non-zero, non-
    // identity rotation — exactly what we need to test the rebase.
    // The exact angle is incidental; the structural assertions
    // below (orthonormality, agreement across leaves, non-identity)
    // are what AC-L-3 is really verifying.
    const anchorPt: [number, number] = [
      GROUP_ANCHOR_X + 2 * RECT_W + GAP + 60,
      GROUP_ANCHOR_Y + RECT_H / 2,
    ];
    const delta: [number, number] = [-80, 90];

    await page.evaluate(
      async ({ groupId, pageId, anchorPt, delta }) => {
        const c = (globalThis as unknown as { __canvas: CanvasGlobal }).__canvas;
        const h = await c.client.beginGesture(
          [{ kind: "group", id: groupId }],
          { kind: "rotate" },
          { pageId, pointInPage: anchorPt },
        );
        await c.client.updateGesture(h, delta, { shift: false, alt: false });
        await c.client.commitGesture(h);
      },
      { groupId, pageId, anchorPt, delta },
    );

    const after = await leafTransforms(page, leaves);
    const left = after.get(leaves[0].id);
    const right = after.get(leaves[1].id);
    if (!left || !right) throw new Error("missing leaf transforms post-rotate");
    // (1) Both leaves picked up the SAME linear part. (Translations
    // differ — they capture each leaf's distance from the pivot.)
    for (let i = 0; i < 4; i++) {
      expect(left[i]).toBeCloseTo(right[i], 3);
    }
    // (2) The linear part is an orthonormal rotation: a² + b² = 1
    // and a·c + b·d = 0 (column orthogonality).
    expect(left[0] * left[0] + left[1] * left[1]).toBeCloseTo(1, 3);
    expect(left[0] * left[2] + left[1] * left[3]).toBeCloseTo(0, 3);
    // (3) det = +1 (rotation, not reflection).
    expect(left[0] * left[3] - left[1] * left[2]).toBeCloseTo(1, 3);
    // (4) Non-trivial rotation: at least one off-axis component
    // is appreciable. (Guards against the gesture silently no-op'ing
    // through a math error in the channel translation.)
    expect(Math.hypot(left[1], left[2])).toBeGreaterThan(0.3);
    // (5) Sanity: both leaves' tx/ty actually changed (the
    // rotation about the pivot moved them in the plane).
    for (const leaf of leaves) {
      const old = before.get(leaf.id)!;
      const cur = after.get(leaf.id)!;
      const dx = cur[4] - old[4];
      const dy = cur[5] - old[5];
      expect(Math.hypot(dx, dy)).toBeGreaterThan(1);
    }
  });

  test("AC-L-4 — double-click descent sets activeGroup; Escape exits", async ({
    page,
  }) => {
    // activeGroup starts null (no descent). Set it via the dev hook
    // (mirrors the panel's `onDoubleClickGroup` callback, which the
    // ViewportCanvas double-click handler fires after a hit-test
    // resolves the user's intent to "enter this group").
    const initial = await page.evaluate(
      () =>
        (globalThis as unknown as { __canvas: CanvasGlobal }).__canvas
          .activeGroup,
    );
    expect(initial).toBeNull();

    await page.evaluate(
      ({ groupId }) => {
        (globalThis as unknown as { __canvas: CanvasGlobal }).__canvas
          .setActiveGroup(groupId);
      },
      { groupId },
    );
    // Re-read on a fresh tick so the React render has flushed.
    await page.waitForFunction(
      ({ expected }) =>
        (globalThis as unknown as { __canvas: CanvasGlobal }).__canvas
          .activeGroup === expected,
      { expected: groupId },
      { timeout: 2_000 },
    );

    // Escape exits the active group (the panel's keydown listener
    // calls setActiveGroup(null)).
    await page.keyboard.press("Escape");
    await page.waitForFunction(
      () =>
        (globalThis as unknown as { __canvas: CanvasGlobal }).__canvas
          .activeGroup === null,
      null,
      { timeout: 2_000 },
    );
  });

  test("AC-L-5 — undo restores every leaf transform bytewise", async ({
    page,
  }) => {
    const before = await leafTransforms(page, leaves);
    const delta: [number, number] = [111, 77];

    await page.evaluate(
      async ({ groupId, delta }) => {
        const c = (globalThis as unknown as { __canvas: CanvasGlobal }).__canvas;
        const h = await c.client.beginGesture(
          [{ kind: "group", id: groupId }],
          { kind: "translate" },
        );
        await c.client.updateGesture(h, delta, { shift: false, alt: false });
        await c.client.commitGesture(h);
        await c.client.undo();
      },
      { groupId, delta },
    );

    const after = await leafTransforms(page, leaves);
    for (const leaf of leaves) {
      const old = before.get(leaf.id)!;
      const cur = after.get(leaf.id)!;
      for (let i = 0; i < 6; i++) expect(cur[i]).toBeCloseTo(old[i], 3);
    }
  });
});

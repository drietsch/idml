// Track K — cross-spread Alt-duplicate acceptance.
//
// AC-K-1  Drag-duplicate within the same spread behaves identically
//         to Phase H.4 — no regression.
// AC-K-2  Drag crossing into a different spread: the duplicate
//         appears on the destination spread; original stays on the
//         source spread unchanged.
// AC-K-4  Single Cmd-Z removes the duplicate regardless of spread.
//
// AC-K-3 (preview live) isn't asserted explicitly because today's
// gesture-preview already moves the frame to the world pointer
// position before commit — there's no separate "ghost on
// destination spread" affordance to assert against. If a follow-up
// adds a literal ghost, extend this spec.
//
// Verification strategy: each test computes the duplicate's
// expected synthetic id (`${source_id}_dup_${suffix}_0`) where
// `suffix` is the wasm-process duplicate counter. The counter
// persists across model loads (static AtomicU64), so successive
// tests in the same worker bump it; we track the expected counter
// per-test via a beforeEach probe. Then `elementGeometry` looks up
// the duplicate's `pageId` — same as source's = AC-K-1, different
// = AC-K-2.
//
// Fixture: `corpus/generated/geometry.idml` (40 spreads, one page
// each, so consecutive pageIds belong to different spreads).

import { dirname, resolve as pathResolve } from "node:path";
import { fileURLToPath } from "node:url";
import { test, expect, type Page } from "@playwright/test";

import { openCanvas, loadIdml } from "./fidelity/canvas-driver";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = pathResolve(__dirname, "..", "..", "..");

// Real InDesign-exported pack with distinct per-spread
// item_transforms. The `corpus/generated/*.idml` fixtures all use
// identity spread transforms (every spread overlaps at world (0,0)),
// which would make the cross-spread routing untestable through the
// gesture spine's world-pointer reconstruction.
const FIXTURE = `${REPO_ROOT}/corpus/envato/packs/brand-guidelines/template.idml`;
const FIXTURE_PACK = "brand-guidelines";

type ElementId =
  | { kind: "textFrame"; id: string }
  | { kind: "rectangle"; id: string }
  | { kind: "oval"; id: string }
  | { kind: "polygon"; id: string }
  | { kind: "graphicLine"; id: string }
  | { kind: "group"; id: string };

interface ElementGeometryItem {
  id: ElementId;
  pageId: string;
  bounds: [number, number, number, number];
  itemTransform: [number, number, number, number, number, number] | null;
}

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
    ) => Promise<unknown>;
    commitGesture: (
      h: number,
    ) => Promise<{ appliedSeq: number; pageIds: string[] }>;
    elementGeometry: (ids: ElementId[]) => Promise<ElementGeometryItem[]>;
    undo: () => Promise<unknown>;
  };
}

/** Find an un-rotated frame on the named page by probing a grid of
 *  interior points. Returns the element id, source pageId, and
 *  page-local bounds. */
async function pickFrame(
  page: Page,
  pageId: string,
  w: number,
  h: number,
): Promise<{
  id: ElementId;
  pageId: string;
  bounds: [number, number, number, number];
}> {
  return page.evaluate(
    async ({ pageId, w, h }) => {
      const c = (globalThis as unknown as { __canvas: CanvasGlobal }).__canvas;
      for (let r = 0.2; r < 1.0; r += 0.15) {
        for (let cc = 0.2; cc < 1.0; cc += 0.15) {
          const reply = (await c.client.send({
            kind: "hitTest",
            payload: { pageId, docPoint: [w * cc, h * r], filter: "any" },
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
          if (tr && (Math.abs(tr[0] - 1) > 1e-3 || Math.abs(tr[3] - 1) > 1e-3))
            continue;
          if (tr && (Math.abs(tr[1]) > 1e-3 || Math.abs(tr[2]) > 1e-3))
            continue;
          return {
            id: el,
            pageId,
            bounds: [fb.top, fb.left, fb.bottom, fb.right] as [
              number,
              number,
              number,
              number,
            ],
          };
        }
      }
      throw new Error(`no un-rotated frame on page ${pageId}`);
    },
    { pageId, w, h },
  );
}

/** Probe the next duplicate suffix by performing a throwaway
 *  Alt-translate-cancel sequence on a known frame. The wasm-side
 *  duplicate counter increments per emitted clone op; this lets
 *  the spec predict the upcoming dup id without parsing the
 *  worker's reply log. */
// (Not actually used — `duplicate_suffix` increments on COMMIT,
// not on op-construction. Instead each test reads the duplicate
// id by enumerating elementGeometry across a candidate range.)

/** After a commit, walk a known set of candidate dup ids (one per
 *  expected suffix) and return the first one whose elementGeometry
 *  resolves. The wasm `duplicate_suffix()` static counter is
 *  monotonic but not test-isolated, so this scan covers reuse. */
async function findDuplicateForSource(
  page: Page,
  srcId: ElementId,
): Promise<ElementGeometryItem | null> {
  return page.evaluate(
    async ({ srcId }) => {
      const c = (globalThis as unknown as { __canvas: CanvasGlobal }).__canvas;
      for (let suffix = 0; suffix < 32; suffix++) {
        const candidate = `${srcId.id}_dup_${suffix}_0`;
        const geom = await c.client.elementGeometry([
          { kind: srcId.kind, id: candidate } as ElementId,
        ]);
        if (geom.length > 0) return geom[0];
      }
      return null;
    },
    { srcId },
  );
}

test.describe("Track K — cross-spread Alt-duplicate", () => {
  let pageAId = "";
  let pageBId = "";
  let pageAW = 0;
  let pageAH = 0;

  test.beforeEach(async ({ page }) => {
    await openCanvas(page);
    const loaded = await loadIdml(page, FIXTURE, FIXTURE_PACK);
    expect(loaded.pages.length).toBeGreaterThanOrEqual(2);
    pageAId = loaded.pages[0].pageId;
    pageBId = loaded.pages[1].pageId;
    pageAW = loaded.pages[0].widthPt;
    pageAH = loaded.pages[0].heightPt;
  });

  test("AC-K-1 — same-spread Alt-translate: duplicate lands on source page", async ({
    page,
  }) => {
    const src = await pickFrame(page, pageAId, pageAW, pageAH);

    // Tiny delta — well inside the source page so no cross-spread
    // routing fires.
    const delta: [number, number] = [12, 18];
    await page.evaluate(
      async ({ id, delta }) => {
        const c = (globalThis as unknown as { __canvas: CanvasGlobal }).__canvas;
        const h = await c.client.beginGesture([id], { kind: "translate" });
        await c.client.updateGesture(h, delta, { shift: false, alt: true });
        await c.client.commitGesture(h);
      },
      { id: src.id, delta },
    );

    const dup = await findDuplicateForSource(page, src.id);
    expect(dup, "duplicate should exist").not.toBeNull();
    // Same page as the source: same-spread routing preserved.
    expect(dup!.pageId).toBe(src.pageId);
    // Source still present.
    const srcGeom = await page.evaluate(
      async ({ id }) => {
        const c = (globalThis as unknown as { __canvas: CanvasGlobal }).__canvas;
        return c.client.elementGeometry([id]);
      },
      { id: src.id },
    );
    expect(srcGeom.length).toBe(1);
    expect(srcGeom[0].pageId).toBe(src.pageId);
  });

  test("AC-K-2 — cross-spread Alt-translate: duplicate dispatches with destination spread resolved", async ({
    page,
  }) => {
    // End-to-end coverage of cross-spread routing is split between
    // here and the Rust unit tests in idml-mutate's lib.rs:
    //   - `clone_translate_with_destination_routes_to_dest_with_corrected_delta`
    //     proves the apply layer inserts into the named spread with
    //     the corrected effective delta.
    //   - `cross_spread_clone_undo_removes_from_dest`
    //     proves the inverse removes from the same destination spread.
    // This test exercises the GESTURE-SPINE half: when the Alt-drag
    // carries the world pointer into a different spread, the
    // commit emits a `CloneTranslate` whose `destination_spread_id`
    // is `Some(...)` rather than `None`. We confirm via captured
    // worker console logs — the spine emits a
    // `[K-debug] dest spread origin = ...` line when it resolved a
    // destination. The pageId assigned by the renderer post-rebuild
    // is intentionally not asserted: in real InDesign exports the
    // renderer routes by frame-vs-page geometry, which can drift
    // from spread membership when the duplicate's bounds land
    // outside the destination page's pure-page rect.
    let sawDestResolve = false;
    page.on("console", (m) => {
      const t = m.text();
      if (t.includes("[K-debug] dest spread origin")) {
        sawDestResolve = true;
      }
    });
    const src = await pickFrame(page, pageAId, pageAW, pageAH);

    // Drag distance that overshoots the source page's height plus
    // typical pasteboard gap. geometry.idml uses single-page
    // landscape spreads; pageB sits below pageA in world coords.
    // 1.5x the page height is a robust overshoot to land the
    // pointer inside pageB's bounds.
    // brand-guidelines' spreads stack DOWN from the source
    // spread `uc8` (world x ∈ [0, 841.89], y ∈ [-297.638,
    // 297.638]). The next spread `u1d273` hosts two facing
    // pages: a left page at world x ∈ [-841.89, 0], y ∈ [495.6,
    // 1090.9] and a right page at world x ∈ [0, 841.89], y ∈
    // [495.6, 1090.9]. A delta of (-200, 700) from the source's
    // center (~556, 203) places the world pointer at (356, 903),
    // inside u1d273's right page → routes to that spread.
    const delta: [number, number] = [-200, 700];
    const anchorPoint: [number, number] = [
      (src.bounds[1] + src.bounds[3]) / 2,
      (src.bounds[0] + src.bounds[2]) / 2,
    ];
    await page.evaluate(
      async ({ id, delta, pageAId, anchorPoint }) => {
        const c = (globalThis as unknown as { __canvas: CanvasGlobal }).__canvas;
        const h = await c.client.beginGesture(
          [id],
          { kind: "translate" },
          // Anchor at the source's centre (page-local). Required
          // for the gesture spine's world-pointer reconstruction
          // in `resolve_destination_spread` — without an anchor it
          // can't compute the world pointer, falls back to None,
          // and the apply takes the source-spread (no-op cross)
          // path.
          { pageId: pageAId, pointInPage: anchorPoint },
        );
        await c.client.updateGesture(h, delta, { shift: false, alt: true });
        await c.client.commitGesture(h);
      },
      { id: src.id, delta, pageAId, anchorPoint },
    );

    const dup = await findDuplicateForSource(page, src.id);
    expect(dup, "duplicate should exist").not.toBeNull();
    // Gesture spine resolved a destination spread (i.e. cross-
    // spread routing fired, not the source-spread fallback). The
    // debug log was emitted between the test's beginGesture and
    // commitGesture, so it's visible by the time elementGeometry
    // returns.
    expect(
      sawDestResolve,
      "gesture spine should have resolved a destination spread for this delta",
    ).toBe(true);
    // Strict pageId routing: the duplicate's pageId reports a page
    // of the DESTINATION spread, not the source page. Prior to the
    // spread-scoped lookup in `element_geometry`, the dup's centroid
    // (in spread-B-local coords) could alias spread A's pages and
    // surface the source pageId — making this assertion impossible
    // to pin. (The earlier K.3 spec asserted only the dispatch-side
    // debug log; the spread-scoped routing fix lets us tighten.)
    expect(dup!.pageId).not.toBe(src.pageId);
    // Source unchanged on its original page.
    const srcGeom = await page.evaluate(
      async ({ id }) => {
        const c = (globalThis as unknown as { __canvas: CanvasGlobal }).__canvas;
        return c.client.elementGeometry([id]);
      },
      { id: src.id },
    );
    expect(srcGeom.length).toBe(1);
    expect(srcGeom[0].pageId).toBe(src.pageId);
  });

  test("AC-K-4 — single Cmd-Z removes the duplicate (cross-spread)", async ({
    page,
  }) => {
    const src = await pickFrame(page, pageAId, pageAW, pageAH);

    const anchorPoint: [number, number] = [
      (src.bounds[1] + src.bounds[3]) / 2,
      (src.bounds[0] + src.bounds[2]) / 2,
    ];
    // Same cross-spread delta used by AC-K-2 — lands on
    // spread `u1d273`'s right page (see AC-K-2's rationale).
    const delta: [number, number] = [-200, 700];
    await page.evaluate(
      async ({ id, delta, pageAId, anchorPoint }) => {
        const c = (globalThis as unknown as { __canvas: CanvasGlobal }).__canvas;
        const h = await c.client.beginGesture(
          [id],
          { kind: "translate" },
          { pageId: pageAId, pointInPage: anchorPoint },
        );
        await c.client.updateGesture(h, delta, { shift: false, alt: true });
        await c.client.commitGesture(h);
      },
      { id: src.id, delta, pageAId, anchorPoint },
    );

    const before = await findDuplicateForSource(page, src.id);
    expect(before, "duplicate exists before undo").not.toBeNull();

    await page.evaluate(async () => {
      const c = (globalThis as unknown as { __canvas: CanvasGlobal }).__canvas;
      await c.client.undo();
    });

    const after = await findDuplicateForSource(page, src.id);
    expect(after, "duplicate gone after undo").toBeNull();
    // Source still on page A.
    const srcGeom = await page.evaluate(
      async ({ id }) => {
        const c = (globalThis as unknown as { __canvas: CanvasGlobal }).__canvas;
        return c.client.elementGeometry([id]);
      },
      { id: src.id },
    );
    expect(srcGeom.length).toBe(1);
    expect(srcGeom[0].pageId).toBe(src.pageId);
  });
});

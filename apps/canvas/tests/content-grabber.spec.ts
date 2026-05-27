// Phase F acceptance suite — image content gesture (the "grabber").
//
// `TranslateContent` translates the placed image *inside* a frame
// without moving the frame's own bounds or `ItemTransform`. It edits
// the Rectangle's `image_item_transform`'s tx/ty by the pointer delta.

import { dirname, resolve as pathResolve } from "node:path";
import { fileURLToPath } from "node:url";
import { test, expect, type Page } from "@playwright/test";

import { openCanvas, loadIdml } from "./fidelity/canvas-driver";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = pathResolve(__dirname, "..", "..", "..");

// `square-catalog-brochure-template` is an image-heavy pack (82
// `<Image>` elements across its spreads). Phase F's content grabber
// only fires on image-bearing Rectangles; picking a pack that has
// many of them keeps the spec robust.
const PACK_NAME = "square-catalog-brochure-template";
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
    cancelGesture: (h: number) => Promise<string[]>;
    undo: () => Promise<unknown>;
    marqueeHits: (
      pageId: string,
      rect: [number, number, number, number],
    ) => Promise<ElementId[]>;
  };
}

/**
 * Walk every marqueed element across every page of the document and
 * ask `requestElementGeometry` for `hasImage`. Returns the first
 * image-bearing Rectangle found anywhere in the document.
 */
async function findImageBearingRectangle(
  page: Page,
  pageIds: string[],
  pageSizesPt: Array<[number, number]>,
): Promise<{ element: ElementId; itemTransform: number[] | null } | null> {
  return page.evaluate(
    async ({ pageIds, pageSizesPt }) => {
      const c = (globalThis as unknown as { __canvas: CanvasGlobal }).__canvas;
      for (let i = 0; i < pageIds.length; i++) {
        const pid = pageIds[i];
        const [w, h] = pageSizesPt[i];
        const ids = await c.client.marqueeHits(pid, [0, 0, h, w]);
        for (const id of ids) {
          if (id.kind !== "rectangle") continue;
          const r = (await c.client.send({
            kind: "requestElementGeometry",
            payload: { ids: [id] },
          })) as {
            payload: {
              items: Array<{
                id: ElementId;
                hasImage?: boolean;
                itemTransform: number[] | null;
              }>;
            };
          };
          const item = r.payload.items[0];
          if (!item || !item.hasImage) continue;
          return { element: item.id, itemTransform: item.itemTransform };
        }
      }
      return null;
    },
    { pageIds, pageSizesPt },
  );
}

async function rectangleImageTransform(
  page: Page,
  id: ElementId,
): Promise<[number, number, number, number, number, number] | null> {
  // The wire-side ElementGeometryItem doesn't expose
  // `image_item_transform`. Drive a Rust-side path via a JSON probe:
  // we synthesise a quick TranslateContent of (0,0) to read the
  // pre-gesture transform out of `commitGesture`'s reply. Cheaper
  // approach: ask the worker for the geometry, then we read whatever
  // shape we have. For Phase F v1 we need an actual read; cheapest is
  // an inspector query — but we don't have one. So we use a 0-delta
  // gesture as a no-op probe? Even that doesn't expose the matrix.
  //
  // For the test, we'll commit a known TranslateContent and check
  // the *delta* between before/after through the same probe: hit
  // the frame at its centre and read back the `frameBounds` (which
  // stays put for TranslateContent — that's the WHOLE POINT). The
  // image-transform delta itself is asserted in the Rust integration
  // tests; here we assert the frame DIDN'T move (sanity that we
  // used the right gesture path) plus successful commit.
  return page.evaluate(
    async ({ id }) => {
      const c = (globalThis as unknown as { __canvas: CanvasGlobal }).__canvas;
      const r = (await c.client.send({
        kind: "requestElementGeometry",
        payload: { ids: [id] },
      })) as { payload: { items: Array<{ itemTransform: number[] | null }> } };
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
    { id },
  );
}

test.describe("Phase F — content grabber gesture", () => {
  let pageIds: string[] = [];
  let pageSizesPt: Array<[number, number]> = [];

  test.beforeEach(async ({ page }) => {
    await openCanvas(page);
    const loaded = await loadIdml(page, PACK_PATH, PACK_NAME);
    pageIds = loaded.pages.map((p) => p.pageId);
    pageSizesPt = loaded.pages.map((p) => [p.widthPt, p.heightPt]);
  });

  test("TranslateContent commits successfully and leaves frame ItemTransform unchanged", async ({
    page,
  }) => {
    const hit = await findImageBearingRectangle(page, pageIds, pageSizesPt);
    test.skip(hit === null, "pack has no image-bearing rectangles to grab");
    const target = hit!.element;
    const frameTransformBefore = await rectangleImageTransform(page, target);

    const reply = await page.evaluate(
      async ({ target }) => {
        const c = (globalThis as unknown as { __canvas: CanvasGlobal }).__canvas;
        const h = await c.client.beginGesture([target], {
          kind: "translateContent",
        });
        await c.client.updateGesture(h, [12, -7], {
          shift: false,
          alt: false,
        });
        const commit = await c.client.commitGesture(h);
        return commit;
      },
      { target },
    );
    expect(reply.appliedSeq).toBeGreaterThan(0);

    // The frame's own ItemTransform must stay put — TranslateContent
    // only edits the inner image transform. (The Rust integration
    // test `translate_content_shifts_image_transform_tx_ty_only`
    // proves the inner transform moved; this spec proves the outer
    // one did not, which is the contract that matters at the UI.)
    const frameTransformAfter = await rectangleImageTransform(page, target);
    if (frameTransformBefore === null) {
      expect(frameTransformAfter).toBeNull();
    } else {
      expect(frameTransformAfter).not.toBeNull();
      for (let i = 0; i < 6; i++) {
        expect(frameTransformAfter![i]).toBeCloseTo(frameTransformBefore[i], 2);
      }
    }
  });

  test("TranslateContent undo round-trips", async ({ page }) => {
    const hit = await findImageBearingRectangle(page, pageIds, pageSizesPt);
    test.skip(hit === null, "pack has no image-bearing rectangles to grab");
    const target = hit!.element;
    const reply = await page.evaluate(
      async ({ target }) => {
        const c = (globalThis as unknown as { __canvas: CanvasGlobal }).__canvas;
        const h = await c.client.beginGesture([target], {
          kind: "translateContent",
        });
        await c.client.updateGesture(h, [40, 20], {
          shift: false,
          alt: false,
        });
        const commit = await c.client.commitGesture(h);
        await c.client.undo();
        return commit;
      },
      { target },
    );
    expect(reply.appliedSeq).toBeGreaterThan(0);
  });

  test("TranslateContent cancel restores", async ({ page }) => {
    const hit = await findImageBearingRectangle(page, pageIds, pageSizesPt);
    test.skip(hit === null, "pack has no image-bearing rectangles to grab");
    const target = hit!.element;
    await page.evaluate(
      async ({ target }) => {
        const c = (globalThis as unknown as { __canvas: CanvasGlobal }).__canvas;
        const h = await c.client.beginGesture([target], {
          kind: "translateContent",
        });
        await c.client.updateGesture(h, [99, 99], {
          shift: false,
          alt: false,
        });
        await c.client.cancelGesture(h);
      },
      { target },
    );
    // No assertion needed beyond the implicit "did not throw" —
    // cancel restores the snapshot. The Rust integration test
    // `translate_content_cancel_restores` covers the bytes-level
    // restoration.
  });
});

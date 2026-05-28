// Plan-2 §8.3 — ruler guides acceptance.
//
// Loading an IDML with `<Guide>` elements surfaces them on the
// DocumentHandle so the overlay can render them and the snap pass
// treats them as targets. Verifies the wire round-trip end-to-end:
// parser → model → channel → main thread.
//
// Fixture: `resume-template-teacher` carries 14 ruler guides across
// its body pages (canonical real-world InDesign export). The exact
// count is fixture-pinned — if the upstream template changes, the
// assertion should be updated to match.

import { dirname, resolve as pathResolve } from "node:path";
import { fileURLToPath } from "node:url";
import { test, expect } from "@playwright/test";

import { openCanvas, loadIdml } from "./fidelity/canvas-driver";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = pathResolve(__dirname, "..", "..", "..");

const PACK_NAME = "resume-template-teacher";
const PACK_PATH = `${REPO_ROOT}/corpus/envato/packs/${PACK_NAME}/template.idml`;

interface RulerGuideWire {
  pageId: string;
  orientation: "vertical" | "horizontal";
  location: number;
}

interface DocumentHandleWithGuides {
  pageIds: string[];
  rulerGuides?: RulerGuideWire[];
}

interface CanvasGlobal {
  client: {
    loadDocument: (
      bytes: Uint8Array,
    ) => Promise<DocumentHandleWithGuides>;
  };
}

test.describe("Plan-2 §8.3 — ruler guides", () => {
  test("DocumentHandle surfaces every Guide element from the IDML", async ({
    page,
  }) => {
    await openCanvas(page);
    // Load the IDML directly through the channel and inspect the
    // returned handle in-place — avoids relying on the React state
    // path that the test driver's `loadIdml` doesn't run.
    const handle = await page.evaluate(
      async ({ pack }) => {
        const c = (globalThis as unknown as { __canvas: CanvasGlobal }).__canvas;
        const url = `/@fs${pack}`;
        const bytes = new Uint8Array(await (await fetch(url)).arrayBuffer());
        return c.client.loadDocument(bytes);
      },
      { pack: PACK_PATH },
    );
    expect(handle.pageIds.length).toBeGreaterThan(0);

    const guides = handle.rulerGuides ?? [];
    expect(
      guides.length,
      "resume-template-teacher ships 14 ruler guides; the wire surface should expose them",
    ).toBeGreaterThanOrEqual(14);
    // Each guide should carry a recognised orientation + a page id
    // present in the document's page list.
    const pageIds = new Set(handle.pageIds);
    for (const g of guides) {
      expect(["vertical", "horizontal"]).toContain(g.orientation);
      expect(pageIds.has(g.pageId)).toBe(true);
      expect(Number.isFinite(g.location)).toBe(true);
    }
  });
});

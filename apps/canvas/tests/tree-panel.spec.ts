// Inspector P1 — scene-tree panel acceptance. Verifies the wire
// surface; the DOM test for clicking through the panel itself rides
// on `sceneTree()` returning the data the rows would render.

import { dirname, resolve as pathResolve } from "node:path";
import { fileURLToPath } from "node:url";
import { test, expect } from "@playwright/test";

import { openCanvas, loadIdml } from "./fidelity/canvas-driver";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = pathResolve(__dirname, "..", "..", "..");

const FIXTURE = `${REPO_ROOT}/corpus/generated/geometry-groups.idml`;

interface SceneTreeNode {
  id: { kind: string; id: string } | null;
  kind: string;
  label: string;
  children?: SceneTreeNode[];
}
interface CanvasGlobal {
  client: {
    sceneTree: () => Promise<SceneTreeNode[]>;
  };
}

test.describe("Inspector P1 — scene tree", () => {
  test("AC-TREE-1 — sceneTree() lists every spread → page → frame", async ({
    page,
  }) => {
    await openCanvas(page);
    await loadIdml(page, FIXTURE);
    const roots = await page.evaluate(async () => {
      const c = (globalThis as unknown as { __canvas: CanvasGlobal }).__canvas;
      return c.client.sceneTree();
    });
    expect(roots.length).toBeGreaterThan(0);
    for (const spread of roots) {
      expect(spread.kind).toBe("Spread");
      expect(spread.children?.length ?? 0).toBeGreaterThan(0);
      const page0 = spread.children![0];
      expect(page0.kind).toBe("Page");
      expect(page0.children?.length ?? 0).toBeGreaterThan(0);
    }
    // The first spread's first page's first child is the label text
    // frame; verify its id surfaces and is selectable (id !== null).
    const firstFrame = roots[0].children![0].children![0];
    expect(firstFrame.id).not.toBeNull();
    expect(firstFrame.id!.kind).toBe("textFrame");
  });
});

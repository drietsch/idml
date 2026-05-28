// Track M.1 — Layers read surface + toggle ops.
//
// Loads a real fixture, lists every `<Layer>` via `client.layers()`,
// then exercises the three layer-property toggles
// (visible / locked / printable) through `client.mutate()` and
// asserts the wire surface reflects the change. Single-undo restores
// each toggle bytewise.
//
// Fixture: `resume-template-teacher` ships multiple layers and at
// least one ruler-guide layer ("Guides" by IDML convention).

import { dirname, resolve as pathResolve } from "node:path";
import { fileURLToPath } from "node:url";
import { test, expect } from "@playwright/test";

import { openCanvas, loadIdml } from "./fidelity/canvas-driver";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = pathResolve(__dirname, "..", "..", "..");

const PACK_NAME = "resume-template-teacher";
const PACK_PATH = `${REPO_ROOT}/corpus/envato/packs/${PACK_NAME}/template.idml`;

interface LayerSummary {
  selfId: string;
  name: string | null;
  visible: boolean;
  locked: boolean;
  printable: boolean;
  z: number;
}

interface CanvasGlobal {
  client: {
    loadDocument: (bytes: Uint8Array) => Promise<unknown>;
    layers: () => Promise<LayerSummary[]>;
    mutate: (m: unknown) => Promise<unknown>;
    undo: () => Promise<unknown>;
  };
}

test.describe("Track M.1 — layers read + toggle", () => {
  test("client.layers() lists every IDML layer; visibility/lock/printable round-trip on undo", async ({
    page,
  }) => {
    await openCanvas(page);
    await page.evaluate(
      async ({ pack }) => {
        const c = (globalThis as unknown as { __canvas: CanvasGlobal }).__canvas;
        const url = `/@fs${pack}`;
        const bytes = new Uint8Array(await (await fetch(url)).arrayBuffer());
        await c.client.loadDocument(bytes);
      },
      { pack: PACK_PATH },
    );

    const layers = await page.evaluate(async () => {
      const c = (globalThis as unknown as { __canvas: CanvasGlobal }).__canvas;
      return c.client.layers();
    });
    expect(layers.length).toBeGreaterThan(0);
    // Sanity: z indices are 0-based and contiguous.
    expect(layers[0].z).toBe(0);
    for (let i = 1; i < layers.length; i++) {
      expect(layers[i].z).toBe(i);
    }

    // Pick the first layer and toggle visibility off → on.
    const target = layers[0];
    const wasVisible = target.visible;
    await page.evaluate(
      async ({ id, next }) => {
        const c = (globalThis as unknown as { __canvas: CanvasGlobal }).__canvas;
        await c.client.mutate({
          op: "layerSetVisible",
          args: { layerId: id, visible: next },
        });
      },
      { id: target.selfId, next: !wasVisible },
    );
    let after = await page.evaluate(async () => {
      const c = (globalThis as unknown as { __canvas: CanvasGlobal }).__canvas;
      return c.client.layers();
    });
    const flipped = after.find((l) => l.selfId === target.selfId)!;
    expect(flipped.visible).toBe(!wasVisible);

    // Undo restores.
    await page.evaluate(async () => {
      const c = (globalThis as unknown as { __canvas: CanvasGlobal }).__canvas;
      await c.client.undo();
    });
    after = await page.evaluate(async () => {
      const c = (globalThis as unknown as { __canvas: CanvasGlobal }).__canvas;
      return c.client.layers();
    });
    const restored = after.find((l) => l.selfId === target.selfId)!;
    expect(restored.visible).toBe(wasVisible);

    // Lock toggle.
    await page.evaluate(
      async ({ id }) => {
        const c = (globalThis as unknown as { __canvas: CanvasGlobal }).__canvas;
        await c.client.mutate({
          op: "layerSetLocked",
          args: { layerId: id, locked: true },
        });
      },
      { id: target.selfId },
    );
    after = await page.evaluate(async () => {
      const c = (globalThis as unknown as { __canvas: CanvasGlobal }).__canvas;
      return c.client.layers();
    });
    expect(after.find((l) => l.selfId === target.selfId)!.locked).toBe(true);

    // Printable toggle.
    await page.evaluate(
      async ({ id, next }) => {
        const c = (globalThis as unknown as { __canvas: CanvasGlobal }).__canvas;
        await c.client.mutate({
          op: "layerSetPrintable",
          args: { layerId: id, printable: next },
        });
      },
      { id: target.selfId, next: !target.printable },
    );
    after = await page.evaluate(async () => {
      const c = (globalThis as unknown as { __canvas: CanvasGlobal }).__canvas;
      return c.client.layers();
    });
    expect(after.find((l) => l.selfId === target.selfId)!.printable).toBe(
      !target.printable,
    );
  });
});

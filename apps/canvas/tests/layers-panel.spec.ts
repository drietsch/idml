// Track M.4-M.7 — structural layer ops via the channel. Tests the
// wire surface end-to-end; the panel itself just dispatches these
// mutations on button clicks / drops.
//
// AC-M-4 Rename     — `LayerSetName` round-trips on undo.
// AC-M-5 Reorder    — `LayerMove` re-orders the layer list.
// AC-M-6 Add/Delete — `LayerInsert` appends; `LayerRemove` removes.
// AC-M-7 Undo       — every op + the structural ones undo bytewise.

import { dirname, resolve as pathResolve } from "node:path";
import { fileURLToPath } from "node:url";
import { test, expect } from "@playwright/test";

import { openCanvas } from "./fidelity/canvas-driver";

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

async function load(page: import("@playwright/test").Page) {
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
}

async function getLayers(
  page: import("@playwright/test").Page,
): Promise<LayerSummary[]> {
  return page.evaluate(async () => {
    const c = (globalThis as unknown as { __canvas: CanvasGlobal }).__canvas;
    return c.client.layers();
  });
}

test.describe("Track M.4-M.7 — structural layer ops", () => {
  test("AC-M-4 — rename a layer + undo restores the original", async ({
    page,
  }) => {
    await load(page);
    const before = await getLayers(page);
    expect(before.length).toBeGreaterThan(0);
    const target = before[0];
    const originalName = target.name;
    await page.evaluate(
      async ({ id }) => {
        const c = (globalThis as unknown as { __canvas: CanvasGlobal }).__canvas;
        await c.client.mutate({
          op: "layerSetName",
          args: { layerId: id, name: "RenameTest" },
        });
      },
      { id: target.selfId },
    );
    const mid = await getLayers(page);
    expect(mid.find((l) => l.selfId === target.selfId)!.name).toBe(
      "RenameTest",
    );
    await page.evaluate(async () => {
      const c = (globalThis as unknown as { __canvas: CanvasGlobal }).__canvas;
      await c.client.undo();
    });
    const after = await getLayers(page);
    expect(after.find((l) => l.selfId === target.selfId)!.name).toBe(
      originalName,
    );
  });

  test("AC-M-5 — reorder a layer + undo restores", async ({ page }) => {
    await load(page);
    const before = await getLayers(page);
    expect(before.length).toBeGreaterThanOrEqual(2);
    const moved = before[before.length - 1];
    await page.evaluate(
      async ({ id }) => {
        const c = (globalThis as unknown as { __canvas: CanvasGlobal }).__canvas;
        await c.client.mutate({
          op: "layerMove",
          args: { layerId: id, newIndex: 0 },
        });
      },
      { id: moved.selfId },
    );
    const mid = await getLayers(page);
    expect(mid[0].selfId).toBe(moved.selfId);
    await page.evaluate(async () => {
      const c = (globalThis as unknown as { __canvas: CanvasGlobal }).__canvas;
      await c.client.undo();
    });
    const after = await getLayers(page);
    expect(after[after.length - 1].selfId).toBe(moved.selfId);
  });

  test("AC-M-6 — add + delete a layer; both round-trip on undo", async ({
    page,
  }) => {
    await load(page);
    const before = await getLayers(page);
    const beforeCount = before.length;
    await page.evaluate(async () => {
      const c = (globalThis as unknown as { __canvas: CanvasGlobal }).__canvas;
      await c.client.mutate({
        op: "layerInsert",
        args: { position: 0, name: "Inserted" },
      });
    });
    const afterAdd = await getLayers(page);
    expect(afterAdd.length).toBe(beforeCount + 1);
    expect(afterAdd[0].name).toBe("Inserted");
    const insertedId = afterAdd[0].selfId;

    await page.evaluate(
      async ({ id }) => {
        const c = (globalThis as unknown as { __canvas: CanvasGlobal }).__canvas;
        await c.client.mutate({
          op: "layerRemove",
          args: { layerId: id },
        });
      },
      { id: insertedId },
    );
    const afterRemove = await getLayers(page);
    expect(afterRemove.length).toBe(beforeCount);
    expect(afterRemove.find((l) => l.selfId === insertedId)).toBeUndefined();

    // Undo the remove → layer should come back at position 0
    // with name "Inserted" and the original flags.
    await page.evaluate(async () => {
      const c = (globalThis as unknown as { __canvas: CanvasGlobal }).__canvas;
      await c.client.undo();
    });
    const afterUndoRemove = await getLayers(page);
    expect(afterUndoRemove.length).toBe(beforeCount + 1);
    const restored = afterUndoRemove[0];
    expect(restored.selfId).toBe(insertedId);
    expect(restored.name).toBe("Inserted");

    // Undo the insert → original layer set restored.
    await page.evaluate(async () => {
      const c = (globalThis as unknown as { __canvas: CanvasGlobal }).__canvas;
      await c.client.undo();
    });
    const afterUndoInsert = await getLayers(page);
    expect(afterUndoInsert.length).toBe(beforeCount);
  });
});

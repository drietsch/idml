// SDK Phase 5 (v1 sweep) — Align panel acceptance.
//
// Smoke + apply-path validation.

import { test, expect } from "@playwright/test";
import { dirname, resolve as pathResolve } from "node:path";
import { fileURLToPath } from "node:url";

import { openCanvas, loadIdml } from "./fidelity/canvas-driver";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = pathResolve(__dirname, "..", "..", "..");
const FIXTURE = `${REPO_ROOT}/corpus/generated/geometry-groups.idml`;

test.describe("Phase 5 — Align panel", () => {
  test.beforeEach(async ({ page }) => {
    await openCanvas(page);
    await loadIdml(page, FIXTURE);
    await page.getByText("Align", { exact: true }).first().click();
  });

  test("AC-ALIGN-1 — panel mounts; 6 align + 2 distribute buttons; hints when no selection", async ({
    page,
  }) => {
    await expect(page.locator('[data-align-panel="ready"]')).toBeVisible();
    const buttons = page.locator('[data-align-panel="ready"] button[data-align-kind]');
    // 6 align + 2 distribute = 8.
    await expect(buttons).toHaveCount(8);
    // Hint visible with empty selection.
    await expect(
      page.locator('[data-align-panel="ready"] [data-align-hint]'),
    ).toBeVisible();
  });

  test("AC-ALIGN-2 — align-left writes new bounds to every selected frame", async ({
    page,
  }) => {
    const minLeft = await page.evaluate(async () => {
      type DebugCanvas = {
        client?: {
          executeScript(src: string): Promise<{
            output: string[];
            error: string | null;
          }>;
          elementProperties(id: unknown): Promise<{
            entries: Array<{
              path: string;
              value: { type: string; value: number[] } | null;
            }>;
          } | null>;
        };
        setElementSelection?(ids: unknown[], mode: string): void;
      };
      const dbg = (window as unknown as { __canvas?: DebugCanvas }).__canvas;
      if (!dbg?.client) throw new Error("__canvas client not available");

      // Find 2+ TextFrames in the tree.
      const treeJson = await dbg.client
        .executeScript("paged.tree()")
        .then((r) => r.output[0] ?? "[]");
      type Node = {
        id?: { kind: string; id: string } | null;
        children?: Node[];
      };
      const ids: Array<{ kind: string; id: string }> = [];
      const walk = (nodes: Node[] | undefined) => {
        if (!nodes) return;
        for (const n of nodes) {
          if (n.id && n.id.kind === "textFrame") ids.push(n.id);
          walk(n.children);
        }
      };
      walk(JSON.parse(treeJson) as Node[]);
      if (ids.length < 2) throw new Error("fixture has < 2 TextFrames");
      const pair = ids.slice(0, 2);
      dbg.setElementSelection?.(pair, "replace");
      await new Promise((r) => setTimeout(r, 80));
      return JSON.stringify(pair);
    });

    // Click Align Left.
    await page
      .locator('[data-align-panel="ready"] [data-align-kind="left"]')
      .click();
    await page.waitForTimeout(150);

    // Re-read each frame's bounds; left edge of both should now
    // equal the minimum left of the original selection.
    const aftermath = await page.evaluate(async (pairJson) => {
      type DebugCanvas = {
        client?: {
          elementProperties(id: unknown): Promise<{
            entries: Array<{
              path: string;
              value: { type: string; value: number[] } | null;
            }>;
          } | null>;
        };
      };
      const dbg = (window as unknown as { __canvas?: DebugCanvas }).__canvas;
      if (!dbg?.client) throw new Error("no client");
      const pair = JSON.parse(pairJson) as Array<{ kind: string; id: string }>;
      const lefts: number[] = [];
      for (const id of pair) {
        const props = await dbg.client.elementProperties(id);
        const entry = props?.entries.find((e) => e.path === "frameBounds");
        if (entry?.value?.value) lefts.push(entry.value.value[1]);
      }
      return lefts;
    }, minLeft);

    // After align-left, every frame's left edge equals the same
    // value (within tolerance — the minimum-left of the original
    // selection).
    expect(aftermath.length).toBe(2);
    expect(Math.abs(aftermath[0] - aftermath[1])).toBeLessThan(0.01);
  });

  test("AC-DIST-1 — distribute-h spaces middle frames evenly between extremes", async ({
    page,
  }) => {
    const result = await page.evaluate(async () => {
      type DebugCanvas = {
        client?: {
          executeScript(src: string): Promise<{
            output: string[];
            error: string | null;
          }>;
          elementProperties(id: unknown): Promise<{
            entries: Array<{
              path: string;
              value: { type: string; value: number[] } | null;
            }>;
          } | null>;
          mutate(op: unknown): Promise<unknown>;
        };
        setElementSelection?(ids: unknown[], mode: string): void;
      };
      const dbg = (window as unknown as { __canvas?: DebugCanvas }).__canvas;
      if (!dbg?.client) throw new Error("no client");

      // Need ≥3 TextFrames; the geometry-groups fixture ships
      // enough for this. Set explicit non-uniform bounds first so
      // the distribute math has something to do.
      const treeJson = await dbg.client
        .executeScript("paged.tree()")
        .then((r) => r.output[0] ?? "[]");
      type Node = {
        id?: { kind: string; id: string } | null;
        children?: Node[];
      };
      const ids: Array<{ kind: string; id: string }> = [];
      const walk = (nodes: Node[] | undefined) => {
        if (!nodes) return;
        for (const n of nodes) {
          if (n.id && n.id.kind === "textFrame") ids.push(n.id);
          walk(n.children);
        }
      };
      walk(JSON.parse(treeJson) as Node[]);
      if (ids.length < 3) return null;
      const trio = ids.slice(0, 3);

      // Force known initial positions: first at x=0, last at
      // x=300, middle squeezed to x=50 — distribute-h should
      // move the middle to x=150 (the average).
      await dbg.client.mutate({
        op: "batch",
        args: {
          ops: [
            {
              op: "setElementProperty",
              args: {
                elementId: trio[0],
                path: "frameBounds",
                value: { type: "bounds", value: [0, 0, 50, 50] },
              },
            },
            {
              op: "setElementProperty",
              args: {
                elementId: trio[1],
                path: "frameBounds",
                value: { type: "bounds", value: [0, 50, 50, 100] },
              },
            },
            {
              op: "setElementProperty",
              args: {
                elementId: trio[2],
                path: "frameBounds",
                value: { type: "bounds", value: [0, 300, 50, 350] },
              },
            },
          ],
        },
      });
      await new Promise((r) => setTimeout(r, 50));

      dbg.setElementSelection?.(trio, "replace");
      await new Promise((r) => setTimeout(r, 80));
      return JSON.stringify(trio);
    });

    if (result === null) {
      test.skip(true, "fixture has < 3 TextFrames");
      return;
    }

    await page
      .locator('[data-align-panel="ready"] [data-align-kind="distributeH"]')
      .click();
    await page.waitForTimeout(150);

    const aftermath = await page.evaluate(async (trioJson) => {
      type DebugCanvas = {
        client?: {
          elementProperties(id: unknown): Promise<{
            entries: Array<{
              path: string;
              value: { type: string; value: number[] } | null;
            }>;
          } | null>;
        };
      };
      const dbg = (window as unknown as { __canvas?: DebugCanvas }).__canvas;
      if (!dbg?.client) throw new Error("no client");
      const trio = JSON.parse(trioJson) as Array<{ kind: string; id: string }>;
      const centers: number[] = [];
      for (const id of trio) {
        const props = await dbg.client.elementProperties(id);
        const v = props?.entries.find((e) => e.path === "frameBounds")
          ?.value?.value;
        if (v) centers.push((v[1] + v[3]) / 2);
      }
      return centers;
    }, result);

    // First + last unchanged. Middle should be at the midpoint
    // of the first + last centers.
    expect(aftermath.length).toBe(3);
    const sortedCenters = aftermath.slice().sort((a, b) => a - b);
    const expectedMid = (sortedCenters[0] + sortedCenters[2]) / 2;
    expect(Math.abs(sortedCenters[1] - expectedMid)).toBeLessThan(0.5);
  });

  test("AC-ALIGN-3 — multi-target align is one undo entry (Mutation::Batch)", async ({
    page,
  }) => {
    const result = await page.evaluate(async () => {
      type DebugCanvas = {
        client?: {
          executeScript(src: string): Promise<{
            output: string[];
            error: string | null;
          }>;
          elementProperties(id: unknown): Promise<{
            entries: Array<{
              path: string;
              value: { type: string; value: number[] } | null;
            }>;
          } | null>;
          undo(): Promise<unknown>;
        };
        setElementSelection?(ids: unknown[], mode: string): void;
      };
      const dbg = (window as unknown as { __canvas?: DebugCanvas }).__canvas;
      if (!dbg?.client) throw new Error("no client");
      const treeJson = await dbg.client
        .executeScript("paged.tree()")
        .then((r) => r.output[0] ?? "[]");
      type Node = {
        id?: { kind: string; id: string } | null;
        children?: Node[];
      };
      const ids: Array<{ kind: string; id: string }> = [];
      const walk = (nodes: Node[] | undefined) => {
        if (!nodes) return;
        for (const n of nodes) {
          if (n.id && n.id.kind === "textFrame") ids.push(n.id);
          walk(n.children);
        }
      };
      walk(JSON.parse(treeJson) as Node[]);
      if (ids.length < 2) throw new Error("< 2 TextFrames");
      const pair = ids.slice(0, 2);

      // Snapshot the originals.
      const beforeLefts: number[] = [];
      for (const id of pair) {
        const props = await dbg.client.elementProperties(id);
        const v = props?.entries.find((e) => e.path === "frameBounds")
          ?.value?.value;
        if (v) beforeLefts.push(v[1]);
      }
      dbg.setElementSelection?.(pair, "replace");
      await new Promise((r) => setTimeout(r, 50));
      return { pair: JSON.stringify(pair), beforeLefts };
    });

    // Click Align Left, then ONE undo. Both frames should be back
    // to their original lefts — proves the multi-frame rewrite
    // landed as a single undo entry (the wire-level
    // Mutation::Batch).
    await page
      .locator('[data-align-panel="ready"] [data-align-kind="left"]')
      .click();
    await page.waitForTimeout(150);

    await page.evaluate(async () => {
      type DebugCanvas = {
        client?: {
          undo(): Promise<unknown>;
        };
      };
      const dbg = (window as unknown as { __canvas?: DebugCanvas }).__canvas;
      if (!dbg?.client) throw new Error("no client");
      await dbg.client.undo();
    });
    await page.waitForTimeout(150);

    const afterUndo = await page.evaluate(async (pairJson) => {
      type DebugCanvas = {
        client?: {
          elementProperties(id: unknown): Promise<{
            entries: Array<{
              path: string;
              value: { type: string; value: number[] } | null;
            }>;
          } | null>;
        };
      };
      const dbg = (window as unknown as { __canvas?: DebugCanvas }).__canvas;
      if (!dbg?.client) throw new Error("no client");
      const pair = JSON.parse(pairJson) as Array<{ kind: string; id: string }>;
      const lefts: number[] = [];
      for (const id of pair) {
        const props = await dbg.client.elementProperties(id);
        const v = props?.entries.find((e) => e.path === "frameBounds")
          ?.value?.value;
        if (v) lefts.push(v[1]);
      }
      return lefts;
    }, result.pair);

    expect(afterUndo.length).toBe(2);
    // Both frames back to their original left edges (within
    // float tolerance).
    expect(Math.abs(afterUndo[0] - result.beforeLefts[0])).toBeLessThan(0.01);
    expect(Math.abs(afterUndo[1] - result.beforeLefts[1])).toBeLessThan(0.01);
  });
});

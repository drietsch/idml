// SDK Phase 5 (v1 sweep) — Pathfinder panel acceptance.
//
// v1 ships Union via BBox math; the other three buttons stay
// disabled with a v2 hint. AC-PF-1 pins the panel shape; AC-PF-2
// pins the Union apply path (kept frame's bounds expand to the
// union BBox; other frames are removed in the same Batch undo
// entry).

import { test, expect } from "@playwright/test";
import { dirname, resolve as pathResolve } from "node:path";
import { fileURLToPath } from "node:url";

import { openCanvas, loadIdml } from "./fidelity/canvas-driver";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = pathResolve(__dirname, "..", "..", "..");
const FIXTURE = `${REPO_ROOT}/corpus/generated/geometry-groups.idml`;

test.describe("Phase 5 — Pathfinder panel", () => {
  test.beforeEach(async ({ page }) => {
    await openCanvas(page);
    await loadIdml(page, FIXTURE);
    await page.getByText("Pathfinder", { exact: true }).first().click();
  });

  test("AC-PF-1 — panel mounts; 4 buttons; Union + Intersect enabled in v1", async ({
    page,
  }) => {
    await expect(
      page.locator('[data-pathfinder-panel="ready"]'),
    ).toBeVisible();
    const buttons = page.locator(
      '[data-pathfinder-panel="ready"] button[data-pathfinder-kind]',
    );
    await expect(buttons).toHaveCount(4);
    // Union + Intersect are the v1 buttons.
    const v1 = page.locator(
      '[data-pathfinder-panel="ready"] button[data-v1="true"]',
    );
    await expect(v1).toHaveCount(2);
    // The v2 note is always visible.
    await expect(
      page.locator(
        '[data-pathfinder-panel="ready"] [data-pathfinder-v2-note]',
      ),
    ).toBeVisible();
  });

  test("AC-PF-2 — Union expands kept frame to union BBox; removes others", async ({
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
      const treeJson = await dbg.client
        .executeScript("verso.tree()")
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

      // Pin known initial bounds via a setup Batch.
      await dbg.client.mutate({
        op: "batch",
        args: {
          ops: [
            {
              op: "setElementProperty",
              args: {
                elementId: pair[0],
                path: "frameBounds",
                value: { type: "bounds", value: [0, 0, 50, 100] },
              },
            },
            {
              op: "setElementProperty",
              args: {
                elementId: pair[1],
                path: "frameBounds",
                value: { type: "bounds", value: [30, 60, 120, 200] },
              },
            },
          ],
        },
      });
      await new Promise((r) => setTimeout(r, 50));
      dbg.setElementSelection?.(pair, "replace");
      await new Promise((r) => setTimeout(r, 80));
      return JSON.stringify(pair);
    });

    // Click Union.
    await page
      .locator(
        '[data-pathfinder-panel="ready"] button[data-pathfinder-kind="union"]',
      )
      .click();
    await page.waitForTimeout(150);

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
      // Kept frame should now span [0, 0, 120, 200] (union BBox).
      const props0 = await dbg.client.elementProperties(pair[0]);
      const kept = props0?.entries.find((e) => e.path === "frameBounds")
        ?.value?.value;
      // Other frame should be gone — elementProperties returns null.
      const props1 = await dbg.client.elementProperties(pair[1]);
      return {
        kept: kept ?? null,
        otherGone: props1 === null || props1 === undefined,
      };
    }, result);

    expect(aftermath.kept).toEqual([0, 0, 120, 200]);
    expect(aftermath.otherGone).toBe(true);
  });

  test("AC-PF-3 — Intersect contracts kept frame to overlap rect; removes others", async ({
    page,
  }) => {
    const pair = await page.evaluate(async () => {
      type DebugCanvas = {
        client?: {
          executeScript(src: string): Promise<{
            output: string[];
            error: string | null;
          }>;
          mutate(op: unknown): Promise<unknown>;
        };
        setElementSelection?(ids: unknown[], mode: string): void;
      };
      const dbg = (window as unknown as { __canvas?: DebugCanvas }).__canvas;
      if (!dbg?.client) throw new Error("no client");
      const treeJson = await dbg.client
        .executeScript("verso.tree()")
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
      // Pin overlapping bounds: [10, 20, 80, 120] and [40, 60, 110, 200].
      // Intersection should be [40, 60, 80, 120].
      await dbg.client.mutate({
        op: "batch",
        args: {
          ops: [
            {
              op: "setElementProperty",
              args: {
                elementId: pair[0],
                path: "frameBounds",
                value: { type: "bounds", value: [10, 20, 80, 120] },
              },
            },
            {
              op: "setElementProperty",
              args: {
                elementId: pair[1],
                path: "frameBounds",
                value: { type: "bounds", value: [40, 60, 110, 200] },
              },
            },
          ],
        },
      });
      await new Promise((r) => setTimeout(r, 50));
      dbg.setElementSelection?.(pair, "replace");
      await new Promise((r) => setTimeout(r, 80));
      return JSON.stringify(pair);
    });

    await page
      .locator(
        '[data-pathfinder-panel="ready"] button[data-pathfinder-kind="intersect"]',
      )
      .click();
    await page.waitForTimeout(150);

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
      const arr = JSON.parse(pairJson) as Array<{ kind: string; id: string }>;
      const props0 = await dbg.client.elementProperties(arr[0]);
      const kept = props0?.entries.find((e) => e.path === "frameBounds")
        ?.value?.value;
      const props1 = await dbg.client.elementProperties(arr[1]);
      return {
        kept: kept ?? null,
        otherGone: props1 === null || props1 === undefined,
      };
    }, pair);

    expect(aftermath.kept).toEqual([40, 60, 80, 120]);
    expect(aftermath.otherGone).toBe(true);
  });
});

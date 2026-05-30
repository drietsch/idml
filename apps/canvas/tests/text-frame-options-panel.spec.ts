// SDK Phase 5 (v1 sweep) — Text Frame Options panel acceptance.
//
// One row today (inset spacing); the row's BoundsLeaf reuses the
// same primitive the Object panel uses for Frame Bounds. AC-TFO-2
// pins the apply path end-to-end: a setProperty against
// frameInsetSpacing flows through the new apply arm.

import { test, expect } from "@playwright/test";
import { dirname, resolve as pathResolve } from "node:path";
import { fileURLToPath } from "node:url";

import { openCanvas, loadIdml } from "./fidelity/canvas-driver";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = pathResolve(__dirname, "..", "..", "..");
const FIXTURE = `${REPO_ROOT}/corpus/generated/geometry-groups.idml`;

test.describe("Phase 5 — Text Frame Options panel", () => {
  test.beforeEach(async ({ page }) => {
    await openCanvas(page);
    await loadIdml(page, FIXTURE);
    await page.getByText("Text Frame", { exact: true }).first().click();
  });

  test("AC-TFO-1 — panel mounts as a composition", async ({ page }) => {
    await expect(
      page.locator('[data-text-frame-options-panel="ready"]'),
    ).toBeVisible();
  });

  test("AC-TFO-2 — frameInsetSpacing apply round-trips", async ({ page }) => {
    const result = await page.evaluate(async () => {
      type DebugCanvas = {
        client?: {
          executeScript(src: string): Promise<{
            output: string[];
            error: string | null;
          }>;
          mutate(op: unknown): Promise<unknown>;
        };
      };
      const w = window as unknown as { __canvas?: DebugCanvas };
      const dbg = w.__canvas;
      if (!dbg?.client) throw new Error("__canvas client not available");

      // Walk the tree for the first TextFrame.
      const treeJson = await dbg.client
        .executeScript("paged.tree()")
        .then((r) => r.output[0] ?? "[]");
      type Node = {
        id?: { kind: string; id: string } | null;
        children?: Node[];
      };
      const walk = (nodes: Node[] | undefined): Node["id"] => {
        if (!nodes) return null;
        for (const n of nodes) {
          if (n.id && n.id.kind === "textFrame") return n.id;
          const f = walk(n.children);
          if (f) return f;
        }
        return null;
      };
      const target = walk(JSON.parse(treeJson) as Node[]);
      if (!target) throw new Error("fixture has no TextFrame");

      const addr = `${target.kind}:${target.id}`;
      await dbg.client.mutate({
        op: "setElementProperty",
        args: {
          elementId: { kind: target.kind, id: target.id },
          path: "frameInsetSpacing",
          value: { type: "bounds", value: [10, 20, 30, 40] },
        },
      });
      await new Promise((r) => setTimeout(r, 50));

      const inspectJson = await dbg.client
        .executeScript(`paged.inspect(${JSON.stringify(addr)});`)
        .then((r) => r.output[0] ?? "");
      const inspect = JSON.parse(inspectJson) as {
        entries: Array<{
          path: string;
          value: { type: string; value: number[] } | null;
        }>;
      };
      const entry = inspect.entries.find(
        (e) => e.path === "frameInsetSpacing",
      );
      return entry?.value?.value ?? null;
    });

    expect(result).toEqual([10, 20, 30, 40]);
  });
});

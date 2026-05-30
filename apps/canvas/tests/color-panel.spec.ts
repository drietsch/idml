// SDK Phase 5 (v1 sweep) — Color panel acceptance.

import { test, expect } from "@playwright/test";
import { dirname, resolve as pathResolve } from "node:path";
import { fileURLToPath } from "node:url";

import { openCanvas, loadIdml } from "./fidelity/canvas-driver";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = pathResolve(__dirname, "..", "..", "..");
const FIXTURE = `${REPO_ROOT}/corpus/generated/geometry-groups.idml`;

test.describe("Phase 5 — Color panel", () => {
  test.beforeEach(async ({ page }) => {
    await openCanvas(page);
    await loadIdml(page, FIXTURE);
    await page.getByText("Color", { exact: true }).first().click();
  });

  test("AC-COLOR-1 — panel mounts as a composition with fill picker + tint scrub", async ({
    page,
  }) => {
    await expect(page.locator('[data-color-panel="ready"]')).toBeVisible();
    await expect(
      page.locator(
        '[data-color-panel="ready"] select[data-collection="swatches"][data-value-type="colorRef"]',
      ),
    ).toBeVisible();
  });

  test("AC-COLOR-2 — frameFillTint round-trips via the apply layer", async ({
    page,
  }) => {
    const applied = await page.evaluate(async () => {
      type DebugCanvas = {
        client?: {
          executeScript(src: string): Promise<{
            output: string[];
            error: string | null;
          }>;
          elementProperties(id: unknown): Promise<{
            entries: Array<{
              path: string;
              value: { type: string; value: number | null } | null;
            }>;
          } | null>;
          mutate(op: unknown): Promise<unknown>;
        };
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
      if (!target) throw new Error("no TextFrame");
      await dbg.client.mutate({
        op: "setElementProperty",
        args: {
          elementId: { kind: target.kind, id: target.id },
          path: "frameFillTint",
          value: { type: "length", value: 42 },
        },
      });
      await new Promise((r) => setTimeout(r, 30));
      const props = await dbg.client.elementProperties(target);
      const entry = props?.entries.find((e) => e.path === "frameFillTint");
      return entry?.value?.value ?? null;
    });

    expect(applied).toBe(42);
  });
});

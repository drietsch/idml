// SDK Phase 5 (v1 sweep) — Control bar acceptance.

import { test, expect } from "@playwright/test";
import { dirname, resolve as pathResolve } from "node:path";
import { fileURLToPath } from "node:url";

import { openCanvas, loadIdml } from "./fidelity/canvas-driver";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = pathResolve(__dirname, "..", "..", "..");
const FIXTURE = `${REPO_ROOT}/corpus/generated/geometry-groups.idml`;

test.describe("Phase 5 — Control bar", () => {
  test.beforeEach(async ({ page }) => {
    await openCanvas(page);
    await loadIdml(page, FIXTURE);
    await page.getByText("Control", { exact: true }).first().click();
  });

  test("AC-CTRL-1 — empty selection shows the guidance hint", async ({
    page,
  }) => {
    await expect(
      page.locator('[data-control-panel="ready"]'),
    ).toBeVisible();
    await expect(
      page.locator(
        '[data-control-panel="ready"] [data-control-empty]',
      ),
    ).toBeVisible();
  });

  test("AC-CTRL-2 — element selection adds Object + Stroke sections horizontally", async ({
    page,
  }) => {
    await page.evaluate(async () => {
      type DebugCanvas = {
        client?: {
          executeScript(src: string): Promise<{
            output: string[];
            error: string | null;
          }>;
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
      dbg.setElementSelection?.([target], "replace");
      await new Promise((r) => setTimeout(r, 80));
    });
    await expect(
      page.locator(
        '[data-control-panel="ready"][data-has-element="true"]',
      ),
    ).toBeVisible();
    await expect(
      page.locator(
        '[data-control-panel="ready"] [data-control-section="object"]',
      ),
    ).toBeVisible();
    await expect(
      page.locator(
        '[data-control-panel="ready"] [data-control-section="stroke"]',
      ),
    ).toBeVisible();
  });
});

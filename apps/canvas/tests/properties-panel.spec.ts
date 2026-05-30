// SDK Phase 5 (v1 sweep) — Properties panel acceptance.
//
// Context router: shows different composition sections based on
// element vs content selection. AC-PROP-1 pins the empty state;
// AC-PROP-2 pins element selection surfaces Object + Stroke;
// AC-PROP-3 pins content selection adds Character + Paragraph.

import { test, expect } from "@playwright/test";
import { dirname, resolve as pathResolve } from "node:path";
import { fileURLToPath } from "node:url";

import { openCanvas, loadIdml } from "./fidelity/canvas-driver";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = pathResolve(__dirname, "..", "..", "..");
const FIXTURE = `${REPO_ROOT}/corpus/generated/geometry-groups.idml`;

test.describe("Phase 5 — Properties panel", () => {
  test.beforeEach(async ({ page }) => {
    await openCanvas(page);
    await loadIdml(page, FIXTURE);
    await page.getByText("Properties", { exact: true }).first().click();
  });

  test("AC-PROP-1 — empty selection shows the guidance hint", async ({
    page,
  }) => {
    await expect(
      page.locator('[data-properties-panel="ready"]'),
    ).toBeVisible();
    await expect(
      page.locator(
        '[data-properties-panel="ready"] [data-properties-empty]',
      ),
    ).toBeVisible();
    // No section panels rendered yet.
    await expect(
      page.locator(
        '[data-properties-panel="ready"] [data-properties-section]',
      ),
    ).toHaveCount(0);
  });

  test("AC-PROP-2 — element selection adds Object + Stroke sections", async ({
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
        '[data-properties-panel="ready"][data-has-element="true"]',
      ),
    ).toBeVisible();
    await expect(
      page.locator(
        '[data-properties-panel="ready"] [data-properties-section="object"]',
      ),
    ).toBeVisible();
    await expect(
      page.locator(
        '[data-properties-panel="ready"] [data-properties-section="stroke"]',
      ),
    ).toBeVisible();
    // Character / paragraph are content-scope; not visible yet.
    await expect(
      page.locator(
        '[data-properties-panel="ready"] [data-properties-section="character"]',
      ),
    ).toHaveCount(0);
  });
});

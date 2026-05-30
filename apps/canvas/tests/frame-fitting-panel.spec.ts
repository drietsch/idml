// SDK Phase 5 (v1 sweep) — Frame Fitting panel acceptance.
//
// Rectangle-only. Mode + crops both round-trip via the apply
// layer; partial commits preserve the other half (mirrors the
// Text Wrap pattern with `Option<FrameFittingOption>`).

import { test, expect } from "@playwright/test";
import { dirname, resolve as pathResolve } from "node:path";
import { fileURLToPath } from "node:url";

import { openCanvas, loadIdml } from "./fidelity/canvas-driver";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = pathResolve(__dirname, "..", "..", "..");
const FIXTURE = `${REPO_ROOT}/corpus/generated/images.idml`;

test.describe("Phase 5 — Frame Fitting panel", () => {
  test.beforeEach(async ({ page }) => {
    await openCanvas(page);
    await loadIdml(page, FIXTURE);
    await page.getByText("Frame Fitting", { exact: true }).first().click();
  });

  test("AC-FF-1 — panel mounts", async ({ page }) => {
    await expect(
      page.locator('[data-frame-fitting-panel="ready"]'),
    ).toBeVisible();
  });

  test("AC-FF-2 — type + crops round-trip; partial commits preserve the other half", async ({
    page,
  }) => {
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
      const dbg = (window as unknown as { __canvas?: DebugCanvas }).__canvas;
      if (!dbg?.client) throw new Error("__canvas client not available");

      // Find the first Rectangle in the tree (the images fixture
      // ships several placed-image rectangles).
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
          if (n.id && n.id.kind === "rectangle") return n.id;
          const f = walk(n.children);
          if (f) return f;
        }
        return null;
      };
      const target = walk(JSON.parse(treeJson) as Node[]);
      if (!target) throw new Error("fixture has no Rectangle");
      const addr = `${target.kind}:${target.id}`;

      // 1. Set fitting type → "Proportionally".
      const setType = await dbg.client.executeScript(
        `paged.set(${JSON.stringify(addr)}, "frameFittingType", "Proportionally");`,
      );
      if (setType.error || setType.output[0]?.trim() !== "true") {
        throw new Error(`type set failed: ${setType.error ?? setType.output[0]}`);
      }
      await new Promise((r) => setTimeout(r, 30));

      // 2. Set crops → [4, 8, 12, 16]. Type must stay
      //    "Proportionally".
      await dbg.client.mutate({
        op: "setElementProperty",
        args: {
          elementId: { kind: target.kind, id: target.id },
          path: "frameFittingCrops",
          value: { type: "bounds", value: [4, 8, 12, 16] },
        },
      });
      await new Promise((r) => setTimeout(r, 30));

      const inspectJson = await dbg.client
        .executeScript(`paged.inspect(${JSON.stringify(addr)});`)
        .then((r) => r.output[0] ?? "");
      const inspect = JSON.parse(inspectJson) as {
        entries: Array<{
          path: string;
          value: { type: string; value: unknown } | null;
        }>;
      };
      const fittingType = inspect.entries.find(
        (e) => e.path === "frameFittingType",
      );
      const crops = inspect.entries.find(
        (e) => e.path === "frameFittingCrops",
      );
      return {
        type: fittingType?.value?.value ?? null,
        crops: crops?.value?.value ?? null,
      };
    });

    expect(result.type).toBe("Proportionally");
    expect(result.crops).toEqual([4, 8, 12, 16]);
  });
});

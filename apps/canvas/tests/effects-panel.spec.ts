// SDK Phase 5 (named sweep) — Effects panel acceptance.
//
// v1 ships only the drop-shadow enable toggle; per-field editors
// land when their PropertyPaths do. This pins the toggle apply
// path end-to-end.

import { test, expect } from "@playwright/test";
import { dirname, resolve as pathResolve } from "node:path";
import { fileURLToPath } from "node:url";

import { openCanvas, loadIdml } from "./fidelity/canvas-driver";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = pathResolve(__dirname, "..", "..", "..");
const FIXTURE = `${REPO_ROOT}/corpus/generated/geometry-groups.idml`;

test.describe("Phase 5 — Effects panel", () => {
  test.beforeEach(async ({ page }) => {
    await openCanvas(page);
    await loadIdml(page, FIXTURE);
    await page.getByText("Effects", { exact: true }).first().click();
  });

  test("AC-EFFECTS-1 — panel mounts; em-dash when no selection", async ({
    page,
  }) => {
    await expect(
      page.locator('[data-effects-panel="ready"]'),
    ).toBeVisible();
    // Multiple em-dash placeholders now (toggle + 6 per-field
    // editors all render em-dash without a selection). Strict-
    // mode requires `.first()` here; the count check below pins
    // that all 7 are present (1 toggle + 6 fields).
    await expect(
      page.locator('[data-effects-panel="ready"] [data-mixed]').first(),
    ).toBeVisible();
    await expect(
      page.locator('[data-effects-panel="ready"] [data-mixed]'),
    ).toHaveCount(7);
  });

  test("AC-EFFECTS-2 — drop-shadow toggle round-trips via the apply layer", async ({
    page,
  }) => {
    const initial = await page.evaluate(async () => {
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
      if (!target) throw new Error("fixture has no TextFrame");
      const addr = `${target.kind}:${target.id}`;

      // Toggle on.
      await dbg.client.mutate({
        op: "setElementProperty",
        args: {
          elementId: { kind: target.kind, id: target.id },
          path: "frameDropShadow",
          value: { type: "bool", value: true },
        },
      });
      await new Promise((r) => setTimeout(r, 30));

      const inspectJson = await dbg.client
        .executeScript(`verso.inspect(${JSON.stringify(addr)});`)
        .then((r) => r.output[0] ?? "");
      const inspect = JSON.parse(inspectJson) as {
        entries: Array<{
          path: string;
          value: { type: string; value: boolean } | null;
        }>;
      };
      const entry = inspect.entries.find(
        (e) => e.path === "frameDropShadow",
      );
      return entry?.value?.value ?? null;
    });

    expect(initial).toBe(true);
  });
});

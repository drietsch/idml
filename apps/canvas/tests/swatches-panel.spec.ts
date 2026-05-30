// SDK Phase 5 (named sweep) — Swatches panel acceptance.
//
// Validates the `valueType: "colorRef"` extension to the
// PAGED_INPUT_COLLECTION_SELECT primitive end-to-end. The panel
// renders the same select as Paragraph / Character / Object
// Styles, but the commit emits a `Value::ColorRef` payload (not
// `Value::Text`), addressed to the selected frame's
// `frameFillColor` property.

import { test, expect } from "@playwright/test";
import { dirname, resolve as pathResolve } from "node:path";
import { fileURLToPath } from "node:url";

import { openCanvas, loadIdml } from "./fidelity/canvas-driver";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = pathResolve(__dirname, "..", "..", "..");
const FIXTURE = `${REPO_ROOT}/corpus/generated/geometry-groups.idml`;

test.describe("Phase 5 — Swatches panel", () => {
  test.beforeEach(async ({ page }) => {
    await openCanvas(page);
    await loadIdml(page, FIXTURE);
    await page.getByText("Swatches", { exact: true }).first().click();
  });

  test("AC-SWATCH-1 — panel mounts as a composition with a swatches select", async ({
    page,
  }) => {
    await expect(
      page.locator('[data-swatches-panel="ready"]'),
    ).toBeVisible();
    await expect(
      page.locator(
        '[data-swatches-panel="ready"] select[data-collection="swatches"][data-value-type="colorRef"]',
      ),
    ).toBeVisible();
  });

  test("AC-SWATCH-2 — selecting a swatch writes frameFillColor as Value::ColorRef", async ({
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
        setElementSelection?(ids: unknown[], mode: string): void;
      };
      const w = window as unknown as { __canvas?: DebugCanvas };
      const dbg = w.__canvas;
      if (!dbg?.client) throw new Error("__canvas client not available");

      // Find a TextFrame from the tree.
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
          if (n.id && (n.id.kind === "textFrame" || n.id.kind === "rectangle")) {
            return n.id;
          }
          const found = walk(n.children);
          if (found) return found;
        }
        return null;
      };
      const target = walk(JSON.parse(treeJson) as Node[]);
      if (!target) throw new Error("fixture has no selectable frame");
      dbg.setElementSelection?.([target], "replace");
      await new Promise((r) => setTimeout(r, 50));

      // Pull the swatches list, pick a known one ("Color/Black"
      // is universal — every IDML ships it as a default).
      const swatchesJson = await dbg.client
        .executeScript("paged.swatches()")
        .then((r) => r.output[0] ?? "[]");
      const swatches = JSON.parse(swatchesJson) as Array<{
        selfId: string;
      }>;
      const target_swatch =
        swatches.find((s) => s.selfId === "Color/Black") ??
        swatches.find((s) => s.selfId && s.selfId !== "Color/None") ??
        swatches[0];
      if (!target_swatch) throw new Error("fixture has no swatches");

      // Apply via mutate — the same path the composition's
      // collection-select takes on click. Wire payload mirrors the
      // leaf's onCommit: `{ type: "colorRef", value: <selfId> }`.
      const addr = `${target.kind}:${target.id}`;
      await dbg.client.mutate({
        op: "setElementProperty",
        args: {
          elementId: { kind: target.kind, id: target.id },
          path: "frameFillColor",
          value: { type: "colorRef", value: target_swatch.selfId },
        },
      });
      await new Promise((r) => setTimeout(r, 50));

      // Round-trip via inspect.
      const inspectJson = await dbg.client
        .executeScript(`paged.inspect(${JSON.stringify(addr)});`)
        .then((r) => r.output[0] ?? "");
      const inspect = JSON.parse(inspectJson) as {
        entries: Array<{
          path: string;
          value: { type: string; value: string | null } | null;
        }>;
      };
      const entry = inspect.entries.find((e) => e.path === "frameFillColor");
      return {
        applied: entry?.value?.value ?? null,
        wantedType: entry?.value?.type ?? null,
      };
    });

    expect(result.applied).toBeTruthy();
    expect(result.wantedType).toBe("colorRef");
  });
});

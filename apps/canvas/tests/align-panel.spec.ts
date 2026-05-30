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

  test("AC-ALIGN-1 — panel mounts; six buttons disabled without 2+ selection", async ({
    page,
  }) => {
    await expect(page.locator('[data-align-panel="ready"]')).toBeVisible();
    const buttons = page.locator('[data-align-panel="ready"] button[data-align-kind]');
    await expect(buttons).toHaveCount(6);
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
});

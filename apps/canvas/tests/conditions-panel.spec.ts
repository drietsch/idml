// SDK Phase 5 (v1 sweep) — Conditions panel acceptance.

import { test, expect } from "@playwright/test";
import { dirname, resolve as pathResolve } from "node:path";
import { fileURLToPath } from "node:url";

import { openCanvas, loadIdml } from "./fidelity/canvas-driver";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = pathResolve(__dirname, "..", "..", "..");
const FIXTURE = `${REPO_ROOT}/corpus/generated/geometry-groups.idml`;

test.describe("Phase 5 — Conditions panel", () => {
  test.beforeEach(async ({ page }) => {
    await openCanvas(page);
    await loadIdml(page, FIXTURE);
    await page.getByText("Conditions", { exact: true }).first().click();
  });

  test("AC-COND-1 — panel mounts; either lists conditions or shows empty placeholder", async ({
    page,
  }) => {
    await expect(
      page.locator('[data-conditions-panel="ready"]'),
    ).toBeVisible();
    // One of the two outcomes is visible — both prove the
    // channel + dispatcher + accessor chain completes.
    const list = page.locator(
      '[data-conditions-panel="ready"] [data-condition-list]',
    );
    const empty = page.locator(
      '[data-conditions-panel="ready"] [data-empty-conditions]',
    );
    const listVisible = await list.isVisible();
    const emptyVisible = await empty.isVisible();
    expect(listVisible || emptyVisible).toBe(true);
  });
});
